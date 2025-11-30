const User = require('../models/user.js');

// Send tokens in cookies
const sendTokens = async (user, statusCode, res) => {
  const accessToken = user.getAccessToken();
  const refreshToken = user.getRefreshToken();

  // Save refresh token to database
  await User.findByIdAndUpdate(user._id, { refreshToken });

  const accessTokenOptions = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  const refreshTokenOptions = {
    expires: new Date(
      Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ), // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  const userResponse = {
    _id: user._id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    accountType: user.accountType,
    bio: user.bio,
    profilePicture: user.profilePicture,
    coverPhoto: user.coverPhoto,
    location: user.location,
    website: user.website,
    businessEmail: user.businessEmail,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    postsCount: user.postsCount,
    isVerified: user.isVerified,
    isPrivate: user.isPrivate,
    createdAt: user.createdAt
  };

  res
    .status(statusCode)
    .cookie('accessToken', accessToken, accessTokenOptions)
    .cookie('refreshToken', refreshToken, refreshTokenOptions)
    .json({
      success: true,
      user: userResponse,
      accessToken,
      refreshToken
    });
};

// Register user
exports.register = async (req, res, next) => {
  try {
    const { username, email, password, fullName, accountType } = req.body;

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { username }] });

    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    user = await User.create({
      username,
      email,
      password,
      fullName,
      accountType: accountType || 'personal'
    });

    sendTokens(user, 201, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Login user
exports.login = async (req, res, next) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/username and password'
      });
    }

    const user = await User.findOne({
      $or: [
        { email: emailOrUsername },
        { username: emailOrUsername }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordMatched = await user.comparePassword(password);

    if (!isPasswordMatched) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    sendTokens(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Refresh access token
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found'
      });
    }

    // Verify refresh token
    const decoded = require('jsonwebtoken').verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    // Get user with refresh token
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify if refresh token matches
    if (user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    sendTokens(user, 200, res);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Logout user
exports.logout = async (req, res, next) => {
  try {
    // Clear refresh token from database
    await User.findByIdAndUpdate(req.user.id, { refreshToken: null });

    res
      .cookie('accessToken', null, {
        expires: new Date(Date.now()),
        httpOnly: true
      })
      .cookie('refreshToken', null, {
        expires: new Date(Date.now()),
        httpOnly: true
      })
      .status(200)
      .json({
        success: true,
        message: 'Logged out successfully'
      });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get current user
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update FCM token
exports.updateFCMToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;

    await User.findByIdAndUpdate(req.user.id, { fcmToken });

    res.status(200).json({
      success: true,
      message: 'FCM token updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};