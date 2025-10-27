/**
 * Cryptographic Utilities
 * Provides secure password hashing and verification using Node.js built-in crypto
 */

const crypto = require('crypto');

// Configuration for PBKDF2
const HASH_CONFIG = {
  iterations: 100000,
  keyLength: 64,
  digest: 'sha512',
  saltLength: 32
};

/**
 * Hash a password using PBKDF2
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hash in format: salt:hash
 */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    // Generate random salt
    const salt = crypto.randomBytes(HASH_CONFIG.saltLength).toString('hex');

    // Hash password with salt
    crypto.pbkdf2(
      password,
      salt,
      HASH_CONFIG.iterations,
      HASH_CONFIG.keyLength,
      HASH_CONFIG.digest,
      (err, derivedKey) => {
        if (err) reject(err);
        const hash = derivedKey.toString('hex');
        resolve(`${salt}:${hash}`);
      }
    );
  });
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash in format: salt:hash
 * @returns {Promise<boolean>} True if password matches
 */
function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    // Handle legacy plain-text passwords (for migration)
    if (!storedHash.includes(':')) {
      resolve(password === storedHash);
      return;
    }

    // Parse salt and hash
    const [salt, originalHash] = storedHash.split(':');

    // Hash provided password with same salt
    crypto.pbkdf2(
      password,
      salt,
      HASH_CONFIG.iterations,
      HASH_CONFIG.keyLength,
      HASH_CONFIG.digest,
      (err, derivedKey) => {
        if (err) reject(err);
        const hash = derivedKey.toString('hex');
        resolve(hash === originalHash);
      }
    );
  });
}

/**
 * Check if a password hash is using legacy plain-text format
 * @param {string} hash - Password hash to check
 * @returns {boolean} True if legacy format
 */
function isLegacyHash(hash) {
  return !hash.includes(':');
}

module.exports = {
  hashPassword,
  verifyPassword,
  isLegacyHash
};
