'use client';

import { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 text-xs">
        <span className="text-gray-400 font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Copied!</span>
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
      {/* Code content */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px',
          fontSize: '13px',
          borderRadius: 0,
          background: '#1e1e1e',
        }}
        wrapLongLines
      >
        {code.trim()}
      </SyntaxHighlighter>
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
