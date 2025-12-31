const admin = require('firebase-admin');

// Initialize Firebase Admin
let firebaseInitialized = false;

if (!admin.apps.length) {
  try {
    // Validate environment variables
    if (!process.env.FIREBASE_PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID is not set');
    }
    if (!process.env.FIREBASE_CLIENT_EMAIL) {
      throw new Error('FIREBASE_CLIENT_EMAIL is not set');
    }
    if (!process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('FIREBASE_PRIVATE_KEY is not set');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });

    firebaseInitialized = true;
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error.message);
    console.error('Notifications will be disabled');
    firebaseInitialized = false;
  }
}

const sendNotification = async (token, title, body, data = {}) => {
  // Check if Firebase is initialized
  if (!firebaseInitialized) {
    console.warn('Firebase not initialized, skipping notification');
    return null;
  }

  try {
    const message = {
      notification: {
        title,
        body,
      },
      data,
      token,
    };

    const response = await admin.messaging().send(message);
    console.log('Successfully sent notification:', response);
    return response;
  } catch (error) {
    console.error('Error sending notification:', error.message);
    // Don't throw error - just log it
    return null;
  }
};

const sendMulticastNotification = async (tokens, title, body, data = {}) => {
  // Check if Firebase is initialized
  if (!firebaseInitialized) {
    console.warn('Firebase not initialized, skipping multicast notification');
    return null;
  }

  try {
    const message = {
      notification: {
        title,
        body,
      },
      data,
      tokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`Successfully sent ${response.successCount} notifications`);
    return response;
  } catch (error) {
    console.error('Error sending multicast notification:', error.message);
    // Don't throw error - just log it
    return null;
  }
};

module.exports = { 
  admin, 
  sendNotification, 
  sendMulticastNotification,
  firebaseInitialized // Export this so controllers can check if Firebase is available
};