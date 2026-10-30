const express = require('express');
const router = express.Router();
const {
  getOrCreateChat,
  getChats,
  sendMessage,
  getMessages,
  markAsRead,
  searchMessages,
  clearChat,
  reactToMessage,
  deleteMessage,
  acceptChatRequest,
  declineChatRequest
} = require('../../controllers/chatController');
const { isAuthenticated } = require('../../middleware/auth');
const upload = require('../../middleware/multer');

// Chat session
router.get('/user/:userId', isAuthenticated, getOrCreateChat);
router.get('/', isAuthenticated, getChats);

// Messages (FIX 12: search before the dynamic :chatId/:messageId routes)
router.get('/:chatId/messages/search', isAuthenticated, searchMessages);
router.get('/:chatId/messages', isAuthenticated, getMessages);
router.post('/:chatId/message', isAuthenticated, upload.single('media'), sendMessage);
router.post('/:chatId/read', isAuthenticated, markAsRead);

// FIX 13: Clear entire chat history
router.delete('/:chatId/messages', isAuthenticated, clearChat);

// Reaction & Unsend
router.post('/messages/:messageId/react', isAuthenticated, reactToMessage);
router.delete('/messages/:messageId', isAuthenticated, deleteMessage);

// Message Requests
router.post('/:chatId/accept', isAuthenticated, acceptChatRequest);
router.post('/:chatId/decline', isAuthenticated, declineChatRequest);

module.exports = router;
