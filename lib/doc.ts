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
