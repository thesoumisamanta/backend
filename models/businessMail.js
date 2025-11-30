const mongoose = require('mongoose');

const businessMailSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    maxlength: 200
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    maxlength: 10000
  },
  isRead: {
    type: Boolean,
    default: false
  },
  replied: {
    type: Boolean,
    default: false
  },
  parentMail: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessMail',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
businessMailSchema.index({ recipient: 1, createdAt: -1 });
businessMailSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model('BusinessMail', businessMailSchema);