const User = require('../models/user.js');
const Notification = require('../models/notification.js');
const { uploadImage, deleteFile } = require('../utils/cloudinary');
const { sendNotification } = require('../config/firebase');

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('followers', 'username fullName profilePicture')
      .populate('following', 'username fullName profilePicture');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if current user is following this user
    const isFollowing = user.followers.some(
      follower => follower._id.toString() === req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user,
        isFollowing
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const updateData = {
      fullName: req.body.fullName,
      bio: req.body.bio,
      location: req.body.location,
      website: req.body.website,
      businessEmail: req.body.businessEmail,
      isPrivate: req.body.isPrivate
    };

    // Handle profile picture upload
    if (req.files && req.files.profilePicture) {
      const user = await User.findById(req.user.id);

      // Delete old profile picture
      if (user.profilePicture && user.profilePicture.public_id) {
        await deleteFile(user.profilePicture.public_id);
      }

      const result = await uploadImage(
        req.files.profilePicture[0].buffer,
        'travel-diary/profiles'
      );

      updateData.profilePicture = result;
    }

    // Handle cover photo upload
    if (req.files && req.files.coverPhoto) {
      const user = await User.findById(req.user.id);

      // Delete old cover photo
      if (user.coverPhoto && user.coverPhoto.public_id) {
        await deleteFile(user.coverPhoto.public_id);
      }

      const result = await uploadImage(
        req.files.coverPhoto[0].buffer,
        'travel-diary/covers'
      );

      updateData.coverPhoto = result;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Follow/Unfollow user
exports.followUnfollowUser = async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (userToFollow._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot follow yourself'
      });
    }

    // Business accounts cannot follow anyone
    if (currentUser.accountType === 'business') {
      return res.status(400).json({
        success: false,
        message: 'Business accounts cannot follow users'
      });
    }

    const isFollowing = currentUser.following.includes(userToFollow._id);

    if (isFollowing) {
      // Unfollow
      currentUser.following.pull(userToFollow._id);
      currentUser.followingCount -= 1;
      userToFollow.followers.pull(currentUser._id);
      userToFollow.followersCount -= 1;

      await currentUser.save();
      await userToFollow.save();

      res.status(200).json({
        success: true,
        message: 'User unfollowed successfully',
        data: {
          isFollowing: false
        }
      });
    } else {
      // Follow
      currentUser.following.push(userToFollow._id);
      currentUser.followingCount += 1;
      userToFollow.followers.push(currentUser._id);
      userToFollow.followersCount += 1;

      await currentUser.save();
      await userToFollow.save();

      // Create notification
      const notification = await Notification.create({
        recipient: userToFollow._id,
        sender: currentUser._id,
        type: 'follow',
        message: `${currentUser.username} started following you`
      });

      // Send push notification
      if (userToFollow.fcmToken) {
        await sendNotification(
          userToFollow.fcmToken,
          'New Follower',
          `${currentUser.username} started following you`
        );
      }

      res.status(200).json({
        success: true,
        message: 'User followed successfully',
        data: {
          isFollowing: true
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Search users
exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { fullName: { $regex: query, $options: 'i' } }
      ]
    })
      .select('username fullName profilePicture accountType isVerified')
      .limit(20);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get followers
exports.getFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('followers', 'username fullName profilePicture accountType isVerified');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Followers retrieved successfully',
      data: {
        followers: user.followers
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get following
exports.getFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('following', 'username fullName profilePicture accountType isVerified');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Following users retrieved successfully',
      data: {
        following: user.following
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both current and new password'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect current password'
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Account Privacy / Settings
exports.updateAccountSettings = async (req, res) => {
  try {
    const { isPrivate } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { isPrivate },
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Account settings updated successfully',
      data: {
        user
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete Account (Permanent Account Removal)
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to confirm account deletion'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect password. Account deletion failed.'
      });
    }

    const Post = require('../models/post.js');
    const Story = require('../models/story.js');
    const Comment = require('../models/comment.js');

    // 1. Delete user profile picture & cover photo from Cloudinary
    if (user.profilePicture && user.profilePicture.public_id) {
      await deleteFile(user.profilePicture.public_id);
    }
    if (user.coverPhoto && user.coverPhoto.public_id) {
      await deleteFile(user.coverPhoto.public_id);
    }

    // 2. Delete all posts and their Cloudinary media
    const userPosts = await Post.find({ user: user._id });
    for (const post of userPosts) {
      if (post.media && post.media.length > 0) {
        for (const m of post.media) {
          if (m.public_id) await deleteFile(m.public_id);
        }
      }
      await post.deleteOne();
    }

    // 3. Delete user stories
    const userStories = await Story.find({ user: user._id });
    for (const story of userStories) {
      if (story.media && story.media.public_id) {
        await deleteFile(story.media.public_id);
      }
      await story.deleteOne();
    }

    // 4. Delete user comments
    await Comment.deleteMany({ user: user._id });

    // 5. Remove user from followers and following lists of other users
    await User.updateMany(
      { followers: user._id },
      { $pull: { followers: user._id }, $inc: { followersCount: -1 } }
    );
    await User.updateMany(
      { following: user._id },
      { $pull: { following: user._id }, $inc: { followingCount: -1 } }
    );

    // 6. Delete user account
    await user.deleteOne();

    res
      .cookie('accessToken', null, { expires: new Date(Date.now()), httpOnly: true })
      .cookie('refreshToken', null, { expires: new Date(Date.now()), httpOnly: true })
      .status(200)
      .json({
        success: true,
        message: 'Account deleted successfully',
        data: null
      });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};