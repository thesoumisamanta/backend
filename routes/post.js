const express = require('express');
const router = express.Router();
const {
  createPost,
  getFeed,
  getUserPosts,
  getPost,
  likePost,
  dislikePost,
  deletePost,
  sharePost
} = require('../controllers/postController');
const { isAuthenticated } = require('../middleware/auth');
const upload = require('../middleware/multer');

router.post('/', isAuthenticated, upload.array('media', 10), createPost);
router.get('/feed', isAuthenticated, getFeed);
router.get('/user/:userId', isAuthenticated, getUserPosts);
router.get('/:id', isAuthenticated, getPost);
router.post('/:id/like', isAuthenticated, likePost);
router.post('/:id/dislike', isAuthenticated, dislikePost);
router.delete('/:id', isAuthenticated, deletePost);
router.post('/:id/share', isAuthenticated, sharePost);

module.exports = router;