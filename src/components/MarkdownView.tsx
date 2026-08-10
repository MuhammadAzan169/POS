import type { ReactNode } from "react";

/**
 * Small markdown renderer for assistant replies.
 *
 * Deliberately hand-rolled rather than pulling in a library: the model emits a
 * narrow subset — headings, paragraphs, bullet and numbered lists, GFM tables,
 * bold/italic/code and horizontal rules — and this keeps the output styled with
 * the app's own tokens so it matches in both themes.
 */

/** Bold, italic and inline code inside a line of text. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split on the three inline forms at once so nesting order doesn't matter.
  const parts = text.split(/(\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|`[^`]+`)/g);
  parts.forEach((part, i) => {
    const key = `${keyBase}-${i}`;
    if (!part) return;
    if (part.startsWith("**") && part.endsWith("**")) {
      out.push(<strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded bg-muted text-[0.9em] font-mono">{part.slice(1, -1)}</code>,
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      out.push(<em key={key}>{part.slice(1, -1)}</em>);
    } else {
      out.push(<span key={key}>{part}</span>);
    }
  });
  return out;
}

// The trailing pipe is optional: if a reply is cut off mid-table the last row
// still renders as a row rather than dropping out as stray text.
const isTableRow = (l: string) => l.trim().startsWith("|") && l.trim().length > 1;
const isDivider = (l: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes("-");

const cells = (row: string) =>
  row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Numbers right-align; everything else left-aligns, matching the app's tables. */
const alignOf = (v: string) => (/^[-+]?[\d.,]+%?$/.test(v.replace(/^(Rs|PKR)\s*/i, "").trim()) ? "text-right" : "text-left");

export function MarkdownView({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // ---- fenced block ----
    // Models sometimes wrap a markdown table in ``` fences. Rendering that as a
    // code block would show raw pipes, so a fenced table is unwrapped and the
    // lines are re-processed as markdown; anything else prints as code.
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // closing fence
      const looksLikeTable = body.length > 1 && isTableRow(body[0]) && isDivider(body[1]);
      if (looksLikeTable) {
        lines.splice(i, 0, ...body);
        continue;
      }
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs font-mono">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // ---- horizontal rule ----
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="border-border my-1" />);
      i++;
      continue;
    }

    // ---- table ----
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} className={`px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground ${alignOf(rows[0]?.[hi] ?? "")}`}>
                    {inline(h, `h${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t">
                  {header.map((_, ci) => (
                    <td key={ci} className={`px-3 py-2 ${alignOf(r[ci] ?? "")}`}>{inline(r[ci] ?? "", `c${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // ---- heading ----
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p key={key++} className={level <= 2 ? "font-semibold text-base" : "font-semibold"}>
          {inline(heading[2], `hd${key}`)}
        </p>,
      );
      i++;
      continue;
    }

    // ---- numbered list ----
    // Indented sub-bullets belong to the item above them. Without absorbing
    // them the list is split into several <ol>s and every item renders as "1.".
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: { text: string; children: string[] }[] = [];
      while (i < lines.length) {
        const numbered = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (numbered) {
          items.push({ text: numbered[1], children: [] });
          i++;
          // Sub-bullets, and wrapped continuation lines, attach to this item.
          while (i < lines.length && /^\s{2,}([-*•]\s+|\S)/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
            items[items.length - 1].children.push(lines[i].replace(/^\s*[-*•]\s+/, "").trim());
            i++;
          }
          continue;
        }
        // Blank lines between items don't end the list — look past ALL of them.
        // Models commonly separate numbered items by one or two blank lines, and
        // treating each as a terminator produced a new <ol> per item, so every
        // item rendered as "1.".
        if (!lines[i].trim()) {
          let j = i;
          while (j < lines.length && !lines[j].trim()) j++;
          if (/^\s*\d+[.)]\s+/.test(lines[j] ?? "")) { i = j; continue; }
        }
        break;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-5 space-y-1.5 marker:text-muted-foreground">
          {items.map((it, ii) => (
            <li key={ii}>
              {inline(it.text, `ol${key}-${ii}`)}
              {it.children.length > 0 && (
                <ul className="list-[circle] pl-5 mt-1 space-y-0.5 marker:text-muted-foreground">
                  {it.children.map((c, ci) => <li key={ci}>{inline(c, `oc${key}-${ii}-${ci}`)}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // ---- bullet list (supports one level of nesting) ----
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)?.[0].length ?? 0;
        items.push({ depth: indent >= 2 ? 1 : 0, text: lines[i].replace(/^\s*[-*•]\s+/, "") });
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 marker:text-muted-foreground">
          {items.map((it, ii) => (
            <li key={ii} className={it.depth ? "ml-4 list-[circle]" : ""}>{inline(it.text, `ul${key}-${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // ---- paragraph: gather until a blank line or the start of another block ----
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isTableRow(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++}>{inline(para.join(" "), `p${key}`)}</p>);
  }

  return <div className="space-y-2.5 text-sm leading-relaxed break-words">{blocks}</div>;
}
