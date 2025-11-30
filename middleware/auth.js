const jwt = require('jsonwebtoken');
const User = require('../models/user.js');

exports.isAuthenticated = async (req, res, next) => {
  try {
    const { accessToken } = req.cookies;

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Please login to access this resource',
        requiresAuth: true
      });
    }

    try {
      const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
      req.user = await User.findById(decoded.id);

      if (!req.user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          requiresAuth: true
        });
      }

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token expired',
          tokenExpired: true
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        requiresAuth: true
      });
    }
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication error',
      requiresAuth: true
    });
  }
};

exports.authorizeAccountType = (...accountTypes) => {
  return (req, res, next) => {
    if (!accountTypes.includes(req.user.accountType)) {
      return res.status(403).json({
        success: false,
        message: `Account type ${req.user.accountType} is not allowed to access this resource`
      });
    }
    next();
  };
};