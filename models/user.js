const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false
  },
  fullName: {
    type: String,
    required: [true, 'Please provide your full name'],
    trim: true
  },
  accountType: {
    type: String,
    enum: ['personal', 'business'],
    default: 'personal'
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },
  profilePicture: {
    public_id: String,
    url: {
      type: String,
      default: '' 
    }
  },
  coverPhoto: {
    public_id: String,
    url: String
  },
  location: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  businessEmail: {
    type: String,
    default: ''
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followersCount: {
    type: Number,
    default: 0
  },
  followingCount: {
    type: Number,
    default: 0
  },
  postsCount: {
    type: Number,
    default: 0
  },
  fcmToken: {
    type: String,
    default: null
  },
  refreshToken: {
    type: String,
    select: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});


userSchema.pre('save', async function (next) {
  if (!this.profilePicture.url || this.profilePicture.url === '') {
    const name = encodeURIComponent(this.fullName);

    // Different colors for personal vs business accounts
    const background = this.accountType === 'business' ? '4285F4' : '34A853';

    this.profilePicture.url = `https://ui-avatars.com/api/?name=${name}&size=512&background=${background}&color=fff&bold=true`;
  }

  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  next();
});

// Compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate Access Token
userSchema.methods.getAccessToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRE
  });
};

// Generate Refresh Token
userSchema.methods.getRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE
  });
};

// Verify Refresh Token
userSchema.methods.verifyRefreshToken = function (token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    return decoded.id === this._id.toString();
  } catch (error) {
    return false;
  }
};

module.exports = mongoose.model('User', userSchema);