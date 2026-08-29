const express = require('express');
const router = express.Router();
const {
  createStory,
  getFollowingStories,
  getUserStories,
  viewStory,
  deleteStory,
  getStoryViewers,
  replyToStory,
  getArchivedStories,
  createHighlight,
  getUserHighlights,
  updateHighlight,
  deleteHighlight
} = require('../../controllers/storyController');
const { isAuthenticated } = require('../../middleware/auth');
const upload = require('../../middleware/multer');

// Main Story Routes
router.post('/', isAuthenticated, upload.single('media'), createStory);
router.get('/following', isAuthenticated, getFollowingStories);
router.get('/archive', isAuthenticated, getArchivedStories);

// Story Highlights Routes
router.post('/highlights', isAuthenticated, upload.single('coverImage'), createHighlight);
router.get('/highlights/user/:userId', isAuthenticated, getUserHighlights);
router.put('/highlights/:id', isAuthenticated, upload.single('coverImage'), updateHighlight);
router.delete('/highlights/:id', isAuthenticated, deleteHighlight);

// Individual Story Routes (by Story ID)
router.get('/user/:userId', isAuthenticated, getUserStories);
router.post('/:id/view', isAuthenticated, viewStory);
router.post('/:id/reply', isAuthenticated, replyToStory);
router.get('/:id/viewers', isAuthenticated, getStoryViewers);
router.delete('/:id', isAuthenticated, deleteStory);

module.exports = router;
