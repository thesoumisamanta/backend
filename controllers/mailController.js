const BusinessMail = require('../models/businessMail.js');
const User = require('../models/user.js');
const { sendNotification } = require('../config/firebase');

// Send mail to business account
exports.sendMail = async (req, res) => {
  try {
    const { recipientId, subject, message } = req.body;

    const recipient = await User.findById(recipientId);

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    if (recipient.accountType !== 'business') {
      return res.status(400).json({
        success: false,
        message: 'You can only send mail to business accounts'
      });
    }

    const mail = await BusinessMail.create({
      sender: req.user.id,
      recipient: recipientId,
      subject,
      message
    });

    await mail.populate('sender', 'username fullName profilePicture accountType');

    // Send notification
    if (recipient.fcmToken) {
      await sendNotification(
        recipient.fcmToken,
        'New Business Inquiry',
        `${req.user.username}: ${subject}`,
        { type: 'mail', mailId: mail._id.toString() }
      );
    }

    res.status(201).json({
      success: true,
      mail
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reply to mail
exports.replyToMail = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const { mailId } = req.params;

    const parentMail = await BusinessMail.findById(mailId);

    if (!parentMail) {
      return res.status(404).json({
        success: false,
        message: 'Mail not found'
      });
    }

    // Verify user is recipient of parent mail
    if (parentMail.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only reply to mails sent to you'
      });
    }

    const reply = await BusinessMail.create({
      sender: req.user.id,
      recipient: parentMail.sender,
      subject: `Re: ${subject}`,
      message,
      parentMail: mailId
    });

    // Mark parent mail as replied
    parentMail.replied = true;
    await parentMail.save();

    await reply.populate('sender', 'username fullName profilePicture accountType');

    // Send notification
    const recipient = await User.findById(parentMail.sender);
    if (recipient.fcmToken) {
      await sendNotification(
        recipient.fcmToken,
        'Mail Reply',
        `${req.user.username} replied to your inquiry`,
        { type: 'mail', mailId: reply._id.toString() }
      );
    }

    res.status(201).json({
      success: true,
      mail: reply
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get inbox
exports.getInbox = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const mails = await BusinessMail.find({
      recipient: req.user.id
    })
      .populate('sender', 'username fullName profilePicture accountType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BusinessMail.countDocuments({
      recipient: req.user.id
    });

    const unreadCount = await BusinessMail.countDocuments({
      recipient: req.user.id,
      isRead: false
    });

    res.status(200).json({
      success: true,
      mails,
      unreadCount,
      currentPage: page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get sent mails
exports.getSentMails = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const mails = await BusinessMail.find({
      sender: req.user.id
    })
      .populate('recipient', 'username fullName profilePicture accountType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BusinessMail.countDocuments({
      sender: req.user.id
    });

    res.status(200).json({
      success: true,
      mails,
      currentPage: page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get mail thread
exports.getMailThread = async (req, res) => {
  try {
    const { mailId } = req.params;

    const mail = await BusinessMail.findById(mailId)
      .populate('sender', 'username fullName profilePicture accountType')
      .populate('recipient', 'username fullName profilePicture accountType');

    if (!mail) {
      return res.status(404).json({
        success: false,
        message: 'Mail not found'
      });
    }

    // Verify user is part of conversation
    if (mail.sender._id.toString() !== req.user.id &&
      mail.recipient._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this mail'
      });
    }

    // Get all mails in thread
    const threadMails = await BusinessMail.find({
      $or: [
        { _id: mailId },
        { parentMail: mailId }
      ]
    })
      .populate('sender', 'username fullName profilePicture accountType')
      .populate('recipient', 'username fullName profilePicture accountType')
      .sort({ createdAt: 1 });

    // Mark as read if user is recipient
    if (mail.recipient._id.toString() === req.user.id && !mail.isRead) {
      mail.isRead = true;
      await mail.save();
    }

    res.status(200).json({
      success: true,
      mails: threadMails
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete mail
exports.deleteMail = async (req, res) => {
  try {
    const mail = await BusinessMail.findById(req.params.mailId);

    if (!mail) {
      return res.status(404).json({
        success: false,
        message: 'Mail not found'
      });
    }

    // Only recipient or sender can delete
    if (mail.sender.toString() !== req.user.id &&
      mail.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this mail'
      });
    }

    await mail.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Mail deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};