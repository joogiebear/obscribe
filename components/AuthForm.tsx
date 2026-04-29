'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, KeyRound, LogIn, Mail, UserPlus } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'register' | 'forgot' | 'reset';

export default function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const initialMode: Mode = requestedMode === 'sign-in' || requestedMode === 'reset' ? requestedMode : 'register';
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
        setMessage('Choose a new password for your Obscribe account.');
        return;
      }
      if (session?.user && mode !== 'reset') router.push('/');
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);

    if (mode === 'forgot') {
      if (!email.trim()) { setBusy(false); return; }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth?mode=reset` });
      setBusy(false);
      setMessage(error ? error.message : 'Password reset link sent. Check your email, then follow the link to choose a new password.');
      return;
    }

    if (mode === 'reset') {
      if (!password) { setBusy(false); return; }
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      setPassword('');
      setMessage('Password updated. Taking you back to your notebook…');
      router.push('/');
      return;
    }

    if (!email.trim() || !password) { setBusy(false); return; }
    const credentials = { email: email.trim(), password };
    const emailRedirectTo = `${window.location.origin}/auth?mode=sign-in`;
    const result = mode === 'register'
      ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo } })
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

  if (user && mode !== 'reset') {
    router.push('/');
    return null;
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <button className="back-link" onClick={() => router.push('/')}><ArrowLeft size={16} /> Back to notebook</button>
        <p className="eyebrow">Obscribe account</p>
        <h1>{mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Welcome back'}</h1>
        <p className="auth-subtitle">{mode === 'forgot' ? 'Enter your email and we’ll send a secure reset link.' : mode === 'reset' ? 'Set a new password, then you’ll return to your notebook.' : 'Accounts are ready for early access. Cloud sync is enabled for signed-in workspaces.'}</p>

        <div className="auth-form auth-form-page">
          {mode !== 'reset' && <label><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" autoComplete="email" onKeyDown={(event) => { if (event.key === 'Enter' && mode === 'forgot') submit(); }} /></label>}
          {mode !== 'forgot' && <label>{mode === 'reset' ? <KeyRound size={16} /> : <LogIn size={16} />}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'reset' ? 'New password' : 'Password'} autoComplete={mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} /></label>}
          <button className="new auth-submit" onClick={submit} disabled={busy}>{mode === 'register' ? <UserPlus size={16} /> : mode === 'forgot' || mode === 'reset' ? <KeyRound size={16} /> : <LogIn size={16} />}{busy ? 'Working…' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : 'Sign in'}</button>
          {mode === 'sign-in' && <button className="link-button" onClick={() => { setMode('forgot'); setMessage(null); setPassword(''); }}>Forgot your password?</button>}
          {mode !== 'reset' && <button className="link-button" onClick={() => { setMode(mode === 'register' ? 'sign-in' : 'register'); setMessage(null); setPassword(''); }}>
            {mode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Register'}
          </button>}
          {mode === 'forgot' && <button className="link-button" onClick={() => { setMode('sign-in'); setMessage(null); }}>Back to sign in</button>}
          {message && <p className="auth-message">{message}</p>}
        </div>
      </section>
    </main>
  );
}
