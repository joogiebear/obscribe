import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Terms of Use | Obscribe',
  description: 'Terms of use for Obscribe.'
};

export default function TermsPage() {
  return (
    <InfoPage eyebrow="Terms" title="Terms of Use">
      <p><strong>Effective date:</strong> April 29, 2026</p>
      <p>By using Obscribe, you agree to use the app responsibly and only for content you have the right to store.</p>
      <h2>Alpha software</h2>
      <p>Obscribe is currently alpha software. Features may change, bugs may exist, and availability is not guaranteed. Keep separate backups of important notes.</p>
      <h2>Your content</h2>
      <p>Your notes remain yours. You are responsible for the content you create, upload, or store in Obscribe.</p>
      <h2>Accounts</h2>
      <p>You are responsible for keeping your account credentials secure. If you use local encryption for provider keys, keep your passphrase safe because Obscribe cannot recover it.</p>
      <h2>Acceptable use</h2>
      <p>Do not use Obscribe to store or distribute malicious, illegal, abusive, or infringing content, or to interfere with the service or other users.</p>
      <h2>Contact</h2>
      <p>Questions about these terms can be sent through the contact page.</p>
    </InfoPage>
  );
}
