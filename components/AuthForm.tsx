'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, LogIn, Mail, UserPlus } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'register';

export default function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'sign-in' ? 'sign-in' : 'register';
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) router.push('/');
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function submit() {
    if (!supabase || !email.trim() || !password) return;
    setBusy(true);
    setMessage(null);
    const credentials = { email: email.trim(), password };
    const result = mode === 'register'
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === 'register' && !result.data.session) {
      setMessage('Check your email to confirm your account, then come back to sign in.');
    } else {
      router.push('/');
    }
    setPassword('');
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-page">
        <section className="auth-shell">
          <p className="eyebrow">Accounts</p>
          <h1>Registration is not configured yet</h1>
          <p>Add Supabase environment variables in Vercel to enable account creation.</p>
          <button className="ghost-button" onClick={() => router.push('/')}><ArrowLeft size={16} /> Back to notebook</button>
        </section>
      </main>
    );
  }

  if (user) {
    router.push('/');
    return null;
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <button className="back-link" onClick={() => router.push('/')}><ArrowLeft size={16} /> Back to notebook</button>
        <p className="eyebrow">Obscribe account</p>
        <h1>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-subtitle">Accounts are ready for early access. Cloud sync is the next layer; notes still save locally in this alpha.</p>

        <div className="auth-form auth-form-page">
          <label><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" autoComplete="email" /></label>
          <label><LogIn size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} /></label>
          <button className="new auth-submit" onClick={submit} disabled={busy}>{mode === 'register' ? <UserPlus size={16} /> : <LogIn size={16} />}{busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
          <button className="link-button" onClick={() => { setMode(mode === 'register' ? 'sign-in' : 'register'); setMessage(null); }}>
            {mode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Register'}
          </button>
          {message && <p className="auth-message">{message}</p>}
        </div>
      </section>
    </main>
  );
}
