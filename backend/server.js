const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult, param } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const axios = require('axios');

const { generateToken, verifyToken, authenticate } = require('./middleware/auth');
const { logLoginAttempt, log2FAAttempt, logPasswordChange, logAccountAccess, logSuspiciousActivity } = require('./middleware/audit');
const { isLockedOut, getRemainingLockoutTime, recordFailedAttempt, resetFailedAttempts, getAttemptCount } = require('./middleware/lockout');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error('FATAL: ENCRYPTION_KEY environment variable is required (32 bytes hex)');
  process.exit(1);
}

if (ENCRYPTION_KEY && !/^[a-fA-F0-9]{64}$/.test(ENCRYPTION_KEY)) {
  console.error('FATAL: ENCRYPTION_KEY must be a 64 character hex string (256 bits)');
  process.exit(1);
}

// Crypto utilities for encrypting reversible secrets
const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(ciphertext) {
  try {
    const buffer = Buffer.from(ciphertext, 'base64');
    const iv = buffer.slice(0, IV_LENGTH);
    const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (err) {
    return null;
  }
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.strem.io", "https://v3-cinemeta.strem.io"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// Prevent clickjacking
app.disable('x-powered-by');

// Remove trailingslash
app.use((req, res, next) => {
  if (req.path.endsWith('/') && req.path.length > 1) {
    res.redirect(req.path.slice(0, -1));
  } else {
    next();
  }
});

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  handler: (req, res) => {
    res.status(429).json({ 
      error: 'Too many login attempts, please try again later',
      retryAfter: '15 minutes'
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later',
      retryAfter: '15 minutes'
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for sensitive operations
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later',
      retryAfter: '1 minute'
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration - strict for production
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DATABASE_FILE = path.join(dataDir, 'database.json');
const DEFAULT_DB_STATE = {
  accounts: [],
  nextAccountId: 1,
  users: [],
  nextUserId: 1,
  savedAddons: [],
  nextSavedAddonId: 1,
};

const loadStateFromDisk = () => {
  if (!fs.existsSync(DATABASE_FILE)) {
    return { ...DEFAULT_DB_STATE };
  }
  try {
    const raw = fs.readFileSync(DATABASE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      accounts: parsed.accounts || [],
      nextAccountId: parsed.nextAccountId || 1,
      users: parsed.users || [],
      nextUserId: parsed.nextUserId || 1,
      savedAddons: parsed.savedAddons || [],
      nextSavedAddonId: parsed.nextSavedAddonId || 1,
    };
  } catch (error) {
    console.error('Failed to load database.json, resetting state:', error);
    return { ...DEFAULT_DB_STATE };
  }
};

const saveStateToDisk = (state) => {
  try {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Failed to save database.json:', error);
  }
};

let persistentState = loadStateFromDisk();

const persistState = () => {
  saveStateToDisk(persistentState);
};

const db = {
  createTable: function () {
    persistentState = { ...DEFAULT_DB_STATE };
    persistState();
  },

  getAll: function () {
    return persistentState.accounts;
  },

  getById: function (id) {
    return persistentState.accounts.find((acc) => acc.id === id);
  },

  insert: function (account) {
    account.id = 'acc_' + persistentState.nextAccountId++;
    persistentState.accounts.push(account);
    persistState();
    return account;
  },

  update: function (id, updates) {
    const index = persistentState.accounts.findIndex((acc) => acc.id === id);
    if (index !== -1) {
      persistentState.accounts[index] = { ...persistentState.accounts[index], ...updates };
      persistState();
      return persistentState.accounts[index];
    }
    return null;
  },

  delete: function (id) {
    const index = persistentState.accounts.findIndex((acc) => acc.id === id);
    if (index !== -1) {
      persistentState.accounts.splice(index, 1);
      persistState();
      return true;
    }
    return false;
  },

  getAllUsers: function () {
    return persistentState.users;
  },

  getUserById: function (id) {
    return persistentState.users.find((user) => user.id === id);
  },

  getUserByEmail: function (email) {
    return persistentState.users.find((user) => user.email === email);
  },

  insertUser: function (user) {
    user.id = 'user_' + persistentState.nextUserId++;
    persistentState.users.push(user);
    persistState();
    return user;
  },

  updateUser: function (id, updates) {
    const index = persistentState.users.findIndex((user) => user.id === id);
    if (index !== -1) {
      persistentState.users[index] = { ...persistentState.users[index], ...updates };
      persistState();
      return persistentState.users[index];
    }
    return null;
  },

  deleteUser: function (id) {
    const index = persistentState.users.findIndex((user) => user.id === id);
    if (index !== -1) {
      persistentState.users.splice(index, 1);
      persistState();
      return true;
    }
    return false;
  },

  getAllSavedAddons: function () {
    return persistentState.savedAddons;
  },

  getSavedAddonById: function (id) {
    return persistentState.savedAddons.find((addon) => addon.id === id);
  },

  insertSavedAddon: function (addon) {
    addon.id = 'addon_' + persistentState.nextSavedAddonId++;
    persistentState.savedAddons.push(addon);
    persistState();
    return addon;
  },

  updateSavedAddon: function (id, updates) {
    const index = persistentState.savedAddons.findIndex((addon) => addon.id === id);
    if (index !== -1) {
      persistentState.savedAddons[index] = { ...persistentState.savedAddons[index], ...updates };
      persistState();
      return persistentState.savedAddons[index];
    }
    return null;
  },

  deleteSavedAddon: function (id) {
    const index = persistentState.savedAddons.findIndex((addon) => addon.id === id);
    if (index !== -1) {
      persistentState.savedAddons.splice(index, 1);
      persistState();
      return true;
    }
    return false;
  },
};

// Create initial table if file missing
if (!fs.existsSync(DATABASE_FILE)) {
  db.createTable();
} else {
  // Ensure we persist any normalized defaults immediately
  persistState();
}

// Create default admin account if it doesn't exist
const adminExists = db.getUserByEmail('admin');
if (!adminExists) {
  // Hash the default password
  const hashedPassword = bcrypt.hashSync('admin', 10);
  
  db.insertUser({
    email: 'admin',
    password: hashedPassword,
    two_factor_enabled: false,
    two_factor_secret: null,
    created_at: new Date().toISOString()
  });
  console.log('Default admin account created: admin/admin (PLEASE CHANGE PASSWORD IMMEDIATELY!)');
}

// API Endpoints

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Get all accounts (protected)
app.get('/api/accounts', authenticate, (req, res) => {
  try {
    logAccountAccess(req.user.id, 'GET_ALL_ACCOUNTS', req.ip);
    const accounts = db.getAll();
    // Decrypt sensitive fields for frontend use
    const decryptedAccounts = accounts.map(acc => ({
      ...acc,
      auth_key: acc.auth_key ? decrypt(acc.auth_key) : null,
      password: acc.password ? decrypt(acc.password) : null,
    }));
    res.json(decryptedAccounts);
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get account by id (protected)
app.get('/api/accounts/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    // Input validation
    if (!id || typeof id !== 'string' || !id.startsWith('acc_')) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }

    const account = db.getById(id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Optionally decrypt sensitive fields for response
    const safeAccount = { ...account };
    if (safeAccount.auth_key) {
      safeAccount.auth_key = '[ENCRYPTED]';
    }
    if (safeAccount.password) {
      safeAccount.password = '[ENCRYPTED]';
    }
    res.json(safeAccount);
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account (protected)
app.delete('/api/accounts/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    // Input validation
    if (!id || typeof id !== 'string' || !id.startsWith('acc_')) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }

    const deleted = db.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/accounts', authenticate, (req, res) => {
  try {
    const { name, email, auth_key, password, addons, last_sync, status } = req.body;

    // Encrypt sensitive fields before storage
    const encryptedAuthKey = auth_key ? encrypt(auth_key) : null;
    const encryptedPassword = password ? encrypt(password) : null;

    const account = db.insert({
      name,
      email,
      auth_key: encryptedAuthKey,
      password: encryptedPassword,
      addons,
      last_sync,
      status: status || 'active',
      created_at: new Date().toISOString()
    });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update account
app.put('/api/accounts/:id', authenticate, (req, res) => {
  try {
    const { name, email, auth_key, password, addons, last_sync, status } = req.body;

    // Encrypt sensitive fields before storage
    const updates = {
      name,
      email,
      addons,
      last_sync,
      status,
      updated_at: new Date().toISOString()
    };

    if (auth_key !== undefined) {
      updates.auth_key = auth_key ? encrypt(auth_key) : null;
    }
    if (password !== undefined) {
      updates.password = password ? encrypt(password) : null;
    }

    const updated = db.update(req.params.id, updates);

    if (!updated) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Management Endpoints

// Get all users
app.get('/api/users', (req, res) => {
  try {
    const users = db.getAllUsers();
    // Remove sensitive data
    const safeUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      two_factor_enabled: user.two_factor_enabled
    }));
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user by id
app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Remove sensitive data
    const safeUser = {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      two_factor_enabled: user.two_factor_enabled
    };
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register new user
app.post('/api/users/register', 
  [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).trim()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;
      
      // Sanitize inputs
      const sanitizedEmail = sanitizeHtml(email);
      const sanitizedPassword = sanitizeHtml(password);
      
      // Check if user already exists
      const existingUser = db.getUserByEmail(sanitizedEmail);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      // Hash password
      const hashedPassword = bcrypt.hashSync(sanitizedPassword, 10);
      
      // Create new user
      const user = db.insertUser({
        email: sanitizedEmail,
        password: hashedPassword,
        two_factor_enabled: false,
        two_factor_secret: null,
        created_at: new Date().toISOString()
      });
      
      // Generate JWT token
      const token = generateToken(user);
      
      // Remove sensitive data
      const safeUser = {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        two_factor_enabled: user.two_factor_enabled
      };
      
      logAccountAccess(user.id, 'USER_REGISTERED', req.ip);
      
      res.status(201).json({ 
        user: safeUser,
        token
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Login user
app.post('/api/users/login', 
  loginLimiter,
  [
    body('email').trim().notEmpty().withMessage('Username or email is required'),
    body('password').isLength({ min: 5 }).trim(),
    body('two_factor_code').optional().isLength({ min: 6, max: 6 }).isNumeric()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || 'unknown';

    // Check if IP is locked out
    if (isLockedOut(ip)) {
      const remainingTime = getRemainingLockoutTime(ip);
      logSuspiciousActivity('LOCKOUT_ATTEMPT', { ip, userAgent });
      return res.status(429).json({ 
        error: 'Too many failed attempts. Please try again later.',
        remainingTime
      });
    }

    try {
      const { email, password, two_factor_code } = req.body;
      
      // Sanitize inputs
      const sanitizedEmail = sanitizeHtml(email);
      const sanitizedPassword = sanitizeHtml(password);
      
      // Find user by email
      const user = db.getUserByEmail(sanitizedEmail);
      if (!user) {
        recordFailedAttempt(ip);
        logLoginAttempt(sanitizedEmail, false, ip, userAgent);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check password using bcrypt
      const passwordMatch = bcrypt.compareSync(sanitizedPassword, user.password);
      if (!passwordMatch) {
        recordFailedAttempt(ip);
        logLoginAttempt(sanitizedEmail, false, ip, userAgent);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check if it's the default admin account
      const isDefaultAdmin = user.email === 'admin' && bcrypt.compareSync('admin', user.password);
      
      // Check 2FA if enabled
      if (user.two_factor_enabled) {
        if (!two_factor_code) {
          return res.status(400).json({ error: 'Two-factor code required' });
        }
        
        // Check if it's a backup code (format: XXXX-XXXX)
        if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(two_factor_code)) {
          // Verify backup code
          let validBackupCode = false;
          let codeIndex = -1;
          for (let i = 0; i < user.backup_codes.length; i++) {
            if (bcrypt.compareSync(two_factor_code, user.backup_codes[i])) {
              validBackupCode = true;
              codeIndex = i;
              break;
            }
          }
          
          if (!validBackupCode) {
            recordFailedAttempt(ip);
            return res.status(401).json({ error: 'Invalid backup code' });
          }
          
          // Remove used backup code
          const updatedBackupCodes = [...user.backup_codes];
          updatedBackupCodes.splice(codeIndex, 1);
          db.updateUser(user.id, {
            backup_codes: updatedBackupCodes.length > 0 ? updatedBackupCodes : null
          });
        } else {
          // Validate 2FA code format
          if (typeof two_factor_code !== 'string' || !/^\d{6}$/.test(two_factor_code)) {
            return res.status(400).json({ error: 'Invalid two-factor code format' });
          }

          // Decrypt the stored TOTP secret before verification
          const decryptedSecret = decrypt(user.two_factor_secret);
          if (!decryptedSecret) {
            recordFailedAttempt(ip);
            log2FAAttempt(sanitizedEmail, false, ip);
            return res.status(401).json({ error: 'Invalid two-factor code' });
          }

          // Verify TOTP code
          if (!verifyTOTP(decryptedSecret, two_factor_code)) {
            recordFailedAttempt(ip);
            log2FAAttempt(sanitizedEmail, false, ip);
            return res.status(401).json({ error: 'Invalid two-factor code' });
          }

          log2FAAttempt(sanitizedEmail, true, ip);
        }
      }
      
      // Reset failed attempts on successful login
      resetFailedAttempts(ip);
      logLoginAttempt(sanitizedEmail, true, ip, userAgent);
      
      // Generate JWT token
      const token = generateToken(user);
      
      // Remove sensitive data
      const safeUser = {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        two_factor_enabled: user.two_factor_enabled,
        is_default_admin: isDefaultAdmin
      };
      
      res.json({ 
        user: safeUser,
        token
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update user
app.put('/api/users/:id', (req, res) => {
  try {
    const { email, two_factor_enabled } = req.body;
    
    // Build updates object with only provided fields
    const updates = {};
    if (email !== undefined) updates.email = email;
    if (two_factor_enabled !== undefined) updates.two_factor_enabled = two_factor_enabled;
    updates.updated_at = new Date().toISOString();
    
    const updated = db.updateUser(req.params.id, updates);
    
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove sensitive data
    const safeUser = {
      id: updated.id,
      email: updated.email,
      created_at: updated.created_at,
      two_factor_enabled: updated.two_factor_enabled
    };
    
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  try {
    const deleted = db.deleteUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enable 2FA for user
app.post('/api/users/:id/enable-2fa', authenticate, (req, res) => {
  try {
    const { secret } = req.body;
    const user = db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Authorization: users can only enable their own 2FA
    if (req.user.id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!secret) {
      return res.status(400).json({ error: 'Secret is required' });
    }

    // Generate 10 backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{4}/g).join('-');
      backupCodes.push(code);
    }

    // Hash backup codes for storage
    const hashedBackupCodes = backupCodes.map(code => bcrypt.hashSync(code, 10));

    // Encrypt the TOTP secret before storage
    const encryptedSecret = encrypt(secret);

    const updated = db.updateUser(req.params.id, {
      two_factor_enabled: true,
      two_factor_secret: encryptedSecret,
      backup_codes: hashedBackupCodes
    });

    res.json({
      success: true,
      secret: secret, // Return plain secret only once during setup
      backupCodes: backupCodes,
      message: 'Two-factor authentication enabled successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disable 2FA for user
app.post('/api/users/:id/disable-2fa', authenticate, (req, res) => {
  try {
    const user = db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Authorization: users can only disable their own 2FA
    if (req.user.id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = db.updateUser(req.params.id, {
      two_factor_enabled: false,
      two_factor_secret: null,
      backup_codes: null
    });

    res.json({ success: true, message: 'Two-factor authentication disabled' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request recovery code (check if user has backup codes)
app.post('/api/users/recovery-code', (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email address' });
    }

    if (!user.backup_codes || !Array.isArray(user.backup_codes) || user.backup_codes.length === 0) {
      return res.status(400).json({ error: 'This account has no backup codes set up' });
    }

    res.json({
      success: true,
      message: 'Recovery code requested. Please enter one of your backup codes.',
      remainingCodes: user.backup_codes.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify backup code
app.post('/api/users/verify-backup-code', (req, res) => {
  try {
    const { email, backupCode } = req.body;
    
    if (!email || !backupCode) {
      return res.status(400).json({ error: 'Email and backup code are required' });
    }
    
    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.backup_codes || !Array.isArray(user.backup_codes)) {
      return res.status(401).json({ error: 'No backup codes set for this account' });
    }
    
    // Find matching backup code
    let codeIndex = -1;
    for (let i = 0; i < user.backup_codes.length; i++) {
      if (bcrypt.compareSync(backupCode, user.backup_codes[i])) {
        codeIndex = i;
        break;
      }
    }
    
    if (codeIndex === -1) {
      return res.status(401).json({ error: 'Invalid backup code' });
    }

    // Remove used backup code
    const updatedBackupCodes = [...user.backup_codes];
    updatedBackupCodes.splice(codeIndex, 1);

    // Disable 2FA when using backup code for recovery
    db.updateUser(user.id, {
      two_factor_enabled: false,
      two_factor_secret: null,
      backup_codes: null
    });

    res.json({
      success: true,
      message: '2FA has been disabled. You can now login with your username and password.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change user password
app.post('/api/users/:id/change-password', 
  authenticate,
  [
    param('id').isString(),
    body('currentPassword').isLength({ min: 5 }).trim(),
    body('newPassword').isLength({ min: 6 }).trim()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { currentPassword, newPassword } = req.body;
      const { id } = req.params;
      
      // Authorization check - user can only change their own password
      if (req.user.id !== id) {
        logSuspiciousActivity('UNAUTHORIZED_PASSWORD_CHANGE', {
          userId: req.user.id,
          targetId: id,
          ip: req.ip
        });
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      // Sanitize inputs
      const sanitizedCurrentPassword = sanitizeHtml(currentPassword);
      const sanitizedNewPassword = sanitizeHtml(newPassword);
      
      const user = db.getUserById(id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Verify current password using bcrypt
      const passwordMatch = bcrypt.compareSync(sanitizedCurrentPassword, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      // Hash new password
      const hashedNewPassword = bcrypt.hashSync(sanitizedNewPassword, 10);
      
      // Update password
      const updated = db.updateUser(id, {
        password: hashedNewPassword
      });
      
      logPasswordChange(user.email, req.ip);
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      console.error('Password change error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Saved Addons Endpoints

// Get all saved addons
app.get('/api/saved-addons', (req, res) => {
  try {
    const savedAddons = db.getAllSavedAddons();
    res.json(savedAddons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get saved addon by id
app.get('/api/saved-addons/:id', (req, res) => {
  try {
    const savedAddon = db.getSavedAddonById(req.params.id);
    if (!savedAddon) {
      return res.status(404).json({ error: 'Saved addon not found' });
    }
    res.json(savedAddon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new saved addon
app.post('/api/saved-addons', (req, res) => {
  try {
    const { name, installUrl, manifest, tags, sourceType } = req.body;
    
    const savedAddon = db.insertSavedAddon({
      name,
      installUrl,
      manifest: manifest || {},
      tags: tags || [],
      sourceType: sourceType || 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsed: null
    });
    
    res.status(201).json(savedAddon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update saved addon
app.put('/api/saved-addons/:id', (req, res) => {
  try {
    const { name, installUrl, manifest, tags, lastUsed } = req.body;
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (installUrl !== undefined) updates.installUrl = installUrl;
    if (manifest !== undefined) updates.manifest = manifest;
    if (tags !== undefined) updates.tags = tags;
    if (lastUsed !== undefined) updates.lastUsed = lastUsed;
    updates.updatedAt = new Date().toISOString();
    
    const updated = db.updateSavedAddon(req.params.id, updates);
    
    if (!updated) {
      return res.status(404).json({ error: 'Saved addon not found' });
    }
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete saved addon
app.delete('/api/saved-addons/:id', (req, res) => {
  try {
    const deleted = db.deleteSavedAddon(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Saved addon not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch addon manifest via backend proxy (avoids CORS/timeouts on the frontend)
app.post('/api/addon-manifest',
  authenticate,
  [
    body('url').trim().isURL({ require_protocol: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { url } = req.body;
    try {
      const response = await axios.get(url, { timeout: 20000 });
      let manifest = response.data;
      if (typeof manifest === 'string') {
        manifest = JSON.parse(manifest);
      }

      if (!manifest?.id || !manifest?.name || !manifest?.version) {
        return res.status(400).json({ error: 'Invalid addon manifest' });
      }

      res.json({ manifest });
    } catch (error) {
      console.error('Addon manifest fetch error:', error);
      let message = 'Failed to fetch addon manifest';
      let statusCode = 502;

      if (axios.isAxiosError && axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          message = 'Addon manifest not found';
          statusCode = 404;
        }
        if (error.code === 'ECONNABORTED') {
          message = 'Addon manifest fetch timed out';
        }
        statusCode = error.response?.status || statusCode;
      }

      res.status(statusCode).json({ error: message });
    }
  }
);

// Helper function to verify TOTP code
function verifyTOTP(secret, code) {
  try {
    const crypto = require('crypto');
    
    // Input validation
    if (!secret || !code) {
      return false;
    }
    
    if (typeof secret !== 'string' || typeof code !== 'string') {
      return false;
    }
    
    if (!/^[A-Z2-7]+$/.test(secret)) {
      return false;
    }
    
    if (!/^\d{6}$/.test(code)) {
      return false;
    }
    
    // Convert Base32 secret to bytes
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < secret.length; i++) {
      const val = base32Chars.indexOf(secret.charAt(i));
      if (val === -1) return false;
      bits += val.toString(2).padStart(5, '0');
    }
    
    const secretBytes = Buffer.alloc(Math.floor(bits.length / 8));
    for (let i = 0; i < secretBytes.length; i++) {
      secretBytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }
    
    // Get current time interval (30 seconds)
    const time = Math.floor(Date.now() / 1000 / 30);
    
    // Check current and adjacent time intervals (allow 1 step before/after for clock drift)
    for (let offset = -1; offset <= 1; offset++) {
      const timeBytes = Buffer.alloc(8);
      timeBytes.writeBigUInt64BE(BigInt(time + offset));
      
      // Generate HMAC
      const hmac = crypto.createHmac('sha1', secretBytes);
      hmac.update(timeBytes);
      const hmacResult = hmac.digest();
      
      // Dynamic truncation
      const offsetValue = hmacResult[hmacResult.length - 1] & 0x0F;
      const binary = ((hmacResult[offsetValue] & 0x7F) << 24) |
                     ((hmacResult[offsetValue + 1] & 0xFF) << 16) |
                     ((hmacResult[offsetValue + 2] & 0xFF) << 8) |
                     (hmacResult[offsetValue + 3] & 0xFF);
      
      const otp = binary % 1000000;
      const otpStr = otp.toString().padStart(6, '0');
      
      if (otpStr === code) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

// Verify 2FA code (for setup verification)
app.post('/api/users/verify-2fa', (req, res) => {
  try {
    const { secret, code } = req.body;
    
    if (!secret || !code) {
      return res.status(400).json({ error: 'Secret and code are required' });
    }
    
    const isValid = verifyTOTP(secret, code);
    
    res.json({ valid: isValid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request password reset
app.post('/api/users/request-password-reset', 
  [
    body('email').trim().isEmail().normalizeEmail()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      
      // Sanitize input
      const sanitizedEmail = sanitizeHtml(email);
      
      // Check if user exists
      const user = db.getUserByEmail(sanitizedEmail);
      if (!user) {
        // Don't reveal if user exists for security
        return res.json({ 
          message: 'If the email exists, a password reset link will be sent' 
        });
      }
      
      // Generate reset token (in production, send email with reset link)
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour
      
      // Store reset token in user record
      db.updateUser(user.id, {
        reset_token: resetToken,
        reset_expires: resetExpires.toISOString()
      });
      
      logPasswordChange(sanitizedEmail, req.ip);
      
      // In production, send email with reset link
      // For now, return the token (only for development)
      if (process.env.NODE_ENV !== 'production') {
        console.log('Password reset token:', resetToken);
      }
      
      res.json({ 
        message: 'If the email exists, a password reset link will be sent',
        // Only include token in development
        ...(process.env.NODE_ENV !== 'production' && { resetToken })
      });
    } catch (err) {
      console.error('Password reset request error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Reset password with token
app.post('/api/users/reset-password', 
  [
    body('token').isString().trim(),
    body('newPassword').isLength({ min: 6 }).trim()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { token, newPassword } = req.body;
      
      // Sanitize inputs
      const sanitizedToken = sanitizeHtml(token);
      const sanitizedNewPassword = sanitizeHtml(newPassword);
      
      // Find user with valid reset token
      const users = db.getAllUsers();
      const user = users.find(u => 
        u.reset_token === sanitizedToken && 
        new Date(u.reset_expires) > new Date()
      );
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      // Hash new password
      const hashedNewPassword = bcrypt.hashSync(sanitizedNewPassword, 10);
      
      // Update password and clear reset token
      const updated = db.updateUser(user.id, {
        password: hashedNewPassword,
        reset_token: null,
        reset_expires: null
      });
      
      logPasswordChange(user.email, req.ip);
      
      res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
      console.error('Password reset error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
