import type { JSONContent } from '@tiptap/react';

export type Notebook = {
  id: string;
  name: string;
  accentColor: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Section = {
  id: string;
  notebookId: string;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type PageRecord = {
  id: string;
  notebookId: string;
  sectionId: string;
  title: string;
  titleSource: 'auto' | 'manual' | 'untitled';
  pinned: boolean;
  order: number;
  content: JSONContent;
  plainText: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type InboxItem = {
  id: string;
  text: string;
  createdAt: string;
};
