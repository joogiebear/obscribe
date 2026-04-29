'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { LogIn, LogOut, Mail, UserPlus } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'register';

export default function AuthPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

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
      setMessage('Check your email to confirm your account.');
    } else {
      setMessage(mode === 'register' ? 'Account created.' : 'Signed in.');
    }
    setPassword('');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage('Signed out. Your notes are still stored locally in this browser.');
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="auth-card muted-card">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Registration ready</h2>
          <p>Add Supabase env vars in Vercel to enable sign up and login.</p>
        </div>
      </section>
    );
  }

  if (user) {
    return (
      <section className="auth-card">
        <div>
          <p className="eyebrow">Signed in</p>
          <h2>{user.email}</h2>
          <p>Cloud sync is next; this alpha still saves notes locally.</p>
        </div>
        <button className="ghost-button" onClick={signOut}><LogOut size={16} /> Sign out</button>
      </section>
    );
  }

  return (
    <section className="auth-card">
      <div>
        <p className="eyebrow">Accounts</p>
        <h2>{mode === 'register' ? 'Create your Obscribe account' : 'Sign in to Obscribe'}</h2>
        <p>Registration is for early access now. Sync comes next.</p>
      </div>
      <div className="auth-form">
        <label><Mail size={15} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" autoComplete="email" /></label>
        <label><LogIn size={15} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} /></label>
        <button className="new" onClick={submit} disabled={busy}>{mode === 'register' ? <UserPlus size={16} /> : <LogIn size={16} />}{busy ? 'Working…' : mode === 'register' ? 'Register' : 'Sign in'}</button>
        <button className="link-button" onClick={() => { setMode(mode === 'register' ? 'sign-in' : 'register'); setMessage(null); }}>
          {mode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Register'}
        </button>
        {message && <p className="auth-message">{message}</p>}
      </div>
    </section>
  );
}
