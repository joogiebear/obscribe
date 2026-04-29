'use client';

import { useEffect, useState } from 'react';
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type JSONContent, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import { Node } from '@tiptap/core';
import { Lightbulb, ListTodo, Minus, Quote, Sparkles, TextQuote, TriangleAlert } from 'lucide-react';

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
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'callout', 'data-kind': HTMLAttributes.kind }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  }
});

function CalloutView({ node }: NodeViewProps) {
  const kind = node.attrs.kind ?? 'note';
  const icon = kind === 'idea' ? '💡' : kind === 'warning' ? '⚠️' : kind === 'question' ? '❓' : '📝';
  return (
    <NodeViewWrapper className={`callout-block ${kind}`} data-type="callout" data-kind={kind}>
      <div className="callout-icon">{icon}</div>
      <NodeViewContent className="callout-content" />
    </NodeViewWrapper>
  );
}

export default function Editor({ content, onChange }: Props) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPosition, setSlashPosition] = useState({ top: 10, left: 8 });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Typography,
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
          setSlashPosition({ top: coords.bottom - editorBox.top + 8, left: Math.max(0, coords.left - editorBox.left) });
          setSlashQuery('');
          setSlashOpen(true);
        }
        return false;
      },
      handleKeyDown(_view, event) {
        if (event.key === 'Escape') setSlashOpen(false);
        return false;
      }
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON())
  });

  useEffect(() => {
    if (!editor) return;
    const updateSlashQuery = () => {
      const range = slashRange();
      if (!range) {
        setSlashQuery('');
        return;
      }
      const { $from } = editor.state.selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
      const slashIndex = textBefore.lastIndexOf('/');
      setSlashQuery(textBefore.slice(slashIndex + 1).toLowerCase());
    };
    editor.on('transaction', updateSlashQuery);
    return () => {
      editor.off('transaction', updateSlashQuery);
    };
  }, [editor]);

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
    const query = textBefore.slice(slashIndex);
    if (/\s/.test(query)) return null;
    return { from: $from.pos - query.length, to: $from.pos };
  }

  function runSlash(action: () => void) {
    if (!editor) return;
    const range = slashRange();
    if (range) editor.chain().focus().deleteRange(range).run();
    action();
    setSlashOpen(false);
  }

  const slashItems = [
    { label: 'Heading', aliases: ['h2', 'title'], icon: <TextQuote size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleHeading({ level: 2 }).run()) },
    { label: 'Todo', aliases: ['task', 'checkbox', 'check'], icon: <ListTodo size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleTaskList().run()) },
    { label: 'Quote', aliases: ['blockquote'], icon: <Quote size={16} />, action: () => runSlash(() => editor?.chain().focus().toggleBlockquote().run()) },
    { label: 'Divider', aliases: ['line', 'rule', 'hr'], icon: <Minus size={16} />, action: () => runSlash(() => editor?.chain().focus().setHorizontalRule().run()) },
    { label: 'Note callout', aliases: ['callout', 'note'], icon: <Sparkles size={16} />, action: () => runSlash(() => editor?.chain().focus().insertContent({ type: 'callout', attrs: { kind: 'note' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] }).run()) },
    { label: 'Idea callout', aliases: ['idea', 'lightbulb'], icon: <Lightbulb size={16} />, action: () => runSlash(() => editor?.chain().focus().insertContent({ type: 'callout', attrs: { kind: 'idea' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Idea' }] }] }).run()) },
    { label: 'Warning callout', aliases: ['warning', 'alert'], icon: <TriangleAlert size={16} />, action: () => runSlash(() => editor?.chain().focus().insertContent({ type: 'callout', attrs: { kind: 'warning' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Warning' }] }] }).run()) }
  ];
  const filteredSlashItems = slashItems.filter((item) => !slashQuery || item.label.toLowerCase().includes(slashQuery) || item.aliases.some((alias) => alias.includes(slashQuery)));

  return (
    <div className="editor-wrap">
      {slashOpen && <div className="slash-menu" style={{ top: slashPosition.top, left: slashPosition.left }}>{filteredSlashItems.length ? filteredSlashItems.map((item) => <button key={item.label} onMouseDown={(event) => { event.preventDefault(); item.action(); }}>{item.icon}{item.label}</button>) : <p>No blocks found</p>}</div>}
      <EditorContent editor={editor} />
    </div>
  );
}
