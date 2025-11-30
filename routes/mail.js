const express = require('express');
const router = express.Router();
const {
  sendMail,
  replyToMail,
  getInbox,
  getSentMails,
  getMailThread,
  deleteMail
} = require('../controllers/mailController');
const { isAuthenticated } = require('../middleware/auth');

router.post('/send', isAuthenticated, sendMail);
router.post('/:mailId/reply', isAuthenticated, replyToMail);
router.get('/inbox', isAuthenticated, getInbox);
router.get('/sent', isAuthenticated, getSentMails);
router.get('/:mailId/thread', isAuthenticated, getMailThread);
router.delete('/:mailId', isAuthenticated, deleteMail);

module.exports = router;