import type { ReactNode } from "react";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "paragraph"; text: string };

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function blocksOf(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const id = `${key}-${n}`;
    n += 1;
    if (token.startsWith("**")) nodes.push(<strong key={id}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) nodes.push(<em key={id}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("`")) nodes.push(<code key={id} className="rounded bg-raised px-1 font-mono text-[0.92em]">{token.slice(1, -1)}</code>);
    else {
      LINK.lastIndex = 0;
      const link = LINK.exec(token);
      if (link) {
        nodes.push(
          <a key={id} href={link[2]} target="_blank" rel="noreferrer" className="text-text underline decoration-line-strong underline-offset-2 hover:text-gold">
            {link[1]}
          </a>,
        );
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** A small Markdown view for research answers. It renders text, not raw HTML. */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="mt-8 max-w-2xl space-y-3 text-[15px] leading-relaxed text-text">
      {blocksOf(text).map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h2" : "h3";
          return <Tag key={index} className={block.level === 1 ? "text-[20px] font-medium" : "text-[17px] font-medium"}>{inline(block.text, `h${index}`)}</Tag>;
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, `l${index}-${itemIndex}`)}</li>)}
            </ul>
          );
        }
        if (block.type === "code") {
          return <pre key={index} className="overflow-x-auto rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px]">{block.text}</pre>;
        }
        return <p key={index}>{inline(block.text, `p${index}`)}</p>;
      })}
    </div>
  );
}
