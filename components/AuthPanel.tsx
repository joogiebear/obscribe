'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { LogIn, LogOut, UserPlus } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function avatarLabel(email?: string) {
  return (email?.[0] ?? 'O').toUpperCase();
}

export default function AuthPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage('Local only on this device.');
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="sidebar-account muted">
        <div className="avatar">O</div>
        <div className="account-copy">
          <strong>Local only</strong>
          <span>Supabase not configured</span>
        </div>
      </section>
    );
  }

  if (user) {
    return (
      <section className="sidebar-account">
        <div className="account-main">
          <div className="avatar">{avatarLabel(user.email)}</div>
          <div className="account-copy">
            <strong title={user.email}>{user.email}</strong>
            <span>Cloud Alpha enabled</span>
          </div>
        </div>
        <button className="sidebar-auth-button" onClick={signOut}><LogOut size={14} /> Sign out</button>
        {message && <small>{message}</small>}
      </section>
    );
  }

  return (
    <section className="sidebar-account">
      <div className="account-main">
        <div className="avatar">O</div>
        <div className="account-copy">
          <strong>Local workspace</strong>
          <span>Sign in for Cloud Alpha</span>
        </div>
      </div>
      <div className="sidebar-auth-actions">
        <button className="sidebar-auth-button" onClick={() => router.push('/auth?mode=sign-in')}><LogIn size={14} /> Sign in</button>
        <button className="sidebar-auth-button primary" onClick={() => router.push('/auth?mode=register')}><UserPlus size={14} /> Register</button>
      </div>
    </section>
  );
}
