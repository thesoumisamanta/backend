const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  coverImage: {
    public_id: String,
    url: String
  },
  stories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster user highlights queries
highlightSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Highlight', highlightSchema);
