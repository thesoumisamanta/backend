const express = require('express');
const router = express.Router();
const {
  createStory,
  getFollowingStories,
  getUserStories,
  viewStory,
  deleteStory,
  getStoryViewers
} = require('../controllers/storyController');
const { isAuthenticated } = require('../middleware/auth');
const upload = require('../middleware/multer');

router.post('/', isAuthenticated, upload.single('media'), createStory);
router.get('/following', isAuthenticated, getFollowingStories);
router.get('/user/:userId', isAuthenticated, getUserStories);
router.post('/:id/view', isAuthenticated, viewStory);
router.delete('/:id', isAuthenticated, deleteStory);
router.get('/:id/viewers', isAuthenticated, getStoryViewers);

module.exports = router;