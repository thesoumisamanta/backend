const express = require('express');
const router = express.Router();
const {
  contactSupport,
  getMyTickets,
  getTicketDetails
} = require('../../controllers/supportController');
const { isAuthenticated, optionalAuth } = require('../../middleware/auth');

// @route   POST /api/v1/support/contact  or  POST /api/v1/support
// @desc    Submit a contact support inquiry (payload: { name, email, subject, message })
// @access  Public (attaches user info if logged in)
router.post('/contact', optionalAuth, contactSupport);
router.post('/', optionalAuth, contactSupport);

// @route   GET /api/v1/support/tickets
// @desc    Get tickets submitted by authenticated user
// @access  Private
router.get('/tickets', isAuthenticated, getMyTickets);

// @route   GET /api/v1/support/tickets/:ticketId
// @desc    Get ticket details
// @access  Private
router.get('/tickets/:ticketId', isAuthenticated, getTicketDetails);

module.exports = router;
