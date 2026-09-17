const jwt = require('jsonwebtoken');
const User = require('../models/user.js');

exports.isAuthenticated = async (req, res, next) => {
  try {
    let token = req.cookies.accessToken;

    // Check Authorization header (Bearer token) if cookie is not present
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please login to access this resource',
        requiresAuth: true
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
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

// Optional authentication: attaches user if token exists, but doesn't block unauthenticated requests
exports.optionalAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = await User.findById(decoded.id);
      } catch (err) {
        // Token invalid or expired, continue as guest
        req.user = null;
      }
    }
    next();
  } catch (error) {
    next();
  }
};