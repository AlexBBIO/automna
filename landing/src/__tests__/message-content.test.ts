import { describe, it, expect } from 'vitest';

// Test the parsing logic directly (extracted from MessageContent)
type Segment = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string };

function parseContent(text: string): Segment[] {
  const segments: Segment[] = [];
  
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const inlineCodeRegex = /`([^`\n]+)`/g;
  
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
  
  // Second pass: extract inline code from text segments
  for (const segment of withCodeBlocks) {
    if (segment.type !== 'text') {
      segments.push(segment);
      continue;
    }
    
    let textLastIndex = 0;
    const textContent = segment.content;
    while ((match = inlineCodeRegex.exec(textContent)) !== null) {
      if (match.index > textLastIndex) {
        segments.push({ type: 'text', content: textContent.slice(textLastIndex, match.index) });
      }
      segments.push({ type: 'inline-code', content: match[1] });
      textLastIndex = match.index + match[0].length;
    }
    if (textLastIndex < textContent.length) {
      segments.push({ type: 'text', content: textContent.slice(textLastIndex) });
    }
    inlineCodeRegex.lastIndex = 0;
  }
  
  return segments;
}

describe('MessageContent parsing', () => {
  describe('plain text', () => {
    it('should return single text segment for plain text', () => {
      const result = parseContent('Hello world');
      expect(result).toEqual([{ type: 'text', content: 'Hello world' }]);
    });

    it('should preserve whitespace and newlines', () => {
      const result = parseContent('Line 1\nLine 2\n  indented');
      expect(result).toEqual([{ type: 'text', content: 'Line 1\nLine 2\n  indented' }]);
    });
  });

  describe('code blocks', () => {
    it('should parse a simple code block', () => {
      const result = parseContent('```js\nconsole.log("hi")\n```');
      expect(result).toEqual([
        { type: 'code', language: 'js', content: 'console.log("hi")\n' }
      ]);
    });

    it('should parse code block with language', () => {
      const result = parseContent('```python\nprint("hello")\n```');
      expect(result).toEqual([
        { type: 'code', language: 'python', content: 'print("hello")\n' }
      ]);
    });

    it('should parse code block without language', () => {
      const result = parseContent('```\nsome code\n```');
      expect(result).toEqual([
        { type: 'code', language: '', content: 'some code\n' }
      ]);
    });

    it('should parse text before and after code block', () => {
      const result = parseContent('Before\n```js\ncode\n```\nAfter');
      expect(result).toEqual([
        { type: 'text', content: 'Before\n' },
        { type: 'code', language: 'js', content: 'code\n' },
        { type: 'text', content: '\nAfter' }
      ]);
    });

    it('should parse multiple code blocks', () => {
      const result = parseContent('```js\na\n```\ntext\n```py\nb\n```');
      expect(result).toEqual([
        { type: 'code', language: 'js', content: 'a\n' },
        { type: 'text', content: '\ntext\n' },
        { type: 'code', language: 'py', content: 'b\n' }
      ]);
    });
  });

  describe('inline code', () => {
    it('should parse inline code', () => {
      const result = parseContent('Use `npm install` to install');
      expect(result).toEqual([
        { type: 'text', content: 'Use ' },
        { type: 'inline-code', content: 'npm install' },
        { type: 'text', content: ' to install' }
      ]);
    });

    it('should parse multiple inline codes', () => {
      const result = parseContent('Run `npm` or `yarn`');
      expect(result).toEqual([
        { type: 'text', content: 'Run ' },
        { type: 'inline-code', content: 'npm' },
        { type: 'text', content: ' or ' },
        { type: 'inline-code', content: 'yarn' }
      ]);
    });

    it('should not match backticks across newlines', () => {
      const result = parseContent('Start `code\nend`');
      expect(result).toEqual([
        { type: 'text', content: 'Start `code\nend`' }
      ]);
    });
  });

  describe('mixed content', () => {
    it('should handle code blocks and inline code together', () => {
      const result = parseContent('Use `foo` like:\n```js\nfoo()\n```\nDone');
      expect(result).toEqual([
        { type: 'text', content: 'Use ' },
        { type: 'inline-code', content: 'foo' },
        { type: 'text', content: ' like:\n' },
        { type: 'code', language: 'js', content: 'foo()\n' },
        { type: 'text', content: '\nDone' }
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = parseContent('');
      expect(result).toEqual([]);
    });

    it('should handle just backticks', () => {
      const result = parseContent('```');
      expect(result).toEqual([{ type: 'text', content: '```' }]);
    });

    it('should handle unclosed code block', () => {
      const result = parseContent('```js\ncode');
      expect(result).toEqual([{ type: 'text', content: '```js\ncode' }]);
    });
  });
});
