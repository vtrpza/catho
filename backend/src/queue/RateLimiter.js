/**
 * Rate Limiter with Circuit Breaker pattern
 * Prevents overwhelming the target site with requests
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 30;
    this.minDelay = options.minDelay || 1000;
    this.maxDelay = options.maxDelay || 10000;

    // Circuit breaker settings
    this.errorThreshold = options.errorThreshold || 5; // Errors before opening circuit
    this.circuitResetTime = options.circuitResetTime || 60000; // 1 minute

    // State
    this.requestHistory = [];
    this.errorCount = 0;
    this.circuitState = 'closed'; // closed, open, half-open
    this.lastCircuitOpen = null;
    this.lastRequestTimestamp = null;
    this.backoffPenalty = 0;
    this.lastResponseMeta = null;
  }

  /**
   * Dynamically update max requests per minute
   */
  setMaxRequestsPerMinute(value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return;
    }
    const normalized = Math.max(1, Math.floor(value));
    if (normalized !== this.maxRequestsPerMinute) {
      this.maxRequestsPerMinute = normalized;
      console.log(`⚙️ Rate limiter RPM atualizado para ${normalized}`);
    }
  }

  /**
   * Update error threshold at runtime
   */
  setErrorThreshold(value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return;
    }
    this.errorThreshold = Math.floor(value);
  }

  /**
   * Check if we can make a request
   */
  async canRequest() {
    // Check circuit breaker
    if (this.circuitState === 'open') {
      const now = Date.now();
      const timeSinceOpen = now - this.lastCircuitOpen;

      if (timeSinceOpen >= this.circuitResetTime) {
        // Try half-open state
        this.circuitState = 'half-open';
        console.log('🔄 Circuit breaker: HALF-OPEN (testing)');
      } else {
        const waitTime = this.circuitResetTime - timeSinceOpen;
        console.log(`🚫 Circuit breaker: OPEN (wait ${Math.round(waitTime / 1000)}s)`);
        return false;
      }
    }

    // Clean old requests (older than 1 minute)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.requestHistory = this.requestHistory.filter(timestamp => timestamp > oneMinuteAgo);

    // Check rate limit
    if (this.requestHistory.length >= this.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...this.requestHistory);
      const waitTime = 60000 - (now - oldestRequest);
      console.log(`⏳ Rate limit reached. Wait ${Math.round(waitTime / 1000)}s`);
      return false;
    }

    return true;
  }

  /**
   * Wait until we can make a request
   */
  async waitForSlot() {
    while (!(await this.canRequest())) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Record a successful request
   */
  recordRequest(meta = {}) {
    const now = Date.now();
    this.requestHistory.push(now);
    this.lastRequestTimestamp = now;
    this.lastResponseMeta = meta || null;

    // Reset error count on success
    if (this.errorCount > 0) {
      this.errorCount--;
    }

    if (this.backoffPenalty > 0) {
      this.backoffPenalty = Math.max(0, this.backoffPenalty - 1);
    }

    // Close circuit if it was half-open and request succeeded
    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      this.errorCount = 0;
      console.log('✅ Circuit breaker: CLOSED (recovered)');
    }
  }

  /**
   * Record a failed request
   */
  recordError(error, meta = {}) {
    this.errorCount++;
    this.lastResponseMeta = meta || null;

    const status = meta?.status ? Number(meta.status) : null;
    const loginRedirect = Boolean(meta?.loginRedirect);
    const blocked = Boolean(meta?.blocked);

    if (status === 429 || status === 403 || blocked || loginRedirect) {
      this.backoffPenalty = Math.min(this.backoffPenalty + 1, 5);
      if (this.circuitState !== 'open') {
        this.circuitState = 'open';
        this.lastCircuitOpen = Date.now();
        const reason = status || (loginRedirect ? 'login_redirect' : 'blocked');
        console.log(`🚨 Circuit breaker: OPEN (${reason})`);
      }
      return;
    }

    // Open circuit if error threshold reached
    if (this.errorCount >= this.errorThreshold && this.circuitState !== 'open') {
      this.circuitState = 'open';
      this.lastCircuitOpen = Date.now();
      console.log(`🚨 Circuit breaker: OPEN (${this.errorCount} errors)`);
    }
  }

  /**
   * Get adaptive delay based on current state
   */
  getAdaptiveDelay(baseDelay) {
    // Increase delay if we're seeing errors
    let multiplier = 1;

    if (this.errorCount > 0) {
      multiplier = 1 + (this.errorCount * 0.2);
    }

    if (this.circuitState === 'half-open') {
      multiplier = 2; // Be extra cautious when testing
    }

    if (this.backoffPenalty > 0) {
      multiplier += this.backoffPenalty * 0.5;
    }

    const delay = Math.min(baseDelay * multiplier, this.maxDelay);
    return Math.max(delay, this.minDelay);
  }

  /**
   * Get current rate limit statistics
   */
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.requestHistory.filter(t => t > oneMinuteAgo).length;

    return {
      requestsLastMinute: recentRequests,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      remainingSlots: Math.max(0, this.maxRequestsPerMinute - recentRequests),
      errorCount: this.errorCount,
      circuitState: this.circuitState,
      isThrottled: recentRequests >= this.maxRequestsPerMinute,
      lastRequestTimestamp: this.lastRequestTimestamp,
      backoffPenalty: this.backoffPenalty,
      lastResponseMeta: this.lastResponseMeta
    };
  }

  /**
   * Reset the rate limiter
   */
  reset() {
    this.requestHistory = [];
    this.errorCount = 0;
    this.circuitState = 'closed';
    this.lastCircuitOpen = null;
    console.log('✓ Rate limiter reset');
  }

  /**
   * Manually close the circuit
   */
  closeCircuit() {
    this.circuitState = 'closed';
    this.errorCount = 0;
    this.lastCircuitOpen = null;
    console.log('✓ Circuit breaker manually closed');
  }
}
