const express = require('express');
const router = express.Router();
const UploadHandler = require('../modules/uploadHandler');

router.get('/info/:code', (req, res) => {
  try {
    const info = UploadHandler.getShareInfo(req.params.code);
    res.json({
      success: true,
      data: info
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

router.post('/:code', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 
               req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
    const userAgent = req.headers['user-agent'] || '';

    const fileInfo = await UploadHandler.downloadFile(req.params.code, ip, userAgent);

    res.download(fileInfo.filePath, fileInfo.originalName, {
      headers: {
        'Content-Type': fileInfo.mimetype,
        'Content-Length': fileInfo.size
      }
    }, (err) => {
      if (err) {
        console.error('下载出错:', err);
      }
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
