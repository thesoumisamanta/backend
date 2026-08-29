const Story = require('../models/story.js');
const User = require('../models/user.js');
const Highlight = require('../models/highlight.js');
const Chat = require('../models/chat.js');
const Message = require('../models/message.js');
const Notification = require('../models/notification.js');
const { sendNotification } = require('../config/firebase');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/cloudinary');

// Create story
exports.createStory = async (req, res) => {
  try {
    const { caption } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a media file'
      });
    }

    let mediaData;
    const mime = (req.file.mimetype || '').toLowerCase();
    const name = (req.file.originalname || '').toLowerCase();
    const isVideo = mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v)$/i.test(name);

    if (isVideo) {
      const result = await uploadVideo(req.file.buffer, 'travel-diary/stories');
      mediaData = {
        public_id: result.public_id,
        url: result.url,
        type: 'video',
        thumbnail: result.thumbnail,
        duration: result.duration
      };
    } else {
      const result = await uploadImage(req.file.buffer, 'travel-diary/stories');
      mediaData = {
        public_id: result.public_id,
        url: result.url,
        type: 'image'
      };
    }

    const story = await Story.create({
      user: req.user.id,
      media: mediaData,
      caption
    });

    await story.populate('user', 'username fullName profilePicture accountType isVerified');

    res.status(201).json({
      success: true,
      message: 'Story created successfully',
      data: {
        story
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get stories from following users
exports.getFollowingStories = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Get stories from following users grouped by user
    const stories = await Story.find({
      user: { $in: [...user.following, req.user.id] },
      expiresAt: { $gt: new Date() }
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 });

    // Group stories by user
    const groupedStories = {};
    stories.forEach(story => {
      const userId = story.user._id.toString();
      if (!groupedStories[userId]) {
        groupedStories[userId] = {
          user: story.user,
          stories: []
        };
      }

      // Check if current user has viewed this story
      const hasViewed = story.viewers.some(
        v => v.user.toString() === req.user.id
      );

      groupedStories[userId].stories.push({
        ...story.toObject(),
        hasViewed
      });
    });

    const result = Object.values(groupedStories);

    res.status(200).json({
      success: true,
      message: 'Following stories retrieved successfully',
      data: {
        stories: result
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user stories
exports.getUserStories = async (req, res) => {
  try {
    const stories = await Story.find({
      user: req.params.userId,
      expiresAt: { $gt: new Date() }
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'User stories retrieved successfully',
      data: {
        stories
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// View story
exports.viewStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Check if user already viewed
    const hasViewed = story.viewers.some(
      v => v.user.toString() === req.user.id
    );

    if (!hasViewed) {
      story.viewers.push({ user: req.user.id });
      story.viewsCount += 1;
      await story.save();
    }

    res.status(200).json({
      success: true,
      message: 'Story viewed',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete story
exports.deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (story.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this story'
      });
    }

    // Delete from cloudinary
    await deleteFile(story.media.public_id);
    await story.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Story deleted successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get story viewers
exports.getStoryViewers = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('viewers.user', 'username fullName profilePicture accountType isVerified');

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (story.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only view viewers of your own stories'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Story viewers retrieved successfully',
      data: {
        viewers: story.viewers
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reply to a story (sends DM to the story creator)
exports.replyToStory = async (req, res) => {
  try {
    const { text } = req.body;
    const storyId = req.params.id;

    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reply text is required'
      });
    }

    const story = await Story.findById(storyId).populate('user', 'username fcmToken');
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (story.user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot reply to your own story'
      });
    }

    // Find or create chat between current user and story owner
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, story.user._id] }
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, story.user._id]
      });
    }

    const message = await Message.create({
      chat: chat._id,
      sender: req.user.id,
      messageType: 'story_reply',
      text: text.trim(),
      sharedStory: story._id
    });

    // Update chat last message
    chat.lastMessage = message._id;
    chat.lastMessageTime = Date.now();
    await chat.save();

    await message.populate('sender', 'username fullName profilePicture');
    await message.populate('sharedStory');

    // Create notification
    await Notification.create({
      recipient: story.user._id,
      sender: req.user.id,
      type: 'story_reply',
      message: `${req.user.username} replied to your story`
    });

    // Push notification
    if (story.user.fcmToken) {
      await sendNotification(
        story.user.fcmToken,
        'Story Reply',
        `${req.user.username}: ${text.substring(0, 100)}`
      );
    }

    res.status(201).json({
      success: true,
      message: 'Replied to story successfully',
      data: {
        message
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user's story archive (all past stories created by current user)
exports.getArchivedStories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { user: req.user.id };

    const stories = await Story.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Story.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Archived stories retrieved successfully',
      data: {
        stories,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalStories: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create a new Story Highlight
exports.createHighlight = async (req, res) => {
  try {
    const { title, storyIds } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Highlight title is required'
      });
    }

    let parsedStoryIds = storyIds;
    if (typeof storyIds === 'string') {
      try {
        parsedStoryIds = JSON.parse(storyIds);
      } catch (e) {
        parsedStoryIds = storyIds.split(',').map(s => s.trim());
      }
    }

    if (!parsedStoryIds || !Array.isArray(parsedStoryIds) || parsedStoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide story IDs for the highlight'
      });
    }

    let coverImageData = null;
    if (req.file) {
      const result = await uploadImage(req.file.buffer, 'travel-diary/highlights');
      coverImageData = {
        public_id: result.public_id,
        url: result.url
      };
    } else {
      // Fallback cover image from the first story's media
      const firstStory = await Story.findById(parsedStoryIds[0]);
      if (firstStory && firstStory.media) {
        coverImageData = {
          public_id: firstStory.media.public_id || '',
          url: firstStory.media.url || ''
        };
      }
    }

    const highlight = await Highlight.create({
      user: req.user.id,
      title: title.trim(),
      coverImage: coverImageData,
      stories: parsedStoryIds
    });

    await highlight.populate('stories');
    await highlight.populate('user', 'username fullName profilePicture');

    res.status(201).json({
      success: true,
      message: 'Highlight created successfully',
      data: {
        highlight
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get public highlights for a user profile
exports.getUserHighlights = async (req, res) => {
  try {
    const highlights = await Highlight.find({ user: req.params.userId })
      .populate('stories')
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'User highlights retrieved successfully',
      data: {
        highlights
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update a Story Highlight
exports.updateHighlight = async (req, res) => {
  try {
    const { title, storyIds } = req.body;
    const highlight = await Highlight.findById(req.params.id);

    if (!highlight) {
      return res.status(404).json({
        success: false,
        message: 'Highlight not found'
      });
    }

    if (highlight.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this highlight'
      });
    }

    if (title) highlight.title = title.trim();

    if (storyIds) {
      let parsedStoryIds = storyIds;
      if (typeof storyIds === 'string') {
        try {
          parsedStoryIds = JSON.parse(storyIds);
        } catch (e) {
          parsedStoryIds = storyIds.split(',').map(s => s.trim());
        }
      }
      if (Array.isArray(parsedStoryIds)) {
        highlight.stories = parsedStoryIds;
      }
    }

    if (req.file) {
      if (highlight.coverImage && highlight.coverImage.public_id) {
        await deleteFile(highlight.coverImage.public_id);
      }
      const result = await uploadImage(req.file.buffer, 'travel-diary/highlights');
      highlight.coverImage = {
        public_id: result.public_id,
        url: result.url
      };
    }

    highlight.updatedAt = Date.now();
    await highlight.save();

    await highlight.populate('stories');

    res.status(200).json({
      success: true,
      message: 'Highlight updated successfully',
      data: {
        highlight
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete a Story Highlight
exports.deleteHighlight = async (req, res) => {
  try {
    const highlight = await Highlight.findById(req.params.id);

    if (!highlight) {
      return res.status(404).json({
        success: false,
        message: 'Highlight not found'
      });
    }

    if (highlight.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this highlight'
      });
    }

    if (highlight.coverImage && highlight.coverImage.public_id) {
      await deleteFile(highlight.coverImage.public_id);
    }

    await highlight.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Highlight deleted successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};