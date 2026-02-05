'use client';

import { useState } from 'react';
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
    <div className="relative group my-3 rounded-xl overflow-hidden border border-zinc-300 shadow-sm">
      {/* Header with language and copy button - dark for contrast */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-zinc-200 font-medium">{displayLang}</span>
          {isLong && (
            <span className="text-zinc-400">({lineCount} lines)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLong && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-400">Copied!</span>
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
      {/* Code content - keep dark for readability */}
      <div className={`${!isExpanded && isLong ? 'max-h-[200px] overflow-hidden relative' : ''}`}>
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '16px',
            fontSize: '13px',
            borderRadius: 0,
            background: '#1e1e2e',
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
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#1e1e2e] to-transparent pointer-events-none" />
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
    <code className="px-1.5 py-0.5 bg-zinc-200 rounded text-sm font-mono text-purple-700">
      {code}
    </code>
  );
}

interface MessageContentProps {
  text: string;
  isUser?: boolean;
  showToolOutput?: boolean;
  isStreaming?: boolean;
}

// File attachment component for user and agent-shared files
function FileAttachment({ path, isUser }: { path: string; isUser?: boolean }) {
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
            className={`max-w-full max-h-[400px] rounded-lg transition-colors shadow-sm ${
              isUser 
                ? 'border border-purple-400/50 hover:border-purple-300' 
                : 'border border-zinc-300 hover:border-purple-500'
            }`}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className={`hidden flex items-center gap-2 p-3 rounded-lg mt-1 ${
            isUser ? 'bg-purple-500/20' : 'bg-zinc-100'
          }`}>
            <span>🖼️</span>
            <span className={`text-sm ${isUser ? 'text-purple-100' : 'text-zinc-700'}`}>{filename}</span>
            <span className={`text-xs ${isUser ? 'text-purple-200' : 'text-zinc-500'}`}>(failed to load)</span>
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
      className={`inline-flex items-center gap-2 px-3 py-2 my-1 rounded-lg transition-colors ${
        isUser 
          ? 'bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30' 
          : 'bg-zinc-100 hover:bg-zinc-200 border border-zinc-200'
      }`}
    >
      <span>{icon}</span>
      <span className={`text-sm ${isUser ? 'text-purple-100' : 'text-zinc-700'}`}>{filename}</span>
      <span className={`text-xs ${isUser ? 'text-purple-200' : 'text-purple-600'}`}>⬇️</span>
    </a>
  );
}

// Parse text into segments (text, code blocks, inline code, file refs, markdown)
type Segment = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string }
  | { type: 'file'; path: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'link'; text: string; url: string };

interface ParseOptions {
  skipMedia?: boolean;
}

