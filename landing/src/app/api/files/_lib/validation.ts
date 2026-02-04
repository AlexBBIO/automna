/**
 * File Path Validation
 * 
 * Prevents path traversal attacks by validating that all file paths
 * stay within allowed directories.
 */

import path from 'path';

// Allowed root directories for file operations
const ALLOWED_ROOTS = [
  '/home/node/.openclaw',
  '/home/node/workspace',
];

export interface PathValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validate and normalize a file path.
 * 
 * Checks:
 * - No null bytes (classic attack vector)
 * - Path normalizes to within allowed directories
 * - No escape via ../ sequences
 * 
 * @param inputPath - The raw path from user input
 * @returns Validation result with normalized path or error
 */
export function validateFilePath(inputPath: string): PathValidationResult {
  // Check for null bytes (can truncate paths in some systems)
  if (inputPath.includes('\0')) {
    return { valid: false, error: 'Invalid characters in path' };
  }
  
  // Check for empty path
  if (!inputPath || inputPath.trim() === '') {
    return { valid: false, error: 'Path cannot be empty' };
  }
  
  // Normalize the path to resolve ../ and ./ sequences
  // path.normalize handles: /home/node/../etc -> /etc
  const normalized = path.normalize(inputPath);
  
  // Must start with an allowed root
  const allowed = ALLOWED_ROOTS.some(root => {
    // Ensure exact prefix match (not just startsWith which could match /home/node2/)
    return normalized === root || normalized.startsWith(root + '/');
  });
  
  if (!allowed) {
    return { valid: false, error: 'Path outside allowed directories' };
  }
  
  return { valid: true, normalized };
}

/**
 * Validate multiple paths (for move operations).
 */
export function validateFilePaths(paths: string[]): PathValidationResult {
  for (const p of paths) {
    const result = validateFilePath(p);
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}
