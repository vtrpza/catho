/**
 * Resume Repository - Handles all database operations for resumes
 */
export class ResumeRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Batch insert resumes
   */
  async batchInsert(resumes) {
    if (!resumes || resumes.length === 0) return 0;

    try {
      await this.db.run('BEGIN TRANSACTION');

      const stmt = await this.db.prepare(
        `INSERT OR REPLACE INTO resumes
         (name, job_title, location, experience, summary, contact_email, contact_phone, profile_url, last_updated, search_query)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const resume of resumes) {
        await stmt.run([
          resume.name,
          resume.job_title,
          resume.location,
          resume.experience,
          resume.summary,
          resume.contact_email,
          resume.contact_phone,
          resume.profile_url,
          resume.last_updated,
          resume.search_query
        ]);
      }

      await stmt.finalize();
      await this.db.run('COMMIT');

      console.log(`💾 ${resumes.length} resumes saved in batch`);
      return resumes.length;

    } catch (error) {
      await this.db.run('ROLLBACK').catch(() => {});
      console.error('❌ Error in batch insert:', error.message);
      throw error;
    }
  }

  /**
   * Insert or update a single resume
   */
  async upsert(resume) {
    try {
      const result = await this.db.run(
        `INSERT OR REPLACE INTO resumes
         (name, job_title, location, experience, summary, contact_email, contact_phone, profile_url, last_updated, search_query)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resume.name,
          resume.job_title,
          resume.location,
          resume.experience,
          resume.summary,
          resume.contact_email,
          resume.contact_phone,
          resume.profile_url,
          resume.last_updated,
          resume.search_query
        ]
      );

      return result.lastID;
    } catch (error) {
      console.error('❌ Error upserting resume:', error.message);
      throw error;
    }
  }

  /**
   * Get resume by profile URL
   */
  async getByProfileUrl(profileUrl) {
    try {
      return await this.db.get(
        'SELECT * FROM resumes WHERE profile_url = ?',
        [profileUrl]
      );
    } catch (error) {
      console.error('❌ Error getting resume by URL:', error.message);
      return null;
    }
  }

  /**
   * Get resume by ID
   */
  async getById(id) {
    try {
      return await this.db.get(
        'SELECT * FROM resumes WHERE id = ?',
        [id]
      );
    } catch (error) {
      console.error('❌ Error getting resume by ID:', error.message);
      return null;
    }
  }

  /**
   * Mark resume for profile scraping
   */
  async markForProfileScrape(profileUrl) {
    try {
      await this.db.run(
        `UPDATE resumes
         SET scrape_status = 'pending'
         WHERE profile_url = ?`,
        [profileUrl]
      );
    } catch (error) {
      console.error('❌ Error marking for profile scrape:', error.message);
    }
  }

  /**
   * Update scrape attempt
   */
  async updateScrapeAttempt(profileUrl, success = false, error = null) {
    try {
      if (success) {
        await this.db.run(
          `UPDATE resumes SET
            scrape_attempts = scrape_attempts + 1,
            last_scrape_attempt = CURRENT_TIMESTAMP,
            scrape_status = 'completed'
          WHERE profile_url = ?`,
          [profileUrl]
        );
      } else {
        await this.db.run(
          `UPDATE resumes SET
            scrape_attempts = scrape_attempts + 1,
            last_scrape_attempt = CURRENT_TIMESTAMP,
            scrape_status = 'failed',
            profile_scrape_error = ?
          WHERE profile_url = ?`,
          [error, profileUrl]
        );
      }
    } catch (dbError) {
      console.error('❌ Error updating scrape attempt:', dbError.message);
    }
  }

  /**
   * Get failed profiles for retry
   */
  async getFailedProfiles(maxAttempts = 3, limit = 50) {
    try {
      return await this.db.all(
        `SELECT profile_url, name, scrape_attempts, profile_scrape_error
         FROM resumes
         WHERE scrape_status = 'failed'
         AND scrape_attempts < ?
         AND profile_url IS NOT NULL
         ORDER BY last_scrape_attempt ASC
         LIMIT ?`,
        [maxAttempts, limit]
      );
    } catch (error) {
      console.error('❌ Error getting failed profiles:', error.message);
      return [];
    }
  }

  /**
   * Count resumes by search query
   */
  async countBySearchQuery(searchQuery) {
    try {
      const result = await this.db.get(
        'SELECT COUNT(*) as count FROM resumes WHERE search_query = ?',
        [searchQuery]
      );
      return result.count || 0;
    } catch (error) {
      console.error('❌ Error counting resumes:', error.message);
      return 0;
    }
  }

  /**
   * Count all resumes
   */
  async countAll() {
    try {
      const result = await this.db.get('SELECT COUNT(*) as count FROM resumes');
      return result.count || 0;
    } catch (error) {
      console.error('❌ Error counting all resumes:', error.message);
      return 0;
    }
  }
}
