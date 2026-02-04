'use client';

/**
 * FileBrowser - File tree and preview panel (Light Theme)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useFiles, getFileIcon, formatFileSize, formatDate, type FileItem } from '@/lib/file-context';

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
    writeFile,
    downloadFile,
    getImageUrl,
    deleteFile,
    uploadFile,
    createDirectory,
  } = useFiles();
  
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
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
      setImageUrl(null);
      return;
    }
    
    const ext = selectedFile.extension?.toLowerCase() || '';
    const textExtensions = ['md', 'txt', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'toml', 'ini', 'env', 'sh', 'bash'];
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    
    const loadTextContent = async () => {
      setIsLoadingContent(true);
      setImageUrl(null);
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
    
    const loadImageContent = async () => {
      setIsLoadingContent(true);
      setFileContent(null);
      try {
        const url = await getImageUrl(selectedFile.path);
        setImageUrl(url);
      } catch (err) {
        console.error('Failed to load image:', err);
        setImageUrl(null);
      } finally {
        setIsLoadingContent(false);
      }
    };
    
    if (textExtensions.includes(ext) || !ext) {
      loadTextContent();
    } else if (imageExtensions.includes(ext)) {
      loadImageContent();
    } else {
      setFileContent(null);
      setImageUrl(null);
    }
    
  }, [selectedFile, readFile, getImageUrl]);
  
  // Cleanup: revoke image URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);
  
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
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };
  
  const handleStartEdit = () => {
    if (fileContent !== null) {
      setEditContent(fileContent);
      setIsEditing(true);
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent('');
  };
  
  const handleSave = async () => {
    if (!selectedFile) return;
    
    setIsSaving(true);
    try {
      await writeFile(selectedFile.path, editContent);
      setFileContent(editContent);
      setIsEditing(false);
      refresh();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCreateFile = async () => {
    if (!newItemName.trim()) return;
    
    const filePath = `${currentPath}/${newItemName.trim()}`;
    try {
      await writeFile(filePath, '');
      setShowNewFileModal(false);
      setNewItemName('');
      refresh();
    } catch (err) {
      console.error('Create file failed:', err);
      alert('Failed to create file');
    }
  };
  
  const handleCreateFolder = async () => {
    if (!newItemName.trim()) return;
    
    const folderPath = `${currentPath}/${newItemName.trim()}`;
    try {
      await createDirectory(folderPath);
      setShowNewFolderModal(false);
      setNewItemName('');
      refresh();
    } catch (err) {
      console.error('Create folder failed:', err);
      alert('Failed to create folder');
    }
  };
  
  const WORKSPACE_ROOT = '/home/node/.openclaw';
  const pathSegments = currentPath.split('/').filter(Boolean);
  const workspaceSegmentCount = WORKSPACE_ROOT.split('/').filter(Boolean).length;
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2 text-sm">
          {/* Breadcrumbs */}
          <button 
            onClick={() => navigateTo(WORKSPACE_ROOT)}
            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            📁 workspace
          </button>
          {pathSegments.slice(workspaceSegmentCount).map((segment, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-zinc-300 dark:text-zinc-600">/</span>
              <button
                onClick={() => navigateTo('/' + pathSegments.slice(0, workspaceSegmentCount + i + 1).join('/'))}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
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
            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-lg transition-colors"
            title="New Folder"
          >
            <span>📁</span>
            <span>New Folder</span>
          </button>
          
          <button
            onClick={() => setShowNewFileModal(true)}
            className="flex items-center gap-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-lg transition-colors"
            title="New File"
          >
            <span>📄</span>
            <span>New File</span>
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
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
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File list */}
        <div className="w-1/2 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
          {/* Up button */}
          {currentPath !== '/home/node/.openclaw' && (
            <button
              onClick={navigateUp}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800"
            >
              <span>📂</span>
              <span>..</span>
            </button>
          )}
          
          {/* Files */}
          {files.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-zinc-400">
              Empty directory
            </div>
          )}
          
          {files.map((file) => (
            <div
              key={file.path}
              className={`flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer group ${
                selectedFile?.path === file.path ? 'bg-purple-50 dark:bg-purple-900/30 border-l-2 border-purple-500' : ''
              }`}
              onClick={() => handleFileClick(file)}
            >
              <span className="text-lg">{getFileIcon(file.name, file.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm text-zinc-800 dark:text-zinc-200">{file.name}</div>
                <div className="text-xs text-zinc-400">
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
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                    title="Download"
                  >
                    ⬇️
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                  className="p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Preview panel */}
        <div className="w-1/2 overflow-y-auto bg-zinc-50 dark:bg-zinc-950/50">
          {!selectedFile ? (
            <div className="h-full flex items-center justify-center text-zinc-400">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <div>Select a file to preview</div>
              </div>
            </div>
          ) : isLoadingContent ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
            </div>
          ) : (
            <FilePreview 
              file={selectedFile} 
              content={fileContent}
              imageUrl={imageUrl}
              isEditing={isEditing}
              editContent={editContent}
              isSaving={isSaving}
              onDownload={() => downloadFile(selectedFile.path)}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSave={handleSave}
              onEditChange={setEditContent}
            />
          )}
        </div>
      </div>
      
      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-96 border border-zinc-200 dark:border-zinc-700 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white">Create New File</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="filename.md"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500 focus:ring-1 focus:ring-purple-100 dark:focus:ring-purple-900"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowNewFileModal(false); setNewItemName(''); }}
                className="px-4 py-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-96 border border-zinc-200 dark:border-zinc-700 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white">Create New Folder</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="folder-name"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500 focus:ring-1 focus:ring-purple-100 dark:focus:ring-purple-900"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowNewFolderModal(false); setNewItemName(''); }}
                className="px-4 py-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// FILE PREVIEW
// ============================================

interface FilePreviewProps {
  file: FileItem;
  content: string | null;
  imageUrl: string | null;
  isEditing: boolean;
  editContent: string;
  isSaving: boolean;
  onDownload: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditChange: (content: string) => void;
}

function FilePreview({ 
  file, 
  content, 
  imageUrl,
  isEditing,
  editContent,
  isSaving,
  onDownload,
  onStartEdit,
  onCancelEdit,
  onSave,
  onEditChange,
}: FilePreviewProps) {
  const ext = file.extension?.toLowerCase() || '';
  
  const editableExtensions = ['md', 'txt', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'toml', 'ini', 'env', 'sh', 'bash'];
  const isEditable = editableExtensions.includes(ext) || !ext;
  
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  if (imageExtensions.includes(ext)) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <h3 className="font-medium text-sm text-zinc-900 dark:text-white">{file.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{formatFileSize(file.size)}</span>
            <button
              onClick={onDownload}
              className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded"
            >
              ⬇️ Download
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-zinc-100 dark:bg-zinc-950">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={file.name}
              className="max-w-full max-h-full object-contain rounded shadow-lg"
            />
          ) : (
            <div className="text-center text-zinc-400">
              <div className="text-6xl mb-4">🖼️</div>
              <div>Loading image...</div>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (content !== null) {
    const isMarkdown = ext === 'md';
    const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'yaml', 'yml', 'css', 'html', 'xml', 'sh', 'bash'].includes(ext);
    
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
          <h3 className="font-medium text-sm text-zinc-900">{file.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{formatFileSize(file.size)}</span>
            {isEditing ? (
              <>
                <button
                  onClick={onCancelEdit}
                  disabled={isSaving}
                  className="px-2 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : '💾 Save'}
                </button>
              </>
            ) : (
              <>
                {isEditable && (
                  <button
                    onClick={onStartEdit}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    ✏️ Edit
                  </button>
                )}
                <button
                  onClick={onDownload}
                  className="px-2 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded"
                >
                  ⬇️
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => onEditChange(e.target.value)}
              className="w-full h-full p-4 bg-zinc-900 text-zinc-100 font-mono text-sm resize-none focus:outline-none"
              spellCheck={false}
            />
          ) : isMarkdown ? (
            <div className="p-4 prose prose-sm max-w-none">
              <MarkdownPreview content={content} />
            </div>
          ) : (
            <pre className={`p-4 text-sm font-mono whitespace-pre-wrap break-words ${isCode ? 'bg-zinc-900 text-emerald-400' : 'text-zinc-700'}`}>
              {content}
            </pre>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-zinc-900">{file.name}</h3>
        <button
          onClick={onDownload}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
        >
          ⬇️ Download
        </button>
      </div>
      <div className="text-center text-zinc-400 py-8">
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
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  
  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} className="bg-zinc-900 p-3 rounded-lg overflow-x-auto my-2">
            <code className="text-sm text-emerald-400">{codeBlockContent.join('\n')}</code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }
    
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-lg font-semibold mt-4 mb-2 text-zinc-900">{line.slice(4)}</h3>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-semibold mt-4 mb-2 text-zinc-900">{line.slice(3)}</h2>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold mt-4 mb-2 text-zinc-900">{line.slice(2)}</h1>);
      return;
    }
    
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="ml-4 text-zinc-700">{line.slice(2)}</li>);
      return;
    }
    
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }
    
    let formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-zinc-200 px-1 rounded text-purple-700">$1</code>');
    
    elements.push(
      <p key={i} className="my-1 text-zinc-700" dangerouslySetInnerHTML={{ __html: formatted }} />
    );
  });
  
  return <>{elements}</>;
}
