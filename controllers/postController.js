const Post = require('../models/post.js');
const User = require('../models/user.js');
const Notification = require('../models/notification.js');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/cloudinary');
const { sendMulticastNotification } = require('../config/firebase');

// Create post
exports.createPost = async (req, res) => {
  try {
    const { caption, postType, location, tags } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one media file'
      });
    }

    const mediaArray = [];

    // Upload all media files
    for (const file of req.files) {
      let result;
      if (file.mimetype.startsWith('image/')) {
        result = await uploadImage(file.buffer, 'travel-diary/posts');
        mediaArray.push({
          public_id: result.public_id,
          url: result.url,
          type: 'image'
        });
      } else if (file.mimetype.startsWith('video/')) {
        result = await uploadVideo(file.buffer, 'travel-diary/posts');
        mediaArray.push({
          public_id: result.public_id,
          url: result.url,
          type: 'video',
          thumbnail: result.thumbnail,
          duration: result.duration
        });
      }
    }

    const post = await Post.create({
      user: req.user.id,
      caption,
      postType,
      media: mediaArray,
      location,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });

    // Update user's post count
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { postsCount: 1 }
    });

    // Populate user data
    await post.populate('user', 'username fullName profilePicture accountType isVerified');

    // Send notification to followers
    const user = await User.findById(req.user.id).populate('followers');
    if (user.followers.length > 0) {
      const fcmTokens = user.followers
        .filter(f => f.fcmToken)
        .map(f => f.fcmToken);

      if (fcmTokens.length > 0) {
        await sendMulticastNotification(
          fcmTokens,
          'New Post',
          `${user.username} shared a new ${postType}`
        );
      }
    }

    res.status(201).json({
      success: true,
      post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get feed (posts from following users)
exports.getFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id);

    const posts = await Post.find({
      user: { $in: [...user.following, req.user.id] }
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({
      user: { $in: [...user.following, req.user.id] }
    });

    res.status(200).json({
      success: true,
      posts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user posts
exports.getUserPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const postType = req.query.postType; // 'image', 'video', 'short'

    const query = { user: req.params.userId };
    if (postType) {
      query.postType = postType;
    }

    const posts = await Post.find(query)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(query);

    res.status(200).json({
      success: true,
      posts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get single post
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'username fullName profilePicture accountType isVerified');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Increment view count
    post.viewsCount += 1;
    await post.save();

    // Check if current user liked/disliked
    const hasLiked = post.likes.includes(req.user.id);
    const hasDisliked = post.dislikes.includes(req.user.id);

    res.status(200).json({
      success: true,
      post,
      hasLiked,
      hasDisliked
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// Like/Unlike post
exports.likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const hasLiked = post.likes.includes(req.user.id);
    const hasDisliked = post.dislikes.includes(req.user.id);

    if (hasLiked) {
      // Unlike
      post.likes.pull(req.user.id);
      post.likesCount -= 1;
    } else {
      // Like
      post.likes.push(req.user.id);
      post.likesCount += 1;

      // Remove dislike if exists
      if (hasDisliked) {
        post.dislikes.pull(req.user.id);
        post.dislikesCount -= 1;
      }

      // Create notification if not own post
      if (post.user.toString() !== req.user.id) {
        const user = await User.findById(post.user);

        await Notification.create({
          recipient: post.user,
          sender: req.user.id,
          type: 'like',
          post: post._id,
          message: `${req.user.username} liked your post`
        });

        // Send push notification
        if (user.fcmToken) {
          await sendNotification(
            user.fcmToken,
            'New Like',
            `${req.user.username} liked your post`
          );
        }
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      likesCount: post.likesCount,
      dislikesCount: post.dislikesCount,
      hasLiked: !hasLiked,
      hasDisliked: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Dislike post
exports.dislikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const hasLiked = post.likes.includes(req.user.id);
    const hasDisliked = post.dislikes.includes(req.user.id);

    if (hasDisliked) {
      // Remove dislike
      post.dislikes.pull(req.user.id);
      post.dislikesCount -= 1;
    } else {
      // Dislike
      post.dislikes.push(req.user.id);
      post.dislikesCount += 1;

      // Remove like if exists
      if (hasLiked) {
        post.likes.pull(req.user.id);
        post.likesCount -= 1;
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      likesCount: post.likesCount,
      dislikesCount: post.dislikesCount,
      hasLiked: false,
      hasDisliked: !hasDisliked
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete post
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user owns the post
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this post'
      });
    }

    // Delete media from cloudinary
    for (const media of post.media) {
      await deleteFile(media.public_id);
    }

    await post.deleteOne();

    // Update user's post count
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { postsCount: -1 }
    });

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Share post
exports.sharePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    post.sharesCount += 1;
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post shared successfully',
      sharesCount: post.sharesCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};