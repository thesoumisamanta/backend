require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDatabase = require('./config/database');
const errorHandler = require('./middleware/error');

// Import master versioned routes
const apiRoutes = require('./routes');

const app = express();

// Connect to database
connectDatabase();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(cors({
  origin: true, //process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Mount strict versioned API routes (/api/v1/...)
app.use('/api', apiRoutes);

// Catch unversioned or invalid API endpoints and return 404
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Invalid or unversioned API route '${req.originalUrl}'. All requests must use strict versioning (e.g. /api/v1/...)`
  });
});

// Error handler middleware (must be last)
app.use(errorHandler);

const http = require('http');
const { initSocket } = require('./config/socket');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} on all interfaces (Strict API v1): http://localhost:${PORT}/api/v1`);
});

// Initialize Socket.io
initSocket(server);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});