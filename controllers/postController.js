const Post = require('../models/post.js');
const User = require('../models/user.js');
const Notification = require('../models/notification.js');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/cloudinary');
const { sendMulticastNotification } = require('../config/firebase');
const { createNotification } = require('../utils/notificationHelper');

// ─────────────────────────────────────────────────────────────────────────────
// Create post
// ─────────────────────────────────────────────────────────────────────────────
exports.createPost = async (req, res) => {
  try {
    const { caption, location, tags } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one media file'
      });
    }

    const mediaArray = [];
    let hasVideo = false;

    const isVideoFile = (file) => {
      const mime = (file.mimetype || '').toLowerCase();
      const name = (file.originalname || '').toLowerCase();
      return mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v)$/i.test(name);
    };

    for (const file of req.files) {
      let result;
      if (isVideoFile(file)) {
        hasVideo = true;
        result = await uploadVideo(file.buffer, 'travel-diary/posts');
        mediaArray.push({
          public_id: result.public_id,
          url: result.url,
          type: 'video',
          thumbnail: result.thumbnail,
          duration: result.duration
        });
      } else {
        result = await uploadImage(file.buffer, 'travel-diary/posts');
        mediaArray.push({
          public_id: result.public_id,
          url: result.url,
          type: 'image'
        });
      }
    }

    // Auto-detect postType from uploaded files
    const finalPostType = hasVideo ? 'video' : 'photo';

    let locationString = '';
    if (location) {
      if (typeof location === 'string') {
        const trimmed = location.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            locationString = parsed.name || parsed.address || trimmed;
          } catch (e) {
            locationString = trimmed;
          }
        } else {
          locationString = trimmed;
        }
      } else if (typeof location === 'object') {
        locationString = location.name || location.address || JSON.stringify(location);
      }
    }

    const post = await Post.create({
      user: req.user.id,
      caption,
      postType: finalPostType,
      media: mediaArray,
      location: locationString,
      tags: tags
        ? typeof tags === 'string'
          ? tags.split(',').map(tag => tag.trim())
          : tags
        : []
    });

    await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: 1 } });
    await post.populate('user', 'username fullName profilePicture accountType isVerified');

    // FIX 3: Use finalPostType (was crashing with undefined `postType`)
    // Notify followers via FCM multicast (non-blocking)
    const poster = await User.findById(req.user.id).populate('followers', 'fcmToken');
    if (poster.followers.length > 0) {
      const fcmTokens = poster.followers.filter(f => f.fcmToken).map(f => f.fcmToken);
      if (fcmTokens.length > 0) {
        sendMulticastNotification(
          fcmTokens,
          'New Post',
          `${poster.username} shared a new ${finalPostType}`
        ).catch(err => console.error('Multicast notification failed:', err.message));
      }
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: { post }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper to format post object with like/dislike flags
// ─────────────────────────────────────────────────────────────────────────────
const formatPost = (postDoc, currentUserId) => {
  const post = postDoc.toObject ? postDoc.toObject({ virtuals: true }) : postDoc;
  const userIdStr = currentUserId ? currentUserId.toString() : '';
  const likesList = post.likes
    ? post.likes.map(id => (id && (id._id || id.id || id)).toString()).filter(Boolean)
    : [];
  const dislikesList = post.dislikes
    ? post.dislikes.map(id => (id && (id._id || id.id || id)).toString()).filter(Boolean)
    : [];

  return {
    ...post,
    likes: likesList,
    dislikes: dislikesList,
    likesCount: post.likesCount ?? likesList.length,
    dislikesCount: post.dislikesCount ?? dislikesList.length,
    hasLiked: Boolean(userIdStr && likesList.some(id => id === userIdStr)),
    hasDisliked: Boolean(userIdStr && dislikesList.some(id => id === userIdStr))
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get feed (posts from following users)
// ─────────────────────────────────────────────────────────────────────────────
exports.getFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id);
    const followingIds = user?.following?.map(id => id.toString()) || [];

    const filter = { user: { $in: followingIds } };

    const posts = await Post.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Feed posts retrieved successfully',
      data: {
        posts: posts.map(p => formatPost(p, req.user._id)),
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get trending posts
// ─────────────────────────────────────────────────────────────────────────────
exports.getTrendingPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const followingIds = user?.following?.map(id => id.toString()) || [];

    const filter = { user: { $in: [...followingIds, req.user._id.toString()] } };

    const posts = await Post.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ likesCount: -1, createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      message: 'Trending posts retrieved successfully',
      data: { posts: posts.map(p => formatPost(p, req.user._id)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get user posts
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const postType = req.query.postType;

    const query = { user: req.params.userId };
    if (postType) query.postType = postType;

    const posts = await Post.find(query)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'User posts retrieved successfully',
      data: {
        posts: posts.map(p => formatPost(p, req.user._id)),
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get single post
// ─────────────────────────────────────────────────────────────────────────────
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'username fullName profilePicture accountType isVerified');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

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
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Like / Unlike post + notification
// ─────────────────────────────────────────────────────────────────────────────
exports.likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const userIdStr = req.user._id.toString();
    const hasLiked = post.likes.some(id => (id._id || id).toString() === userIdStr);
    const hasDisliked = post.dislikes.some(id => (id._id || id).toString() === userIdStr);

    if (hasLiked) {
      // Unlike — no notification needed
      post.likes = post.likes.filter(id => (id._id || id).toString() !== userIdStr);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      // Like
      post.likes.push(req.user._id);
      post.likesCount += 1;

      if (hasDisliked) {
        post.dislikes = post.dislikes.filter(id => (id._id || id).toString() !== userIdStr);
        post.dislikesCount = Math.max(0, post.dislikesCount - 1);
      }

      // FIX 2: Use createNotification — handles DB + socket + FCM in one call
      createNotification({
        recipientId: post.user,
        senderId: req.user._id,
        type: 'like',
        message: `${req.user.username} liked your post`,
        postId: post._id,
        fcmTitle: 'New Like',
        fcmBody: `${req.user.username} liked your post`,
        fcmData: { postId: post._id.toString() }
      });
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
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Dislike post (no notification per design — similar to YouTube)
// ─────────────────────────────────────────────────────────────────────────────
exports.dislikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const userIdStr = req.user._id.toString();
    const hasLiked = post.likes.some(id => (id._id || id).toString() === userIdStr);
    const hasDisliked = post.dislikes.some(id => (id._id || id).toString() === userIdStr);

    if (hasDisliked) {
      post.dislikes = post.dislikes.filter(id => (id._id || id).toString() !== userIdStr);
      post.dislikesCount = Math.max(0, post.dislikesCount - 1);
    } else {
      post.dislikes.push(req.user._id);
      post.dislikesCount += 1;
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
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Delete post
// ─────────────────────────────────────────────────────────────────────────────
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this post'
      });
    }

    for (const media of post.media) {
      await deleteFile(media.public_id);
    }

    await post.deleteOne();
    await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: -1 } });

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Share post — FIX 4: Now creates notification + socket + FCM
// ─────────────────────────────────────────────────────────────────────────────
exports.sharePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    post.sharesCount += 1;
    await post.save();

    // Notify post owner (non-blocking)
    createNotification({
      recipientId: post.user,
      senderId: req.user._id,
      type: 'share',
      message: `${req.user.username} shared your post`,
      postId: post._id,
      fcmTitle: 'Post Shared',
      fcmBody: `${req.user.username} shared your post`,
      fcmData: { postId: post._id.toString() }
    });

    res.status(200).json({
      success: true,
      message: 'Post shared successfully',
      data: { sharesCount: post.sharesCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get Shorts / Reels feed
// ─────────────────────────────────────────────────────────────────────────────
exports.getShortsFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { postType: { $in: ['short', 'video'] } },
        { 'media.type': 'video' }
      ]
    };

    const posts = await Post.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Shorts feed retrieved successfully',
      data: {
        posts: posts.map(p => formatPost(p, req.user._id)),
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
