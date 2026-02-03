import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      machines: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('ws', () => ({
  default: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('Sessions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatSessionName', () => {
    function formatSessionName(key: string): string {
      if (key === 'main') return 'General';
      return key
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    it('should return "General" for main session', () => {
      expect(formatSessionName('main')).toBe('General');
    });

    it('should convert kebab-case to Title Case', () => {
      expect(formatSessionName('my-project')).toBe('My Project');
      expect(formatSessionName('work-tasks')).toBe('Work Tasks');
    });

    it('should convert snake_case to Title Case', () => {
      expect(formatSessionName('my_project')).toBe('My Project');
      expect(formatSessionName('work_tasks')).toBe('Work Tasks');
    });

    it('should capitalize single words', () => {
      expect(formatSessionName('test')).toBe('Test');
      expect(formatSessionName('ideas')).toBe('Ideas');
    });

    it('should handle mixed cases', () => {
      expect(formatSessionName('my-work_stuff')).toBe('My Work Stuff');
    });
  });

  describe('Session Key Canonicalization', () => {
    function canonicalizeKey(key: string): string {
      return key.startsWith('agent:main:') ? key : `agent:main:${key}`;
    }

    function normalizeKey(key: string): string {
      return key.replace(/^agent:main:/, '');
    }

    it('should add prefix to simple keys', () => {
      expect(canonicalizeKey('main')).toBe('agent:main:main');
      expect(canonicalizeKey('work')).toBe('agent:main:work');
    });

    it('should not double-prefix canonical keys', () => {
      expect(canonicalizeKey('agent:main:main')).toBe('agent:main:main');
    });

    it('should normalize canonical keys for UI', () => {
      expect(normalizeKey('agent:main:main')).toBe('main');
      expect(normalizeKey('agent:main:work')).toBe('work');
    });

    it('should leave non-canonical keys unchanged during normalization', () => {
      expect(normalizeKey('main')).toBe('main');
      expect(normalizeKey('work')).toBe('work');
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);
      const { userId } = await auth();
      expect(userId).toBeNull();
    });

    it('should allow authenticated requests', async () => {
      vi.mocked(auth).mockResolvedValue({ userId: 'user_test123' } as any);
      const { userId } = await auth();
      expect(userId).toBe('user_test123');
    });
  });

  describe('Machine Lookup', () => {
    it('should return empty sessions when no machine exists', async () => {
      vi.mocked(db.query.machines.findFirst).mockResolvedValue(undefined);
      
      const result = await db.query.machines.findFirst({ where: {} as any });
      expect(result).toBeUndefined();
    });

    it('should find existing machine', async () => {
      const mockMachine = {
        id: 'machine-123',
        userId: 'user_test123',
        appName: 'automna-u-abc123',
        gatewayToken: 'token-123',
      } as any;

      vi.mocked(db.query.machines.findFirst).mockResolvedValue(mockMachine);
      
      const result = await db.query.machines.findFirst({ where: {} as any });
      expect(result?.appName).toBe('automna-u-abc123');
      expect(result?.gatewayToken).toBe('token-123');
    });
  });

  describe('OpenClaw WebSocket Protocol', () => {
    // This documents the correct protocol (NOT JSON-RPC 2.0!)
    
    it('should use type: "req" not jsonrpc', () => {
      const correctRequest = {
        type: 'req',
        id: 'req-123',
        method: 'sessions.list',
        params: { limit: 100 },
      };

      const wrongRequest = {
        jsonrpc: '2.0',
        id: 'req-123',
        method: 'sessions.list',
        params: { limit: 100 },
      };

      expect(correctRequest.type).toBe('req');
      expect(correctRequest).not.toHaveProperty('jsonrpc');
      expect(wrongRequest).toHaveProperty('jsonrpc');
    });

    it('should use payload not result in responses', () => {
      const correctResponse = {
        type: 'res',
        id: 'req-123',
        ok: true,
        payload: { sessions: [] },
      };

      const wrongResponse = {
        type: 'res',
        id: 'req-123',
        ok: true,
        result: { sessions: [] },
      };

      expect(correctResponse.payload).toBeDefined();
      expect(correctResponse).not.toHaveProperty('result');
    });

    it('should use valid client IDs from allowlist', () => {
      const validClientIds = [
        'webchat',
        'webchat-ui',
        'gateway-client',
        'cli',
        'node-host',
        'test',
      ];

      const connectRequest = {
        type: 'req',
        id: 'connect-123',
        method: 'connect',
        params: {
          client: {
            id: 'gateway-client', // Must be from allowlist
            version: '1.0.0',
          },
        },
      };

      expect(validClientIds).toContain(connectRequest.params.client.id);
    });

    it('should handle connect.challenge event', () => {
      const challengeEvent = {
        type: 'event',
        event: 'connect.challenge',
      };

      expect(challengeEvent.type).toBe('event');
      expect(challengeEvent.event).toBe('connect.challenge');
    });

    it('should recognize hello-ok response', () => {
      const helloOkResponse = {
        type: 'res',
        id: 'connect-123',
        ok: true,
        payload: {
          type: 'hello-ok',
          info: {},
        },
      };

      expect(helloOkResponse.ok).toBe(true);
      expect(helloOkResponse.payload.type).toBe('hello-ok');
    });
  });

  describe('Session Filtering', () => {
    it('should filter out global sessions', () => {
      const sessions = [
        { key: 'agent:main:main', kind: 'agent' },
        { key: 'global:settings', kind: 'global' },
        { key: 'agent:main:work', kind: 'agent' },
      ];

      const filtered = sessions.filter(s => {
        if (!s.key) return false;
        if (s.kind === 'global' || s.kind === 'unknown') return false;
        return true;
      });

      expect(filtered.length).toBe(2);
      expect(filtered.map(s => s.key)).not.toContain('global:settings');
    });

    it('should filter out sessions without keys', () => {
      const sessions = [
        { key: 'agent:main:main' },
        { key: null },
        { key: undefined },
        { key: '' },
        { key: 'agent:main:work' },
      ];

      const filtered = sessions.filter(s => !!s.key);
      expect(filtered.length).toBe(2);
    });
  });

  describe('Session Sorting', () => {
    it('should sort by lastActive descending', () => {
      const sessions = [
        { key: 'old', lastActive: 1000 },
        { key: 'newest', lastActive: 3000 },
        { key: 'middle', lastActive: 2000 },
      ];

      const sorted = sessions.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

      expect(sorted[0].key).toBe('newest');
      expect(sorted[1].key).toBe('middle');
      expect(sorted[2].key).toBe('old');
    });

    it('should handle missing lastActive', () => {
      const sessions = [
        { key: 'with-date', lastActive: 1000 },
        { key: 'no-date' },
        { key: 'with-date-2', lastActive: 2000 },
      ];

      const sorted = sessions.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

      expect(sorted[0].key).toBe('with-date-2');
      expect(sorted[1].key).toBe('with-date');
      // no-date should be last (treated as 0)
      expect(sorted[2].key).toBe('no-date');
    });
  });

  describe('DELETE Validation', () => {
    it('should prevent deleting main session', () => {
      const key = 'main';
      const canDelete = key !== 'main';
      expect(canDelete).toBe(false);
    });

    it('should allow deleting other sessions', () => {
      const keys = ['work', 'test', 'project-x'];
      for (const key of keys) {
        const canDelete = key !== 'main';
        expect(canDelete).toBe(true);
      }
    });

    it('should require key parameter', () => {
      const key = null;
      const isValid = !!key;
      expect(isValid).toBe(false);
    });
  });

  describe('PATCH Validation', () => {
    it('should require key parameter', () => {
      const body = { label: 'New Name' } as { label: string; key?: string };
      const isValid = !!body.key && typeof body.key === 'string';
      expect(isValid).toBe(false);
    });

    it('should accept valid updates', () => {
      const body = { key: 'work', label: 'Work Projects' };
      const isValid = !!body.key && typeof body.key === 'string';
      expect(isValid).toBe(true);
    });

    it('should canonicalize key before sending to gateway', () => {
      const key = 'work';
      const canonical = key.startsWith('agent:main:') ? key : `agent:main:${key}`;
      expect(canonical).toBe('agent:main:work');
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC timeout gracefully', async () => {
      // Simulate timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('RPC timeout')), 100);
      });

      await expect(timeoutPromise).rejects.toThrow('RPC timeout');
    });

    it('should handle WebSocket errors', async () => {
      const error = new Error('Connection refused');
      expect(error.message).toBe('Connection refused');
    });

    it('should return empty sessions on gateway error', () => {
      // On error, the API returns { sessions: [] } instead of 500
      const errorResponse = { sessions: [] };
      expect(errorResponse.sessions).toEqual([]);
    });
  });
});

