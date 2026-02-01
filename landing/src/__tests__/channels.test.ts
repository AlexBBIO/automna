import { describe, it, expect } from 'vitest';

// Test channel key generation logic (extracted from dashboard)
function generateChannelKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

describe('Channel key generation', () => {
  it('should convert name to lowercase', () => {
    expect(generateChannelKey('Work')).toBe('work');
    expect(generateChannelKey('PROJECTS')).toBe('projects');
  });

  it('should replace spaces with dashes', () => {
    expect(generateChannelKey('My Project')).toBe('my-project');
    expect(generateChannelKey('Work Tasks')).toBe('work-tasks');
  });

  it('should replace multiple spaces with single dash', () => {
    expect(generateChannelKey('My   Project')).toBe('my-project');
  });

  it('should remove special characters', () => {
    expect(generateChannelKey('Project #1')).toBe('project-1');
    expect(generateChannelKey('Work@Home')).toBe('work-home');
    expect(generateChannelKey('Task (urgent)')).toBe('task-urgent');
  });

  it('should remove leading and trailing dashes', () => {
    expect(generateChannelKey('-test-')).toBe('test');
    expect(generateChannelKey('--test--')).toBe('test');
    expect(generateChannelKey('  test  ')).toBe('test');
  });

  it('should handle emojis', () => {
    expect(generateChannelKey('🚀 Launch')).toBe('launch');
    expect(generateChannelKey('Work 💼')).toBe('work');
  });

  it('should preserve numbers', () => {
    expect(generateChannelKey('Project 123')).toBe('project-123');
    expect(generateChannelKey('2024 Plans')).toBe('2024-plans');
  });

  it('should handle edge cases', () => {
    expect(generateChannelKey('')).toBe('');
    expect(generateChannelKey('   ')).toBe('');
    expect(generateChannelKey('---')).toBe('');
  });
});

describe('Channel validation', () => {
  // Simulate the validation logic
  function isValidChannel(channels: { key: string }[], newKey: string): boolean {
    if (!newKey) return false;
    if (channels.some(c => c.key === newKey)) return false;
    return true;
  }

  const existingChannels = [
    { key: 'main' },
    { key: 'work' },
    { key: 'personal' }
  ];

  it('should reject empty keys', () => {
    expect(isValidChannel(existingChannels, '')).toBe(false);
  });

  it('should reject duplicate keys', () => {
    expect(isValidChannel(existingChannels, 'main')).toBe(false);
    expect(isValidChannel(existingChannels, 'work')).toBe(false);
  });

  it('should accept unique keys', () => {
    expect(isValidChannel(existingChannels, 'projects')).toBe(true);
    expect(isValidChannel(existingChannels, 'ideas')).toBe(true);
  });
});

describe('Channel localStorage', () => {
  const DEFAULT_CHANNELS = [{ key: 'main', name: 'General', icon: '💬' }];

  // Simulate parsing logic
  function parseChannels(savedChannels: string | null): typeof DEFAULT_CHANNELS {
    if (!savedChannels) return DEFAULT_CHANNELS;
    try {
      const parsed = JSON.parse(savedChannels);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_CHANNELS;
  }

  it('should return default channels for null', () => {
    expect(parseChannels(null)).toEqual(DEFAULT_CHANNELS);
  });

  it('should return default channels for invalid JSON', () => {
    expect(parseChannels('not json')).toEqual(DEFAULT_CHANNELS);
    expect(parseChannels('{invalid')).toEqual(DEFAULT_CHANNELS);
  });

  it('should return default channels for empty array', () => {
    expect(parseChannels('[]')).toEqual(DEFAULT_CHANNELS);
  });

  it('should parse valid channels', () => {
    const saved = JSON.stringify([
      { key: 'main', name: 'General', icon: '💬' },
      { key: 'work', name: 'Work', icon: '📝' }
    ]);
    expect(parseChannels(saved)).toEqual([
      { key: 'main', name: 'General', icon: '💬' },
      { key: 'work', name: 'Work', icon: '📝' }
    ]);
  });
});
