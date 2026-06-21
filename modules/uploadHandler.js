const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const CodeManager = require('./codeManager');
const DataStore = require('./dataStore');
const ExpiryChecker = require('./expiryChecker');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE
  }
});

class UploadHandler {
  static getUploadMiddleware() {
    return upload.single('file');
  }

  static async createShare(file, options = {}) {
    const {
      maxDownloads = config.DEFAULT_MAX_DOWNLOADS,
      expiryHours = config.DEFAULT_EXPIRY_HOURS,
      customCode = null
    } = options;

    let code;
    if (customCode) {
      const validation = CodeManager.validateCode(customCode);
      if (!validation.valid) {
        throw new Error(validation.message);
      }
      if (DataStore.getShareByCode(validation.code)) {
        throw new Error('该提取码已被使用');
      }
      code = validation.code;
    } else {
      code = CodeManager.generateUniqueCode();
    }

    const expiryTime = Date.now() + (expiryHours * 60 * 60 * 1000);

    const share = {
      id: uuidv4(),
      code: code,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadTime: Date.now(),
      expiryTime: expiryTime,
      maxDownloads: parseInt(maxDownloads),
      downloadCount: 0,
      status: 'active',
      ip: null
    };

    DataStore.addShare(share);

    return {
      code: code,
      originalName: share.originalName,
      size: share.size,
      expiryTime: share.expiryTime,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      uploadTime: share.uploadTime
    };
  }

  static async downloadFile(code, ip, userAgent) {
    const verification = CodeManager.verifyCode(code);
    if (!verification.success) {
      throw new Error(verification.message);
    }

    const check = ExpiryChecker.checkAndUpdateShare(code);
    if (!check.valid) {
      const reasons = {
        expired: '文件已过期',
        download_limit: '下载次数已用完',
        inactive: '分享已失效',
        not_found: '提取码不存在'
      };
      throw new Error(reasons[check.reason] || '无法下载');
    }

    const share = check.share;
    const filePath = path.join(config.UPLOAD_DIR, share.filename);

    if (!fs.existsSync(filePath)) {
      DataStore.updateShare(code, { status: 'file_missing' });
      throw new Error('文件不存在');
    }

    DataStore.logDownload(share, ip, userAgent);

    const newDownloadCount = share.downloadCount + 1;
    const updates = { downloadCount: newDownloadCount };

    if (share.maxDownloads !== -1 && newDownloadCount >= share.maxDownloads) {
      updates.status = 'download_limit_reached';
    }

    DataStore.updateShare(code, updates);

    return {
      filePath,
      originalName: share.originalName,
      mimetype: share.mimetype,
      size: share.size
    };
  }

  static getShareInfo(code) {
    const verification = CodeManager.verifyCode(code);
    if (!verification.success) {
      throw new Error(verification.message);
    }

    const share = verification.share;
    const check = ExpiryChecker.isShareValid(share);

    return {
      code: share.code,
      originalName: share.originalName,
      size: share.size,
      uploadTime: share.uploadTime,
      expiryTime: share.expiryTime,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      status: ExpiryChecker.getShareStatus(share),
      canDownload: check.valid
    };
  }
}

module.exports = UploadHandler;
