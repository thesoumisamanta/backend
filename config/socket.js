const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.js');
const Chat = require('../models/chat.js');
const Message = require('../models/message.js');
const { sendNotification } = require('./firebase.js');

let io;

// Map to track connected users on this node: userId -> Set of socketIds
const userSockets = new Map();

// FIX 10: Server-side auto-timeout for typing indicators
// Key: `${userId}:${chatId}` -> timeoutId
const typingTimers = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get all chat partner IDs for a user (for targeted presence events)
// FIX 4: Used instead of broadcasting user_online/offline to ALL sockets
// ─────────────────────────────────────────────────────────────────────────────
const getChatPartnerIds = async (userId) => {
  const chats = await Chat.find({
    participants: userId,
    status: 'accepted'
  }).select('participants');

  return [
    ...new Set(
      chats.flatMap(c =>
        c.participants.map(p => p.toString()).filter(id => id !== userId)
      )
    )
  ];
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Redis Adapter (uncomment for production multi-node horizontal scaling)
  // ─────────────────────────────────────────────────────────────────────────
  // if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  //   const { createAdapter } = require('@socket.io/redis-adapter');
  //   const Redis = require('ioredis');
  //   try {
  //     const redisOptions = process.env.REDIS_URL || {
  //       host: process.env.REDIS_HOST || '127.0.0.1',
  //       port: parseInt(process.env.REDIS_PORT) || 6379,
  //       password: process.env.REDIS_PASSWORD || undefined,
  //       retryStrategy: (times) => Math.min(times * 100, 3000)
  //     };
  //     const pubClient = new Redis(redisOptions);
  //     const subClient = pubClient.duplicate();
  //     pubClient.on('error', (err) => console.warn('Redis Pub Client Error:', err.message));
  //     subClient.on('error', (err) => console.warn('Redis Sub Client Error:', err.message));
  //     io.adapter(createAdapter(pubClient, subClient));
  //     console.log('🚀 Socket.io Redis Adapter connected for multi-node horizontal scaling');
  //   } catch (redisErr) {
  //     console.warn('⚠️ Could not initialize Redis Adapter, falling back to In-Memory:', redisErr.message);
  //   }
  // }

  // ─────────────────────────────────────────────────────────────────────────
  // Socket JWT Authentication Middleware
  // ─────────────────────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Handler
  // ─────────────────────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();

    // Register socket for this user (supports multiple devices)
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Mark user online in DB
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

    // ── FIX 4: Broadcast online presence ONLY to chat partners ───────────
    try {
      const partnerIds = await getChatPartnerIds(userId);
      partnerIds.forEach(partnerId => {
        emitToUser(partnerId, 'user_online', { userId, lastSeen: new Date() });
      });
    } catch (err) {
      console.error('Socket presence broadcast error (connect):', err.message);
    }

    // ── FIX 3: Mark undelivered messages as 'delivered' on reconnect ─────
    // Finds all 'sent' messages in the user's chats where THEY are the recipient
    try {
      const userChats = await Chat.find({
        participants: userId
      }).select('_id');

      const chatIds = userChats.map(c => c._id);

      if (chatIds.length > 0) {
        const undeliveredMessages = await Message.find({
          chat: { $in: chatIds },
          sender: { $ne: userId },
          status: 'sent'
        }).select('_id chat sender');

        if (undeliveredMessages.length > 0) {
          const messageIds = undeliveredMessages.map(m => m._id);

          await Message.updateMany(
            { _id: { $in: messageIds } },
            { $set: { status: 'delivered' } }
          );

          // Group by sender to batch the events
          const bySender = {};
          undeliveredMessages.forEach(msg => {
            const senderId = msg.sender.toString();
            if (!bySender[senderId]) bySender[senderId] = [];
            bySender[senderId].push({
              messageId: msg._id,
              chatId: msg.chat
            });
          });

          Object.entries(bySender).forEach(([senderId, msgs]) => {
            emitToUser(senderId, 'message_delivered', { messages: msgs });
          });
        }
      }
    } catch (err) {
      console.error('Socket delivered-on-reconnect error:', err.message);
    }

    // ── Join specific chat room ───────────────────────────────────────────
    socket.on('join_chat', (chatId) => {
      if (chatId) socket.join(chatId.toString());
    });

    // ── Leave specific chat room ──────────────────────────────────────────
    socket.on('leave_chat', (chatId) => {
      if (chatId) {
        socket.leave(chatId.toString());
        // Clear any lingering typing timer for this chat
        const key = `${userId}:${chatId}`;
        if (typingTimers.has(key)) {
          clearTimeout(typingTimers.get(key));
          typingTimers.delete(key);
        }
      }
    });

    // ── FIX 8: Get user presence on-demand ───────────────────────────────
    socket.on('get_user_presence', async ({ targetUserId }, ackCallback) => {
      try {
        if (!targetUserId) {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'targetUserId is required' });
          }
          return;
        }

        const targetUser = await User.findById(targetUserId).select('isOnline lastSeen');
        if (!targetUser) {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'User not found' });
          }
          return;
        }

        // Use live in-memory socket map for real-time accuracy
        const isOnline =
          userSockets.has(targetUserId.toString()) &&
          userSockets.get(targetUserId.toString()).size > 0;

        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            data: {
              userId: targetUserId,
              isOnline,
              lastSeen: targetUser.lastSeen
            }
          });
        }
      } catch (err) {
        console.error('Socket get_user_presence error:', err.message);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, message: err.message });
        }
      }
    });

    // ── Send Message ──────────────────────────────────────────────────────
    socket.on('send_message', async (data, ackCallback) => {
      try {
        const { chatId, text, replyToId, sharedPostId, sharedStoryId } = data || {};

        if (!chatId || (!text && !sharedPostId && !sharedStoryId)) {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'Invalid parameters' });
          }
          return;
        }

        const chat = await Chat.findById(chatId);
        if (!chat) {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'Chat not found' });
          }
          return;
        }

        // ── FIX 2: Check chat status before allowing send ─────────────
        if (chat.status === 'declined') {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'Chat request was declined' });
          }
          return;
        }

        if (chat.status === 'pending') {
          const isRequester = chat.requestedBy?.toString() === userId;
          if (isRequester) {
            if (typeof ackCallback === 'function') {
              return ackCallback({
                success: false,
                message: 'Waiting for the other user to accept your chat request'
              });
            }
            return;
          }
        }

        // Verify participant
        const isParticipant = chat.participants.map(p => p.toString()).includes(userId);
        if (!isParticipant) {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'Not authorized for this chat' });
          }
          return;
        }

        const otherUserId = chat.participants
          .find(id => id.toString() !== userId)
          .toString();

        // Check if recipient is online for instant delivery status
        const isRecipientOnline =
          userSockets.has(otherUserId) && userSockets.get(otherUserId).size > 0;

        const messageData = {
          chat: chatId,
          sender: userId,
          messageType: 'text',
          text,
          status: isRecipientOnline ? 'delivered' : 'sent' // FIX 3
        };

        // FIX 6: Reply-to support
        if (replyToId) messageData.replyTo = replyToId;

        if (sharedPostId) {
          messageData.sharedPost = sharedPostId;
          messageData.messageType = 'post';
        }
        if (sharedStoryId) {
          messageData.sharedStory = sharedStoryId;
          messageData.messageType = 'story_reply';
        }

        const message = await Message.create(messageData);
        await message.populate('sender', 'username fullName profilePicture');
        if (message.replyTo) {
          await message.populate({
            path: 'replyTo',
            select: 'text messageType sender',
            populate: { path: 'sender', select: 'username fullName profilePicture' }
          });
        }
        if (message.sharedPost) await message.populate('sharedPost');
        if (message.sharedStory) await message.populate('sharedStory');

        // Update chat metadata
        chat.lastMessage = message._id;
        chat.lastMessageTime = message.createdAt;
        const unreadCount = chat.unreadCount.get(otherUserId) || 0;
        chat.unreadCount.set(otherUserId, unreadCount + 1);
        await chat.save();

        const payload = { message, chatId };

        // ── FIX 1: No duplicate receive_message ───────────────────────
        // Emit receive_message ONLY directly to recipient (all their devices)
        emitToUser(otherUserId, 'receive_message', payload);

        // Sync sender's OTHER active sessions (multi-device support)
        const senderSockets = userSockets.get(userId);
        if (senderSockets) {
          senderSockets.forEach(sid => {
            if (sid !== socket.id) {
              io.to(sid).emit('new_sent_message', payload);
            }
          });
        }

        // ACK the sender's current socket
        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            message: 'Message sent successfully',
            data: { message }
          });
        }

        // Emit delivery status back to sender if recipient was online
        if (isRecipientOnline) {
          emitToUser(userId, 'message_delivered', {
            messages: [{ messageId: message._id, chatId }]
          });
        }

        // ── FIX 9: Only push notify if recipient is actually offline ──
        if (!isRecipientOnline) {
          try {
            const otherUser = await User.findById(otherUserId).select('fcmToken');
            if (otherUser && otherUser.fcmToken) {
              await sendNotification(
                otherUser.fcmToken,
                `${socket.user.username}`,
                text || 'Sent a message',
                { type: 'message', chatId: chat._id.toString() }
              );
            }
          } catch (notifErr) {
            console.error('Push notification failed:', notifErr.message);
          }
        }
      } catch (error) {
        console.error('Socket send_message error:', error);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, message: error.message });
        }
      }
    });

    // ── Mark Messages as Read ─────────────────────────────────────────────
    socket.on('mark_read', async ({ chatId }) => {
      try {
        if (!chatId) return;

        const chat = await Chat.findById(chatId);
        if (!chat) return;

        // ── FIX 5: Verify user is a participant ───────────────────────
        const isParticipant = chat.participants
          .map(p => p.toString())
          .includes(userId);
        if (!isParticipant) return;

        // Reset unread count for current user
        chat.unreadCount.set(userId, 0);
        await chat.save();

        // FIX 3: Update status to 'read' alongside isRead
        await Message.updateMany(
          { chat: chatId, sender: { $ne: userId }, status: { $ne: 'read' } },
          {
            $set: { isRead: true, status: 'read' },
            $push: { readBy: { user: userId } }
          }
        );

        const otherUserId = chat.participants
          .find(id => id.toString() !== userId)
          .toString();

        // Notify both: active chat room members AND sender directly
        socket.to(chatId.toString()).emit('messages_read', { chatId, readBy: userId });
        emitToUser(otherUserId, 'messages_read', { chatId, readBy: userId });
      } catch (err) {
        console.error('Socket mark_read error:', err.message);
      }
    });

    // ── React to Message ──────────────────────────────────────────────────
    socket.on('react_message', async ({ messageId, emoji }) => {
      try {
        if (!messageId || !emoji) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        // Verify participant
        const chat = await Chat.findById(message.chat).select('participants');
        if (!chat) return;
        const isParticipant = chat.participants
          .map(p => p.toString())
          .includes(userId);
        if (!isParticipant) return;

        const existingIndex = message.reactions.findIndex(
          r => r.user.toString() === userId
        );
        if (existingIndex > -1) {
          if (message.reactions[existingIndex].emoji === emoji) {
            message.reactions.splice(existingIndex, 1); // toggle off
          } else {
            message.reactions[existingIndex].emoji = emoji; // change emoji
          }
        } else {
          message.reactions.push({ user: userId, emoji });
        }

        await message.save();
        await message.populate('reactions.user', 'username fullName profilePicture');

        const payload = {
          messageId: message._id,
          chatId: message.chat,
          reactions: message.reactions
        };

        // Broadcast to active room participants
        io.to(message.chat.toString()).emit('message_reacted', payload);
      } catch (err) {
        console.error('Socket react_message error:', err.message);
      }
    });

    // ── Delete / Unsend Message ───────────────────────────────────────────
    socket.on('delete_message', async ({ messageId }) => {
      try {
        if (!messageId) return;

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userId) return;

        message.isDeleted = true;
        message.text = 'This message was unsent';
        await message.save();

        const payload = { messageId: message._id, chatId: message.chat };
        io.to(message.chat.toString()).emit('message_deleted', payload);
      } catch (err) {
        console.error('Socket delete_message error:', err.message);
      }
    });

    // ── Typing Indicators ─────────────────────────────────────────────────
    // FIX 10: Server-side auto-timeout (5s) in case client crashes mid-typing
    socket.on('typing', ({ chatId }) => {
      if (!chatId) return;

      const key = `${userId}:${chatId}`;

      // Clear any existing timer first
      if (typingTimers.has(key)) {
        clearTimeout(typingTimers.get(key));
      }

      // Broadcast to others in the room
      socket.to(chatId.toString()).emit('user_typing', { chatId, userId });

      // Auto-stop after 5 seconds if client doesn't explicitly stop
      const timer = setTimeout(() => {
        socket.to(chatId.toString()).emit('user_stop_typing', { chatId, userId });
        typingTimers.delete(key);
      }, 5000);

      typingTimers.set(key, timer);
    });

    socket.on('stop_typing', ({ chatId }) => {
      if (!chatId) return;

      const key = `${userId}:${chatId}`;
      if (typingTimers.has(key)) {
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
      }

      socket.to(chatId.toString()).emit('user_stop_typing', { chatId, userId });
    });

    // ── Disconnect Handler ────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      // FIX 10: Clear ALL typing timers for this user on disconnect
      for (const [key, timer] of typingTimers.entries()) {
        if (key.startsWith(`${userId}:`)) {
          clearTimeout(timer);
          typingTimers.delete(key);
        }
      }

      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);

        // Only mark offline when ALL sessions disconnect (multi-device safe)
        if (sockets.size === 0) {
          userSockets.delete(userId);

          const now = new Date();
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: now });

          // FIX 4: Broadcast offline presence ONLY to chat partners
          try {
            const partnerIds = await getChatPartnerIds(userId);
            partnerIds.forEach(partnerId => {
              emitToUser(partnerId, 'user_offline', { userId, lastSeen: now });
            });
          } catch (err) {
            console.error('Socket presence broadcast error (disconnect):', err.message);
          }
        }
      }
    });
  });

  return io;
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Emit to a specific user across all their connected sockets
// ─────────────────────────────────────────────────────────────────────────────
const emitToUser = (userId, event, data) => {
  if (!io) return;
  const targetId = userId.toString();
  const sockets = userSockets.get(targetId);
  if (sockets && sockets.size > 0) {
    sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  } else {
    // Fallback: emit via room id (works with Redis adapter in multi-node setup)
    io.to(targetId).emit(event, data);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Emit to a chat room
// ─────────────────────────────────────────────────────────────────────────────
const emitToRoom = (roomId, event, data) => {
  if (!io) return;
  io.to(roomId.toString()).emit(event, data);
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRoom
};
