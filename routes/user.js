const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  updateProfile,
  followUnfollowUser,
  searchUsers,
  getFollowers,
  getFollowing
} = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/auth');
const upload = require('../middleware/multer');

router.get('/profile/:id', isAuthenticated, getUserProfile);
router.put('/profile', isAuthenticated, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'coverPhoto', maxCount: 1 }
]), updateProfile);
router.post('/follow/:id', isAuthenticated, followUnfollowUser);
router.get('/search', isAuthenticated, searchUsers);
router.get('/:id/followers', isAuthenticated, getFollowers);
router.get('/:id/following', isAuthenticated, getFollowing);

module.exports = router;