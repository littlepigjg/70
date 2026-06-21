class LockManager {
  constructor() {
    this.locks = new Map();
    this.waitingQueues = new Map();
  }

  async acquire(key) {
    if (!this.locks.has(key)) {
      this.locks.set(key, false);
      this.waitingQueues.set(key, []);
    }

    if (!this.locks.get(key)) {
      this.locks.set(key, true);
      return;
    }

    return new Promise((resolve) => {
      this.waitingQueues.get(key).push(resolve);
    });
  }

  release(key) {
    if (!this.locks.has(key)) return;

    const queue = this.waitingQueues.get(key);
    
    if (queue.length > 0) {
      const next = queue.shift();
      next();
    } else {
      this.locks.set(key, false);
    }
  }

  async withLock(key, fn) {
    try {
      await this.acquire(key);
      return await fn();
    } finally {
      this.release(key);
    }
  }

  isLocked(key) {
    return this.locks.has(key) && this.locks.get(key) === true;
  }

  getLockStatus(key) {
    return {
      locked: this.isLocked(key),
      waitingCount: this.waitingQueues.has(key) ? this.waitingQueues.get(key).length : 0
    };
  }
}

const lockManager = new LockManager();

module.exports = lockManager;
