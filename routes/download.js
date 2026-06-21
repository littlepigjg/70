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
  let downloadSession = null;
  let downloadFinalized = false;

  const finalizeDownload = async (success) => {
    if (downloadFinalized || !downloadSession) return;
    downloadFinalized = true;

    try {
      if (success) {
        await UploadHandler.completeDownload(code);
        console.log(`[${new Date().toLocaleString()}] 下载完成: ${code}`);
      } else {
        await UploadHandler.failDownload(code);
        console.log(`[${new Date().toLocaleString()}] 下载失败/中断: ${code}`);
      }
    } catch (err) {
      console.error(`[${new Date().toLocaleString()}] 下载结束处理失败: ${code} - ${err.message}`);
    } finally {
      if (downloadSession && downloadSession.releaseLock) {
        downloadSession.releaseLock();
        console.log(`[${new Date().toLocaleString()}] 锁已释放: ${code}`);
      }
    }
  };

  try {
    const ip = req.ip || req.connection.remoteAddress || 
               req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
    const userAgent = req.headers['user-agent'] || '';

    console.log(`[${new Date().toLocaleString()}] 开始下载请求: ${code}, IP: ${ip}`);
    downloadSession = await UploadHandler.startDownload(code, ip, userAgent);
    console.log(`[${new Date().toLocaleString()}] 下载会话已创建，锁已持有: ${code}`);

    res.on('finish', async () => {
      const success = res.statusCode >= 200 && res.statusCode < 300;
      await finalizeDownload(success);
    });

    res.on('close', async () => {
      await finalizeDownload(res.headersSent && res.statusCode >= 200 && res.statusCode < 300);
    });

    res.download(downloadSession.filePath, downloadSession.originalName, {
      headers: {
        'Content-Type': downloadSession.mimetype,
        'Content-Length': downloadSession.size
      }
    }, async (err) => {
      if (err) {
        console.error(`[${new Date().toLocaleString()}] res.download 错误: ${code} - ${err.message}`);
        await finalizeDownload(false);
      }
    });

  } catch (err) {
    console.error(`[${new Date().toLocaleString()}] 下载请求失败: ${code} - ${err.message}`);
    await finalizeDownload(false);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
