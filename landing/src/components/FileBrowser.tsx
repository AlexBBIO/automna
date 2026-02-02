'use client';

/**
 * FileBrowser - File tree and preview panel
 * 
 * Features:
 * - Directory tree with expand/collapse
 * - File preview (markdown, code, images)
 * - Upload button
 * - Live polling for updates
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFiles, getFileIcon, formatFileSize, formatDate, type FileItem } from '@/lib/file-context';

// ============================================
// MAIN COMPONENT
// ============================================

interface FileBrowserProps {
  isVisible?: boolean;
}

export function FileBrowser({ isVisible = true }: FileBrowserProps) {
  const { 
    currentPath, 
    files, 
    isLoading, 
    error,
    navigateTo, 
    navigateUp,
    refresh,
    readFile,
    downloadFile,
    deleteFile,
    uploadFile,
  } = useFiles();
  
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initial load
  useEffect(() => {
    if (isVisible && files.length === 0) {
      navigateTo(currentPath);
    }
  }, [isVisible, files.length, navigateTo, currentPath]);
  
  // Poll for changes when visible (every 5 seconds)
  useEffect(() => {
    if (!isVisible) return;
    
    const interval = setInterval(() => {
      refresh();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isVisible, refresh]);
  
  // Load file content when selected
  useEffect(() => {
    if (!selectedFile || selectedFile.type === 'directory') {
      setFileContent(null);
      return;
    }
    
    const loadContent = async () => {
      setIsLoadingContent(true);
      try {
        const content = await readFile(selectedFile.path);
        setFileContent(content);
      } catch (err) {
        console.error('Failed to load file:', err);
        setFileContent(null);
      } finally {
        setIsLoadingContent(false);
      }
    };
    
    // Only load text files (not images/binaries)
    const textExtensions = ['md', 'txt', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'toml', 'ini', 'env', 'sh', 'bash'];
    const ext = selectedFile.extension?.toLowerCase() || '';
    
    if (textExtensions.includes(ext) || !ext) {
      loadContent();
    } else {
      setFileContent(null);
    }
  }, [selectedFile, readFile]);
  
  const handleFileClick = (file: FileItem) => {
    if (file.type === 'directory') {
      navigateTo(file.path);
      setSelectedFile(null);
    } else {
      setSelectedFile(file);
    }
  };
  
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      await uploadFile(file, currentPath);
    } catch (err) {
      console.error('Upload failed:', err);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleDelete = async (file: FileItem) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    
    try {
      await deleteFile(file.path);
      if (selectedFile?.path === file.path) {
        setSelectedFile(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };
  
  // Breadcrumb path segments
  // OpenClaw workspace is at /home/node/.openclaw
  const WORKSPACE_ROOT = '/home/node/.openclaw';
  const pathSegments = currentPath.split('/').filter(Boolean);
  const workspaceSegmentCount = WORKSPACE_ROOT.split('/').filter(Boolean).length;
  
  return (
    <div className="h-full flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2 text-sm">
          {/* Breadcrumbs */}
          <button 
            onClick={() => navigateTo(WORKSPACE_ROOT)}
            className="text-gray-400 hover:text-white"
          >
            📁 workspace
          </button>
          {pathSegments.slice(workspaceSegmentCount).map((segment, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-gray-600">/</span>
              <button
                onClick={() => navigateTo('/' + pathSegments.slice(0, workspaceSegmentCount + i + 1).join('/'))}
                className="text-gray-400 hover:text-white"
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
          >
            <span>⬆️</span>
            <span>Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-900/50 border-b border-red-800 text-red-200 text-sm">
          {error}
        </div>
      )}
      
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File list */}
        <div className="w-1/2 border-r border-gray-800 overflow-y-auto">
          {/* Up button */}
          {currentPath !== '/home/node/.openclaw' && (
            <button
              onClick={navigateUp}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800/50 text-gray-400 border-b border-gray-800/50"
            >
              <span>📂</span>
              <span>..</span>
            </button>
          )}
          
          {/* Files */}
          {files.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-gray-500">
              Empty directory
            </div>
          )}
          
          {files.map((file) => (
            <div
              key={file.path}
              className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-800/50 cursor-pointer group ${
                selectedFile?.path === file.path ? 'bg-purple-900/30' : ''
              }`}
              onClick={() => handleFileClick(file)}
            >
              <span className="text-lg">{getFileIcon(file.name, file.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{file.name}</div>
                <div className="text-xs text-gray-500">
                  {file.type === 'directory' ? 'Folder' : formatFileSize(file.size)}
                  {' · '}
                  {formatDate(file.modified)}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.type === 'file' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadFile(file.path); }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                    title="Download"
                  >
                    ⬇️
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                  className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Preview panel */}
        <div className="w-1/2 overflow-y-auto bg-gray-900/30">
          {!selectedFile ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <div>Select a file to preview</div>
              </div>
            </div>
          ) : isLoadingContent ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-gray-400">Loading...</div>
            </div>
          ) : (
            <FilePreview file={selectedFile} content={fileContent} onDownload={() => downloadFile(selectedFile.path)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// FILE PREVIEW
// ============================================

interface FilePreviewProps {
  file: FileItem;
  content: string | null;
  onDownload: () => void;
}

function FilePreview({ file, content, onDownload }: FilePreviewProps) {
  const ext = file.extension?.toLowerCase() || '';
  
  // Image preview
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  if (imageExtensions.includes(ext)) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">{file.name}</h3>
          <button
            onClick={onDownload}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-sm rounded-lg"
          >
            ⬇️ Download
          </button>
        </div>
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">🖼️</div>
          <div>Image preview not yet implemented</div>
          <div className="text-sm mt-2">Click download to view</div>
        </div>
      </div>
    );
  }
  
  // Text/code preview
  if (content !== null) {
    const isMarkdown = ext === 'md';
    const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'yaml', 'yml', 'css', 'html', 'xml', 'sh', 'bash'].includes(ext);
    
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
          <h3 className="font-medium text-sm">{file.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
            <button
              onClick={onDownload}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
            >
              ⬇️
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {isMarkdown ? (
            <div className="p-4 prose prose-invert prose-sm max-w-none">
              <MarkdownPreview content={content} />
            </div>
          ) : (
            <pre className={`p-4 text-sm font-mono whitespace-pre-wrap break-words ${isCode ? 'text-green-300' : 'text-gray-300'}`}>
              {content}
            </pre>
          )}
        </div>
      </div>
    );
  }
  
  // Binary/unknown file
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">{file.name}</h3>
        <button
          onClick={onDownload}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-sm rounded-lg"
        >
          ⬇️ Download
        </button>
      </div>
      <div className="text-center text-gray-500 py-8">
        <div className="text-6xl mb-4">{getFileIcon(file.name, 'file')}</div>
        <div>{file.extension?.toUpperCase() || 'Unknown'} file</div>
        <div className="text-sm mt-1">{formatFileSize(file.size)}</div>
      </div>
    </div>
  );
}

// ============================================
// MARKDOWN PREVIEW (Simple)
// ============================================

function MarkdownPreview({ content }: { content: string }) {
  // Very basic markdown rendering - just handle common patterns
  // For production, use react-markdown or similar
  
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';
  
  lines.forEach((line, i) => {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} className="bg-gray-800 p-3 rounded-lg overflow-x-auto my-2">
            <code className="text-sm text-green-300">{codeBlockContent.join('\n')}</code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        codeBlockLang = line.slice(3);
        inCodeBlock = true;
      }
      return;
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }
    
    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(4)}</h3>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-semibold mt-4 mb-2">{line.slice(3)}</h2>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>);
      return;
    }
    
    // Lists
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="ml-4">{line.slice(2)}</li>);
      return;
    }
    
    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }
    
    // Regular paragraphs with basic formatting
    let formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1 rounded text-purple-300">$1</code>');
    
    elements.push(
      <p key={i} className="my-1" dangerouslySetInnerHTML={{ __html: formatted }} />
    );
  });
  
  return <>{elements}</>;
}
