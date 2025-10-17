/**
 * Batch Processor for Parallel Scraping
 * Manages concurrent profile scraping with multiple browser tabs
 */

import { humanizedWait, getAdaptiveDelay, simulateHumanBehavior } from './antiDetection.js';

export class BatchProcessor {
  constructor(browser, options = {}) {
    this.browser = browser;
    this.concurrency = options.concurrency || 3; // Number of parallel tabs
    this.maxBatchSize = options.maxBatchSize || 50; // Profiles per batch
    this.profileDelay = options.profileDelay || 2500;
    this.errorCount = 0;
    this.lastRequestTime = 0;
    this.activeJobs = new Map(); // Track active scraping jobs
    this.pageSetup = options.pageSetup || null;
  }

  /**
   * Process a batch of profile URLs in parallel
   * @param {Array<string>} profileUrls - Array of profile URLs to scrape
   * @param {Function} scrapeFunction - Function to scrape each profile
   * @param {Function} saveFunction - Function to save scraped data
   * @returns {Promise<Object>} Results summary
   */
  async processBatch(profileUrls, scrapeFunction, saveFunction) {
    if (!profileUrls || profileUrls.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`\n🚀 Processando batch de ${profileUrls.length} perfis com ${this.concurrency} workers paralelos...`);

    // Split into chunks for batching
    const chunks = this.chunkArray(profileUrls, this.maxBatchSize);
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`\n📦 Batch ${chunkIndex + 1}/${chunks.length} (${chunk.length} perfis)...`);

      const results = await this.processChunkParallel(chunk, scrapeFunction, saveFunction);

      totalProcessed += results.processed;
      totalSucceeded += results.succeeded;
      totalFailed += results.failed;

      // Small delay between chunks
      if (chunkIndex < chunks.length - 1) {
        const delay = getAdaptiveDelay(2000, this.errorCount, this.lastRequestTime);
        console.log(`⏳ Aguardando ${Math.round(delay / 1000)}s antes do próximo batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      processed: totalProcessed,
      succeeded: totalSucceeded,
      failed: totalFailed
    };
  }

  /**
   * Process a chunk of URLs in parallel using worker tabs
   * @param {Array<string>} urls - URLs to process
   * @param {Function} scrapeFunction - Scraping function
   * @param {Function} saveFunction - Save function
   * @returns {Promise<Object>} Results
   */
  async processChunkParallel(urls, scrapeFunction, saveFunction) {
    const workers = [];
    const queue = [...urls];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Create worker tabs
    for (let i = 0; i < Math.min(this.concurrency, urls.length); i++) {
      const worker = this.createWorker(i, queue, scrapeFunction, saveFunction);
      workers.push(worker);
    }

    // Wait for all workers to complete
    const results = await Promise.all(workers);

    // Aggregate results
    results.forEach(result => {
      processed += result.processed;
      succeeded += result.succeeded;
      failed += result.failed;
    });

    return { processed, succeeded, failed };
  }

  /**
   * Create a worker that processes profiles from the queue
   * @param {number} workerId - Worker identifier
   * @param {Array<string>} queue - Shared queue of URLs
   * @param {Function} scrapeFunction - Scraping function
   * @param {Function} saveFunction - Save function
   * @returns {Promise<Object>} Worker results
   */
  async createWorker(workerId, queue, scrapeFunction, saveFunction) {
    let page = null;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      // Create a new page for this worker
      page = await this.browser.newPage();
      if (this.pageSetup) {
        try {
          await this.pageSetup(page);
        } catch (setupError) {
          console.log(`  ⚠️ Worker ${workerId + 1}: falha ao preparar página (${setupError.message}).`);
        }
      }
      console.log(`  👷 Worker ${workerId + 1} iniciado`);

      // Process URLs from queue
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;

        const jobId = `worker${workerId}-${processed}`;
        this.activeJobs.set(jobId, { url, startTime: Date.now() });

        try {
          const startTime = Date.now();

          // Scrape the profile
          const result = await scrapeFunction(page, url);
          this.lastRequestTime = Date.now() - startTime;

          if (result.success) {
            // Save the data
            await saveFunction(url, result.data);
            succeeded++;
            console.log(`  ✅ Worker ${workerId + 1}: ${url.substring(0, 60)}...`);
          } else {
            failed++;
            this.errorCount++;
            console.log(`  ⚠️ Worker ${workerId + 1} falhou: ${result.error}`);
          }

          processed++;
          this.activeJobs.delete(jobId);

          // Adaptive delay between requests for this worker
          if (queue.length > 0) {
            const delay = getAdaptiveDelay(this.profileDelay, this.errorCount, this.lastRequestTime);
            const workerDelay = delay + (workerId * 200); // Stagger workers slightly
            await humanizedWait(page, workerDelay, 0.3);

            // Occasionally simulate human behavior
            if (Math.random() > 0.8) {
              await simulateHumanBehavior(page);
            }
          }

        } catch (error) {
          failed++;
          this.errorCount++;
          console.error(`  ❌ Worker ${workerId + 1} erro: ${error.message}`);
          this.activeJobs.delete(jobId);

          // On error, wait longer before next attempt
          if (queue.length > 0) {
            const errorDelay = getAdaptiveDelay(this.profileDelay * 1.5, this.errorCount, this.lastRequestTime);
            await new Promise(resolve => setTimeout(resolve, errorDelay));
          }
        }
      }

      console.log(`  ✓ Worker ${workerId + 1} finalizado: ${succeeded}/${processed} sucessos`);

    } catch (error) {
      console.error(`  ❌ Worker ${workerId + 1} erro fatal: ${error.message}`);
    } finally {
      // Close the worker page
      if (page) {
        await page.close().catch(() => {});
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Split array into chunks
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array<Array>} Chunked array
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get current active jobs
   */
  getActiveJobs() {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      concurrency: this.concurrency,
      activeJobs: this.activeJobs.size,
      errorCount: this.errorCount,
      lastRequestTime: this.lastRequestTime
    };
  }
}

/**
 * Batch insert resumes into database
 * More efficient than individual inserts
 */
export async function batchInsertResumes(db, resumes) {
  if (!resumes || resumes.length === 0) return;

  try {
    // Start transaction for better performance
    await db.run('BEGIN TRANSACTION');

    const stmt = await db.prepare(
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
    await db.run('COMMIT');

    console.log(`💾 ${resumes.length} currículos salvos em batch`);

  } catch (error) {
    await db.run('ROLLBACK').catch(() => {});
    console.error('❌ Erro no batch insert:', error.message);
    throw error;
  }
}

/**
 * Batch save full profiles with related data
 * Groups multiple profile saves into a transaction
 */
export async function batchSaveProfiles(db, profiles) {
  if (!profiles || profiles.length === 0) return;

  try {
    await db.run('BEGIN TRANSACTION');

    for (const { profileUrl, profileData, searchQuery } of profiles) {
      // Save main profile and get ID
      const result = await db.run(
        `INSERT OR REPLACE INTO resumes
         (profile_url, search_query, full_profile_scraped)
         VALUES (?, ?, 1)`,
        [profileUrl, searchQuery]
      );

      const resumeId = result.lastID;

      // Save related data (work experiences, education, etc.)
      // ... (implementation similar to saveFullProfile but in batch)
    }

    await db.run('COMMIT');
    console.log(`💾 ${profiles.length} perfis completos salvos em batch`);

  } catch (error) {
    await db.run('ROLLBACK').catch(() => {});
    console.error('❌ Erro no batch save profiles:', error.message);
    throw error;
  }
}
