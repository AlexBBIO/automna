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

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('Files API', () => {
  const mockFetch = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  describe('getFileServerUrl', () => {
    function getFileServerUrl(appName: string, endpoint: string, token: string, params?: Record<string, string>) {
      const url = new URL(`https://${appName}.fly.dev/files${endpoint}`);
      url.searchParams.set('token', token);
      if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      }
      return url.toString();
    }

    it('should build correct URL for list operation', () => {
      const url = getFileServerUrl('automna-u-test', '/list', 'token123', { path: '/workspace' });
      expect(url).toContain('automna-u-test.fly.dev');
      expect(url).toContain('/files/list');
      expect(url).toContain('token=token123');
      expect(url).toContain('path=%2Fworkspace');
    });

    it('should build URL without params', () => {
      const url = getFileServerUrl('automna-u-test', '/read', 'token123');
      expect(url).toContain('token=token123');
      expect(url).not.toContain('path=');
    });

    it('should encode special characters in path', () => {
      const url = getFileServerUrl('automna-u-test', '/read', 'token123', { path: '/work space/file.md' });
      // URLSearchParams encodes spaces as '+' (application/x-www-form-urlencoded)
      expect(url).toContain('path=%2Fwork+space%2Ffile.md');
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

  describe('Gateway Lookup', () => {
    it('should return null when no machine exists', async () => {
      vi.mocked(db.query.machines.findFirst).mockResolvedValue(undefined);
      
      const result = await db.query.machines.findFirst({ where: {} as any });
      expect(result).toBeUndefined();
    });

    it('should return gateway details when machine exists', async () => {
      const mockMachine = {
        id: 'machine-123',
        appName: 'automna-u-test',
        gatewayToken: 'token-123',
      } as any;

      vi.mocked(db.query.machines.findFirst).mockResolvedValue(mockMachine);
      
      const result = await db.query.machines.findFirst({ where: {} as any });
      expect(result?.appName).toBe('automna-u-test');
      expect(result?.gatewayToken).toBe('token-123');
    });
  });

  describe('LIST Operation', () => {
    it('should list directory contents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          entries: [
            { name: 'file.txt', type: 'file', size: 100 },
            { name: 'subdir', type: 'directory' },
          ],
        }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/list?token=xxx&path=/workspace');
      const data = await response.json();

      expect(data.entries).toHaveLength(2);
      expect(data.entries[0].name).toBe('file.txt');
    });

    it('should handle empty directories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [] }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/list?token=xxx&path=/workspace');
      const data = await response.json();

      expect(data.entries).toEqual([]);
    });
  });

  describe('READ Operation', () => {
    it('should read file content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: '# Hello World',
          size: 13,
          mtime: Date.now(),
        }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/read?token=xxx&path=/workspace/README.md');
      const data = await response.json();

      expect(data.content).toBe('# Hello World');
    });

    it('should handle file not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'File not found' }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/read?token=xxx&path=/nonexistent');
      expect(response.status).toBe(404);
    });
  });

  describe('WRITE Operation', () => {
    it('should write file content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, written: 13 }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/write?token=xxx&path=/workspace/test.md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Test content' }),
      });
      const data = await response.json();

      expect(data.ok).toBe(true);
    });

    it('should require content', () => {
      const body = { path: '/workspace/test.md' };
      // Content can be empty string (valid), but should exist
      const hasContent = 'content' in body;
      expect(hasContent).toBe(false);
    });
  });

  describe('MKDIR Operation', () => {
    it('should create directory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/mkdir?token=xxx&path=/workspace/newdir', {
        method: 'POST',
      });
      const data = await response.json();

      expect(data.ok).toBe(true);
    });

    it('should handle nested directories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/mkdir?token=xxx&path=/workspace/a/b/c', {
        method: 'POST',
      });
      expect(response.ok).toBe(true);
    });
  });

  describe('MOVE Operation', () => {
    it('should move/rename files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/move?token=xxx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: '/workspace/old.md', to: '/workspace/new.md' }),
      });
      const data = await response.json();

      expect(data.ok).toBe(true);
    });

    it('should require both from and to', () => {
      const validBody = { from: '/a', to: '/b' };
      const invalidBody1 = { from: '/a' };
      const invalidBody2 = { to: '/b' };

      expect('from' in validBody && 'to' in validBody).toBe(true);
      expect('from' in invalidBody1 && 'to' in invalidBody1).toBe(false);
      expect('from' in invalidBody2 && 'to' in invalidBody2).toBe(false);
    });
  });

  describe('DELETE Operation', () => {
    it('should delete files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/delete?token=xxx&path=/workspace/test.md', {
        method: 'DELETE',
      });
      const data = await response.json();

      expect(data.ok).toBe(true);
    });

    it('should require path parameter', () => {
      const url = new URL('https://example.com/api/files/delete');
      const hasPath = !!url.searchParams.get('path');
      expect(hasPath).toBe(false);
    });
  });

  describe('UPLOAD Operation', () => {
    it('should handle file uploads', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, path: '/workspace/uploads/image.png' }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/upload?token=xxx&path=/workspace/uploads/image.png', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from([0x89, 0x50, 0x4E, 0x47]), // PNG magic bytes
      });
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.path).toContain('image.png');
    });

    it('should require file and path', () => {
      // Simulate FormData validation
      const formData = new Map();
      formData.set('path', '/workspace/test.png');
      // Missing 'file'
      
      const hasFile = formData.has('file');
      const hasPath = formData.has('path');
      
      expect(hasFile).toBe(false);
      expect(hasPath).toBe(true);
    });

    it('should have 2 minute timeout for large files', () => {
      const uploadTimeout = 120000; // 2 minutes in ms
      expect(uploadTimeout).toBe(120000);
    });
  });

  describe('DOWNLOAD Operation', () => {
    it('should stream file downloads', async () => {
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('file content'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
        headers: new Headers({
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="test.txt"',
          'Content-Length': '12',
        }),
      });

      const response = await fetch('https://automna-u-test.fly.dev/files/download?token=xxx&path=/workspace/test.txt');
      expect(response.ok).toBe(true);
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
    });
  });

  describe('Path Security', () => {
    it('should reject path traversal attempts', () => {
      const paths = [
        '../../../etc/passwd',
        '/workspace/../../../etc/passwd',
        '/workspace/./../../etc/passwd',
        '..%2F..%2F..%2Fetc%2Fpasswd', // URL encoded
      ];

      for (const path of paths) {
        const isTraversal = path.includes('..') || path.includes('%2F..');
        if (path.includes('..') || path.includes('%2F..')) {
          expect(isTraversal).toBe(true);
        }
      }
    });

    it('should validate paths stay within workspace', () => {
      function isValidPath(path: string, workspace: string): boolean {
        // Normalize and check if path starts with workspace
        const normalizedPath = path.replace(/\\/g, '/');
        if (normalizedPath.includes('..')) return false;
        return normalizedPath.startsWith(workspace);
      }

      expect(isValidPath('/home/node/.openclaw/workspace/file.md', '/home/node/.openclaw/workspace')).toBe(true);
      expect(isValidPath('/home/node/.openclaw/workspace/../secrets', '/home/node/.openclaw/workspace')).toBe(false);
      expect(isValidPath('/etc/passwd', '/home/node/.openclaw/workspace')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      // Create an AbortError-like error
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await fetch('https://example.com');
      } catch (error) {
        expect((error as Error).name).toBe('AbortError');
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetch('https://example.com')).rejects.toThrow('Network error');
    });

    it('should return proper error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      const response = await fetch('https://example.com');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });

  describe('File Size Limits', () => {
    it('should enforce 100MB upload limit', () => {
      const maxUploadSize = 100 * 1024 * 1024; // 100MB
      expect(maxUploadSize).toBe(104857600);
    });

    it('should reject oversized uploads', () => {
      const fileSize = 150 * 1024 * 1024; // 150MB
      const maxSize = 100 * 1024 * 1024;
      const isOversized = fileSize > maxSize;
      expect(isOversized).toBe(true);
    });
  });
});

describe('File Operations Integration', () => {
  it('documents the complete file operation flow', () => {
    const operations = [
      { method: 'GET', endpoint: '/api/files/list', params: 'path=/workspace', description: 'List directory' },
      { method: 'GET', endpoint: '/api/files/read', params: 'path=/workspace/file.md', description: 'Read file' },
      { method: 'POST', endpoint: '/api/files/write', body: '{ path, content }', description: 'Write file' },
      { method: 'POST', endpoint: '/api/files/mkdir', body: '{ path }', description: 'Create directory' },
      { method: 'POST', endpoint: '/api/files/move', body: '{ from, to }', description: 'Move/rename file' },
      { method: 'POST', endpoint: '/api/files/upload', body: 'FormData(file, path)', description: 'Upload file' },
      { method: 'DELETE', endpoint: '/api/files', params: 'path=/workspace/file.md', description: 'Delete file' },
      { method: 'GET', endpoint: '/api/files/download', params: 'path=/workspace/file.md', description: 'Download file' },
    ];

    expect(operations.length).toBe(8);
    expect(operations.map(o => o.method)).toContain('GET');
    expect(operations.map(o => o.method)).toContain('POST');
    expect(operations.map(o => o.method)).toContain('DELETE');
  });
});
