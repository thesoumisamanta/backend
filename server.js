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

// Mount API routes (/api/v1/... and fallback /api/...)
app.use('/api', apiRoutes);

// Error handler middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} on all interfaces (API v1): http://localhost:${PORT}/api/v1`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});