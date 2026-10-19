'use client';

import React, { useState } from 'react';
import { SmartCard } from './SmartCard';

function renderInlineFormatting(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const matches = [
      boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index! } : null,
      italicMatch ? { type: 'italic', match: italicMatch, index: italicMatch.index! } : null,
      codeMatch ? { type: 'code', match: codeMatch, index: codeMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    const matchData = first.match;

    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === 'bold') {
      parts.push(<strong key={key++} className="font-bold">{matchData[1]}</strong>);
    } else if (first.type === 'italic') {
      parts.push(<em key={key++} className="italic">{matchData[1]}</em>);
    } else if (first.type === 'code') {
      parts.push(
        <code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
          {matchData[1]}
        </code>
      );
    }

    remaining = remaining.slice(first.index + matchData[0].length);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

interface MessageContentProps {
  content: string;
  isLoading?: boolean;
  currentTool?: string | null;
}

export function MessageContent({ content, isLoading, currentTool }: MessageContentProps) {
  if (!content && isLoading) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        {currentTool ? (
          <span className="animate-pulse">🔧 Pouzivam {currentTool}...</span>
        ) : (
          <span className="animate-pulse">Premyslam...</span>
        )}
      </span>
    );
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```

      // Smart Card detection
      if (lang === 'card' || lang === 'cards') {
        try {
          const cardData = JSON.parse(codeLines.join('\n'));
          elements.push(<SmartCard key={elements.length} data={cardData} />);
          continue;
        } catch { /* fall through to code display */ }
      }

      elements.push(
        <div key={elements.length} className="my-3 rounded-lg overflow-hidden border border-border/50">
          {lang && (
            <div className="bg-muted/50 px-3 py-1 text-xs text-muted-foreground border-b border-border/50 flex items-center justify-between">
              <span>{lang}</span>
              <CopyButton text={codeLines.join('\n')} />
            </div>
          )}
          <pre className="bg-card/50 p-3 text-sm overflow-x-auto font-mono">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Table: detect | delimited lines with valid separator row
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Validate: need header + separator (|---|---| pattern) + at least 1 data row
      const hasSeparator = tableLines.length >= 3 && /^\|[\s\-:|]+\|$/.test(tableLines[1].trim());
      if (hasSeparator) {
        elements.push(<MarkdownTable key={elements.length} lines={tableLines} />);
        continue;
      }
      i -= tableLines.length;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h4 key={elements.length} className="text-base font-bold mt-3 mb-1">{renderInlineFormatting(line.slice(4))}</h4>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={elements.length} className="text-lg font-bold mt-4 mb-2">{renderInlineFormatting(line.slice(3))}</h3>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={elements.length} className="text-xl font-bold mt-4 mb-2">{renderInlineFormatting(line.slice(2))}</h2>);
      i++; continue;
    }

    // Bullet lists
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-2">
          <span className="text-primary">•</span>
          <span>{renderInlineFormatting(line.slice(2))}</span>
        </div>
      );
      i++; continue;
    }

    // Numbered lists
    const numberedMatch = line.match(/^(\d+)\. (.*)$/);
    if (numberedMatch) {
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-2">
          <span className="text-primary font-medium">{numberedMatch[1]}.</span>
          <span>{renderInlineFormatting(numberedMatch[2])}</span>
        </div>
      );
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={elements.length} className="border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
          {renderInlineFormatting(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(<hr key={elements.length} className="border-border/50 my-3" />);
      i++; continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={elements.length} className="h-2" />);
      i++; continue;
    }

    // Regular paragraph
    elements.push(<p key={elements.length}>{renderInlineFormatting(line)}</p>);
    i++;
  }

  return <div className="space-y-2">{elements}</div>;
}

// ─── Sub-components ─────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    >
      {copied ? '✓ Skopirovane' : 'Kopirovat'}
    </button>
  );
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const parseRow = (line: string) =>
    line.split('|').slice(1, -1).map(cell => cell.trim());

  const headers = parseRow(lines[0]);
  const bodyStart = lines[1]?.match(/^[\s|:-]+$/) ? 2 : 1;
  const rows = lines.slice(bodyStart).map(parseRow);

  return (
    <div className="overflow-x-auto my-3 max-w-full">
      <table className="min-w-full text-sm border border-border/50 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-muted/30">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border/50">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/30 hover:bg-card/50">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 px-3">{renderInlineFormatting(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
