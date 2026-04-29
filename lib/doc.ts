import type { JSONContent } from '@tiptap/react';

export const emptyDoc: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
};

export function textFromDoc(doc: JSONContent): string {
  const parts: string[] = [];
  const walk = (node?: JSONContent) => {
    if (!node) return;
    if (node.type === 'text' && node.text) parts.push(node.text);
    node.content?.forEach(walk);
  };
  walk(doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function titleFromText(text: string): { title: string; source: 'auto' | 'untitled' } {
  const first = text.split(/\n|\s{2,}/).map((s) => s.trim()).find(Boolean);
  if (!first) return { title: 'Untitled', source: 'untitled' };
  return { title: first.slice(0, 80), source: 'auto' };
}

export function tagsFromText(text: string): string[] {
  return Array.from(new Set((text.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase())));
}

export function wikiLinksFromText(text: string): string[] {
  return Array.from(new Set((text.match(/\[\[([^\]]{1,80})\]\]/g) ?? [])
    .map((match) => match.slice(2, -2).trim())
    .filter(Boolean)));
}

export function markdownFromDoc(doc: JSONContent): string {
  const renderText = (node?: JSONContent): string => {
    if (!node) return '';
    if (node.type === 'text') {
      let text = node.text ?? '';
      node.marks?.forEach((mark) => {
        if (mark.type === 'bold') text = `**${text}**`;
        if (mark.type === 'italic') text = `_${text}_`;
        if (mark.type === 'code') text = `\`${text}\``;
        if (mark.type === 'link' && typeof mark.attrs?.href === 'string') text = `[${text}](${mark.attrs.href})`;
      });
      return text;
    }
    return node.content?.map(renderText).join('') ?? '';
  };

  const renderBlock = (node?: JSONContent): string => {
    if (!node) return '';
    const text = renderText(node).trimEnd();
    if (node.type === 'heading') return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${text}`;
    if (node.type === 'bulletList') return node.content?.map((item) => `- ${renderText(item).trim()}`).join('\n') ?? '';
    if (node.type === 'orderedList') return node.content?.map((item, index) => `${index + 1}. ${renderText(item).trim()}`).join('\n') ?? '';
    if (node.type === 'taskList') return node.content?.map((item) => `- [${item.attrs?.checked ? 'x' : ' '}] ${renderText(item).trim()}`).join('\n') ?? '';
    if (node.type === 'blockquote') return text.split('\n').map((line) => `> ${line}`).join('\n');
    if (node.type === 'codeBlock') return `\`\`\`\n${text}\n\`\`\``;
    if (node.type === 'horizontalRule') return '---';
    if (node.type === 'paragraph') return text;
    if (node.content?.length) return node.content.map(renderBlock).filter(Boolean).join('\n\n');
    return text;
  };

  return doc.content?.map(renderBlock).filter(Boolean).join('\n\n').trim() ?? '';
}
