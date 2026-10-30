const Comment = require('../models/comment.js');
const Post = require('../models/post.js');
const User = require('../models/user.js');
const Notification = require('../models/notification.js');
const { createNotification, extractMentions } = require('../utils/notificationHelper');

// ─────────────────────────────────────────────────────────────────────────────
// Create comment or reply
// FIX 2: Uses createNotification (DB + socket + FCM)
// FIX 5: Parses @mentions and notifies tagged users
// ─────────────────────────────────────────────────────────────────────────────
exports.createComment = async (req, res) => {
  try {
    const { text, parentCommentId } = req.body;
    const postId = req.params.postId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    let depth = 0;
    let parentComment = null;

    if (parentCommentId) {
      parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ success: false, message: 'Parent comment not found' });
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

    // Update counts
    post.commentsCount += 1;
    await post.save();

    if (parentCommentId) {
      await Comment.findByIdAndUpdate(parentCommentId, { $inc: { repliesCount: 1 } });
    }

    // ── Notify post owner (if not self) ────────────────────────────────
    const postOwnerId = post.user.toString();
    if (postOwnerId !== req.user.id) {
      createNotification({
        recipientId: postOwnerId,
        senderId: req.user._id,
        type: parentCommentId ? 'reply' : 'comment',
        message: parentCommentId
          ? `${req.user.username} replied to a comment on your post`
          : `${req.user.username} commented on your post`,
        postId: post._id,
        commentId: comment._id,
        fcmTitle: parentCommentId ? 'New Reply' : 'New Comment',
        fcmBody: text.substring(0, 100),
        fcmData: { postId: post._id.toString(), commentId: comment._id.toString() }
      });
    }

    // ── Notify parent comment owner when someone replies ────────────────
    if (parentCommentId && parentComment) {
      const parentCommentOwnerId = parentComment.user.toString();
      if (parentCommentOwnerId !== req.user.id && parentCommentOwnerId !== postOwnerId) {
        createNotification({
          recipientId: parentCommentOwnerId,
          senderId: req.user._id,
          type: 'reply',
          message: `${req.user.username} replied to your comment`,
          postId: post._id,
          commentId: comment._id,
          fcmTitle: 'New Reply',
          fcmBody: text.substring(0, 100),
          fcmData: { postId: post._id.toString(), commentId: comment._id.toString() }
        });
      }
    }

    // ── FIX 5: Parse @mentions and notify each tagged user ──────────────
    const mentionedUsernames = extractMentions(text);
    if (mentionedUsernames.length > 0) {
      const mentionedUsers = await User.find({
        username: { $in: mentionedUsernames }
      }).select('_id username');

      // Notify mentioned users (except self, post owner, parent comment owner — already notified above)
      const alreadyNotified = new Set([
        req.user.id,
        postOwnerId,
        parentComment?.user?.toString()
      ].filter(Boolean));

      for (const mentionedUser of mentionedUsers) {
        const mentionedId = mentionedUser._id.toString();
        if (!alreadyNotified.has(mentionedId)) {
          createNotification({
            recipientId: mentionedUser._id,
            senderId: req.user._id,
            type: 'mention',
            message: `${req.user.username} mentioned you in a comment`,
            postId: post._id,
            commentId: comment._id,
            fcmTitle: 'You were mentioned',
            fcmBody: text.substring(0, 100),
            fcmData: { postId: post._id.toString() }
          });
          alreadyNotified.add(mentionedId);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: {
        comment: {
          ...comment.toObject(),
          hasLiked: false,
          hasDisliked: false
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get post comments (paginated)
// ─────────────────────────────────────────────────────────────────────────────
exports.getPostComments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {
      post: req.params.postId,
      parentComment: null,
      $or: [
        { isDeleted: { $ne: true } },
        { repliesCount: { $gt: 0 } }
      ]
    };

    const comments = await Comment.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Comment.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Comments retrieved successfully',
      data: {
        comments: comments.map(c => ({
          ...c,
          hasLiked: c.likes.some(id => id.toString() === req.user.id),
          hasDisliked: c.dislikes.some(id => id.toString() === req.user.id)
        })),
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalComments: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get comment replies (paginated)
// ─────────────────────────────────────────────────────────────────────────────
exports.getCommentReplies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      parentComment: req.params.commentId,
      $or: [
        { isDeleted: { $ne: true } },
        { repliesCount: { $gt: 0 } }
      ]
    };

    const replies = await Comment.find(filter)
      .populate('user', 'username fullName profilePicture accountType isVerified')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Comment.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Comment replies retrieved successfully',
      data: {
        replies: replies.map(r => ({
          ...r,
          hasLiked: r.likes.some(id => id.toString() === req.user.id),
          hasDisliked: r.dislikes.some(id => id.toString() === req.user.id)
        })),
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalReplies: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update / Edit comment
// ─────────────────────────────────────────────────────────────────────────────
exports.updateComment = async (req, res) => {
  try {
    const { text } = req.body;
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
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
      message: 'Comment updated successfully',
      data: {
        comment: {
          ...comment.toObject(),
          hasLiked: comment.likes.some(id => id.toString() === req.user.id),
          hasDisliked: comment.dislikes.some(id => id.toString() === req.user.id)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get users who liked a comment
// ─────────────────────────────────────────────────────────────────────────────
exports.getCommentLikes = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
      .populate('likes', 'username fullName profilePicture accountType isVerified');

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Users who liked comment retrieved successfully',
      data: { users: comment.likes, count: comment.likesCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get users who disliked a comment
// ─────────────────────────────────────────────────────────────────────────────
exports.getCommentDislikes = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
      .populate('dislikes', 'username fullName profilePicture accountType isVerified');

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Users who disliked comment retrieved successfully',
      data: { users: comment.dislikes, count: comment.dislikesCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Like / Unlike comment
// FIX 5: Now uses createNotification (adds socket + FCM that was missing)
// ─────────────────────────────────────────────────────────────────────────────
exports.likeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
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

      // FIX 5: createNotification now handles DB + socket + FCM (was missing FCM before)
      createNotification({
        recipientId: comment.user,
        senderId: req.user._id,
        type: 'like',
        message: `${req.user.username} liked your comment`,
        postId: comment.post,
        commentId: comment._id,
        fcmTitle: 'New Like',
        fcmBody: `${req.user.username} liked your comment`,
        fcmData: { commentId: comment._id.toString() }
      });
    }

    await comment.save();

    res.status(200).json({
      success: true,
      message: hasLiked ? 'Comment unliked successfully' : 'Comment liked successfully',
      data: {
        likesCount: comment.likesCount,
        dislikesCount: comment.dislikesCount,
        hasLiked: !hasLiked,
        hasDisliked: false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Dislike comment (no notification per design)
// ─────────────────────────────────────────────────────────────────────────────
exports.dislikeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
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
      message: hasDisliked ? 'Comment dislike removed' : 'Comment disliked',
      data: {
        likesCount: comment.likesCount,
        dislikesCount: comment.dislikesCount,
        hasLiked: false,
        hasDisliked: !hasDisliked
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Delete comment (soft delete)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this comment'
      });
    }

    comment.isDeleted = true;
    comment.text = '[Deleted]';
    await comment.save();

    await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -1 } });

    if (comment.parentComment) {
      await Comment.findByIdAndUpdate(comment.parentComment, { $inc: { repliesCount: -1 } });
    }

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
