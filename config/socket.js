const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.js');

let io;
// Map to track connected users: userId -> Set of socketIds
const userSockets = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();

    // Register user socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Update user online status in database
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

    // Broadcast user online status
    socket.broadcast.emit('user_online', { userId, lastSeen: new Date() });

    // Join specific chat room
    socket.on('join_chat', (chatId) => {
      socket.join(chatId);
    });

    // Leave specific chat room
    socket.on('leave_chat', (chatId) => {
      socket.leave(chatId);
    });

    // Typing Indicators
    socket.on('typing', ({ chatId, recipientId }) => {
      if (chatId) {
        socket.to(chatId).emit('user_typing', { chatId, userId });
      } else if (recipientId) {
        emitToUser(recipientId, 'user_typing', { userId });
      }
    });

    socket.on('stop_typing', ({ chatId, recipientId }) => {
      if (chatId) {
        socket.to(chatId).emit('user_stop_typing', { chatId, userId });
      } else if (recipientId) {
        emitToUser(recipientId, 'user_stop_typing', { userId });
      }
    });

    // Disconnect Handler
    socket.on('disconnect', async () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          const now = new Date();
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: now });
          socket.broadcast.emit('user_offline', { userId, lastSeen: now });
        }
      }
    });
  });

  return io;
};

// Utility to emit socket event to a specific user
const emitToUser = (userId, event, data) => {
  if (!io) return;
  const targetId = userId.toString();
  const sockets = userSockets.get(targetId);
  if (sockets && sockets.size > 0) {
    sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  }
};

// Utility to emit socket event to a chat room
const emitToRoom = (roomId, event, data) => {
  if (!io) return;
  io.to(roomId).emit(event, data);
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRoom
};
