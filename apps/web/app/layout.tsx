import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Obscribe',
  description: 'A private, self-hostable notes workspace.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
