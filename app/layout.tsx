import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.obscribe.com'),
  title: {
    default: 'Obscribe',
    template: '%s | Obscribe'
  },
  description: 'A calm notebook workspace for notes, projects, and ideas.',
  applicationName: 'Obscribe',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Obscribe',
    description: 'A calm notebook workspace for notes, projects, and ideas.',
    url: 'https://www.obscribe.com',
    siteName: 'Obscribe',
    type: 'website'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
