import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export default function AuthPage() {
  return (
    <Suspense fallback={<main className="auth-page"><section className="auth-shell">Loading…</section></main>}>
      <AuthForm />
    </Suspense>
  );
}
