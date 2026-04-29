import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  eyebrow: string;
  title: string;
  children: ReactNode;
};

export default function InfoPage({ eyebrow, title, children }: Props) {
  return (
    <main className="info-page">
      <section className="info-card">
        <Link className="back-link" href="/">← Back to Obscribe</Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="info-content">{children}</div>
      </section>
    </main>
  );
}
