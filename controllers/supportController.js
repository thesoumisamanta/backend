const SupportTicket = require('../models/supportTicket.js');
const sendEmail = require('../utils/sendEmail.js');

// @desc    Submit a contact support inquiry / ticket
// @route   POST /api/v1/support/contact  or  POST /api/v1/contact
// @access  Public (Optional Auth attaches user account)
exports.contactSupport = async (req, res) => {
  try {
    const { name, email, subject, message, priority } = req.body;

    // Validate presence of required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, subject, and message'
      });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    // Field length validations
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 2 and 100 characters'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (trimmedSubject.length < 3 || trimmedSubject.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Subject must be between 3 and 200 characters'
      });
    }

    if (trimmedMessage.length < 5 || trimmedMessage.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message must be between 5 and 5000 characters'
      });
    }

    // Create support ticket in database
    const ticket = await SupportTicket.create({
      name: trimmedName,
      email: trimmedEmail,
      subject: trimmedSubject,
      message: trimmedMessage,
      priority: ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium',
      user: req.user ? req.user._id : null
    });

    // 1. Send automated confirmation email to the user
    try {
      const userEmailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; color: #1e293b;">
          <div style="background: linear-gradient(135deg, #2563eb, #3b82f6); padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Vagabond Support</h1>
            <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">We have received your message</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 16px; line-height: 1.5; margin-top: 0;">Hi <strong>${trimmedName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #475569;">
              Thank you for contacting Vagabond support. Your inquiry has been received and assigned to our team.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;"><strong>Ticket Reference:</strong></p>
              <p style="margin: 0 0 12px; font-size: 18px; font-weight: 700; color: #2563eb; letter-spacing: 1px;">${ticket.ticketId}</p>
              <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;"><strong>Subject:</strong></p>
              <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">${trimmedSubject}</p>
              <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;"><strong>Your Message:</strong></p>
              <p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-wrap;">${trimmedMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Our support team typically reviews and replies within <strong>24 to 48 hours</strong>.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
              Vagabond &bull; samantasoumi10@gmail.com &bull; https://vagabond.clipboux.online
            </p>
          </div>
        </div>
      `;

      await sendEmail({
        email: trimmedEmail,
        subject: `[Support Ticket Received: ${ticket.ticketId}] ${trimmedSubject}`,
        message: `Hi ${trimmedName},\n\nThank you for reaching out. We have received your inquiry (Ticket: ${ticket.ticketId}). Our support team will reply within 24-48 hours.\n\nSubject: ${trimmedSubject}\nMessage:\n${trimmedMessage}`,
        html: userEmailHtml,
        type: 'SUPPORT'
      });
    } catch (emailError) {
      console.error('Support confirmation email failed to send:', emailError.message);
    }

    // 2. Send notification to internal support team inbox
    try {
      const supportInbox = process.env.SUPPORT_EMAIL || 'samantasoumi10@gmail.com';
      const supportNoticeHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #dc2626;">New Support Ticket: ${ticket.ticketId}</h2>
          <p><strong>From:</strong> ${trimmedName} (&lt;${trimmedEmail}&gt;)</p>
          <p><strong>User ID:</strong> ${req.user ? req.user._id : 'Guest / Unauthenticated'}</p>
          <p><strong>Priority:</strong> ${ticket.priority.toUpperCase()}</p>
          <p><strong>Subject:</strong> ${trimmedSubject}</p>
          <hr/>
          <p><strong>Message:</strong></p>
          <blockquote style="background: #f1f5f9; padding: 12px; border-left: 4px solid #2563eb; margin: 10px 0;">
            ${trimmedMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}
          </blockquote>
        </div>
      `;

      await sendEmail({
        email: supportInbox,
        subject: `[New Ticket: ${ticket.ticketId}] ${trimmedSubject}`,
        message: `New support ticket received from ${trimmedName} (${trimmedEmail}).\n\nTicket: ${ticket.ticketId}\nSubject: ${trimmedSubject}\n\nMessage:\n${trimmedMessage}`,
        html: supportNoticeHtml,
        type: 'ADMIN_ALERT'
      });
    } catch (adminEmailError) {
      console.error('Support admin alert email failed to send:', adminEmailError.message);
    }

    // Return response
    return res.status(201).json({
      success: true,
      message: 'Support request submitted successfully. Our team will get back to you shortly.',
      data: {
        ticketId: ticket.ticketId,
        name: ticket.name,
        email: ticket.email,
        subject: ticket.subject,
        message: ticket.message,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt
      }
    });
  } catch (error) {
    console.error('Error in contactSupport:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while submitting your support inquiry'
    });
  }
};

// @desc    Get tickets submitted by the authenticated user
// @route   GET /api/v1/support/tickets
// @access  Private
exports.getMyTickets = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { user: req.user._id },
        { email: req.user.email.toLowerCase() }
      ]
    };

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SupportTicket.countDocuments(query);

    return res.status(200).json({
      success: true,
      count: tickets.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: tickets
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching tickets'
    });
  }
};

// @desc    Get ticket details by ticketId
// @route   GET /api/v1/support/tickets/:ticketId
// @access  Private
exports.getTicketDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await SupportTicket.findOne({
      $or: [{ ticketId }, { _id: ticketId.match(/^[0-9a-fA-F]{24}$/) ? ticketId : null }]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    // Check authorization: must be the creator or match user's email
    const isOwner =
      (ticket.user && ticket.user.toString() === req.user._id.toString()) ||
      ticket.email.toLowerCase() === req.user.email.toLowerCase();

    if (!isOwner && req.user.accountType !== 'business') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this support ticket'
      });
    }

    return res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching ticket details'
    });
  }
};
