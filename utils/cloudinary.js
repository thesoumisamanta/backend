const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// Upload image from buffer
exports.uploadImage = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            public_id: result.public_id,
            url: result.secure_url
          });
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Upload video from buffer
exports.uploadVideo = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'video',
        chunk_size: 6000000 // 6MB chunks
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            public_id: result.public_id,
            url: result.secure_url,
            duration: result.duration,
            thumbnail: result.secure_url.replace(/\.[^.]+$/, '.jpg')
          });
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Delete file from cloudinary
exports.deleteFile = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
    return true;
  } catch (error) {
    console.error('Error deleting from cloudinary:', error);
    return false;
  }
};