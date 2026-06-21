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
  const code = req.params.code;
  let downloadStarted = false;
  let downloadCompleted = false;

  try {
    const ip = req.ip || req.connection.remoteAddress || 
               req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
    const userAgent = req.headers['user-agent'] || '';

    const fileInfo = await UploadHandler.attemptDownload(code, ip, userAgent);
    downloadStarted = true;

    res.on('finish', async () => {
      if (!downloadCompleted) {
        downloadCompleted = true;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          await UploadHandler.markDownloadComplete(code);
          console.log(`[${new Date().toLocaleString()}] 下载完成: ${fileInfo.originalName} (${code})`);
        } else {
          await UploadHandler.markDownloadFailed(code);
          console.log(`[${new Date().toLocaleString()}] 下载失败 (${res.statusCode}): ${fileInfo.originalName} (${code})`);
        }
      }
    });

    res.on('close', async () => {
      if (!downloadCompleted) {
        downloadCompleted = true;
        if (!res.headersSent || res.statusCode < 200 || res.statusCode >= 400) {
          await UploadHandler.markDownloadFailed(code);
          console.log(`[${new Date().toLocaleString()}] 下载中断: ${fileInfo.originalName} (${code})`);
        } else {
          await UploadHandler.markDownloadComplete(code);
          console.log(`[${new Date().toLocaleString()}] 下载完成 (连接关闭): ${fileInfo.originalName} (${code})`);
        }
      }
    });

    res.download(fileInfo.filePath, fileInfo.originalName, {
      headers: {
        'Content-Type': fileInfo.mimetype,
        'Content-Length': fileInfo.size
      }
    }, async (err) => {
      if (err) {
        console.error('下载出错:', err);
        if (!downloadCompleted) {
          downloadCompleted = true;
          await UploadHandler.markDownloadFailed(code);
        }
      }
    });
  } catch (err) {
    if (downloadStarted && !downloadCompleted) {
      downloadCompleted = true;
      await UploadHandler.markDownloadFailed(code);
    }
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
