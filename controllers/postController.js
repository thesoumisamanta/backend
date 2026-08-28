const Post = require('../models/post.js');
const User = require('../models/user.js');
const Notification = require('../models/notification.js');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/cloudinary');
const { sendNotification, sendMulticastNotification } = require('../config/firebase');

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

    let locationData = location;
    if (typeof location === 'string' && location.trim() !== '') {
      try {
        locationData = JSON.parse(location);
      } catch (e) {
        locationData = { name: location };
      }
    }

    const post = await Post.create({
      user: req.user.id,
      caption,
      postType: postType || 'photo',
      media: mediaArray,
      location: locationData,
      tags: tags ? (typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags) : []
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
      message: 'Post created successfully',
      data: {
        post
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const formatPost = (postDoc, currentUserId) => {
  const post = postDoc.toObject ? postDoc.toObject({ virtuals: true }) : postDoc;
  const userIdStr = currentUserId ? currentUserId.toString() : '';
  const likesList = post.likes
    ? post.likes.map(id => (id && (id._id || id.id || id)).toString()).filter(Boolean)
    : [];
  const dislikesList = post.dislikes
    ? post.dislikes.map(id => (id && (id._id || id.id || id)).toString()).filter(Boolean)
    : [];

  const hasLiked = Boolean(userIdStr && likesList.some(id => id === userIdStr));
  const hasDisliked = Boolean(userIdStr && dislikesList.some(id => id === userIdStr));

  return {
    ...post,
    likes: likesList,
    dislikes: dislikesList,
    likesCount: post.likesCount ?? likesList.length,
    dislikesCount: post.dislikesCount ?? dislikesList.length,
    hasLiked,
    hasDisliked,
  };
};

// Get feed (posts from following users)
exports.getFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id);
    const followingIds = (user && user.following) ? user.following.map(id => id.toString()) : [];
    
    // Include user's own posts and posts from followed users
    const filter = { user: { $in: [...followingIds, req.user._id.toString()] } };

    const posts = await Post.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(filter);

    const formattedPosts = posts.map(post => formatPost(post, req.user._id));

    res.status(200).json({
      success: true,
      message: 'Feed posts retrieved successfully',
      data: {
        posts: formattedPosts,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get trending posts from following users (top 5 most liked)
exports.getTrendingPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const followingIds = (user && user.following) ? user.following.map(id => id.toString()) : [];

    const filter = { user: { $in: [...followingIds, req.user._id.toString()] } };

    const posts = await Post.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ likesCount: -1, createdAt: -1 })
      .limit(5);

    const formattedPosts = posts.map(post => formatPost(post, req.user._id));

    res.status(200).json({
      success: true,
      message: 'Trending posts retrieved successfully',
      data: {
        posts: formattedPosts
      }
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

    const formattedPosts = posts.map(post => formatPost(post, req.user._id));

    res.status(200).json({
      success: true,
      message: 'User posts retrieved successfully',
      data: {
        posts: formattedPosts,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total
      }
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

    const formattedPost = formatPost(post, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Post details retrieved successfully',
      data: {
        post: formattedPost,
        hasLiked: formattedPost.hasLiked,
        hasDisliked: formattedPost.hasDisliked
      }
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

    const userIdStr = req.user._id.toString();
    const hasLiked = post.likes.some(id => (id._id || id).toString() === userIdStr);
    const hasDisliked = post.dislikes.some(id => (id._id || id).toString() === userIdStr);

    if (hasLiked) {
      // Unlike
      post.likes = post.likes.filter(id => (id._id || id).toString() !== userIdStr);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      // Like
      post.likes.push(req.user._id);
      post.likesCount += 1;

      // Remove dislike if exists
      if (hasDisliked) {
        post.dislikes = post.dislikes.filter(id => (id._id || id).toString() !== userIdStr);
        post.dislikesCount = Math.max(0, post.dislikesCount - 1);
      }

      // Create notification if not own post
      if (post.user.toString() !== userIdStr) {
        const user = await User.findById(post.user);

        await Notification.create({
          recipient: post.user,
          sender: req.user._id,
          type: 'like',
          post: post._id,
          message: `${req.user.username} liked your post`
        });

        // Send push notification
        if (user && user.fcmToken) {
          await sendNotification(
            user.fcmToken,
            'New Like',
            `${req.user.username} liked your post`
          );
        }
      }
    }

    post.markModified('likes');
    post.markModified('dislikes');
    await post.save();

    res.status(200).json({
      success: true,
      message: hasLiked ? 'Post unliked successfully' : 'Post liked successfully',
      data: {
        likesCount: post.likesCount,
        dislikesCount: post.dislikesCount,
        hasLiked: !hasLiked,
        hasDisliked: false
      }
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

    const userIdStr = req.user._id.toString();
    const hasLiked = post.likes.some(id => (id._id || id).toString() === userIdStr);
    const hasDisliked = post.dislikes.some(id => (id._id || id).toString() === userIdStr);

    if (hasDisliked) {
      // Remove dislike
      post.dislikes = post.dislikes.filter(id => (id._id || id).toString() !== userIdStr);
      post.dislikesCount = Math.max(0, post.dislikesCount - 1);
    } else {
      // Dislike
      post.dislikes.push(req.user._id);
      post.dislikesCount += 1;

      // Remove like if exists
      if (hasLiked) {
        post.likes = post.likes.filter(id => (id._id || id).toString() !== userIdStr);
        post.likesCount = Math.max(0, post.likesCount - 1);
      }
    }

    post.markModified('likes');
    post.markModified('dislikes');
    await post.save();

    res.status(200).json({
      success: true,
      message: hasDisliked ? 'Dislike removed' : 'Post disliked',
      data: {
        likesCount: post.likesCount,
        dislikesCount: post.dislikesCount,
        hasLiked: false,
        hasDisliked: !hasDisliked
      }
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
      message: 'Post deleted successfully',
      data: null
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
      data: {
        sharesCount: post.sharesCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};