/**
 * Encryption utilities for secrets management
 * 
 * Uses AES-256-GCM with per-user key derivation.
 * Master key is stored in SECRETS_MASTER_KEY env var.
 */

import crypto from 'crypto';

const MASTER_KEY = process.env.SECRETS_MASTER_KEY;

if (!MASTER_KEY && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: SECRETS_MASTER_KEY not set. Secrets encryption will fail.');
}

/**
 * Derive a per-user encryption key from the master key
 */
function deriveUserKey(userId: string): Buffer {
  if (!MASTER_KEY) {
    throw new Error('SECRETS_MASTER_KEY not configured');
  }
  return crypto.pbkdf2Sync(MASTER_KEY, userId, 100000, 32, 'sha256');
}

/**
 * Encrypt a secret value
 * Returns encrypted ciphertext and IV (both base64 encoded)
 */
export function encryptSecret(value: string, userId: string): { encrypted: string; iv: string } {
  const key = deriveUserKey(userId);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Combine ciphertext and auth tag
  return {
    encrypted: encrypted + ':' + authTag.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Decrypt a secret value
 */
export function decryptSecret(encrypted: string, iv: string, userId: string): string {
  const key = deriveUserKey(userId);
  
  const [ciphertext, authTag] = encrypted.split(':');
  if (!ciphertext || !authTag) {
    throw new Error('Invalid encrypted value format');
  }
  
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate a random master key (for initial setup)
 * Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
