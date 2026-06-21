const DataStore = require('./dataStore');

class ExpiryChecker {
  static isExpired(share) {
    if (!share.expiryTime) return false;
    return Date.now() > share.expiryTime;
  }

  static isDownloadLimitReached(share) {
    if (!share.maxDownloads || share.maxDownloads === -1) return false;
    return share.downloadCount >= share.maxDownloads;
  }

  static isShareValid(share) {
    if (!share) return { valid: false, reason: 'not_found' };
    if (share.status !== 'active') {
      return { valid: false, reason: 'inactive' };
    }
    if (this.isExpired(share)) {
      return { valid: false, reason: 'expired' };
    }
    if (this.isDownloadLimitReached(share)) {
      return { valid: false, reason: 'download_limit' };
    }
    return { valid: true };
  }

  static checkAndUpdateShare(code) {
    const share = DataStore.getShareByCode(code);
    const validation = this.isShareValid(share);
    
    if (!validation.valid) {
      return { valid: false, reason: validation.reason, share };
    }
    
    return { valid: true, share };
  }

  static getExpiredShares() {
    const shares = DataStore.getAllShares();
    return shares.filter(s => 
      s.status === 'active' && (this.isExpired(s) || this.isDownloadLimitReached(s))
    );
  }

  static getShareStatus(share) {
    if (share.status !== 'active') return '已失效';
    if (this.isExpired(share)) return '已过期';
    if (this.isDownloadLimitReached(share)) return '下载次数已满';
    return '正常';
  }
}

module.exports = ExpiryChecker;
