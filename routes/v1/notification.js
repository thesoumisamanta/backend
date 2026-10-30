const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications
} = require('../../controllers/notificationController');
const { isAuthenticated } = require('../../middleware/auth');

router.get('/', isAuthenticated, getNotifications);
router.put('/read-all', isAuthenticated, markAllAsRead);
router.put('/:id/read', isAuthenticated, markAsRead);
router.delete('/all', isAuthenticated, deleteAllNotifications);  // must be before /:id
router.delete('/:id', isAuthenticated, deleteNotification);

module.exports = router;
