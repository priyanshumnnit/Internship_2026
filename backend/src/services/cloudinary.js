const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(base64, folder) {
  if (!base64) {
    throw new Error('No image payload provided');
  }
  const result = await cloudinary.uploader.upload(base64, {
    folder: folder || 'blue-collar-docs',
  });
  return result.secure_url;
}

module.exports = { uploadImage };
