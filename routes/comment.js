const express = require('express');
const router = express.Router();
const {
  createComment,
  getPostComments,
  getCommentReplies,
  likeComment,
  dislikeComment,
  deleteComment
} = require('../controllers/commentController');
const { isAuthenticated } = require('../middleware/auth');

router.post('/post/:postId', isAuthenticated, createComment);
router.get('/post/:postId', isAuthenticated, getPostComments);
router.get('/:commentId/replies', isAuthenticated, getCommentReplies);
router.post('/:id/like', isAuthenticated, likeComment);
router.post('/:id/dislike', isAuthenticated, dislikeComment);
router.delete('/:id', isAuthenticated, deleteComment);

module.exports = router;