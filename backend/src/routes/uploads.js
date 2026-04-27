const express = require('express');
const { uploadImage } = require('../services/cloudinary');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  const base64 = req.body.base64;
  const folder = req.body.folder;

  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 image payload is required' });
  }

  try {
    const url = await uploadImage(base64, folder);
    return res.json({ url });
  } catch (error) {
    return res.status(500).json({ error: 'Cloudinary upload failed' });
  }
});

module.exports = router;