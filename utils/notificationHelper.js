const Notification = require('../models/notification.js');
const User = require('../models/user.js');
const { sendNotification } = require('../config/firebase.js');
const { emitToUser } = require('../config/socket.js');

/**
 * Central notification dispatcher.
 * Creates a DB record, emits a real-time socket event, and optionally sends an FCM push.
 *
 * @param {Object} options
 * @param {string}   options.recipientId   - User who receives the notification
 * @param {string}   options.senderId      - User who triggered it
 * @param {string}   options.type          - follow | like | comment | reply | mention | share | story_view | story_reply
 * @param {string}   options.message       - Human-readable notification text
 * @param {string}  [options.postId]       - Related post id (if any)
 * @param {string}  [options.commentId]    - Related comment id (if any)
 * @param {string}  [options.storyId]      - Related story id (if any)
 * @param {string}  [options.fcmTitle]     - FCM notification title (defaults to type label)
 * @param {string}  [options.fcmBody]      - FCM notification body (defaults to message)
 * @param {Object}  [options.fcmData]      - Extra FCM data payload
 * @param {boolean} [options.skipPush]     - Skip FCM push (e.g. when recipient is online)
 */
const createNotification = async ({
  recipientId,
  senderId,
  type,
  message,
  postId = null,
  commentId = null,
  storyId = null,
  fcmTitle = null,
  fcmBody = null,
  fcmData = {},
  skipPush = false
}) => {
  try {
    // Don't notify yourself
    if (recipientId.toString() === senderId.toString()) return null;

    const notificationData = {
      recipient: recipientId,
      sender: senderId,
      type,
      message
    };
    if (postId)    notificationData.post    = postId;
    if (commentId) notificationData.comment = commentId;
    if (storyId)   notificationData.story   = storyId;

    const notification = await Notification.create(notificationData);

    // Populate sender info for the socket payload
    await notification.populate('sender', 'username fullName profilePicture accountType isVerified');
    if (postId)  await notification.populate('post',  'media caption');
    if (storyId) await notification.populate('story', 'media');

    // ── Real-time socket delivery ─────────────────────────────────────────
    emitToUser(recipientId.toString(), 'new_notification', {
      notification
    });

    // ── FCM push (only if recipient has a token and we don't skip) ────────
    if (!skipPush) {
      const recipient = await User.findById(recipientId).select('fcmToken isOnline');
      if (recipient && recipient.fcmToken && !recipient.isOnline) {
        await sendNotification(
          recipient.fcmToken,
          fcmTitle || typeToTitle(type),
          fcmBody  || message,
          { type, notificationId: notification._id.toString(), ...fcmData }
        );
      }
    }

    return notification;
  } catch (err) {
    // Never crash the main request because of a notification failure
    console.error(`[createNotification] Failed (type=${type}):`, err.message);
    return null;
  }
};

/** Map notification type to a readable FCM title */
const typeToTitle = (type) => {
  const titles = {
    follow:      'New Follower',
    like:        'New Like',
    comment:     'New Comment',
    reply:       'New Reply',
    mention:     'You were mentioned',
    share:       'Post Shared',
    story_view:  'Story Viewed',
    story_reply: 'Story Reply'
  };
  return titles[type] || 'New Notification';
};

/**
 * Extract @mentions from text and return an array of usernames.
 */
const extractMentions = (text = '') => {
  const matches = text.match(/@([a-zA-Z0-9_.]+)/g) || [];
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))];
};

module.exports = { createNotification, extractMentions };

