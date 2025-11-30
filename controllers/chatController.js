const Chat = require('../models/chat.js');
const Message = require('../models/message.js');
const User = require('../models/user.js');
const { uploadImage, uploadVideo } = require('../utils/cloudinary');
const { sendNotification } = require('../config/firebase');

// Get or create chat
exports.getOrCreateChat = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if both users follow each other
    const currentUser = await User.findById(req.user.id);
    const otherUser = await User.findById(userId);

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Business accounts cannot chat
    if (otherUser.accountType === 'business') {
      return res.status(400).json({
        success: false,
        message: 'Cannot chat with business accounts'
      });
    }

    // Check mutual following
    const isFollowing = currentUser.following.includes(userId);
    const isFollower = otherUser.following.includes(req.user.id);

    if (!isFollowing || !isFollower) {
      return res.status(403).json({
        success: false,
        message: 'Both users must follow each other to chat'
      });
    }

    // Find existing chat
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, userId] }
    })
      .populate('participants', 'username fullName profilePicture accountType')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username fullName profilePicture' }
      });

    // Create new chat if doesn't exist
    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, userId],
        unreadCount: {
          [req.user.id]: 0,
          [userId]: 0
        }
      });

      await chat.populate('participants', 'username fullName profilePicture accountType');
    }

    res.status(200).json({
      success: true,
      chat
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
      participants: req.user.id
    })
      .populate('participants', 'username fullName profilePicture accountType')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username fullName profilePicture' }
      })
      .sort({ lastMessageTime: -1 });

    res.status(200).json({
      success: true,
      chats
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
    const { text, messageType, sharedPostId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify user is participant
    if (!chat.participants.includes(req.user.id)) {
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

    // Handle media upload
    if (req.file) {
      let result;
      if (req.file.mimetype.startsWith('image/')) {
        result = await uploadImage(req.file.buffer, 'travel-diary/chats');
        messageData.media = {
          public_id: result.public_id,
          url: result.url,
          type: 'image'
        };
        messageData.messageType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        result = await uploadVideo(req.file.buffer, 'travel-diary/chats');
        messageData.media = {
          public_id: result.public_id,
          url: result.url,
          type: 'video'
        };
        messageData.messageType = 'video';
      }
    }

    // Handle shared post
    if (sharedPostId) {
      messageData.sharedPost = sharedPostId;
      messageData.messageType = 'post';
    }

    const message = await Message.create(messageData);
    await message.populate('sender', 'username fullName profilePicture');

    // Update chat
    const otherUserId = chat.participants.find(
      id => id.toString() !== req.user.id
    ).toString();

    chat.lastMessage = message._id;
    chat.lastMessageTime = message.createdAt;

    const unreadCount = chat.unreadCount.get(otherUserId) || 0;
    chat.unreadCount.set(otherUserId, unreadCount + 1);

    await chat.save();

    // Send notification
    const otherUser = await User.findById(otherUserId);
    if (otherUser.fcmToken) {
      await sendNotification(
        otherUser.fcmToken,
        `${req.user.username}`,
        text || 'Sent a media file',
        { type: 'message', chatId: chat._id.toString() }
      );
    }

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
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

    if (!chat.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'username fullName profilePicture')
      .populate('sharedPost')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ chat: chatId });

    res.status(200).json({
      success: true,
      messages: messages.reverse(),
      currentPage: page,
      totalPages: Math.ceil(total / limit)
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

    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};