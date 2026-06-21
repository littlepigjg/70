const fs = require('fs');
const path = require('path');
const config = require('../config');
const DataStore = require('./dataStore');
const ExpiryChecker = require('./expiryChecker');

class CleanupTask {
  static async cleanupExpiredShares() {
    console.log(`[${new Date().toLocaleString()}] 开始清理过期文件...`);
    
    const shares = DataStore.getAllShares();
    let cleanedCount = 0;
    let skippedCount = 0;

    for (const share of shares) {
      if (share.status === 'deleted' || share.status === 'file_missing') {
        skippedCount++;
        continue;
      }

      const shouldClean = ExpiryChecker.isExpired(share) || 
                         ExpiryChecker.isDownloadLimitReached(share);

      if (shouldClean) {
        try {
          const filePath = path.join(config.UPLOAD_DIR, share.filename);
          
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`  ✓ 已删除文件: ${share.originalName} (${share.code})`);
          } else {
            console.log(`  ℹ 文件已不存在: ${share.originalName} (${share.code})`);
          }

          DataStore.updateShare(share.code, { status: 'deleted' });
          cleanedCount++;
        } catch (err) {
          console.error(`  ✗ 删除失败: ${share.originalName} (${share.code}) - ${err.message}`);
        }
      }
    }

    console.log(`[${new Date().toLocaleString()}] 清理完成: 删除 ${cleanedCount} 个，跳过 ${skippedCount} 个，总计 ${shares.length} 个`);
    return { cleanedCount, skippedCount, totalCount: shares.length };
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

  static getStats() {
    const shares = DataStore.getAllShares();
    const active = shares.filter(s => s.status === 'active').length;
    const expired = shares.filter(s => ExpiryChecker.isExpired(s)).length;
    const downloadLimit = shares.filter(s => ExpiryChecker.isDownloadLimitReached(s)).length;
    const deleted = shares.filter(s => s.status === 'deleted' || s.status === 'file_missing').length;
    
    let totalSize = 0;
    shares.forEach(s => {
      if (s.status === 'active') {
        totalSize += s.size;
      }
    });

    return {
      total: shares.length,
      active,
      expired,
      downloadLimit,
      deleted,
      totalActiveSize: totalSize
    };
  }
}

module.exports = CleanupTask;
