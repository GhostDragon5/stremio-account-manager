const fs = require('fs');
const path = require('path');

const LOCKOUT_FILE = path.join(__dirname, '../data/lockouts.json');
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Ensure data directory exists
 */
function ensureDataDirectory() {
  const dataDir = path.dirname(LOCKOUT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Load lockouts from file
 */
function loadLockouts() {
  ensureDataDirectory();
  
  try {
    if (fs.existsSync(LOCKOUT_FILE)) {
      const data = fs.readFileSync(LOCKOUT_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load lockouts:', error);
  }
  
  return {};
}

/**
 * Save lockouts to file
 */
function saveLockouts(lockouts) {
  ensureDataDirectory();
  
  try {
    fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(lockouts, null, 2));
  } catch (error) {
    console.error('Failed to save lockouts:', error);
  }
}

/**
 * Check if IP is locked out
 */
function isLockedOut(ip) {
  const lockouts = loadLockouts();
  const lockout = lockouts[ip];
  
  if (!lockout) {
    return false;
  }
  
  // Check if lockout has expired
  if (Date.now() > lockout.expiresAt) {
    delete lockouts[ip];
    saveLockouts(lockouts);
    return false;
  }
  
  return true;
}

/**
 * Get remaining lockout time in seconds
 */
function getRemainingLockoutTime(ip) {
  const lockouts = loadLockouts();
  const lockout = lockouts[ip];
  
  if (!lockout) {
    return 0;
  }
  
  const remaining = lockout.expiresAt - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Record failed attempt
 */
function recordFailedAttempt(ip) {
  const lockouts = loadLockouts();
  
  if (!lockouts[ip]) {
    lockouts[ip] = {
      attempts: 0,
      firstAttempt: Date.now(),
      expiresAt: 0
    };
  }
  
  lockouts[ip].attempts++;
  
  // Lock out if max attempts reached
  if (lockouts[ip].attempts >= MAX_ATTEMPTS) {
    lockouts[ip].expiresAt = Date.now() + LOCKOUT_DURATION;
  }
  
  saveLockouts(lockouts);
  
  return lockouts[ip];
}

/**
 * Reset failed attempts (on successful login)
 */
function resetFailedAttempts(ip) {
  const lockouts = loadLockouts();
  
  if (lockouts[ip]) {
    delete lockouts[ip];
    saveLockouts(lockouts);
  }
}

/**
 * Get attempt count
 */
function getAttemptCount(ip) {
  const lockouts = loadLockouts();
  return lockouts[ip]?.attempts || 0;
}

module.exports = {
  isLockedOut,
  getRemainingLockoutTime,
  recordFailedAttempt,
  resetFailedAttempts,
  getAttemptCount,
  MAX_ATTEMPTS,
  LOCKOUT_DURATION
};