const User = require('../models/user.js');
const sendEmail = require('../utils/sendEmail.js');

// Send tokens in cookies & data object
const sendTokens = async (user, statusCode, res, message = 'Login successful') => {
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

  res
    .status(statusCode)
    .cookie('accessToken', accessToken, accessTokenOptions)
    .cookie('refreshToken', refreshToken, refreshTokenOptions)
    .json({
      success: true,
      message,
      data: {
        accessToken,
        refreshToken
      }
    });
};

// Register user (Sends Verification OTP)
exports.register = async (req, res, next) => {
  try {
    const { username, email, password, fullName, accountType } = req.body;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.trim();

    // Check if user already exists
    let user = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
    });

    if (user) {
      // If user exists and is already email verified
      if (user.isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email or username'
        });
      }

      // If user exists but email is NOT verified, update their info and re-send verification OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.username = normalizedUsername;
      user.email = normalizedEmail;
      user.password = password;
      user.fullName = fullName;
      user.accountType = accountType || 'personal';
      user.emailVerificationOTP = otp;
      user.emailVerificationOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await sendEmail({
        email: user.email,
        subject: 'Travel Diary - Verify Your Email Address',
        otp,
        type: 'VERIFICATION'
      });

      return res.status(200).json({
        success: true,
        message: 'Registration successful! OTP code sent to your email address.'
      });
    }

    // Generate 6-digit OTP code for new user
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      fullName,
      accountType: accountType || 'personal',
      isEmailVerified: false,
      emailVerificationOTP: otp,
      emailVerificationOTPExpire: new Date(Date.now() + 10 * 60 * 1000)
    });

    await sendEmail({
      email: user.email,
      subject: 'Travel Diary - Verify Your Email Address',
      otp,
      type: 'VERIFICATION'
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! OTP code sent to your email address.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Verify Registration Email OTP
exports.verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and verification OTP code'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      emailVerificationOTP: otp,
      emailVerificationOTPExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification OTP code'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Resend Registration Email OTP
exports.resendEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your email address'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email address is already verified. Please log in.'
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    await sendEmail({
      email: user.email,
      subject: 'Travel Diary - Verify Your Email Address',
      otp,
      type: 'VERIFICATION'
    });

    res.status(200).json({
      success: true,
      message: 'Verification OTP resent to your email address',
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
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
        { email: emailOrUsername.toLowerCase().trim() },
        { username: emailOrUsername.trim() }
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

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Email address is not verified. Please verify your email first.'
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

// Forgot Password - Send OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your registered email address'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    await user.save({ validateBeforeSave: false });

    await sendEmail({
      email: user.email,
      subject: 'Travel Diary - Password Reset OTP',
      otp,
      type: 'RESET'
    });

    res.status(200).json({
      success: true,
      message: 'Verification OTP sent to your email address',
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordOTP: otp,
      resetPasswordOTPExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code'
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, OTP, and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordOTP: otp,
      resetPasswordOTPExpire: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code. Please request a new code.'
      });
    }

    // Set new password
    user.password = newPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully! Please log in with your new password.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};