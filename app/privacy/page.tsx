import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Obscribe',
  description: 'Privacy policy for Obscribe.'
};

export default function PrivacyPage() {
  return (
    <InfoPage eyebrow="Privacy" title="Privacy Policy">
      <p><strong>Effective date:</strong> April 29, 2026</p>
      <p>Obscribe is designed as a private notebook workspace. This policy explains the basic data Obscribe uses during the alpha.</p>
      <h2>Information you provide</h2>
      <p>If you create an account, Obscribe uses your email address for sign-in, account security, and password recovery. If you write notes in a signed-in workspace, your notebooks, sections, pages, tags, and page content are stored so they can sync to your account.</p>
      <h2>Local-only use</h2>
      <p>If you use Obscribe without signing in, your workspace is stored locally in your browser using IndexedDB. Local-only notes are not synced to an Obscribe account.</p>
      <h2>AI provider keys</h2>
      <p>If you paste an AI provider API key, Obscribe encrypts it in this browser with your passphrase before storing it locally on this device. Obscribe does not store your passphrase.</p>
      <h2>Service providers</h2>
      <p>Obscribe is hosted on Vercel and uses Supabase for authentication and cloud workspace storage. These providers process data needed to run the app.</p>
      <h2>Contact</h2>
      <p>Questions or data requests can be sent through the contact page.</p>
    </InfoPage>
  );
}
