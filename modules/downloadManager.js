const fs = require('fs');
const path = require('path');
const config = require('../config');
const DataStore = require('./dataStore');
const ExpiryChecker = require('./expiryChecker');
const lockManager = require('./lockManager');

class DownloadManager {
  static async attemptDownload(code, ip, userAgent) {
    return lockManager.withLock(`download:${code}`, async () => {
      const share = DataStore.getShareByCode(code);
      if (!share) {
        throw new Error('提取码不存在');
      }

      const validation = ExpiryChecker.isShareValid(share);
      if (!validation.valid) {
        const reasons = {
          expired: '文件已过期',
          download_limit: '下载次数已用完',
          inactive: '分享已失效',
          not_found: '提取码不存在'
        };
        throw new Error(reasons[validation.reason] || '无法下载');
      }

      const filePath = path.join(config.UPLOAD_DIR, share.filename);
      if (!fs.existsSync(filePath)) {
        DataStore.updateShare(code, { status: 'file_missing' });
        throw new Error('文件不存在');
      }

      DataStore.logDownload(share, ip, userAgent);

      const newDownloadCount = share.downloadCount + 1;
      const updates = { downloadCount: newDownloadCount };

      if (share.maxDownloads !== -1 && newDownloadCount >= share.maxDownloads) {
        updates.status = 'pending_delete';
      }

      DataStore.updateShare(code, updates);

      return {
        filePath,
        originalName: share.originalName,
        mimetype: share.mimetype,
        size: share.size,
        share: { ...share, ...updates }
      };
    });
  }

  static async markDownloadComplete(code) {
    return lockManager.withLock(`download:${code}`, async () => {
      const share = DataStore.getShareByCode(code);
      if (!share) return null;

      if (share.status === 'pending_delete') {
        DataStore.updateShare(code, { 
          status: 'ready_for_cleanup',
          completedAt: Date.now()
        });
        console.log(`[${new Date().toLocaleString()}] 分享 ${code} 下载完成，标记为可清理`);
      }

      return DataStore.getShareByCode(code);
    });
  }

  static async markDownloadFailed(code) {
    return lockManager.withLock(`download:${code}`, async () => {
      const share = DataStore.getShareByCode(code);
      if (!share) return null;

      if (share.status === 'pending_delete') {
        const newDownloadCount = Math.max(0, share.downloadCount - 1);
        const updates = { 
          downloadCount: newDownloadCount,
          status: 'active'
        };
        DataStore.updateShare(code, updates);
        console.log(`[${new Date().toLocaleString()}] 分享 ${code} 下载失败，回滚下载次数`);
      }

      return DataStore.getShareByCode(code);
    });
  }

  static async canDownload(code) {
    const share = DataStore.getShareByCode(code);
    if (!share) return { canDownload: false, reason: 'not_found' };

    const validation = ExpiryChecker.isShareValid(share);
    return {
      canDownload: validation.valid,
      reason: validation.reason
    };
  }

  static getActiveDownloadCount() {
    let count = 0;
    for (const [key] of lockManager.locks) {
      if (key.startsWith('download:') && lockManager.isLocked(key)) {
        count++;
      }
    }
    return count;
  }
}

module.exports = DownloadManager;
