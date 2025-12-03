const Comment = require('../models/comment.js');
const Post = require('../models/post.js');
const User = require('../models/user.js');
const Notification = require('../models/notification.js');
const { sendNotification } = require('../config/firebase');

// Create comment
exports.createComment = async (req, res) => {
  try {
    const { text, parentCommentId } = req.body;
    const postId = req.params.postId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    let depth = 0;
    let parentComment = null;

    // If this is a reply, get parent comment info
    if (parentCommentId) {
      parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({
          success: false,
          message: 'Parent comment not found'
        });
      }
      depth = (parentComment.depth || 0) + 1;
    }

    const comment = await Comment.create({
      post: postId,
      user: req.user.id,
      text,
      parentComment: parentCommentId || null,
      depth
    });

    await comment.populate('user', 'username fullName profilePicture accountType isVerified');

    // Update post comment count
    post.commentsCount += 1;
    await post.save();

    // Update parent comment reply count
    if (parentCommentId) {
      await Comment.findByIdAndUpdate(parentCommentId, {
        $inc: { repliesCount: 1 }
      });
    }

    // Create notification
    if (post.user.toString() !== req.user.id) {
      const postOwner = await User.findById(post.user);

      await Notification.create({
        recipient: post.user,
        sender: req.user.id,
        type: parentCommentId ? 'reply' : 'comment',
        post: postId,
        comment: comment._id,
        message: parentCommentId
          ? `${req.user.username} replied to a comment`
          : `${req.user.username} commented on your post`
      });

      // Send push notification
      if (postOwner && postOwner.fcmToken) {
        await sendNotification(
          postOwner.fcmToken,
          parentCommentId ? 'New Reply' : 'New Comment',
          text.substring(0, 100)
        );
      }
    }

    // Notify parent comment owner if replying
    if (parentCommentId && parentComment.user.toString() !== req.user.id) {
      const commentOwner = await User.findById(parentComment.user);

      await Notification.create({
        recipient: parentComment.user,
        sender: req.user.id,
        type: 'reply',
        post: postId,
        comment: comment._id,
        message: `${req.user.username} replied to your comment`
      });

      if (commentOwner && commentOwner.fcmToken) {
        await sendNotification(
          commentOwner.fcmToken,
          'New Reply',
          text.substring(0, 100)
        );
      }
    }

    res.status(201).json({
      success: true,
      comment: {
        ...comment.toObject(),
        hasLiked: false,
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

// Get post comments
exports.getPostComments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get only parent comments (not replies)
    const comments = await Comment.find({
      post: req.params.postId,
      parentComment: null,
      isDeleted: { $ne: true }
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Comment.countDocuments({
      post: req.params.postId,
      parentComment: null,
      isDeleted: { $ne: true }
    });

    // Add hasLiked and hasDisliked flags
    const commentsWithFlags = comments.map(comment => ({
      ...comment,
      hasLiked: comment.likes.some(id => id.toString() === req.user.id),
      hasDisliked: comment.dislikes.some(id => id.toString() === req.user.id)
    }));

    res.status(200).json({
      success: true,
      comments: commentsWithFlags,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalComments: total
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get comment replies
exports.getCommentReplies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const replies = await Comment.find({
      parentComment: req.params.commentId,
      isDeleted: { $ne: true }
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Comment.countDocuments({
      parentComment: req.params.commentId,
      isDeleted: { $ne: true }
    });

    // Add hasLiked and hasDisliked flags
    const repliesWithFlags = replies.map(reply => ({
      ...reply,
      hasLiked: reply.likes.some(id => id.toString() === req.user.id),
      hasDisliked: reply.dislikes.some(id => id.toString() === req.user.id)
    }));

    res.status(200).json({
      success: true,
      replies: repliesWithFlags,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReplies: total
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update/Edit comment
exports.updateComment = async (req, res) => {
  try {
    const { text } = req.body;
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to edit this comment'
      });
    }

    comment.text = text;
    comment.isEdited = true;
    comment.updatedAt = Date.now();
    await comment.save();

    await comment.populate('user', 'username fullName profilePicture accountType isVerified');

    res.status(200).json({
      success: true,
      comment: {
        ...comment.toObject(),
        hasLiked: comment.likes.some(id => id.toString() === req.user.id),
        hasDisliked: comment.dislikes.some(id => id.toString() === req.user.id)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get users who liked a comment
exports.getCommentLikes = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
      .populate('likes', 'username fullName profilePicture accountType isVerified');

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    res.status(200).json({
      success: true,
      users: comment.likes,
      count: comment.likesCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get users who disliked a comment
exports.getCommentDislikes = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
      .populate('dislikes', 'username fullName profilePicture accountType isVerified');

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    res.status(200).json({
      success: true,
      users: comment.dislikes,
      count: comment.dislikesCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Like/Unlike comment
exports.likeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const hasLiked = comment.likes.includes(req.user.id);
    const hasDisliked = comment.dislikes.includes(req.user.id);

    if (hasLiked) {
      comment.likes.pull(req.user.id);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    } else {
      comment.likes.push(req.user.id);
      comment.likesCount += 1;

      if (hasDisliked) {
        comment.dislikes.pull(req.user.id);
        comment.dislikesCount = Math.max(0, comment.dislikesCount - 1);
      }

      // Create notification
      if (comment.user.toString() !== req.user.id) {
        await Notification.create({
          recipient: comment.user,
          sender: req.user.id,
          type: 'like',
          comment: comment._id,
          post: comment.post,
          message: `${req.user.username} liked your comment`
        });
      }
    }

    await comment.save();

    res.status(200).json({
      success: true,
      likesCount: comment.likesCount,
      dislikesCount: comment.dislikesCount,
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

// Dislike comment
exports.dislikeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const hasLiked = comment.likes.includes(req.user.id);
    const hasDisliked = comment.dislikes.includes(req.user.id);

    if (hasDisliked) {
      comment.dislikes.pull(req.user.id);
      comment.dislikesCount = Math.max(0, comment.dislikesCount - 1);
    } else {
      comment.dislikes.push(req.user.id);
      comment.dislikesCount += 1;

      if (hasLiked) {
        comment.likes.pull(req.user.id);
        comment.likesCount = Math.max(0, comment.likesCount - 1);
      }
    }

    await comment.save();

    res.status(200).json({
      success: true,
      likesCount: comment.likesCount,
      dislikesCount: comment.dislikesCount,
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

// Delete comment (soft delete)
exports.deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this comment'
      });
    }

    // Soft delete
    comment.isDeleted = true;
    comment.text = '[Deleted]';
    await comment.save();

    // Update post comment count
    await Post.findByIdAndUpdate(comment.post, {
      $inc: { commentsCount: -1 }
    });

    // Update parent comment reply count
    if (comment.parentComment) {
      await Comment.findByIdAndUpdate(comment.parentComment, {
        $inc: { repliesCount: -1 }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};