'use client';

/**
 * File Context - Shared file API utilities for the dashboard
 * 
 * Provides:
 * - File listing, reading, writing
 * - Upload/download
 * - Delete (to trash)
 * - Directory creation
 * 
 * All operations use signed URL auth (same as chat).
 */

import { createContext, useContext, useCallback, useState, useRef, type ReactNode } from 'react';

// ============================================
// TYPES
// ============================================

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  extension?: string;
}

export interface FileContextType {
  // State
  currentPath: string;
  files: FileItem[];
  isLoading: boolean;
  error: string | null;
  
  // Navigation
  listDirectory: (path: string) => Promise<FileItem[]>;
  navigateTo: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;
  
  // File operations
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  uploadFile: (file: File, targetDir?: string) => Promise<string>;
  downloadFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  moveFile: (from: string, to: string) => Promise<void>;
}

// ============================================
// CONTEXT
// ============================================

const FileContext = createContext<FileContextType | null>(null);

const WORKSPACE_ROOT = '/root/clawd';

// ============================================
// PROVIDER
// ============================================

interface FileProviderProps {
  gatewayUrl: string;
  children: ReactNode;
}

export function FileProvider({ gatewayUrl, children }: FileProviderProps) {
  const [currentPath, setCurrentPath] = useState(WORKSPACE_ROOT);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Cache the last known files to enable smart refresh
  const lastFilesRef = useRef<Map<string, FileItem[]>>(new Map());
  
  // Build API URL from gateway WebSocket URL
  const buildUrl = useCallback((endpoint: string, params?: Record<string, string>) => {
    const wsUrl = new URL(gatewayUrl);
    const httpUrl = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    const baseUrl = `${httpUrl}//${wsUrl.host}`;
    
    const url = new URL(`${baseUrl}/api/files/${endpoint}`);
    
    // Copy auth params from gateway URL
    const userId = wsUrl.searchParams.get('userId');
    const exp = wsUrl.searchParams.get('exp');
    const sig = wsUrl.searchParams.get('sig');
    
    if (userId) url.searchParams.set('userId', userId);
    if (exp) url.searchParams.set('exp', exp);
    if (sig) url.searchParams.set('sig', sig);
    
    // Add custom params
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    
    return url.toString();
  }, [gatewayUrl]);
  
  // ============================================
  // NAVIGATION
  // ============================================
  
  const listDirectory = useCallback(async (path: string): Promise<FileItem[]> => {
    const url = buildUrl('list', { path });
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to list directory');
    }
    
    return data.files || [];
  }, [buildUrl]);
  
  const navigateTo = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newFiles = await listDirectory(path);
      setCurrentPath(path);
      setFiles(newFiles);
      lastFilesRef.current.set(path, newFiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to navigate';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [listDirectory]);
  
  const navigateUp = useCallback(async () => {
    if (currentPath === WORKSPACE_ROOT) return;
    
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || WORKSPACE_ROOT;
    await navigateTo(parentPath);
  }, [currentPath, navigateTo]);
  
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newFiles = await listDirectory(currentPath);
      
      // Only update if files actually changed (prevents flicker)
      const oldFiles = lastFilesRef.current.get(currentPath);
      const hasChanged = !oldFiles || 
        oldFiles.length !== newFiles.length ||
        newFiles.some((f, i) => 
          oldFiles[i]?.path !== f.path || 
          oldFiles[i]?.modified !== f.modified
        );
      
      if (hasChanged) {
        setFiles(newFiles);
        lastFilesRef.current.set(currentPath, newFiles);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [currentPath, listDirectory]);
  
  // ============================================
  // FILE OPERATIONS
  // ============================================
  
  const readFile = useCallback(async (path: string): Promise<string> => {
    const url = buildUrl('read', { path });
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to read file');
    }
    
    return data.content || '';
  }, [buildUrl]);
  
  const writeFile = useCallback(async (path: string, content: string) => {
    const url = buildUrl('write');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to write file');
    }
  }, [buildUrl]);
  
  const uploadFile = useCallback(async (file: File, targetDir?: string): Promise<string> => {
    const dir = targetDir || `${currentPath}/uploads`;
    const targetPath = `${dir}/${file.name}`;
    
    const url = buildUrl('upload');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', targetPath);
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    // Refresh to show new file
    await refresh();
    
    return targetPath;
  }, [buildUrl, currentPath, refresh]);
  
  const downloadFile = useCallback(async (path: string) => {
    const url = buildUrl('download', { path });
    const response = await fetch(url);
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Download failed');
    }
    
    const blob = await response.blob();
    const filename = path.split('/').pop() || 'download';
    
    // Trigger browser download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [buildUrl]);
  
  const deleteFile = useCallback(async (path: string) => {
    const url = buildUrl('', { path }); // DELETE /api/files?path=...
    const response = await fetch(url, { method: 'DELETE' });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Delete failed');
    }
    
    // Refresh to remove deleted file
    await refresh();
  }, [buildUrl, refresh]);
  
  const createDirectory = useCallback(async (path: string) => {
    const url = buildUrl('mkdir');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create directory');
    }
    
    // Refresh to show new directory
    await refresh();
  }, [buildUrl, refresh]);
  
  const moveFile = useCallback(async (from: string, to: string) => {
    const url = buildUrl('move');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Move failed');
    }
    
    // Refresh to show changes
    await refresh();
  }, [buildUrl, refresh]);
  
  // ============================================
  // RENDER
  // ============================================
  
  return (
    <FileContext.Provider value={{
      currentPath,
      files,
      isLoading,
      error,
      listDirectory,
      navigateTo,
      navigateUp,
      refresh,
      readFile,
      writeFile,
      uploadFile,
      downloadFile,
      deleteFile,
      createDirectory,
      moveFile,
    }}>
      {children}
    </FileContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useFiles() {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFiles must be used within a FileProvider');
  }
  return context;
}

// ============================================
// UTILITIES
// ============================================

/** Get file icon based on extension */
export function getFileIcon(filename: string, type: 'file' | 'directory'): string {
  if (type === 'directory') return '📁';
  
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  const icons: Record<string, string> = {
    // Documents
    md: '📝',
    txt: '📄',
    pdf: '📕',
    doc: '📘',
    docx: '📘',
    
    // Code
    js: '⚡',
    ts: '💠',
    jsx: '⚛️',
    tsx: '⚛️',
    py: '🐍',
    rs: '🦀',
    go: '🐹',
    
    // Data
    json: '📋',
    yaml: '📋',
    yml: '📋',
    csv: '📊',
    xml: '📋',
    
    // Images
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    svg: '🎨',
    webp: '🖼️',
    
    // Archives
    zip: '📦',
    tar: '📦',
    gz: '📦',
    
    // Config
    env: '⚙️',
    toml: '⚙️',
    ini: '⚙️',
  };
  
  return icons[ext] || '📄';
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/** Format date for display */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than 24 hours - show time
  if (diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Less than 7 days - show day
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  
  // Otherwise show date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
