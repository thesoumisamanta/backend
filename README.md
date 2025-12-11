# Travel Diary - Backend API

A comprehensive RESTful API built with Node.js, Express, and MongoDB for a travel social media application. Features include JWT authentication with refresh tokens, real-time notifications via Firebase, media storage with Cloudinary, and complete social networking functionality.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Authentication](#authentication)
- [File Upload](#file-upload)
- [Push Notifications](#push-notifications)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

---

## 🎯 Overview

The Travel Diary backend is a production-ready Node.js API that powers a full-featured social media platform for travel enthusiasts. It handles user authentication, content management, real-time messaging, push notifications, and media storage.

### Key Highlights

- **Secure Authentication**: JWT-based auth with access (24h) and refresh tokens (7d)
- **Social Features**: Posts, stories, comments, likes/dislikes, following system
- **Real-time Chat**: One-on-one messaging between mutually following users
- **Media Management**: Image and video upload via Cloudinary CDN
- **Push Notifications**: Firebase Cloud Messaging integration
- **Account Types**: Personal and Business accounts with different capabilities
- **Scalable Architecture**: Clean MVC pattern with middleware and controllers

---

## ✨ Features

### Authentication & Authorization
- User registration and login with JWT tokens
- Access token (24h) and refresh token (7d) system
- Automatic token refresh mechanism
- Password hashing with bcrypt (10 rounds)
- Cookie-based token storage
- Role-based access control (Personal/Business accounts)

### User Management
- Profile creation and editing
- Profile and cover photo upload
- Follow/unfollow system (Instagram-like)
- Public and private account options
- User search functionality
- Followers and following lists

### Content Features
- **Posts**: Create image/video/short posts with captions
- **Stories**: 24-hour auto-expiring stories
- **Comments**: Nested comments with like/dislike
- **Likes/Dislikes**: Reaction system for posts and comments
- **Tags**: Hashtag support for posts
- **Location**: Geolocation tagging

### Social Interaction
- Real-time chat between mutually following users
- Message read receipts
- Share posts
- Business mail system for business inquiries
- Notification system for all interactions

### Media Handling
- Image and video upload to Cloudinary
- Automatic thumbnail generation for videos
- Multiple images per post (up to 10)
- Image optimization and CDN delivery

---

## 🛠 Tech Stack

### Core Technologies
- **Runtime**: Node.js (v16+)
- **Framework**: Express.js 4.x
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt

### Third-Party Services
- **Cloud Storage**: Cloudinary
- **Push Notifications**: Firebase Admin SDK
- **File Upload**: Multer

### Key Dependencies
```json
{
  "express": "^4.18.2",
  "mongoose": "^8.0.0",
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^5.1.1",
  "multer": "^1.4.5-lts.1",
  "cloudinary": "^1.41.0",
  "firebase-admin": "^12.0.0",
  "cookie-parser": "^1.4.6",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1"
}
```

---

## 🏗 Architecture

### MVC Pattern
```
Backend Architecture
│
├── Routes Layer (HTTP endpoints)
│   └── Define API endpoints and HTTP methods
│
├── Middleware Layer
│   ├── Authentication (JWT verification)
│   ├── File Upload (Multer)
│   └── Error Handling
│
├── Controller Layer
│   └── Business logic and request handling
│
├── Service Layer
│   ├── Firebase (Push notifications)
│   └── Cloudinary (Media storage)
│
└── Data Layer (MongoDB + Mongoose)
    └── Database models and schema
```

---

## 📦 Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 16.x
- **MongoDB** >= 5.x (local or MongoDB Atlas)
- **npm** or **yarn** package manager
- **Cloudinary Account** (free tier available)
- **Firebase Project** (for push notifications)

### Required Accounts

1. **MongoDB Atlas** (or local MongoDB)
   - Sign up at: https://www.mongodb.com/cloud/atlas

2. **Cloudinary**
   - Sign up at: https://cloudinary.com/
   - Get: Cloud name, API key, API secret

3. **Firebase**
   - Create project at: https://console.firebase.google.com/
   - Download service account key JSON

---

## 🚀 Installation

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd backend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Create Environment File
```bash
cp .env.example .env
```

### Step 4: Configure Environment Variables
Edit `.env` file with your credentials (see [Configuration](#configuration))

### Step 5: Start the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server will start on `http://localhost:5000`

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/travel-diary
# For MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/travel-diary

# JWT Secrets (IMPORTANT: Use strong, different secrets in production!)
JWT_ACCESS_SECRET=your_super_strong_access_secret_key_min_32_chars
JWT_REFRESH_SECRET=your_super_strong_refresh_secret_key_min_32_chars_different
JWT_ACCESS_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d
COOKIE_EXPIRE=7

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Firebase Configuration
# For Development: Use serviceAccountKey.json file
# For Production: Use these environment variables
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"

# CORS
CLIENT_URL=http://localhost:3000
```

### Firebase Setup (Development)

1. Download `serviceAccountKey.json` from Firebase Console:
   - Project Settings → Service Accounts → Generate New Private Key

2. Place file in backend root:
   ```
   backend/
   └── serviceAccountKey.json
   ```

3. Add to `.gitignore`:
   ```
   serviceAccountKey.json
   ```

### Cloudinary Setup

1. Sign up at https://cloudinary.com/
2. Go to Dashboard
3. Copy credentials:
   - Cloud name
   - API Key
   - API Secret
4. Add to `.env`

---

## 🗄️ Database Schema

### User Model
```javascript
{
  username: String (unique, 3-30 chars),
  email: String (unique, valid email),
  password: String (hashed with bcrypt),
  fullName: String,
  accountType: String (enum: 'personal', 'business'),
  bio: String (max 500 chars),
  profilePicture: { public_id: String, url: String },
  coverPhoto: { public_id: String, url: String },
  location: String,
  website: String,
  businessEmail: String,
  followers: [ObjectId],
  following: [ObjectId],
  followersCount: Number,
  followingCount: Number,
  postsCount: Number,
  fcmToken: String,
  refreshToken: String (hashed),
  isVerified: Boolean,
  isPrivate: Boolean,
  createdAt: Date
}
```

### Post Model
```javascript
{
  user: ObjectId (ref: User),
  caption: String (max 5000 chars),
  postType: String (enum: 'image', 'video', 'short'),
  media: [{ public_id, url, type, thumbnail, duration }],
  location: String,
  tags: [String],
  likes: [ObjectId],
  dislikes: [ObjectId],
  likesCount: Number,
  dislikesCount: Number,
  commentsCount: Number,
  sharesCount: Number,
  viewsCount: Number,
  isCommentEnabled: Boolean,
  createdAt: Date
}
```

### Other Models
- **Story**: 24-hour expiring content
- **Comment**: Nested comments with reactions
- **Chat**: One-on-one conversations
- **Message**: Text and media messages
- **Notification**: Activity notifications
- **BusinessMail**: Business inquiries

For complete schema details, see `/models` directory.

---

## 📡 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "accountType": "personal"
}

Response: 201 Created
{
  "success": true,
  "user": { ... },
  "accessToken": "...",
  "refreshToken": "..."
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "emailOrUsername": "johndoe",
  "password": "password123"
}

Response: 200 OK
{
  "success": true,
  "user": { ... },
  "accessToken": "...",
  "refreshToken": "..."
}
```

#### Refresh Token
```http
POST /api/auth/refresh-token
Cookie: refreshToken=...

Response: 200 OK
{
  "success": true,
  "user": { ... },
  "accessToken": "...",
  "refreshToken": "..."
}
```

#### Logout
```http
GET /api/auth/logout
Cookie: accessToken=...

Response: 200 OK
{
  "success": true,
  "message": "Logged out successfully"
}
```

### User Endpoints

#### Get User Profile
```http
GET /api/users/profile/:userId
Cookie: accessToken=...

Response: 200 OK
{
  "success": true,
  "user": { ... },
  "isFollowing": false
}
```

#### Update Profile
```http
PUT /api/users/profile
Cookie: accessToken=...
Content-Type: application/json

{
  "fullName": "John Updated",
  "bio": "Travel enthusiast",
  "location": "New York"
}

Response: 200 OK
{
  "success": true,
  "user": { ... }
}
```

#### Follow/Unfollow User
```http
POST /api/users/follow/:userId
Cookie: accessToken=...

Response: 200 OK
{
  "success": true,
  "message": "User followed successfully",
  "isFollowing": true
}
```

#### Search Users
```http
GET /api/users/search?query=john
Cookie: accessToken=...

Response: 200 OK
{
  "success": true,
  "users": [ ... ]
}
```

### Post Endpoints

#### Create Post
```http
POST /api/posts
Cookie: accessToken=...
Content-Type: multipart/form-data

FormData:
- caption: "Amazing sunset!"
- postType: "image"
- location: "Bali, Indonesia"
- tags: "travel,sunset,bali"
- media: [file1.jpg, file2.jpg]

Response: 201 Created
{
  "success": true,
  "post": { ... }
}
```

#### Get Feed
```http
GET /api/posts/feed?page=1&limit=10
Cookie: accessToken=...

Response: 200 OK
{
  "success": true,
  "posts": [ ... ],
  "currentPage": 1,
  "totalPages": 5,
  "totalPosts": 50
}
```

#### Like Post
```http
POST /api/posts/:postId/like
Cookie: accessToken=...

Response: 200 OK
{
  "success": true,
  "likesCount": 42,
  "dislikesCount": 3,
  "hasLiked": true,
  "hasDisliked": false
}
```

### For Complete API Documentation
See full endpoint list in main README or use tools like:
- Postman Collection (import from `/docs/postman`)
- Swagger UI (coming soon)

---

## 🔐 Authentication

### Token System

#### Access Token
- **Validity**: 24 hours
- **Purpose**: API request authentication
- **Storage**: HTTP-only cookie
- **Secret**: `JWT_ACCESS_SECRET`

#### Refresh Token
- **Validity**: 7 days
- **Purpose**: Generate new access tokens
- **Storage**: HTTP-only cookie + Database
- **Secret**: `JWT_REFRESH_SECRET`

### Authentication Flow

```
1. User Login/Register
   ↓
2. Server generates Access Token (24h) + Refresh Token (7d)
   ↓
3. Tokens stored in HTTP-only cookies
   ↓
4. Access Token used for API requests
   ↓
5. Access Token expires after 24h
   ↓
6. Client sends Refresh Token
   ↓
7. Server validates and issues new tokens
   ↓
8. Continue with new Access Token
   ↓
9. After 7 days, Refresh Token expires
   ↓
10. User must login again
```

### Middleware Protection

```javascript
// Protect routes with authentication middleware
router.get('/profile', isAuthenticated, getUserProfile);

// Protect routes with role-based access
router.post('/post', 
  isAuthenticated, 
  authorizeAccountType('personal'),
  createPost
);
```

---

## 📤 File Upload

### Supported File Types
- **Images**: JPG, JPEG, PNG, GIF
- **Videos**: MP4, MOV, AVI

### File Size Limits
- **Images**: 5 MB per file
- **Videos**: 100 MB per file
- **Multiple files**: Up to 10 images per post

### Upload Process

1. **Client**: Sends multipart/form-data
2. **Multer**: Processes file in memory
3. **Controller**: Validates file
4. **Cloudinary**: Uploads and optimizes
5. **Database**: Stores URL and public_id
6. **Response**: Returns media URLs

### Example Upload

```javascript
// Using Postman or form-data
POST /api/posts
Content-Type: multipart/form-data

FormData:
- caption: "My travel photo"
- postType: "image"
- media: [file1.jpg, file2.jpg]
```

---

## 🔔 Push Notifications

### Firebase Cloud Messaging

Notifications are sent for:
- New followers
- Post likes/dislikes
- Comments and replies
- New messages
- Story views

### Sending Notifications

```javascript
// Single device
await sendNotification(
  fcmToken,
  'New Follower',
  'John started following you'
);

// Multiple devices
await sendMulticastNotification(
  [token1, token2, token3],
  'New Post',
  'Someone you follow posted a new photo'
);
```

### Notification Payload

```javascript
{
  notification: {
    title: "New Message",
    body: "You have a new message from John"
  },
  data: {
    type: "message",
    chatId: "chat_id_here"
  },
  token: "device_fcm_token"
}
```

---

## ⚠️ Error Handling

### Error Response Format

```json
{
  "success": false,
  "message": "Error description"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

### Custom Error Types

```javascript
// Validation Error
{
  "success": false,
  "message": ["Username is required", "Email must be valid"]
}

// Authentication Error
{
  "success": false,
  "message": "Invalid or expired token",
  "tokenExpired": true
}

// Mongoose Duplicate Key
{
  "success": false,
  "message": "Email already exists"
}
```

---

## 🧪 Testing

### Manual Testing with Postman

1. Import Postman collection from `/docs/postman`
2. Set environment variables
3. Test endpoints

### Testing Checklist

- [ ] User registration
- [ ] User login
- [ ] Token refresh
- [ ] Create post with images
- [ ] Like/dislike post
- [ ] Comment on post
- [ ] Follow/unfollow user
- [ ] Send message
- [ ] Create story
- [ ] Receive push notification

---

## 🚢 Deployment

### Deployment Options

1. **Heroku**
2. **Railway**
3. **DigitalOcean**
4. **AWS EC2**
5. **Render**

### Pre-Deployment Checklist

- [ ] Set `NODE_ENV=production` in environment
- [ ] Use strong JWT secrets (min 32 characters)
- [ ] Use MongoDB Atlas for database
- [ ] Configure CORS with production URL
- [ ] Use Firebase environment variables (not JSON file)
- [ ] Enable HTTPS
- [ ] Set up error logging (e.g., Sentry)
- [ ] Configure rate limiting
- [ ] Set up monitoring

### Heroku Deployment Example

```bash
# Install Heroku CLI
heroku login

# Create app
heroku create travel-diary-api

# Set environment variables
heroku config:set JWT_ACCESS_SECRET=your_secret
heroku config:set MONGODB_URI=mongodb+srv://...
# ... set all env variables

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Railway Deployment

1. Connect GitHub repository
2. Add environment variables in Railway dashboard
3. Railway auto-deploys on push

---

## 📁 Project Structure

```
backend/
├── config/
│   ├── database.js          # MongoDB connection
│   ├── cloudinary.js        # Cloudinary configuration
│   └── firebase.js          # Firebase Admin SDK
│
├── controllers/
│   ├── authController.js    # Auth logic
│   ├── userController.js    # User CRUD
│   ├── postController.js    # Post management
│   ├── commentController.js # Comment handling
│   ├── storyController.js   # Story features
│   ├── chatController.js    # Chat functionality
│   ├── mailController.js    # Business mail
│   └── notificationController.js
│
├── middleware/
│   ├── auth.js              # JWT authentication
│   ├── multer.js            # File upload
│   └── error.js             # Error handler
│
├── models/
│   ├── User.js              # User schema
│   ├── Post.js              # Post schema
│   ├── Story.js             # Story schema
│   ├── Comment.js           # Comment schema
│   ├── Chat.js              # Chat schema
│   ├── Message.js           # Message schema
│   ├── Notification.js      # Notification schema
│   └── BusinessMail.js      # Mail schema
│
├── routes/
│   ├── auth.js              # Auth routes
│   ├── user.js              # User routes
│   ├── post.js              # Post routes
│   ├── comment.js           # Comment routes
│   ├── story.js             # Story routes
│   ├── chat.js              # Chat routes
│   ├── mail.js              # Mail routes
│   └── notification.js      # Notification routes
│
├── utils/
│   └── cloudinary.js        # Upload utilities
│
├── .env                     # Environment variables
├── .gitignore
├── package.json
├── server.js                # Entry point
└── README.md
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- Express.js team
- MongoDB team
- Firebase team
- Cloudinary team
- All open-source contributors

---

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check documentation
- Review code comments

---

**Built with ❤️ for travel enthusiasts worldwide**