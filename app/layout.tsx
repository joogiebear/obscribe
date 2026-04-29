import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Obscribe Local Alpha',
  description: 'A calm notebook workspace for notes, projects, and ideas.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
