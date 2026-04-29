import type { Metadata } from 'next';
import InfoPage from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'About Obscribe',
  description: 'About Obscribe, a calm notebook workspace for notes, projects, and ideas.'
};

export default function AboutPage() {
  return (
    <InfoPage eyebrow="About" title="A calmer notebook for your work and ideas">
      <p>Obscribe is a notebook-style workspace for notes, projects, tasks, and loose ideas. The goal is to keep writing fast and focused without turning your notebook into a complicated dashboard.</p>
      <p>You can use Obscribe locally in your browser without signing in. If you create an account, your cloud workspace syncs through Supabase so your notebooks can follow you between devices.</p>
      <p>Obscribe is currently in alpha, so features are still evolving. The priority is simple: keep your notes clear, portable, and under your control.</p>
    </InfoPage>
  );
}
