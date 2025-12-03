const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    maxlength: 2000
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  // Store user IDs for likes
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Store user IDs for dislikes
  dislikes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  dislikesCount: {
    type: Number,
    default: 0
  },
  repliesCount: {
    type: Number,
    default: 0
  },
  // Track nesting level (0 = root comment, 1 = reply, 2 = reply to reply, etc.)
  depth: {
    type: Number,
    default: 0
  },
  // Track if comment is edited
  isEdited: {
    type: Boolean,
    default: false
  },
  // Track if comment is deleted (soft delete)
  isDeleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: 1 });
commentSchema.index({ user: 1 });

// Virtual for nested replies
commentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment'
});

// Method to check if user has liked
commentSchema.methods.hasUserLiked = function(userId) {
  return this.likes.includes(userId);
};

// Method to check if user has disliked
commentSchema.methods.hasUserDisliked = function(userId) {
  return this.dislikes.includes(userId);
};

module.exports = mongoose.model('Comment', commentSchema);