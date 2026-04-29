'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';

type Props = {
  content: JSONContent;
  onChange: (content: JSONContent) => void;
};

export default function Editor({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing. Try / for ideas, #tags, or [[page links]] soon…' })
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose-page' }
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON())
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content);
  }, [content, editor]);

  return <EditorContent editor={editor} />;
}
