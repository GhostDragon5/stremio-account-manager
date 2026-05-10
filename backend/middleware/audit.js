const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../logs/security.log');

/**
 * Ensure log directory exists
 */
function ensureLogDirectory() {
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Log security event
 */
function logSecurityEvent(event, details = {}) {
  ensureLogDirectory();
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    details
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('Failed to write security log:', err);
    }
  });
  
  // Also log to console for debugging
  console.log(`[SECURITY] ${event}:`, details);
}

/**
 * Log login attempt
 */
function logLoginAttempt(email, success, ip, userAgent) {
  logSecurityEvent('LOGIN_ATTEMPT', {
    email,
    success,
    ip,
    userAgent
  });
}

/**
 * Log 2FA attempt
 */
function log2FAAttempt(email, success, ip) {
  logSecurityEvent('2FA_ATTEMPT', {
    email,
    success,
    ip
  });
}

/**
 * Log password change
 */
function logPasswordChange(email, ip) {
  logSecurityEvent('PASSWORD_CHANGE', {
    email,
    ip
  });
}

/**
 * Log account access
 */
function logAccountAccess(userId, action, ip) {
  logSecurityEvent('ACCOUNT_ACCESS', {
    userId,
    action,
    ip
  });
}

/**
 * Log suspicious activity
 */
function logSuspiciousActivity(type, details) {
  logSecurityEvent('SUSPICIOUS_ACTIVITY', {
    type,
    ...details
  });
}

module.exports = {
  logSecurityEvent,
  logLoginAttempt,
  log2FAAttempt,
  logPasswordChange,
  logAccountAccess,
  logSuspiciousActivity
};