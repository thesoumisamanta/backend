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

    const comment = await Comment.create({
      post: postId,
      user: req.user.id,
      text,
      parentComment: parentCommentId || null
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
          ? `${req.user.username} replied to your comment`
          : `${req.user.username} commented on your post`
      });

      // Send push notification
      if (postOwner.fcmToken) {
        await sendNotification(
          postOwner.fcmToken,
          parentCommentId ? 'New Reply' : 'New Comment',
          parentCommentId
            ? `${req.user.username} replied to your comment`
            : `${req.user.username} commented on your post`
        );
      }
    }

    res.status(201).json({
      success: true,
      comment
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
      parentComment: null
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments({
      post: req.params.postId,
      parentComment: null
    });

    res.status(200).json({
      success: true,
      comments,
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
    const replies = await Comment.find({
      parentComment: req.params.commentId
    })
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      replies
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
      comment.likesCount -= 1;
    } else {
      comment.likes.push(req.user.id);
      comment.likesCount += 1;

      if (hasDisliked) {
        comment.dislikes.pull(req.user.id);
        comment.dislikesCount -= 1;
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
      comment.dislikesCount -= 1;
    } else {
      comment.dislikes.push(req.user.id);
      comment.dislikesCount += 1;

      if (hasLiked) {
        comment.likes.pull(req.user.id);
        comment.likesCount -= 1;
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

// Delete comment
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

    // Delete all replies
    await Comment.deleteMany({ parentComment: comment._id });

    // Update post comment count
    await Post.findByIdAndUpdate(comment.post, {
      $inc: { commentsCount: -(comment.repliesCount + 1) }
    });

    await comment.deleteOne();

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