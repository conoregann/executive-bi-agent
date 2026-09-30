import type { ReactNode } from 'react';

/** Render the small Markdown subset used by retrieved company documents.
 * React escapes text and attributes; raw HTML is deliberately never interpreted.
 */
export function MarkdownContent({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let paragraph: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={`p-${blocks.length}`}>{inline(paragraph.join(' '))}</p>,
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {list.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {quote.map((line, index) => (
            <p key={index}>{inline(line)}</p>
          ))}
        </blockquote>,
      );
      quote = [];
    }
  };

  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    const item = /^\s*[-*+]\s+(.+)$/.exec(line);
    const quoted = /^>\s?(.*)$/.exec(line);
    if (!line.trim() || heading || item || quoted) {
      flushParagraph();
      if (!item) flushList();
      if (!quoted) flushQuote();
      if (heading) {
        const level = heading[1]?.length ?? 1;
        const content = inline(heading[2] ?? '');
        blocks.push(
          level === 1 ? (
            <h3 key={`h-${blocks.length}`}>{content}</h3>
          ) : level === 2 ? (
            <h4 key={`h-${blocks.length}`}>{content}</h4>
          ) : (
            <h5 key={`h-${blocks.length}`}>{content}</h5>
          ),
        );
      } else if (item) list.push(item[1] ?? '');
      else if (quoted) quote.push(quoted[1] ?? '');
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  flushQuote();
  return <div className="markdown-content">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const tokens = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)/g;
  const nodes: ReactNode[] = [];
  let previous = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index ?? 0;
    if (index > previous) nodes.push(text.slice(previous, index));
    if (match[1]) nodes.push(<strong key={index}>{match[1]}</strong>);
    else if (match[2]) nodes.push(<em key={index}>{match[2]}</em>);
    else if (match[3]) nodes.push(<code key={index}>{match[3]}</code>);
    else if (match[4] && match[5]) {
      const safeUrl = safeMarkdownUrl(match[5]);
      nodes.push(
        safeUrl ? (
          <a key={index} href={safeUrl} target="_blank" rel="noreferrer">
            {match[4]}
          </a>
        ) : (
          match[4]
        ),
      );
    }
    previous = index + match[0].length;
  }
  if (previous < text.length) nodes.push(text.slice(previous));
  return nodes;
}

function safeMarkdownUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
