import { ReactNode } from "react";

export function inline(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

export function Reply({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith("```"))
        code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(
        <pre key={index}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^###\s+/.test(line)) {
      blocks.push(<h3 key={index}>{inline(line.replace(/^###\s+/, ""))}</h3>);
      index++;
      continue;
    }
    if (/^##?\s+/.test(line)) {
      blocks.push(<h2 key={index}>{inline(line.replace(/^##?\s+/, ""))}</h2>);
      index++;
      continue;
    }
    const ordered = /^\d+[.)]\s+/.test(line);
    const bullet = /^[-*•]\s+/.test(line);
    if (ordered || bullet) {
      const items: ReactNode[] = [];
      const expression = ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/;
      while (index < lines.length && expression.test(lines[index])) {
        items.push(
          <li key={index}>{inline(lines[index].replace(expression, ""))}</li>,
        );
        index++;
      }
      blocks.push(
        ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>,
      );
      continue;
    }
    if (!line.trim()) {
      index++;
      continue;
    }
    const paragraph: string[] = [line];
    index++;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !/^#{1,3}\s+/.test(lines[index]) &&
      !/^([-*•]\s+|\d+[.)]\s+)/.test(lines[index])
    )
      paragraph.push(lines[index++]);
    blocks.push(<p key={index}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="assistant-copy">{blocks}</div>;
}
