const express = require('express');
const router = express.Router();
const {
  createComment,
  getPostComments,
  getCommentReplies,
  likeComment,
  dislikeComment,
  deleteComment,
  updateComment,
  getCommentLikes,
  getCommentDislikes
} = require('../controllers/commentController');
const { isAuthenticated } = require('../middleware/auth');

// Comment CRUD
router.post('/post/:postId', isAuthenticated, createComment);
router.get('/post/:postId', isAuthenticated, getPostComments);
router.put('/:id', isAuthenticated, updateComment);
router.delete('/:id', isAuthenticated, deleteComment);

// Replies
router.get('/:commentId/replies', isAuthenticated, getCommentReplies);

// Likes & Dislikes
router.post('/:id/like', isAuthenticated, likeComment);
router.post('/:id/dislike', isAuthenticated, dislikeComment);

// Get users who liked/disliked
router.get('/:id/likes', isAuthenticated, getCommentLikes);
router.get('/:id/dislikes', isAuthenticated, getCommentDislikes);

module.exports = router;