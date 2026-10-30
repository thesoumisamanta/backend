const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messageType: {
    type: String,
    // FIX 7: Added 'audio' type support
    enum: ['text', 'image', 'video', 'audio', 'post', 'story_reply'],
    default: 'text'
  },
  text: {
    type: String,
    maxlength: 5000
  },
  // IMPORTANT: wrap every sub-field in { type: X } notation to prevent Mongoose
  // from misreading the `type` key as a schema-type declaration for the whole field.
  // Without this, `media: { type: String }` causes Mongoose to treat `media` as a
  // plain String, which throws "Cast to string failed" when an object is assigned.
  media: {
    public_id: { type: String, default: null },
    url:       { type: String, default: null },
    type:      { type: String, default: null }   // 'image' | 'video' | 'audio'
  },
  // FIX 6: Reply-to-message (WhatsApp-style message quoting)
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  sharedPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  sharedStory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  },
  // FIX 2 & 3: WhatsApp-style delivery status (sent → delivered → read)
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    emoji: {
      type: String,
      required: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for faster queries
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ chat: 1, sender: 1, status: 1 }); // For delivered-on-reconnect query
messageSchema.index({ chat: 1, text: 'text' }); // For message search (FIX 12)

module.exports = mongoose.model('Message', messageSchema);
