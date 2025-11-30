const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getMe,
  updateFCMToken,
  refreshToken
} = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.get('/logout', isAuthenticated, logout);
router.get('/me', isAuthenticated, getMe);
router.put('/fcm-token', isAuthenticated, updateFCMToken);

module.exports = router;