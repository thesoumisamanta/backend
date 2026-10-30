const Chat = require('../models/chat.js');
const Message = require('../models/message.js');
const User = require('../models/user.js');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/cloudinary');
const { sendNotification } = require('../config/firebase');
const { emitToUser, emitToRoom } = require('../config/socket');

// ─────────────────────────────────────────────────────────────────────────────
// Get or create a 1:1 chat session between current user and another user
// ─────────────────────────────────────────────────────────────────────────────
exports.getOrCreateChat = async (req, res) => {
  try {
    const { userId } = req.params;

    const currentUser = await User.findById(req.user.id);
    const otherUser = await User.findById(userId);

    if (!otherUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (otherUser.accountType === 'business') {
      return res.status(400).json({
        success: false,
        message: 'Cannot chat with business accounts'
      });
    }

    const isFollowing = currentUser.following.includes(userId);
    const isFollower = otherUser.following.includes(req.user.id);
    const isMutual = isFollowing && isFollower;

    // Find existing chat
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, userId] }
    })
      .populate('participants', 'username fullName profilePicture accountType isOnline lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username fullName profilePicture' }
      });

    // Create new chat if none exists
    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, userId],
        status: isMutual ? 'accepted' : 'pending',
        requestedBy: isMutual ? null : req.user.id,
        unreadCount: {
          [req.user.id]: 0,
          [userId]: 0
        }
      });

      await chat.populate(
        'participants',
        'username fullName profilePicture accountType isOnline lastSeen'
      );
    }

    res.status(200).json({
      success: true,
      message: 'Chat session retrieved successfully',
      data: { chat }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get all chats for the current user
// ─────────────────────────────────────────────────────────────────────────────
exports.getChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.user.id,
      status: { $ne: 'declined' }
    })
      .populate('participants', 'username fullName profilePicture accountType isOnline lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username fullName profilePicture' }
      })
      .sort({ lastMessageTime: -1 });

    res.status(200).json({
      success: true,
      message: 'Chats list retrieved successfully',
      data: { chats }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Send a message (REST — supports text, image, video, audio, shared post/story)
// ─────────────────────────────────────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text, messageType, replyToId, sharedPostId, sharedStoryId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    // FIX 2: Block sending if chat is declined or requester sends to a pending chat
    if (chat.status === 'declined') {
      return res.status(403).json({
        success: false,
        message: 'Chat request was declined'
      });
    }

    if (chat.status === 'pending') {
      const isRequester = chat.requestedBy?.toString() === req.user.id;
      if (isRequester) {
        return res.status(403).json({
          success: false,
          message: 'Waiting for the other user to accept your chat request'
        });
      }
    }

    const otherUserId = chat.participants
      .find(id => id.toString() !== req.user.id)
      .toString();

    // FIX 9: Check recipient online status for delivery tracking
    const { getIO } = require('../config/socket');
    let isRecipientOnline = false;
    try {
      // We can't access userSockets directly here, so check DB flag
      const otherUser = await User.findById(otherUserId).select('isOnline fcmToken');
      isRecipientOnline = otherUser?.isOnline === true;

      const messageData = {
        chat: chatId,
        sender: req.user.id,
        messageType: messageType || 'text',
        text,
        status: isRecipientOnline ? 'delivered' : 'sent' // FIX 3
      };

      // FIX 6: Reply-to-message support
      if (replyToId) messageData.replyTo = replyToId;

      // FIX 7: Auto-detect & handle media upload (image / video / audio)
      if (req.file) {
        const mime = (req.file.mimetype || '').toLowerCase();
        const name = (req.file.originalname || '').toLowerCase();

        const isVideo = mime.startsWith('video/') ||
          /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v)$/i.test(name);
        const isAudio = mime.startsWith('audio/') ||
          /\.(mp3|m4a|aac|ogg|wav|opus|flac|wma)$/i.test(name);

        if (isVideo) {
          const result = await uploadVideo(req.file.buffer, 'travel-diary/chats');
          messageData.media = { public_id: result.public_id, url: result.url, type: 'video' };
          messageData.messageType = 'video';
        } else if (isAudio) {
          // For audio, use uploadVideo util (Cloudinary handles audio too) or uploadImage
          const result = await uploadVideo(req.file.buffer, 'travel-diary/chats/audio');
          messageData.media = { public_id: result.public_id, url: result.url, type: 'audio' };
          messageData.messageType = 'audio';
        } else {
          const result = await uploadImage(req.file.buffer, 'travel-diary/chats');
          messageData.media = { public_id: result.public_id, url: result.url, type: 'image' };
          messageData.messageType = 'image';
        }
      }

      // Handle shared post
      if (sharedPostId) {
        messageData.sharedPost = sharedPostId;
        messageData.messageType = 'post';
      }

      // Handle shared story reply
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

      // FIX 1: Emit receive_message only to recipient (no duplicate room + user emit)
      emitToUser(otherUserId, 'receive_message', { message, chatId });
      // Sync sender's other devices
      emitToUser(req.user.id, 'new_sent_message', { message, chatId });

      // Notify sender when message is delivered (recipient is online)
      if (isRecipientOnline) {
        emitToUser(req.user.id, 'message_delivered', {
          messages: [{ messageId: message._id, chatId }]
        });
      }

      // FIX 9: Only push-notify if recipient is truly offline
      if (!isRecipientOnline && otherUser?.fcmToken) {
        try {
          await sendNotification(
            otherUser.fcmToken,
            `${req.user.username}`,
            text || 'Sent a media file',
            { type: 'message', chatId: chat._id.toString() }
          );
        } catch (notificationError) {
          console.error('Failed to send push notification:', notificationError.message);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: { message }
      });
    } catch (innerError) {
      throw innerError;
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get messages in a chat (cursor-based pagination via `before` timestamp)
// FIX 11: Use cursor-based pagination for accuracy with soft-deleted messages
// Query: GET /chats/:chatId/messages?limit=50&before=<ISO_TIMESTAMP>
// ─────────────────────────────────────────────────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : new Date();

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    const messages = await Message.find({
      chat: chatId,
      isDeleted: false,
      createdAt: { $lt: before }
    })
      .populate('sender', 'username fullName profilePicture')
      .populate({
        path: 'replyTo',
        select: 'text messageType sender isDeleted',
        populate: { path: 'sender', select: 'username fullName profilePicture' }
      })
      .populate('sharedPost')
      .populate('sharedStory')
      .populate('reactions.user', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit);

    const reversed = messages.reverse();
    const hasMore = messages.length === limit;
    const nextCursor = reversed.length > 0 ? reversed[0].createdAt.toISOString() : null;

    res.status(200).json({
      success: true,
      message: 'Messages retrieved successfully',
      data: {
        messages: reversed,
        hasMore,
        nextCursor // pass this as `before` in next request to load older messages
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark messages as read (REST endpoint)
// FIX 3: Also updates message status to 'read'
// ─────────────────────────────────────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    // Reset unread count for current user
    chat.unreadCount.set(req.user.id, 0);
    await chat.save();

    // FIX 3: Update status to 'read'
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: req.user.id },
        status: { $ne: 'read' }
      },
      {
        $set: { isRead: true, status: 'read' },
        $push: { readBy: { user: req.user.id } }
      }
    );

    const otherUserId = chat.participants
      .find(id => id.toString() !== req.user.id)
      .toString();

    // Notify both: active chat room AND sender directly
    emitToUser(otherUserId, 'messages_read', { chatId, readBy: req.user.id });
    emitToRoom(chatId, 'messages_read', { chatId, readBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Search messages inside a chat
// FIX 12: GET /chats/:chatId/messages/search?q=keyword
// ─────────────────────────────────────────────────────────────────────────────
exports.searchMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { q } = req.query;

    if (!q || q.trim().length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    const messages = await Message.find({
      chat: chatId,
      isDeleted: false,
      messageType: 'text',
      text: { $regex: q.trim(), $options: 'i' }
    })
      .populate('sender', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      message: 'Search results retrieved',
      data: { messages: messages.reverse(), total: messages.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// React to a message with an emoji (toggle/change/remove)
// ─────────────────────────────────────────────────────────────────────────────
exports.reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const existingIndex = message.reactions.findIndex(
      r => r.user.toString() === req.user.id
    );

    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        message.reactions.splice(existingIndex, 1); // toggle off same emoji
      } else {
        message.reactions[existingIndex].emoji = emoji; // change emoji
      }
    } else {
      message.reactions.push({ user: req.user.id, emoji });
    }

    await message.save();
    await message.populate('reactions.user', 'username fullName profilePicture');

    // Broadcast live socket event to chat room
    emitToRoom(message.chat.toString(), 'message_reacted', {
      messageId: message._id,
      chatId: message.chat,
      reactions: message.reactions
    });

    res.status(200).json({
      success: true,
      message: 'Reaction updated successfully',
      data: { reactions: message.reactions }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Unsend / Delete a message (soft-delete, cleans up Cloudinary media)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only unsend your own messages'
      });
    }

    message.isDeleted = true;
    message.text = 'This message was unsent';

    // Remove media from Cloudinary
    if (message.media && message.media.public_id) {
      await deleteFile(message.media.public_id);
      message.media = null;
    }

    await message.save();

    // Broadcast live socket event
    emitToRoom(message.chat.toString(), 'message_deleted', {
      messageId: message._id,
      chatId: message.chat
    });

    res.status(200).json({
      success: true,
      message: 'Message unsent successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Clear all messages in a chat (hard delete for both participants)
// FIX 13: DELETE /chats/:chatId/messages
// ─────────────────────────────────────────────────────────────────────────────
exports.clearChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    // Delete Cloudinary media assets before removing messages
    const mediaMessages = await Message.find({
      chat: chatId,
      'media.public_id': { $exists: true, $ne: null }
    }).select('media');

    for (const msg of mediaMessages) {
      if (msg.media?.public_id) {
        try {
          await deleteFile(msg.media.public_id);
        } catch (e) {
          console.error('Failed to delete media from Cloudinary:', e.message);
        }
      }
    }

    // Hard delete all messages
    await Message.deleteMany({ chat: chatId });

    // Reset chat metadata
    chat.lastMessage = null;
    chat.lastMessageTime = null;
    chat.unreadCount = {};
    await chat.save();

    // Notify both participants via socket
    emitToRoom(chatId, 'chat_cleared', { chatId });

    const otherUserId = chat.participants
      .find(id => id.toString() !== req.user.id)
      ?.toString();
    if (otherUserId) {
      emitToUser(otherUserId, 'chat_cleared', { chatId });
    }

    res.status(200).json({
      success: true,
      message: 'Chat cleared successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Accept a message / chat request
// ─────────────────────────────────────────────────────────────────────────────
exports.acceptChatRequest = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    chat.status = 'accepted';
    await chat.save();

    // Notify requester that request was accepted
    if (chat.requestedBy) {
      emitToUser(chat.requestedBy.toString(), 'chat_request_accepted', { chatId });
    }

    res.status(200).json({
      success: true,
      message: 'Message request accepted',
      data: { chat }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Decline a message / chat request
// ─────────────────────────────────────────────────────────────────────────────
exports.declineChatRequest = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    chat.status = 'declined';
    await chat.save();

    // Notify requester that request was declined
    if (chat.requestedBy) {
      emitToUser(chat.requestedBy.toString(), 'chat_request_declined', { chatId });
    }

    res.status(200).json({
      success: true,
      message: 'Message request declined',
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
