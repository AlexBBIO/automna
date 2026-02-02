/**
 * File Server for Automna
 * 
 * Lightweight HTTP server for file operations on the workspace volume.
 * Runs alongside OpenClaw gateway, handles uploads/downloads directly.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const PORT = process.env.FILE_SERVER_PORT || 8080;
const ALLOWED_BASE = '/home/node/.openclaw';
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800'); // 50MB default

// ============================================
// UTILITIES
// ============================================

function validatePath(p) {
  if (!p) return false;
  const resolved = path.resolve(p);
  return resolved.startsWith(ALLOWED_BASE) && !p.includes('..');
}

function authenticate(req) {
  // Check Authorization header
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7) === TOKEN;
  }
  // Check query param
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') === TOKEN;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
  };
  return types[ext] || 'application/octet-stream';
}

// ============================================
// HANDLERS
// ============================================

async function handleUpload(req, res, filePath) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    // Stream request body to file
    const writeStream = fs.createWriteStream(filePath);
    
    // Track size
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        writeStream.destroy();
        req.destroy();
      }
    });
    
    await pipeline(req, writeStream);
    
    const stats = await fs.promises.stat(filePath);
    console.log(`[file-server] Uploaded: ${filePath} (${stats.size} bytes)`);
    sendJson(res, 200, { success: true, path: filePath, size: stats.size });
  } catch (err) {
    console.error('[file-server] Upload error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleDownload(req, res, filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    
    if (stats.isDirectory()) {
      return sendJson(res, 400, { error: 'Cannot download directory' });
    }
    
    const filename = path.basename(filePath);
    const contentType = getContentType(filename);
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': stats.size,
    });
    
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return sendJson(res, 404, { error: 'File not found' });
    }
    console.error('[file-server] Download error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleList(req, res, dirPath) {
  try {
    const stats = await fs.promises.stat(dirPath);
    
    if (!stats.isDirectory()) {
      return sendJson(res, 400, { error: 'Not a directory' });
    }
    
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(e => !e.name.startsWith('.')) // Skip hidden files
        .map(async (e) => {
          const fullPath = path.join(dirPath, e.name);
          try {
            const stats = await fs.promises.stat(fullPath);
            return {
              name: e.name,
              path: fullPath,
              type: e.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime.toISOString(),
              extension: e.isDirectory() ? undefined : path.extname(e.name).slice(1),
            };
          } catch {
            return null;
          }
        })
    );
    
    // Sort: directories first, then alphabetically
    const sorted = files
      .filter(Boolean)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    
    sendJson(res, 200, { files: sorted });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return sendJson(res, 404, { error: 'Directory not found' });
    }
    console.error('[file-server] List error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleRead(req, res, filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    
    if (stats.isDirectory()) {
      return sendJson(res, 400, { error: 'Cannot read directory' });
    }
    
    if (stats.size > MAX_SIZE) {
      return sendJson(res, 413, { error: 'File too large' });
    }
    
    const content = await fs.promises.readFile(filePath, 'utf-8');
    sendJson(res, 200, { content, size: stats.size, encoding: 'utf-8' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return sendJson(res, 404, { error: 'File not found' });
    }
    console.error('[file-server] Read error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleWrite(req, res, filePath) {
  try {
    // Read JSON body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    
    const { content } = JSON.parse(body);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    await fs.promises.writeFile(filePath, content, 'utf-8');
    const stats = await fs.promises.stat(filePath);
    
    console.log(`[file-server] Wrote: ${filePath} (${stats.size} bytes)`);
    sendJson(res, 200, { success: true, path: filePath, size: stats.size });
  } catch (err) {
    console.error('[file-server] Write error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleMkdir(req, res, dirPath) {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`[file-server] Created directory: ${dirPath}`);
    sendJson(res, 200, { success: true, path: dirPath });
  } catch (err) {
    console.error('[file-server] Mkdir error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleDelete(req, res, filePath) {
  try {
    await fs.promises.rm(filePath, { recursive: true });
    console.log(`[file-server] Deleted: ${filePath}`);
    sendJson(res, 200, { success: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return sendJson(res, 404, { error: 'File not found' });
    }
    console.error('[file-server] Delete error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleMove(req, res) {
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    
    const { from, to } = JSON.parse(body);
    
    if (!validatePath(from) || !validatePath(to)) {
      return sendJson(res, 400, { error: 'Invalid path' });
    }
    
    // Ensure target directory exists
    const targetDir = path.dirname(to);
    await fs.promises.mkdir(targetDir, { recursive: true });
    
    await fs.promises.rename(from, to);
    console.log(`[file-server] Moved: ${from} -> ${to}`);
    sendJson(res, 200, { success: true });
  } catch (err) {
    console.error('[file-server] Move error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}

// ============================================
// SERVER
// ============================================

const server = http.createServer(async (req, res) => {
  // CORS headers for direct browser access (if needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  
  // Health check (no auth required)
  if (req.url === '/health') {
    return sendJson(res, 200, { status: 'ok', service: 'file-server' });
  }
  
  // Authenticate
  if (!authenticate(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  
  const url = new URL(req.url, 'http://localhost');
  const filePath = url.searchParams.get('path');
  
  // Route requests
  try {
    if (url.pathname === '/upload' && req.method === 'POST') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleUpload(req, res, filePath);
    }
    
    if (url.pathname === '/download' && req.method === 'GET') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleDownload(req, res, filePath);
    }
    
    if (url.pathname === '/list' && req.method === 'GET') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleList(req, res, filePath);
    }
    
    if (url.pathname === '/read' && req.method === 'GET') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleRead(req, res, filePath);
    }
    
    if (url.pathname === '/write' && req.method === 'POST') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleWrite(req, res, filePath);
    }
    
    if (url.pathname === '/mkdir' && req.method === 'POST') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleMkdir(req, res, filePath);
    }
    
    if (url.pathname === '/delete' && req.method === 'DELETE') {
      if (!filePath || !validatePath(filePath)) {
        return sendJson(res, 400, { error: 'Invalid path' });
      }
      return handleDelete(req, res, filePath);
    }
    
    if (url.pathname === '/move' && req.method === 'POST') {
      return handleMove(req, res);
    }
    
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[file-server] Unexpected error:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[file-server] Listening on port ${PORT}`);
  console.log(`[file-server] Allowed base path: ${ALLOWED_BASE}`);
  console.log(`[file-server] Max upload size: ${MAX_SIZE} bytes`);
});
