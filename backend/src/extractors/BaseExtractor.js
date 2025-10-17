/**
 * Base Extractor Class
 * All extractors should extend this class
 */
export class BaseExtractor {
  constructor() {
    this.errors = [];
  }

  /**
   * Extract data from a page
   * Must be implemented by subclasses
   */
  async extract(page, context = {}) {
    throw new Error('extract() must be implemented by subclass');
  }

  /**
   * Validate extracted data
   * Can be overridden by subclasses
   */
  validate(data) {
    return data !== null && data !== undefined;
  }

  /**
   * Add an error
   */
  addError(error, context = {}) {
    this.errors.push({
      message: error.message || error,
      context,
      timestamp: Date.now()
    });

    // Keep only last 20 errors per extractor
    if (this.errors.length > 20) {
      this.errors.shift();
    }
  }

  /**
   * Get recent errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Clear errors
   */
  clearErrors() {
    this.errors = [];
  }
}