function parseContent(text: string, options: ParseOptions = {}): Segment[] {
  const segments: Segment[] = [];
  const { skipMedia = false } = options;
  
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const inlineCodeRegex = /`([^`\n]+)`/g;
  // Support both [[file:/path]] and MEDIA:/path formats (OpenClaw uses MEDIA:)
  const fileRefRegex = /\[\[(file|image):([^\]]+)\]\]|(?:^|\s)MEDIA:\s*`?([^\n`]+)`?/gim;
  
  let lastIndex = 0;
  let match;
  
  // First pass: extract code blocks
  const withCodeBlocks: Segment[] = [];
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      withCodeBlocks.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    withCodeBlocks.push({ type: 'code', language: match[1], content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    withCodeBlocks.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  // Second pass: extract file references from text segments (skip if streaming to avoid partial MEDIA paths)
  const withFiles: Segment[] = [];
  for (const segment of withCodeBlocks) {
    if (segment.type !== 'text') {
      withFiles.push(segment);
      continue;
    }
    
    // Skip MEDIA parsing while streaming - content may be incomplete
    if (skipMedia) {
      withFiles.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
    fileRefRegex.lastIndex = 0;
    while ((match = fileRefRegex.exec(textContent)) !== null) {
      // Handle [[file:/path]] or [[image:/path]] format
      if (match[1] && match[2]) {
        if (match.index > textLastIndex) {
          withFiles.push({ type: 'text', content: textContent.slice(textLastIndex, match.index) });
        }
        withFiles.push({ type: 'file', path: match[2].trim() });
        textLastIndex = match.index + match[0].length;
      }
      // Handle MEDIA:/path format (OpenClaw native)
      else if (match[3]) {
        // Include any leading whitespace that was captured
        const leadingWhitespace = match[0].match(/^(\s*)/)?.[1] || '';
        if (match.index + leadingWhitespace.length > textLastIndex) {
          withFiles.push({ type: 'text', content: textContent.slice(textLastIndex, match.index + leadingWhitespace.length) });
        }
        // Clean up the path (remove quotes, backticks, trailing punctuation)
        let path = match[3].trim().replace(/^[`"']+/, '').replace(/[`"'.,;:!?]+$/, '');
        // Handle file:// prefix
        if (path.startsWith('file://')) {
          path = path.replace('file://', '');
        }
        withFiles.push({ type: 'file', path });
        textLastIndex = match.index + match[0].length;
      }
    }
    if (textLastIndex < textContent.length) {
      withFiles.push({ type: 'text', content: textContent.slice(textLastIndex) });
    }
  }
  
  // Third pass: extract inline code from remaining text segments
  const withInlineCode: Segment[] = [];
  for (const segment of withFiles) {
    if (segment.type !== 'text') {
      withInlineCode.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
    inlineCodeRegex.lastIndex = 0;
    while ((match = inlineCodeRegex.exec(textContent)) !== null) {
      if (match.index > textLastIndex) {
        withInlineCode.push({ type: 'text', content: textContent.slice(textLastIndex, match.index) });
      }
      withInlineCode.push({ type: 'inline-code', content: match[1] });
      textLastIndex = match.index + match[0].length;
    }
    if (textLastIndex < textContent.length) {
      withInlineCode.push({ type: 'text', content: textContent.slice(textLastIndex) });
    }
  }
  
  // Fourth pass: extract markdown formatting (bold, italic, links) from remaining text
  // Order matters: bold (**) before italic (*) to avoid conflicts
  const markdownRegex = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/g;
  
  for (const segment of withInlineCode) {
    if (segment.type !== 'text') {
      segments.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
    markdownRegex.lastIndex = 0;
    while ((match = markdownRegex.exec(textContent)) !== null) {
      if (match.index > textLastIndex) {
        segments.push({ type: 'text', content: textContent.slice(textLastIndex, match.index) });
      }
      if (match[1] !== undefined) {
        // Bold: **text**
        segments.push({ type: 'bold', content: match[1] });
      } else if (match[2] !== undefined) {
        // Italic: *text*
        segments.push({ type: 'italic', content: match[2] });
      } else if (match[3] !== undefined) {
        // Italic: _text_
        segments.push({ type: 'italic', content: match[3] });
      } else if (match[4] !== undefined && match[5] !== undefined) {
        // Link: [text](url)
        segments.push({ type: 'link', text: match[4], url: match[5] });
      }
      textLastIndex = match.index + match[0].length;
    }
    if (textLastIndex < textContent.length) {
      segments.push({ type: 'text', content: textContent.slice(textLastIndex) });
    }
  }
  
  return segments;
}

// Detect if a code block looks like tool output (web_fetch, web_search, etc.)
// Check if text is raw tool output JSON (not in a code block)
function isRawToolOutputJson(text: string): boolean {
  const trimmed = text.trim();
  
  // Must start with { and end with } (looks like JSON object)
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }
  
  // Tool error responses: {"status": "error", "tool": "..."}
  if (trimmed.includes('"tool":') && (trimmed.includes('"status":') || trimmed.includes('"error":'))) {
    return true;
  }
  
  // web_fetch output: requires these specific keys
  const webFetchKeys = ['"fetchedAt":', '"tookMs":', '"extractMode":', '"finalUrl":'];
  const webFetchMatches = webFetchKeys.filter(key => trimmed.includes(key)).length;
  if (webFetchMatches >= 2) return true;
  
  // web_search output
  if (trimmed.includes('"citations":') && trimmed.includes('"answer":')) return true;
  
  // brave search output
  if (trimmed.includes('"web":') && trimmed.includes('"results":') && trimmed.includes('"title":')) return true;
  
  return false;
}

export function MessageContent({ text, isUser, showToolOutput = true, isStreaming = false }: MessageContentProps) {
  // Parse content - skip MEDIA while streaming to avoid rendering incomplete paths
  // No useMemo - parsing is fast and ensures fresh results when props change
  const segments = parseContent(text, { skipMedia: isStreaming });
  
  return (
    <div className="text-[15px] leading-relaxed">
      {segments.map((segment, i) => {
        // Code blocks - hide if it's tool output JSON and toggle is off
        if (segment.type === 'code') {
          if (isUser) {
            return (
              <span key={i} className="whitespace-pre-wrap break-words">
                {`\`\`\`${segment.language}\n${segment.content}\`\`\``}
              </span>
            );
          }
          // Hide code blocks that are tool output when toggle is off
          if (!showToolOutput && isRawToolOutputJson(segment.content)) {
            return null;
          }
          return <CodeBlock key={i} language={segment.language} code={segment.content} />;
        }
        
        // Raw text - check if it's tool output JSON
        if (segment.type === 'text') {
          // If toggle is off and this looks like raw tool output JSON, hide it
          if (!showToolOutput && isRawToolOutputJson(segment.content)) {
            return null;
          }
          return (
            <span key={i} className="whitespace-pre-wrap break-words">
              {segment.content}
            </span>
          );
        }
        // Inline code only for assistant messages
        if (segment.type === 'inline-code') {
          if (isUser) {
            return <span key={i} className="whitespace-pre-wrap break-words">`{segment.content}`</span>;
          }
          return <InlineCode key={i} code={segment.content} />;
        }
        // File attachments work for both user and assistant
        if (segment.type === 'file') {
          return <FileAttachment key={i} path={segment.path} isUser={isUser} />;
        }
        // Bold text
        if (segment.type === 'bold') {
          return (
            <strong key={i} className="font-semibold">
              {segment.content}
            </strong>
          );
        }
        // Italic text
        if (segment.type === 'italic') {
          return (
            <em key={i} className="italic">
              {segment.content}
            </em>
          );
        }
        // Links
        if (segment.type === 'link') {
          return (
            <a 
              key={i} 
              href={segment.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className={`underline hover:no-underline ${
                isUser ? 'text-purple-100 hover:text-white' : 'text-purple-600 hover:text-purple-800'
              }`}
            >
              {segment.text}
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}
