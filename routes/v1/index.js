const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const userRoutes = require('./user');
const postRoutes = require('./post');
const commentRoutes = require('./comment');
const storyRoutes = require('./story');
const chatRoutes = require('./chat');
const mailRoutes = require('./mail');
const notificationRoutes = require('./notification');
const legalRoutes = require('./legal');

// API v1 Health Check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    version: 'v1',
    message: 'Server API v1 is healthy and running'
  });
});

// API v1 Routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/stories', storyRoutes);
router.use('/chats', chatRoutes);
router.use('/mails', mailRoutes);
router.use('/notifications', notificationRoutes);
router.use('/legal', legalRoutes);

module.exports = router;
