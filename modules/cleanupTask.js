const fs = require('fs');
const path = require('path');
const config = require('../config');
const DataStore = require('./dataStore');
const ExpiryChecker = require('./expiryChecker');
const lockManager = require('./lockManager');

class CleanupTask {
  static canSafelyDelete(share) {
    if (share.status === 'deleted' || share.status === 'file_missing') {
      return { canDelete: false, reason: 'already_deleted' };
    }

    if (ExpiryChecker.isDownloading(share)) {
      return { canDelete: false, reason: 'downloading' };
    }

    if (lockManager.isLocked(`download:${share.code}`)) {
      return { canDelete: false, reason: 'locked' };
    }

    if (ExpiryChecker.canCleanup(share)) {
      return { canDelete: true, reason: 'ready' };
    }

    return { canDelete: false, reason: 'not_ready' };
  }

  static async deleteShareFile(share) {
    const filePath = path.join(config.UPLOAD_DIR, share.filename);
    let fileDeleted = false;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      fileDeleted = true;
      console.log(`  ✓ 已删除文件: ${share.originalName} (${share.code})`);
    } else {
      console.log(`  ℹ 文件已不存在: ${share.originalName} (${share.code})`);
    }

    DataStore.updateShare(share.code, { 
      status: 'deleted',
      deletedAt: Date.now(),
      fileDeleted: fileDeleted
    });

    return fileDeleted;
  }

  static async cleanupExpiredShares() {
    console.log(`[${new Date().toLocaleString()}] 开始清理过期文件...`);
    
    const shares = DataStore.getAllShares();
    let cleanedCount = 0;
    let skippedCount = 0;
    let downloadingCount = 0;

    for (const share of shares) {
      const check = this.canSafelyDelete(share);

      if (!check.canDelete) {
        skippedCount++;
        if (check.reason === 'downloading' || check.reason === 'locked') {
          downloadingCount++;
          console.log(`  ⏳ 跳过正在下载: ${share.originalName} (${share.code})`);
        }
        continue;
      }

      try {
        await this.deleteShareFile(share);
        cleanedCount++;
      } catch (err) {
        console.error(`  ✗ 删除失败: ${share.originalName} (${share.code}) - ${err.message}`);
      }
    }

    console.log(`[${new Date().toLocaleString()}] 清理完成: 删除 ${cleanedCount} 个，跳过 ${skippedCount} 个（其中下载中 ${downloadingCount} 个），总计 ${shares.length} 个`);
    return { cleanedCount, skippedCount, downloadingCount, totalCount: shares.length };
  }

  static start() {
    console.log(`清理任务已启动，间隔 ${config.CLEANUP_INTERVAL / 1000} 秒`);
    
    setInterval(() => {
      this.cleanupExpiredShares().catch(err => {
        console.error('清理任务执行出错:', err);
      });
    }, config.CLEANUP_INTERVAL);

    setTimeout(() => {
      this.cleanupExpiredShares().catch(err => {
        console.error('初始清理执行出错:', err);
      });
    }, 5000);
  }

  static async forceCleanup() {
    return this.cleanupExpiredShares();
  }

  static async forceDeleteShare(code) {
    return lockManager.withLock(`download:${code}`, async () => {
      const share = DataStore.getShareByCode(code);
      if (!share) {
        throw new Error('分享不存在');
      }

      return this.deleteShareFile(share);
    });
  }

  static getStats() {
    const shares = DataStore.getAllShares();
    
    let active = 0;
    let downloading = 0;
    let expired = 0;
    let downloadLimit = 0;
    let readyForCleanup = 0;
    let deleted = 0;
    let totalActiveSize = 0;

    for (const share of shares) {
      if (share.status === 'deleted' || share.status === 'file_missing' || share.status === 'deleted_by_admin') {
        deleted++;
        continue;
      }

      if (share.status === 'pending_delete') {
        downloading++;
        continue;
      }

      if (share.status === 'ready_for_cleanup' || share.status === 'download_limit_reached') {
        readyForCleanup++;
        continue;
      }

      if (share.status === 'active') {
        if (ExpiryChecker.isExpired(share)) {
          expired++;
        } else if (ExpiryChecker.isDownloadLimitReached(share)) {
          downloadLimit++;
        } else {
          active++;
          totalActiveSize += share.size;
        }
      }
    }

    return {
      total: shares.length,
      active,
      downloading,
      expired,
      downloadLimit,
      readyForCleanup,
      deleted,
      totalActiveSize
    };
  }
}

module.exports = CleanupTask;
