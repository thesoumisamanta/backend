const express = require('express');
const router = express.Router();
const {
  getOrCreateChat,
  getChats,
  sendMessage,
  getMessages,
  markAsRead,
  reactToMessage,
  deleteMessage,
  acceptChatRequest,
  declineChatRequest
} = require('../../controllers/chatController');
const { isAuthenticated } = require('../../middleware/auth');
const upload = require('../../middleware/multer');

router.get('/user/:userId', isAuthenticated, getOrCreateChat);
router.get('/', isAuthenticated, getChats);
router.post('/:chatId/message', isAuthenticated, upload.single('media'), sendMessage);
router.get('/:chatId/messages', isAuthenticated, getMessages);
router.post('/:chatId/read', isAuthenticated, markAsRead);

// Reaction & Unsend Message
router.post('/messages/:messageId/react', isAuthenticated, reactToMessage);
router.delete('/messages/:messageId', isAuthenticated, deleteMessage);

// Message Requests
router.post('/:chatId/accept', isAuthenticated, acceptChatRequest);
router.post('/:chatId/decline', isAuthenticated, declineChatRequest);

module.exports = router;
