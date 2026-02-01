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

// Parse text into segments (text, code blocks, inline code)
type Segment = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string };

function parseContent(text: string): Segment[] {
  const segments: Segment[] = [];
  
  // Regex for code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  // Regex for inline code: `code`
  const inlineCodeRegex = /`([^`\n]+)`/g;
  
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
  
  // Second pass: extract inline code from text segments
  for (const segment of withCodeBlocks) {
    if (segment.type !== 'text') {
      segments.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
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
    // Reset regex lastIndex
    inlineCodeRegex.lastIndex = 0;
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
