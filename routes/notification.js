const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, getNotifications);
router.put('/:id/read', isAuthenticated, markAsRead);
router.put('/read-all', isAuthenticated, markAllAsRead);
router.delete('/:id', isAuthenticated, deleteNotification);

module.exports = router;