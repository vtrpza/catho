/**
 * Task Queue for managing profile scraping tasks
 */
export class TaskQueue {
  constructor() {
    this.queue = [];
    this.processing = new Set();
    this.completed = new Set();
    this.failed = new Map(); // url -> error count
  }

  /**
   * Add tasks to the queue
   */
  addTasks(urls) {
    const newUrls = urls.filter(url => !this.hasTask(url));
    this.queue.push(...newUrls);
    return newUrls.length;
  }

  /**
   * Get next task from queue
   */
  getNext() {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue.shift();
  }

  /**
   * Get multiple tasks from queue
   */
  getNextBatch(count) {
    const batch = [];
    for (let i = 0; i < count && this.queue.length > 0; i++) {
      batch.push(this.queue.shift());
    }
    return batch;
  }

  /**
   * Mark task as processing
   */
  markProcessing(url) {
    this.processing.add(url);
  }

  /**
   * Mark task as completed
   */
  markCompleted(url) {
    this.processing.delete(url);
    this.completed.add(url);
  }

  /**
   * Mark task as failed
   */
  markFailed(url, error) {
    this.processing.delete(url);
    const currentFailCount = this.failed.get(url) || 0;
    this.failed.set(url, currentFailCount + 1);
  }

  /**
   * Check if task exists in queue or was processed
   */
  hasTask(url) {
    return (
      this.queue.includes(url) ||
      this.processing.has(url) ||
      this.completed.has(url)
    );
  }

  /**
   * Get failed tasks that can be retried
   */
  getFailedTasks(maxRetries = 3) {
    const retryable = [];
    for (const [url, failCount] of this.failed.entries()) {
      if (failCount < maxRetries && !this.hasTask(url)) {
        retryable.push(url);
      }
    }
    return retryable;
  }

  /**
   * Retry failed tasks
   */
  retryFailed(maxRetries = 3) {
    const retryable = this.getFailedTasks(maxRetries);
    this.addTasks(retryable);
    return retryable.length;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.size,
      failed: this.failed.size,
      total: this.queue.length + this.processing.size + this.completed.size
    };
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.queue.length === 0 && this.processing.size === 0;
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this.processing.clear();
    this.completed.clear();
    this.failed.clear();
  }

  /**
   * Get pending count
   */
  getPendingCount() {
    return this.queue.length;
  }

  /**
   * Get completed count
   */
  getCompletedCount() {
    return this.completed.size;
  }

  /**
   * Get failed count
   */
  getFailedCount() {
    return this.failed.size;
  }
}
