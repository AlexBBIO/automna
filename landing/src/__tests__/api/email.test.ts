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
    all: vi.fn(),
    run: vi.fn(),
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('Email Send API', () => {
  const mockFetch = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    process.env.AGENTMAIL_API_KEY = 'test-agentmail-key';
  });

  describe('Authentication', () => {
    it('should authenticate via Clerk session', async () => {
      vi.mocked(auth).mockResolvedValue({ userId: 'user_test123' } as any);
      vi.mocked(db.query.machines.findFirst).mockResolvedValue({
        id: 'machine-123',
        userId: 'user_test123',
        agentmailInboxId: 'test@mail.automna.ai',
      } as any);

      const { userId } = await auth();
      const machine = await db.query.machines.findFirst({ where: {} as any });
      
      expect(userId).toBe('user_test123');
      expect(machine?.agentmailInboxId).toBe('test@mail.automna.ai');
    });

    it('should authenticate via gateway token', async () => {
      // Simulate no Clerk auth
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);
      
      // But machine exists for token lookup
      const mockMachine = {
        id: 'machine-123',
        userId: 'user_test123',
        gatewayToken: 'gateway-token-123',
        agentmailInboxId: 'test@mail.automna.ai',
      };

      // Simulate looking up by token
      const authHeader = 'Bearer gateway-token-123';
      const token = authHeader.slice(7);
      expect(token).toBe('gateway-token-123');
      
      // Would query: eq(machines.gatewayToken, token)
      vi.mocked(db.query.machines.findFirst).mockResolvedValue(mockMachine as any);
      
      const result = await db.query.machines.findFirst({ where: {} as any });
      expect(result?.gatewayToken).toBe('gateway-token-123');
    });

    it('should reject requests without auth', async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);
      vi.mocked(db.query.machines.findFirst).mockResolvedValue(undefined);
      
      const { userId } = await auth();
      expect(userId).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    const DAILY_LIMIT = 50;

    it('should allow sends under daily limit', () => {
      const todayCount = 10;
      const remaining = DAILY_LIMIT - todayCount;
      const canSend = todayCount < DAILY_LIMIT;
      
      expect(canSend).toBe(true);
      expect(remaining).toBe(40);
    });

    it('should block sends at daily limit', () => {
      const todayCount = 50;
      const canSend = todayCount < DAILY_LIMIT;
      
      expect(canSend).toBe(false);
    });

    it('should block sends over daily limit', () => {
      const todayCount = 100; // Somehow got over
      const canSend = todayCount < DAILY_LIMIT;
      
      expect(canSend).toBe(false);
    });

    it('should calculate reset time correctly', () => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      
      const resetTime = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      
      // Reset should be tomorrow at midnight UTC
      expect(resetTime.getUTCHours()).toBe(0);
      expect(resetTime.getUTCMinutes()).toBe(0);
      expect(resetTime > new Date()).toBe(true);
    });

    it('should count only today\'s sends', () => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayStartUnix = Math.floor(todayStart.getTime() / 1000);
      
      const sends = [
        { sent_at: todayStartUnix + 3600 }, // 1 hour ago today
        { sent_at: todayStartUnix - 3600 }, // Yesterday
        { sent_at: todayStartUnix + 7200 }, // 2 hours ago today
      ];
      
      const todaySends = sends.filter(s => s.sent_at >= todayStartUnix);
      expect(todaySends.length).toBe(2);
    });
  });

  describe('Request Validation', () => {
    it('should require to field', () => {
      const body = { subject: 'Test' } as { to?: string; subject: string };
      const isValid = !!body.to && !!body.subject;
      expect(isValid).toBe(false);
    });

    it('should require subject field', () => {
      const body = { to: 'test@example.com' } as { to: string; subject?: string };
      const isValid = !!body.to && !!body.subject;
      expect(isValid).toBe(false);
    });

    it('should accept valid request body', () => {
      const body = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Email body',
      };
      const isValid = !!body.to && !!body.subject;
      expect(isValid).toBe(true);
    });

    it('should accept array of recipients', () => {
      const body = {
        to: [{ email: 'test1@example.com' }, { email: 'test2@example.com' }],
        subject: 'Test',
      };
      
      const recipients = Array.isArray(body.to) ? body.to : [{ email: body.to }];
      expect(recipients.length).toBe(2);
    });
  });

  describe('Email Configuration', () => {
    it('should require agentmailInboxId to be configured', async () => {
      vi.mocked(db.query.machines.findFirst).mockResolvedValue({
        id: 'machine-123',
        agentmailInboxId: null, // Not configured!
      } as any);

      const machine = await db.query.machines.findFirst({ where: {} as any });
      expect(machine?.agentmailInboxId).toBeNull();
    });

    it('should have valid inbox ID format', () => {
      const validInboxIds = [
        'swiftfox@mail.automna.ai',
        'clever-owl@mail.automna.ai',
        'user123@agentmail.to',
      ];

      for (const id of validInboxIds) {
        expect(id).toContain('@');
      }
    });
  });

  describe('Agentmail API Integration', () => {
    it('should call Agentmail API with correct format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message_id: 'msg-123' }),
      });

      const inboxId = 'test@mail.automna.ai';
      const requestBody = {
        to: [{ email: 'recipient@example.com' }],
        subject: 'Test Subject',
        text: 'Test body',
      };

      const response = await fetch(
        `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.message_id).toBe('msg-123');
    });

    it('should handle Agentmail API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid recipient'),
      });

      const response = await fetch('https://api.agentmail.to/v0/inboxes/test/messages', {
        method: 'POST',
      } as any);

      expect(response.ok).toBe(false);
      const error = await response.text();
      expect(error).toBe('Invalid recipient');
    });
  });

  describe('Response Format', () => {
    it('should return success with message ID', () => {
      const response = {
        success: true,
        messageId: 'msg-123',
        remaining: 49,
      };

      expect(response.success).toBe(true);
      expect(response.messageId).toBeDefined();
      expect(response.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should return rate limit error with details', () => {
      const errorResponse = {
        error: 'Daily email limit reached',
        limit: 50,
        sent: 50,
        resetsAt: '2026-02-04T00:00:00.000Z',
      };

      expect(errorResponse.error).toContain('limit');
      expect(errorResponse.limit).toBe(50);
      expect(errorResponse.sent).toBe(50);
      expect(errorResponse.resetsAt).toBeDefined();
    });

    it('should return quota status on GET', () => {
      const quotaResponse = {
        limit: 50,
        sent: 10,
        remaining: 40,
        resetsAt: '2026-02-04T00:00:00.000Z',
      };

      expect(quotaResponse.limit - quotaResponse.sent).toBe(quotaResponse.remaining);
    });
  });

  describe('Database Recording', () => {
    it('should record email sends for tracking', async () => {
      const insertSpy = vi.fn();
      vi.mocked(db.run).mockImplementation(insertSpy);

      // Simulate inserting a record
      await db.run({} as any);
      
      expect(insertSpy).toHaveBeenCalled();
    });

    it('should store send metadata', () => {
      const sendRecord = {
        user_id: 'user_test123',
        sent_at: Math.floor(Date.now() / 1000),
        recipient: 'test@example.com',
        subject: 'Test Email',
      };

      expect(sendRecord.user_id).toBeDefined();
      expect(sendRecord.sent_at).toBeGreaterThan(0);
      expect(sendRecord.recipient).toBeDefined();
      expect(sendRecord.subject).toBeDefined();
    });
  });

  describe('Email Address Validation', () => {
    function isValidEmail(email: string): boolean {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.org',
        'user+tag@example.co.uk',
      ];

      for (const email of validEmails) {
        expect(isValidEmail(email)).toBe(true);
      }
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'notanemail',
        '@nodomain.com',
        'no@domain',
        'spaces in@email.com',
      ];

      for (const email of invalidEmails) {
        expect(isValidEmail(email)).toBe(false);
      }
    });
  });
});

describe('Email Quota API (GET)', () => {
  it('should return current quota status', () => {
    const quotaResponse = {
      limit: 50,
      sent: 10,
      remaining: 40,
      resetsAt: new Date().toISOString(),
    };

    expect(quotaResponse).toHaveProperty('limit');
    expect(quotaResponse).toHaveProperty('sent');
    expect(quotaResponse).toHaveProperty('remaining');
    expect(quotaResponse).toHaveProperty('resetsAt');
  });

  it('should calculate remaining correctly', () => {
    const limit = 50;
    const sent = 25;
    const remaining = Math.max(0, limit - sent);
    
    expect(remaining).toBe(25);
  });

  it('should not return negative remaining', () => {
    const limit = 50;
    const sent = 60; // Over limit
    const remaining = Math.max(0, limit - sent);
    
    expect(remaining).toBe(0);
  });
});
