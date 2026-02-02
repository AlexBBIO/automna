'use client';

import { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Language icons/emojis for code blocks
const languageIcons: Record<string, string> = {
  javascript: '⚡',
  js: '⚡',
  typescript: '💠',
  ts: '💠',
  python: '🐍',
  py: '🐍',
  rust: '🦀',
  go: '🐹',
  java: '☕',
  cpp: '⚙️',
  c: '⚙️',
  bash: '💻',
  sh: '💻',
  shell: '💻',
  sql: '🗄️',
  html: '🌐',
  css: '🎨',
  json: '📋',
  yaml: '📋',
  yml: '📋',
  markdown: '📝',
  md: '📝',
};

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  
  const lineCount = code.trim().split('\n').length;
  const isLong = lineCount > 20;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const langLower = language?.toLowerCase() || '';
  const icon = languageIcons[langLower] || '📄';
  const displayLang = language || 'text';

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-700/50">
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-gray-300 font-medium">{displayLang}</span>
          {isLong && (
            <span className="text-gray-500">({lineCount} lines)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLong && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      {/* Code content */}
      <div className={`${!isExpanded && isLong ? 'max-h-[200px] overflow-hidden relative' : ''}`}>
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '16px',
            fontSize: '13px',
            borderRadius: 0,
            background: '#1a1a1a',
            lineHeight: '1.6',
          }}
          wrapLongLines
          showLineNumbers={lineCount > 5}
          lineNumberStyle={{ 
            color: '#4a5568', 
            paddingRight: '16px',
            minWidth: '2.5em',
          }}
        >
          {code.trim()}
        </SyntaxHighlighter>
        {!isExpanded && isLong && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#1a1a1a] to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  );
}

interface InlineCodeProps {
  code: string;
}

function InlineCode({ code }: InlineCodeProps) {
  return (
    <code className="px-1.5 py-0.5 bg-gray-700 rounded text-sm font-mono text-purple-300">
      {code}
    </code>
  );
}

interface MessageContentProps {
  text: string;
  isUser?: boolean;
}

// File attachment component for agent-shared files
function FileAttachment({ path }: { path: string }) {
  const filename = path.split('/').pop() || 'file';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
  
  const downloadUrl = `/api/files/download?path=${encodeURIComponent(path)}`;
  
  if (isImage) {
    return (
      <div className="my-2">
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img 
            src={downloadUrl} 
            alt={filename}
            className="max-w-full max-h-[400px] rounded-lg border border-gray-700 hover:border-purple-500 transition-colors"
            onError={(e) => {
              // If image fails to load, show fallback
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden flex items-center gap-2 p-3 bg-gray-800 rounded-lg mt-1">
            <span>🖼️</span>
            <span className="text-sm text-gray-300">{filename}</span>
            <span className="text-xs text-gray-500">(failed to load)</span>
          </div>
        </a>
      </div>
    );
  }
  
  // Non-image file - show download link
  const fileIcons: Record<string, string> = {
    pdf: '📕',
    doc: '📄', docx: '📄',
    xls: '📊', xlsx: '📊',
    csv: '📊',
    txt: '📝',
    md: '📝',
    json: '📋',
    zip: '📦', tar: '📦', gz: '📦',
  };
  const icon = fileIcons[ext] || '📎';
  
  return (
    <a 
      href={downloadUrl}
      download={filename}
      className="inline-flex items-center gap-2 px-3 py-2 my-1 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
    >
      <span>{icon}</span>
      <span className="text-sm text-gray-300">{filename}</span>
      <span className="text-xs text-purple-400">⬇️</span>
    </a>
  );
}

// Parse text into segments (text, code blocks, inline code, file refs)
type Segment = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string }
  | { type: 'file'; path: string };

function parseContent(text: string): Segment[] {
  const segments: Segment[] = [];
  
  // Regex for code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  // Regex for inline code: `code`
  const inlineCodeRegex = /`([^`\n]+)`/g;
  // Regex for file references: [[file:/path/to/file.ext]] or [[image:/path/to/file.ext]]
  const fileRefRegex = /\[\[(file|image):([^\]]+)\]\]/g;
  
  let lastIndex = 0;
  let match;
  
  // First pass: extract code blocks
  const withCodeBlocks: Segment[] = [];
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      withCodeBlocks.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Add code block
    withCodeBlocks.push({ type: 'code', language: match[1], content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    withCodeBlocks.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  // Second pass: extract file references from text segments
  const withFiles: Segment[] = [];
  for (const segment of withCodeBlocks) {
    if (segment.type !== 'text') {
      withFiles.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
    fileRefRegex.lastIndex = 0;
    while ((match = fileRefRegex.exec(textContent)) !== null) {
      // Add text before file ref
      if (match.index > textLastIndex) {
        withFiles.push({ type: 'text', content: textContent.slice(textLastIndex, match.index) });
      }
      // Add file reference
      withFiles.push({ type: 'file', path: match[2].trim() });
      textLastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (textLastIndex < textContent.length) {
      withFiles.push({ type: 'text', content: textContent.slice(textLastIndex) });
    }
  }
  
  // Third pass: extract inline code from remaining text segments
  for (const segment of withFiles) {
    if (segment.type !== 'text') {
      segments.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
    inlineCodeRegex.lastIndex = 0;
    while ((match = inlineCodeRegex.exec(textContent)) !== null) {
      // Add text before inline code
      if (match.index > textLastIndex) {
        segments.push({ type: 'text', content: textContent.slice(textLastIndex, match.index) });
      }
      // Add inline code
      segments.push({ type: 'inline-code', content: match[1] });
      textLastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (textLastIndex < textContent.length) {
      segments.push({ type: 'text', content: textContent.slice(textLastIndex) });
    }
  }
  
  return segments;
}

export function MessageContent({ text, isUser }: MessageContentProps) {
  const segments = useMemo(() => parseContent(text), [text]);
  
  // For user messages, don't parse code blocks (just show as-is)
  if (isUser) {
    return (
      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {text}
      </div>
    );
  }
  
  return (
    <div className="text-[15px] leading-relaxed">
      {segments.map((segment, i) => {
        if (segment.type === 'code') {
          return <CodeBlock key={i} language={segment.language} code={segment.content} />;
        }
        if (segment.type === 'inline-code') {
          return <InlineCode key={i} code={segment.content} />;
        }
        if (segment.type === 'file') {
          return <FileAttachment key={i} path={segment.path} />;
        }
        // Text segment - preserve whitespace and line breaks
        return (
          <span key={i} className="whitespace-pre-wrap break-words">
            {segment.content}
          </span>
        );
      })}
    </div>
  );
}
