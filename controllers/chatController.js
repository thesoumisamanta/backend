const Chat = require('../models/chat.js');
const Message = require('../models/message.js');
const User = require('../models/user.js');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/cloudinary');
const { sendNotification } = require('../config/firebase');
const { emitToUser, emitToRoom } = require('../config/socket');

// Get or create chat session
exports.getOrCreateChat = async (req, res) => {
  try {
    const { userId } = req.params;

    const currentUser = await User.findById(req.user.id);
    const otherUser = await User.findById(userId);

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
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

    // Create new chat if doesn't exist
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

      await chat.populate('participants', 'username fullName profilePicture accountType isOnline lastSeen');
    }

    res.status(200).json({
      success: true,
      message: 'Chat session retrieved successfully',
      data: {
        chat
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all chats
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
      data: {
        chats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text, messageType, sharedPostId, sharedStoryId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    const messageData = {
      chat: chatId,
      sender: req.user.id,
      messageType: messageType || 'text',
      text
    };

    // Auto-detect & handle media upload
    if (req.file) {
      const mime = (req.file.mimetype || '').toLowerCase();
      const name = (req.file.originalname || '').toLowerCase();
      const isVideo = mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v)$/i.test(name);

      if (isVideo) {
        const result = await uploadVideo(req.file.buffer, 'travel-diary/chats');
        messageData.media = {
          public_id: result.public_id,
          url: result.url,
          type: 'video'
        };
        messageData.messageType = 'video';
      } else {
        const result = await uploadImage(req.file.buffer, 'travel-diary/chats');
        messageData.media = {
          public_id: result.public_id,
          url: result.url,
          type: 'image'
        };
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
    if (message.sharedPost) await message.populate('sharedPost');
    if (message.sharedStory) await message.populate('sharedStory');

    const otherUserId = chat.participants.find(
      id => id.toString() !== req.user.id
    ).toString();

    chat.lastMessage = message._id;
    chat.lastMessageTime = message.createdAt;

    const unreadCount = chat.unreadCount.get(otherUserId) || 0;
    chat.unreadCount.set(otherUserId, unreadCount + 1);

    await chat.save();

    // Broadcast Real-Time Socket Event
    emitToUser(otherUserId, 'receive_message', { message, chatId });
    emitToRoom(chatId, 'receive_message', { message, chatId });

    // Send FCM push notification
    try {
      const otherUser = await User.findById(otherUserId);
      if (otherUser && otherUser.fcmToken) {
        await sendNotification(
          otherUser.fcmToken,
          `${req.user.username}`,
          text || 'Sent a media file',
          { type: 'message', chatId: chat._id.toString() }
        );
      }
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get messages
exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (!chat.participants.map(p => p.toString()).includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    const messages = await Message.find({ chat: chatId, isDeleted: false })
      .populate('sender', 'username fullName profilePicture')
      .populate('sharedPost')
      .populate('sharedStory')
      .populate('reactions.user', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ chat: chatId, isDeleted: false });

    res.status(200).json({
      success: true,
      message: 'Messages retrieved successfully',
      data: {
        messages: messages.reverse(),
        currentPage: page,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Reset unread count for current user
    chat.unreadCount.set(req.user.id, 0);
    await chat.save();

    // Mark messages as read
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: req.user.id },
        isRead: false
      },
      {
        $set: { isRead: true },
        $push: { readBy: { user: req.user.id } }
      }
    );

    const otherUserId = chat.participants.find(
      id => id.toString() !== req.user.id
    ).toString();

    // Socket emission to notify sender that their messages were read
    emitToUser(otherUserId, 'messages_read', { chatId, readBy: req.user.id });
    emitToRoom(chatId, 'messages_read', { chatId, readBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// React to a message with an emoji (e.g. ❤️, 😂, 🔥)
exports.reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Toggle or update reaction
    const existingIndex = message.reactions.findIndex(
      r => r.user.toString() === req.user.id
    );

    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // Remove reaction if same emoji tapped again
        message.reactions.splice(existingIndex, 1);
      } else {
        // Change emoji
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      // Add reaction
      message.reactions.push({
        user: req.user.id,
        emoji
      });
    }

    await message.save();
    await message.populate('reactions.user', 'username fullName profilePicture');

    // Broadcast live socket event
    emitToRoom(message.chat.toString(), 'message_reacted', {
      messageId: message._id,
      chatId: message.chat,
      reactions: message.reactions
    });

    res.status(200).json({
      success: true,
      message: 'Reaction updated successfully',
      data: {
        reactions: message.reactions
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Unsend / Delete Message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only unsend your own messages'
      });
    }

    message.isDeleted = true;
    message.text = 'This message was unsent';
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
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Accept Message Request
exports.acceptChatRequest = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    chat.status = 'accepted';
    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Message request accepted',
      data: {
        chat
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Decline Message Request
exports.declineChatRequest = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    chat.status = 'declined';
    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Message request declined',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};