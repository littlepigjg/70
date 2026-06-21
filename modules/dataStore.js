const fs = require('fs');
const path = require('path');
const config = require('../config');

class DataStore {
  static readShares() {
    try {
      const data = fs.readFileSync(config.SHARES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      return [];
    }
  }

  static writeShares(shares) {
    fs.writeFileSync(config.SHARES_FILE, JSON.stringify(shares, null, 2));
  }

  static addShare(share) {
    const shares = this.readShares();
    shares.push(share);
    this.writeShares(shares);
  }

  static updateShare(code, updates) {
    const shares = this.readShares();
    const index = shares.findIndex(s => s.code === code);
    if (index !== -1) {
      shares[index] = { ...shares[index], ...updates };
      this.writeShares(shares);
      return shares[index];
    }
    return null;
  }

  static getShareByCode(code) {
    const shares = this.readShares();
    return shares.find(s => s.code === code);
  }

  static deleteShare(code) {
    const shares = this.readShares();
    const filtered = shares.filter(s => s.code !== code);
    this.writeShares(filtered);
  }

  static getAllShares() {
    return this.readShares();
  }

  static logDownload(share, ip, userAgent) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      code: share.code,
      filename: share.filename,
      originalName: share.originalName,
      ip: ip,
      userAgent: userAgent
    };
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(config.DOWNLOAD_LOG_FILE, logLine);
  }

  static getDownloadLogs() {
    try {
      const data = fs.readFileSync(config.DOWNLOAD_LOG_FILE, 'utf8');
      return data.trim().split('\n').filter(line => line).map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (err) {
      return [];
    }
  }
}

module.exports = DataStore;
