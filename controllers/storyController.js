const Story = require('../models/story.js');
const User = require('../models/user.js');
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
    if (req.file.mimetype.startsWith('image/')) {
      const result = await uploadImage(req.file.buffer, 'travel-diary/stories');
      mediaData = {
        public_id: result.public_id,
        url: result.url,
        type: 'image'
      };
    } else if (req.file.mimetype.startsWith('video/')) {
      const result = await uploadVideo(req.file.buffer, 'travel-diary/stories');
      mediaData = {
        public_id: result.public_id,
        url: result.url,
        type: 'video',
        thumbnail: result.thumbnail,
        duration: result.duration
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
      story
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
      stories: result
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
      stories
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
      message: 'Story viewed'
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
      message: 'Story deleted successfully'
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
      viewers: story.viewers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};