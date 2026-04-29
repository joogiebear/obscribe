'use client';

import { useEffect, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import { Node } from '@tiptap/core';
import { Code2, Image as ImageIcon, Link as LinkIcon, Lightbulb, ListTodo, Minus, Quote, Sparkles, Table2, TextQuote, TriangleAlert } from 'lucide-react';

const lowlight = createLowlight();

type Props = {
  content: JSONContent;
  onChange: (content: JSONContent) => void;
};

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      kind: { default: 'note' }
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-type="callout"]',
      getAttrs: (element) => ({ kind: element instanceof HTMLElement ? element.dataset.kind || 'note' : 'note' })
    }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind ?? 'note';
    return ['div', { ...HTMLAttributes, class: `callout-block ${kind}`, 'data-type': 'callout', 'data-kind': kind }, ['div', { class: 'callout-content' }, 0]];
  }
});


export default function Editor({ content, onChange }: Props) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPosition, setSlashPosition] = useState({ top: 10, left: 8, placement: 'below' as 'below' | 'above' });
  const [inputModal, setInputModal] = useState<{ kind: 'link' | 'image'; title: string; placeholder: string } | null>(null);
  const [inputValue, setInputValue] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, link: false }),
      Typography,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ allowBase64: true, inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      Placeholder.configure({ placeholder: 'Start writing. Try / for blocks, #tags, or [[page links]] soon…' })
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose-page' },
      handleTextInput(view, _from, to, text) {
        if (text === '/') {
          const coords = view.coordsAtPos(to);
          const editorBox = view.dom.getBoundingClientRect();
          const spaceBelow = window.innerHeight - coords.bottom;
          const placement = spaceBelow < 280 ? 'above' : 'below';
          setSlashPosition({ top: (placement === 'above' ? coords.top : coords.bottom) - editorBox.top + (placement === 'above' ? -8 : 8), left: Math.max(0, coords.left - editorBox.left), placement });
          setSlashQuery('');
          setSlashOpen(true);
        }
        return false;
      },
      handleKeyDown(_view, event) {
        if (event.key === 'Escape') { setSlashOpen(false); setSlashQuery(''); }
        return false;
      }
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON())
  });

  useEffect(() => {
    if (!editor) return;
    const updateSlashQuery = () => {
      if (!slashOpen) return;
      const range = slashRange();
      if (!range) return;
      setSlashQuery(range.query.toLowerCase());
    };
    editor.on('transaction', updateSlashQuery);
    return () => {
      editor.off('transaction', updateSlashQuery);
    };
  }, [editor, slashOpen]);


  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content);
  }, [content, editor]);

  function slashRange() {
    if (!editor) return null;
    const { $from } = editor.state.selection;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
    const slashIndex = textBefore.lastIndexOf('/');
    if (slashIndex < 0) return null;
    const query = textBefore.slice(slashIndex + 1);
    if (/\s/.test(query)) return null;
    const from = $from.pos - (textBefore.length - slashIndex);
    return { from, to: $from.pos, query };
  }


  function runSlash(action: () => void) {
    if (!editor) return;
    const range = slashRange();
    if (range) editor.chain().focus().deleteRange(range).run();
    action();
    setSlashOpen(false);
    setSlashQuery('');
  }

  function insertCallout(kind: 'note' | 'idea' | 'warning' | 'question') {
    runSlash(() => {
      editor?.chain().focus().insertContent({
        type: 'callout',
        attrs: { kind },
        content: [{ type: 'paragraph' }]
      }).run();
    });
  }

  function openInputModal(kind: 'link' | 'image') {
    setInputValue(kind === 'link' ? (editor?.getAttributes('link').href || 'https://') : '');
    setInputModal({
      kind,
      title: kind === 'link' ? 'Insert link' : 'Insert image',
      placeholder: kind === 'link' ? 'https://example.com' : 'https://example.com/image.png'
    });
  }

  function submitInputModal() {
    if (!inputModal) return;
    const url = inputValue.trim();
    if (!url) return;
    if (inputModal.kind === 'link') {
      runSlash(() => {
        if (editor?.state.selection.empty) {
          editor?.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
        } else {
          editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }
      });
    } else {
      runSlash(() => editor?.chain().focus().setImage({ src: url }).run());
    }
    setInputModal(null);
    setInputValue('');
  }

  const slashItems = [
    { label: 'Heading', aliases: ['h2', 'title'], icon: <TextQuote size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleHeading({ level: 2 }).run()) },
    { label: 'Todo', aliases: ['task', 'checkbox', 'check'], icon: <ListTodo size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleTaskList().run()) },
    { label: 'Quote', aliases: ['blockquote'], icon: <Quote size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleBlockquote().run()) },
    { label: 'Divider', aliases: ['line', 'rule', 'hr'], icon: <Minus size={16} />, action: () => runSlash(() => editor?.chain().focus().setHorizontalRule().run()) },
    { label: 'Code block', aliases: ['code', 'pre', 'snippet'], icon: <Code2 size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleCodeBlock().run()) },
    { label: 'Table', aliases: ['grid', 'columns', 'rows'], icon: <Table2 size={16} />, action: () => runSlash(() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()) },
    { label: 'Link', aliases: ['url', 'anchor'], icon: <LinkIcon size={16} />, action: () => openInputModal('link') },
    { label: 'Image', aliases: ['picture', 'photo'], icon: <ImageIcon size={16} />, action: () => openInputModal('image') },
    { label: 'Note callout', aliases: ['callout', 'note'], icon: <Sparkles size={16} />, action: () => insertCallout('note') },
    { label: 'Idea callout', aliases: ['idea', 'lightbulb'], icon: <Lightbulb size={16} />, action: () => insertCallout('idea') },
    { label: 'Warning callout', aliases: ['warning', 'alert'], icon: <TriangleAlert size={16} />, action: () => insertCallout('warning') }
  ];
  const filteredSlashItems = slashItems.filter((item) => !slashQuery || item.label.toLowerCase().includes(slashQuery) || item.aliases.some((alias) => alias.includes(slashQuery)));

  return (
    <div className="editor-wrap">
      {slashOpen && <div className={`slash-menu ${slashPosition.placement}`} style={{ top: slashPosition.top, left: slashPosition.left }}>{filteredSlashItems.length ? filteredSlashItems.map((item) => <button key={item.label} onMouseDown={(event) => { event.preventDefault(); item.action(); }}>{item.icon}{item.label}</button>) : <p>No blocks found</p>}</div>}
      <EditorContent editor={editor} />
      {inputModal && (
        <div className="modal-backdrop editor-modal-backdrop" onMouseDown={() => setInputModal(null)}>
          <section className="notebook-modal editor-input-modal" onMouseDown={(event) => event.stopPropagation()}>
            <p className="eyebrow">Editor block</p>
            <h2>{inputModal.title}</h2>
            <label className="modal-field">URL<input value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder={inputModal.placeholder} autoFocus onKeyDown={(event) => { if (event.key === 'Enter') submitInputModal(); if (event.key === 'Escape') setInputModal(null); }} /></label>
            <div className="modal-actions"><button className="ghost-button" onClick={() => setInputModal(null)}>Cancel</button><button className="new" onClick={submitInputModal}>{inputModal.kind === 'link' ? 'Insert Link' : 'Insert Image'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
