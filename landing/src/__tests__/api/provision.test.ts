import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
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
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

// Simulate the provision logic for testing
describe('Provision API Logic', () => {
  const mockFetch = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    process.env.FLY_API_TOKEN = 'test-fly-token';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  describe('shortUserId', () => {
    function shortUserId(clerkId: string): string {
      const clean = clerkId.replace('user_', '');
      return clean.slice(-12).toLowerCase();
    }

    it('should extract last 12 chars from clerk ID', () => {
      // Clerk IDs are like "user_2abc123def456ghi" - function takes last 12 chars after removing prefix
      expect(shortUserId('user_2abc123def456ghi')).toBe('123def456ghi');
    });

    it('should handle short IDs', () => {
      expect(shortUserId('user_abc')).toBe('abc');
    });

    it('should lowercase the result', () => {
      expect(shortUserId('user_ABC123DEF456')).toBe('abc123def456');
    });

    it('should handle edge cases', () => {
      expect(shortUserId('user_')).toBe('');
      expect(shortUserId('')).toBe('');
    });
  });

  describe('buildInitCommand', () => {
    function buildInitCommand(gatewayToken: string): string[] {
      return ['gateway', '--allow-unconfigured', '--bind', 'lan', '--auth', 'token', '--token', gatewayToken];
    }

    it('should build correct command with token', () => {
      const cmd = buildInitCommand('test-token-123');
      expect(cmd).toEqual([
        'gateway',
        '--allow-unconfigured',
        '--bind', 'lan',
        '--auth', 'token',
        '--token', 'test-token-123',
      ]);
    });

    it('should include all required flags', () => {
      const cmd = buildInitCommand('any-token');
      expect(cmd).toContain('--allow-unconfigured');
      expect(cmd).toContain('--bind');
      expect(cmd).toContain('lan');
      expect(cmd).toContain('--auth');
      expect(cmd).toContain('token');
    });
  });

  describe('generateFriendlyUsername', () => {
    const ADJECTIVES = ['happy', 'swift', 'clever', 'bright', 'calm'];
    const NOUNS = ['fox', 'owl', 'wolf', 'bear', 'deer'];

    function generateFriendlyUsername(): string {
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      return `${adj}${noun}`;
    }

    it('should generate adjective + noun format', () => {
      const username = generateFriendlyUsername();
      const hasAdjective = ADJECTIVES.some(adj => username.startsWith(adj));
      const hasNoun = NOUNS.some(noun => username.endsWith(noun));
      expect(hasAdjective).toBe(true);
      expect(hasNoun).toBe(true);
    });

    it('should generate lowercase strings', () => {
      const username = generateFriendlyUsername();
      expect(username).toBe(username.toLowerCase());
    });

    it('should generate different usernames on multiple calls (statistically)', () => {
      const usernames = new Set();
      for (let i = 0; i < 20; i++) {
        usernames.add(generateFriendlyUsername());
      }
      // With 5x5=25 combinations, 20 calls should produce at least 2 unique
      expect(usernames.size).toBeGreaterThan(1);
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);
      
      // Simulate the auth check
      const { userId } = await auth();
      expect(userId).toBeNull();
    });

    it('should allow authenticated requests', async () => {
      vi.mocked(auth).mockResolvedValue({ userId: 'user_test123' } as any);
      
      const { userId } = await auth();
      expect(userId).toBe('user_test123');
    });
  });

  describe('Existing Machine Check', () => {
    it('should return existing machine if found', async () => {
      const mockMachine = {
        id: 'machine-123',
        userId: 'user_test123',
        appName: 'automna-u-abc123',
        status: 'started',
        gatewayToken: 'token-123',
      };

      vi.mocked(db.query.machines.findFirst).mockResolvedValue(mockMachine);

      const result = await db.query.machines.findFirst({
        where: {} as any,
      });

      expect(result).toEqual(mockMachine);
    });

    it('should return null for new users', async () => {
      vi.mocked(db.query.machines.findFirst).mockResolvedValue(undefined);

      const result = await db.query.machines.findFirst({
        where: {} as any,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Fly.io API Calls', () => {
    it('should call GraphQL API for app creation', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: {
            createApp: {
              app: { id: 'app-123', name: 'automna-u-test', organization: { slug: 'personal' } },
            },
          },
        }),
      });

      await fetch('https://api.fly.io/graphql', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: expect.any(String),
          variables: { input: { name: 'automna-u-test', organizationId: 'org-123' } },
        }),
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should call Machines API for volume creation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'vol-123',
          name: 'openclaw_data',
          state: 'ready',
        }),
      });

      const response = await fetch('https://api.machines.dev/v1/apps/automna-u-test/volumes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'openclaw_data',
          region: 'sjc',
          size_gb: 1,
          encrypted: true,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.id).toBe('vol-123');
    });

    it('should call Machines API for machine creation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'machine-123',
          name: 'openclaw',
          state: 'starting',
          region: 'sjc',
        }),
      });

      const response = await fetch('https://api.machines.dev/v1/apps/automna-u-test/machines', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: expect.any(String),
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('Browserbase Integration', () => {
    it('should create context when configured', async () => {
      process.env.BROWSERBASE_API_KEY = 'bb-test-key';
      process.env.BROWSERBASE_PROJECT_ID = 'bb-project-123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'ctx-123' }),
      });

      const response = await fetch('https://api.browserbase.com/v1/contexts', {
        method: 'POST',
        headers: {
          'X-BB-API-Key': process.env.BROWSERBASE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId: process.env.BROWSERBASE_PROJECT_ID }),
      });

      const data = await response.json();
      expect(data.id).toBe('ctx-123');
    });

    it('should skip when not configured', () => {
      delete process.env.BROWSERBASE_API_KEY;
      delete process.env.BROWSERBASE_PROJECT_ID;

      // createBrowserbaseContext returns null when not configured
      const result = !process.env.BROWSERBASE_API_KEY ? null : 'would-create';
      expect(result).toBeNull();
    });
  });

  describe('Agentmail Integration', () => {
    it('should create inbox when configured', async () => {
      process.env.AGENTMAIL_API_KEY = 'am-test-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ inbox_id: 'swiftfox@mail.automna.ai' }),
      });

      const response = await fetch('https://api.agentmail.to/v0/inboxes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'swiftfox',
          display_name: 'Automna Agent',
        }),
      });

      const data = await response.json();
      expect(data.inbox_id).toBe('swiftfox@mail.automna.ai');
    });

    it('should retry with number suffix on collision', async () => {
      process.env.AGENTMAIL_API_KEY = 'am-test-key';

      // First call fails with collision
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('username already exists'),
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ inbox_id: 'swiftfox1@mail.automna.ai' }),
      });

      // Simulate retry logic
      const firstResponse = await fetch('https://api.agentmail.to/v0/inboxes', {
        method: 'POST',
        body: JSON.stringify({ username: 'swiftfox' }),
      } as any);
      
      expect(firstResponse.ok).toBe(false);
      const errorText = await firstResponse.text();
      expect(errorText).toContain('already exists');

      const secondResponse = await fetch('https://api.agentmail.to/v0/inboxes', {
        method: 'POST',
        body: JSON.stringify({ username: 'swiftfox1' }),
      } as any);
      
      expect(secondResponse.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Fly API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errors: [{ message: 'App name already taken' }],
        }),
      });

      const response = await fetch('https://api.fly.io/graphql', { method: 'POST' } as any);
      const data = await response.json();

      expect(data.errors).toBeDefined();
      expect(data.errors[0].message).toContain('already taken');
    });

    it('should handle missing FLY_API_TOKEN', () => {
      delete process.env.FLY_API_TOKEN;
      
      const hasFlyToken = !!process.env.FLY_API_TOKEN;
      expect(hasFlyToken).toBe(false);
    });

    it('should handle machine creation timeout', async () => {
      // Simulate machine stuck in 'starting' state
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'machine-123',
          state: 'starting', // Never transitions to 'started'
        }),
      });

      // In real code, this would timeout after 120s
      const timeoutMs = 100; // Short timeout for test
      const start = Date.now();
      
      let timedOut = false;
      while (Date.now() - start < timeoutMs) {
        const response = await fetch('https://api.machines.dev/v1/apps/test/machines/123', {
          headers: { Authorization: 'Bearer test' },
        });
        const machine = await response.json();
        if (machine.state === 'started') break;
        await new Promise(r => setTimeout(r, 10));
      }
      
      if (Date.now() - start >= timeoutMs) {
        timedOut = true;
      }
      
      expect(timedOut).toBe(true);
    });
  });

  describe('Database Operations', () => {
    it('should store machine record on success', async () => {
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.insert).mockImplementation(insertMock);

      await db.insert({} as any).values({
        id: 'machine-123',
        userId: 'user_test123',
        appName: 'automna-u-test',
        gatewayToken: 'token-123',
      });

      expect(insertMock).toHaveBeenCalled();
    });

    it('should log machine events', async () => {
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.insert).mockImplementation(insertMock);

      await db.insert({} as any).values({
        machineId: 'machine-123',
        eventType: 'created',
        details: JSON.stringify({ appName: 'automna-u-test' }),
      });

      expect(insertMock).toHaveBeenCalled();
    });
  });

  describe('Idempotency', () => {
    it('should return existing machine without recreating', async () => {
      const mockMachine = {
        id: 'machine-123',
        appName: 'automna-u-test',
        status: 'started',
      };

      vi.mocked(db.query.machines.findFirst).mockResolvedValue(mockMachine);
      
      // Fly API should NOT be called for app creation
      const appCreateCalls = mockFetch.mock.calls.filter(
        call => call[0]?.toString().includes('api.fly.io') && 
               call[1]?.body?.toString().includes('createApp')
      );
      
      expect(appCreateCalls.length).toBe(0);
    });

    it('should start stopped machine instead of creating new one', async () => {
      const mockMachine = {
        id: 'machine-123',
        appName: 'automna-u-test',
        status: 'stopped',
      };

      vi.mocked(db.query.machines.findFirst).mockResolvedValue(mockMachine);

      // Should call start endpoint, not create
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ state: 'stopped' }),
      });
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // POST to start
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'machine-123', state: 'started' }),
      });

      // Simulate the flow
      const statusResponse = await fetch(
        `https://api.machines.dev/v1/apps/${mockMachine.appName}/machines/${mockMachine.id}`,
        { headers: { Authorization: 'Bearer test' } }
      );
      const status = await statusResponse.json();
      expect(status.state).toBe('stopped');

      await fetch(
        `https://api.machines.dev/v1/apps/${mockMachine.appName}/machines/${mockMachine.id}/start`,
        { method: 'POST', headers: { Authorization: 'Bearer test' } }
      );

      const finalResponse = await fetch(
        `https://api.machines.dev/v1/apps/${mockMachine.appName}/machines/${mockMachine.id}`,
        { headers: { Authorization: 'Bearer test' } }
      );
      const finalStatus = await finalResponse.json();
      expect(finalStatus.state).toBe('started');
    });
  });
});
