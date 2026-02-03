import { describe, it, expect } from 'vitest';

/**
 * Session key canonicalization logic.
 * OpenClaw stores sessions with canonical keys like "agent:main:conversation"
 * but the UI uses simple keys like "main", "work", etc.
 */

function canonicalizeSessionKey(key: string): string {
  if (key.startsWith('agent:main:')) return key;
  return `agent:main:${key}`;
}

function isCanonicalKey(key: string): boolean {
  return key.startsWith('agent:main:');
}

function extractSimpleKey(canonicalKey: string): string {
  if (canonicalKey.startsWith('agent:main:')) {
    return canonicalKey.slice('agent:main:'.length);
  }
  return canonicalKey;
}

describe('Session Key Canonicalization', () => {
  describe('canonicalizeSessionKey', () => {
    it('should add prefix to simple keys', () => {
      expect(canonicalizeSessionKey('main')).toBe('agent:main:main');
      expect(canonicalizeSessionKey('work')).toBe('agent:main:work');
      expect(canonicalizeSessionKey('test')).toBe('agent:main:test');
    });

    it('should not double-prefix canonical keys', () => {
      expect(canonicalizeSessionKey('agent:main:main')).toBe('agent:main:main');
      expect(canonicalizeSessionKey('agent:main:work')).toBe('agent:main:work');
    });

    it('should handle empty strings', () => {
      expect(canonicalizeSessionKey('')).toBe('agent:main:');
    });

    it('should handle keys with special characters', () => {
      expect(canonicalizeSessionKey('my-project')).toBe('agent:main:my-project');
      expect(canonicalizeSessionKey('project_123')).toBe('agent:main:project_123');
    });

    it('should handle keys that look similar to canonical format', () => {
      // These should get the prefix because they don't start with agent:main:
      expect(canonicalizeSessionKey('agent:other:main')).toBe('agent:main:agent:other:main');
      expect(canonicalizeSessionKey('agent-main')).toBe('agent:main:agent-main');
    });
  });

  describe('isCanonicalKey', () => {
    it('should return true for canonical keys', () => {
      expect(isCanonicalKey('agent:main:main')).toBe(true);
      expect(isCanonicalKey('agent:main:work')).toBe(true);
      expect(isCanonicalKey('agent:main:')).toBe(true);
    });

    it('should return false for simple keys', () => {
      expect(isCanonicalKey('main')).toBe(false);
      expect(isCanonicalKey('work')).toBe(false);
      expect(isCanonicalKey('')).toBe(false);
    });

    it('should return false for partial matches', () => {
      expect(isCanonicalKey('agent:main')).toBe(false);
      expect(isCanonicalKey('agent:')).toBe(false);
    });
  });

  describe('extractSimpleKey', () => {
    it('should extract simple key from canonical', () => {
      expect(extractSimpleKey('agent:main:main')).toBe('main');
      expect(extractSimpleKey('agent:main:work')).toBe('work');
      expect(extractSimpleKey('agent:main:my-project')).toBe('my-project');
    });

    it('should return input unchanged if not canonical', () => {
      expect(extractSimpleKey('main')).toBe('main');
      expect(extractSimpleKey('work')).toBe('work');
    });

    it('should handle edge cases', () => {
      expect(extractSimpleKey('agent:main:')).toBe('');
      expect(extractSimpleKey('')).toBe('');
    });
  });
});

describe('Session Key Round-Trip', () => {
  it('should preserve key through canonicalize -> extract', () => {
    const keys = ['main', 'work', 'test', 'my-project', 'project_123'];
    
    for (const key of keys) {
      const canonical = canonicalizeSessionKey(key);
      const extracted = extractSimpleKey(canonical);
      expect(extracted).toBe(key);
    }
  });

  it('should be idempotent', () => {
    const key = 'test';
    const once = canonicalizeSessionKey(key);
    const twice = canonicalizeSessionKey(once);
    const thrice = canonicalizeSessionKey(twice);
    
    expect(once).toBe(twice);
    expect(twice).toBe(thrice);
    expect(thrice).toBe('agent:main:test');
  });
});
