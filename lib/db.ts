'use client';

import Dexie, { type Table } from 'dexie';
import type { Notebook, Section, PageRecord, InboxItem } from './types';

class ObscribeDB extends Dexie {
  notebooks!: Table<Notebook, string>;
  sections!: Table<Section, string>;
  pages!: Table<PageRecord, string>;
  inbox!: Table<InboxItem, string>;

  constructor() {
    super('obscribe-local-alpha');
    this.version(1).stores({
      notebooks: 'id, order, updatedAt',
      sections: 'id, notebookId, order, updatedAt',
      pages: 'id, notebookId, sectionId, title, pinned, order, updatedAt, *tags',
      inbox: 'id, createdAt'
    });
  }
}

export const db = new ObscribeDB();
