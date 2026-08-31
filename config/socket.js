const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const User = require('../models/user.js');
const Chat = require('../models/chat.js');
const Message = require('../models/message.js');
const { sendNotification } = require('./firebase.js');

let io;
// Map to track connected users on this node: userId -> Set of socketIds
const userSockets = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Setup Redis Adapter for multi-instance / cluster horizontal scaling
  // if (process.env.REDIS_URL || process.env.REDIS_HOST) {
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
  //     console.warn('⚠️ Could not initialize Redis Adapter, falling back to In-Memory Adapter:', redisErr.message);
  //   }
  // } else {
  //   console.log('ℹ️ Running Socket.io with In-Memory Adapter (Add REDIS_HOST in .env for multi-server scaling)');
  // }

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
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

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();

    // Register user socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Update user online status in database
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

    // Broadcast user online status across all nodes
    io.emit('user_online', { userId, lastSeen: new Date() });

    // Join specific chat room
    socket.on('join_chat', (chatId) => {
      if (chatId) {
        socket.join(chatId.toString());
      }
    });

    // Leave specific chat room
    socket.on('leave_chat', (chatId) => {
      if (chatId) {
        socket.leave(chatId.toString());
      }
    });

    // Send Message Event via WebSockets
    socket.on('send_message', async (data, ackCallback) => {
      try {
        const { chatId, text, sharedPostId, sharedStoryId } = data || {};

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

        const isParticipant = chat.participants.map(p => p.toString()).includes(userId);
        if (!isParticipant) {
          if (typeof ackCallback === 'function') {
            return ackCallback({ success: false, message: 'Not authorized for this chat' });
          }
          return;
        }

        const messageData = {
          chat: chatId,
          sender: userId,
          messageType: 'text',
          text
        };

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
        if (message.sharedPost) await message.populate('sharedPost');
        if (message.sharedStory) await message.populate('sharedStory');

        const otherUserId = chat.participants.find(
          id => id.toString() !== userId
        ).toString();

        chat.lastMessage = message._id;
        chat.lastMessageTime = message.createdAt;

        const unreadCount = chat.unreadCount.get(otherUserId) || 0;
        chat.unreadCount.set(otherUserId, unreadCount + 1);

        await chat.save();

        const payload = { message, chatId };

        // Broadcast to chat room & recipient across cluster nodes via adapter
        io.to(chatId.toString()).emit('receive_message', payload);
        emitToUser(otherUserId, 'receive_message', payload);

        // Acknowledge sender socket
        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, message: 'Message sent successfully', data: { message } });
        }

        // Trigger FCM push notification if recipient is offline
        try {
          const otherUser = await User.findById(otherUserId);
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
      } catch (error) {
        console.error('Socket send_message error:', error);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, message: error.message });
        }
      }
    });

    // Mark Messages as Read Event via WebSockets
    socket.on('mark_read', async ({ chatId }) => {
      try {
        if (!chatId) return;

        const chat = await Chat.findById(chatId);
        if (!chat) return;

        chat.unreadCount.set(userId, 0);
        await chat.save();

        await Message.updateMany(
          { chat: chatId, sender: { $ne: userId }, isRead: false },
          { $set: { isRead: true }, $push: { readBy: { user: userId } } }
        );

        const otherUserId = chat.participants.find(id => id.toString() !== userId).toString();
        
        io.to(chatId.toString()).emit('messages_read', { chatId, readBy: userId });
        emitToUser(otherUserId, 'messages_read', { chatId, readBy: userId });
      } catch (err) {
        console.error('Socket mark_read error:', err.message);
      }
    });

    // React to Message Event via WebSockets
    socket.on('react_message', async ({ messageId, emoji }) => {
      try {
        if (!messageId || !emoji) return;
        const message = await Message.findById(messageId);
        if (!message) return;

        const existingIndex = message.reactions.findIndex(r => r.user.toString() === userId);
        if (existingIndex > -1) {
          if (message.reactions[existingIndex].emoji === emoji) {
            message.reactions.splice(existingIndex, 1);
          } else {
            message.reactions[existingIndex].emoji = emoji;
          }
        } else {
          message.reactions.push({ user: userId, emoji });
        }

        await message.save();
        await message.populate('reactions.user', 'username fullName profilePicture');

        const payload = { messageId: message._id, chatId: message.chat, reactions: message.reactions };
        io.to(message.chat.toString()).emit('message_reacted', payload);
      } catch (err) {
        console.error('Socket react_message error:', err.message);
      }
    });

    // Delete / Unsend Message Event via WebSockets
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

    // Typing Indicators
    socket.on('typing', ({ chatId, recipientId }) => {
      if (chatId) {
        socket.to(chatId.toString()).emit('user_typing', { chatId, userId });
      } else if (recipientId) {
        emitToUser(recipientId, 'user_typing', { userId });
      }
    });

    socket.on('stop_typing', ({ chatId, recipientId }) => {
      if (chatId) {
        socket.to(chatId.toString()).emit('user_stop_typing', { chatId, userId });
      } else if (recipientId) {
        emitToUser(recipientId, 'user_stop_typing', { userId });
      }
    });

    // Disconnect Handler
    socket.on('disconnect', async () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          const now = new Date();
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: now });
          io.emit('user_offline', { userId, lastSeen: now });
        }
      }
    });
  });

  return io;
};

// Utility to emit socket event to a specific user (across adapter nodes)
const emitToUser = (userId, event, data) => {
  if (!io) return;
  const targetId = userId.toString();
  const sockets = userSockets.get(targetId);
  if (sockets && sockets.size > 0) {
    sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  } else {
    // If not on local process node, emit to targetId room
    io.to(targetId).emit(event, data);
  }
};

// Utility to emit socket event to a chat room
const emitToRoom = (roomId, event, data) => {
  if (!io) return;
  io.to(roomId.toString()).emit(event, data);
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRoom
};
