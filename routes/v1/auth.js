const express = require('express');
const router = express.Router();
const {
  register,
  verifyEmailOTP,
  resendEmailOTP,
  login,
  logout,
  getMe,
  updateFCMToken,
  refreshToken,
  forgotPassword,
  verifyOTP,
  resetPassword
} = require('../../controllers/authController');
const { isAuthenticated } = require('../../middleware/auth');

router.post('/register', register);
router.post('/verify-email-otp', verifyEmailOTP);
router.post('/resend-email-otp', resendEmailOTP);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);

// Standard REST Logout
router.post('/logout', isAuthenticated, logout);

router.get('/me', isAuthenticated, getMe);
router.put('/fcm-token', isAuthenticated, updateFCMToken);

module.exports = router;
