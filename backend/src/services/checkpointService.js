/**
 * Checkpoint Service - Manages scraping state persistence
 * Allows resuming scraping operations after crashes or interruptions
 */

import { getDatabase } from '../config/database.js';

export class CheckpointService {
  constructor() {
    this.db = null;
  }

  async init() {
    this.db = getDatabase();
    await this.createCheckpointTable();
  }

  async createCheckpointTable() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS scrape_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        search_query TEXT NOT NULL,
        current_page INTEGER DEFAULT 1,
        total_pages INTEGER,
        last_processed_url TEXT,
        last_processed_index INTEGER DEFAULT 0,
        profiles_scraped INTEGER DEFAULT 0,
        profiles_failed INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running',
        options TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoint_session ON scrape_checkpoints(session_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoint_status ON scrape_checkpoints(status);
    `);
  }

  /**
   * Generate a unique session ID for a scraping run
   */
  generateSessionId(searchQuery) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${searchQuery.substring(0, 20).replace(/\s+/g, '_')}_${timestamp}_${random}`;
  }

  /**
   * Create a new checkpoint for a scraping session
   */
  async createCheckpoint(sessionId, searchQuery, options = {}) {
    await this.db.run(
      `INSERT INTO scrape_checkpoints
       (session_id, search_query, total_pages, status, options)
       VALUES (?, ?, ?, 'running', ?)`,
      [
        sessionId,
        searchQuery,
        options.maxPages ?? null,
        JSON.stringify(options)
      ]
    );

    console.log(`✅ Checkpoint criado: ${sessionId}`);
    return sessionId;
  }

  /**
   * Update checkpoint with current progress
   */
  async updateCheckpoint(sessionId, updates) {
    const fields = [];
    const values = [];

    if (updates.currentPage !== undefined) {
      fields.push('current_page = ?');
      values.push(updates.currentPage);
    }

    if (updates.lastProcessedUrl !== undefined) {
      fields.push('last_processed_url = ?');
      values.push(updates.lastProcessedUrl);
    }

    if (updates.lastProcessedIndex !== undefined) {
      fields.push('last_processed_index = ?');
      values.push(updates.lastProcessedIndex);
    }

    if (updates.profilesScraped !== undefined) {
      fields.push('profiles_scraped = ?');
      values.push(updates.profilesScraped);
    }

    if (updates.profilesFailed !== undefined) {
      fields.push('profiles_failed = ?');
      values.push(updates.profilesFailed);
    }

    if (updates.errorCount !== undefined) {
      fields.push('error_count = ?');
      values.push(updates.errorCount);
    }

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(sessionId);

    const query = `UPDATE scrape_checkpoints SET ${fields.join(', ')} WHERE session_id = ?`;
    await this.db.run(query, values);
  }

  /**
   * Get checkpoint data for a session
   */
  async getCheckpoint(sessionId) {
    const checkpoint = await this.db.get(
      'SELECT * FROM scrape_checkpoints WHERE session_id = ?',
      [sessionId]
    );

    if (checkpoint && checkpoint.options) {
      try {
        checkpoint.options = JSON.parse(checkpoint.options);
      } catch (e) {
        checkpoint.options = {};
      }
    }

    return checkpoint;
  }

  /**
   * Get the most recent incomplete checkpoint for a search query
   */
  async getLatestIncompleteCheckpoint(searchQuery) {
    const checkpoint = await this.db.get(
      `SELECT * FROM scrape_checkpoints
       WHERE search_query = ? AND status IN ('running', 'paused')
       ORDER BY updated_at DESC LIMIT 1`,
      [searchQuery]
    );

    if (checkpoint && checkpoint.options) {
      try {
        checkpoint.options = JSON.parse(checkpoint.options);
      } catch (e) {
        checkpoint.options = {};
      }
    }

    return checkpoint;
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints(limit = 50) {
    const checkpoints = await this.db.all(
      `SELECT * FROM scrape_checkpoints
       ORDER BY updated_at DESC LIMIT ?`,
      [limit]
    );

    return checkpoints.map(cp => {
      if (cp.options) {
        try {
          cp.options = JSON.parse(cp.options);
        } catch (e) {
          cp.options = {};
        }
      }
      return cp;
    });
  }

  /**
   * Mark checkpoint as completed
   */
  async completeCheckpoint(sessionId) {
    await this.db.run(
      `UPDATE scrape_checkpoints
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [sessionId]
    );
    console.log(`✅ Checkpoint concluído: ${sessionId}`);
  }

  /**
   * Mark checkpoint as failed
   */
  async failCheckpoint(sessionId, error) {
    await this.db.run(
      `UPDATE scrape_checkpoints
       SET status = 'failed', updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [sessionId]
    );
    console.log(`❌ Checkpoint falhou: ${sessionId} - ${error}`);
  }

  /**
   * Mark checkpoint as paused
   */
  async pauseCheckpoint(sessionId) {
    await this.db.run(
      `UPDATE scrape_checkpoints
       SET status = 'paused', updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [sessionId]
    );
    console.log(`⏸️ Checkpoint pausado: ${sessionId}`);
  }

  /**
   * Resume a paused checkpoint
   */
  async resumeCheckpoint(sessionId) {
    await this.db.run(
      `UPDATE scrape_checkpoints
       SET status = 'running', updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [sessionId]
    );
    console.log(`▶️ Checkpoint retomado: ${sessionId}`);
  }

  /**
   * Delete old completed checkpoints (older than X days)
   */
  async cleanupOldCheckpoints(daysOld = 30) {
    const result = await this.db.run(
      `DELETE FROM scrape_checkpoints
       WHERE status = 'completed'
       AND datetime(updated_at) < datetime('now', '-' || ? || ' days')`,
      [daysOld]
    );

    console.log(`🧹 Limpeza: ${result.changes} checkpoints antigos removidos`);
    return result.changes;
  }

  /**
   * Get statistics about checkpoints
   */
  async getCheckpointStats() {
    const stats = await this.db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(profiles_scraped) as total_profiles_scraped,
        SUM(profiles_failed) as total_profiles_failed
      FROM scrape_checkpoints
    `);

    return stats;
  }

  /**
   * Check if a session should be resumed
   */
  canResume(checkpoint) {
    if (!checkpoint) return false;
    return checkpoint.status === 'running' || checkpoint.status === 'paused';
  }

  /**
   * Get resume position from checkpoint
   */
  getResumePosition(checkpoint) {
    return {
      startPage: checkpoint.current_page || 1,
      lastUrl: checkpoint.last_processed_url,
      lastIndex: checkpoint.last_processed_index || 0
    };
  }
}

// Singleton instance
let checkpointServiceInstance = null;

export async function getCheckpointService() {
  if (!checkpointServiceInstance) {
    checkpointServiceInstance = new CheckpointService();
    await checkpointServiceInstance.init();
  }
  return checkpointServiceInstance;
}
