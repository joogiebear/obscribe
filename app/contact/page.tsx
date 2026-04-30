import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Contact | Obscribe',
  description: 'Contact Obscribe support.'
};

export default function ContactPage() {
  return (
    <InfoPage eyebrow="Contact" title="Contact Obscribe">
      <p>For beta feedback, support, account questions, privacy requests, or security concerns, contact the Obscribe owner directly.</p>
      <p><strong>Email:</strong> <a href="mailto:support@obscribe.com?subject=Obscribe%20Beta%20Feedback">support@obscribe.com</a></p>
      <p>Helpful beta reports include what you were trying to do, what happened, your browser/device, and whether you were signed in or using local-only mode.</p>
      <p>If this mailbox is not configured yet, use the contact method that brought you to Obscribe until email is fully set up.</p>
    </InfoPage>
  );
}