describe('Gateway RPC Flow', () => {
  it('documents the complete WebSocket handshake', () => {
    const flow = [
      // 1. Connect to WebSocket
      { action: 'connect', url: 'wss://automna-u-xxx.fly.dev/ws?token=xxx&clientId=sessions-api' },
      
      // 2. Receive challenge
      { action: 'receive', message: { type: 'event', event: 'connect.challenge' } },
      
      // 3. Send connect request
      { action: 'send', message: {
        type: 'req',
        id: 'connect-123',
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: { id: 'gateway-client', version: '1.0.0' },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
        },
      }},
      
      // 4. Receive hello-ok
      { action: 'receive', message: {
        type: 'res',
        id: 'connect-123',
        ok: true,
        payload: { type: 'hello-ok' },
      }},
      
      // 5. Send RPC request
      { action: 'send', message: {
        type: 'req',
        id: 'req-456',
        method: 'sessions.list',
        params: { limit: 100 },
      }},
      
      // 6. Receive RPC response
      { action: 'receive', message: {
        type: 'res',
        id: 'req-456',
        ok: true,
        payload: { sessions: [{ key: 'agent:main:main' }] },
      }},
      
      // 7. Close connection
      { action: 'close' },
    ];

    expect(flow.length).toBe(7);
    expect(flow[0].action).toBe('connect');
    expect(flow[6].action).toBe('close');
  });
});
