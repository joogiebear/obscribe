'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { LogIn, LogOut, UserPlus } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

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
    setMessage('Signed out. You are back to local-only mode on this device.');
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="account-strip muted-card">
        <span>Accounts unlock after Supabase env vars are added.</span>
      </section>
    );
  }

  if (user) {
    return (
      <section className="account-strip">
        <span><strong>{user.email}</strong> · Cloud Alpha enabled</span>
        <button className="ghost-button compact" onClick={signOut}><LogOut size={15} /> Sign out</button>
        {message && <small>{message}</small>}
      </section>
    );
  }

  return (
    <section className="account-strip">
      <span>Want early access sync later? Create an account.</span>
      <div className="account-actions">
        <button className="ghost-button compact" onClick={() => router.push('/auth?mode=sign-in')}><LogIn size={15} /> Sign in</button>
        <button className="new compact" onClick={() => router.push('/auth?mode=register')}><UserPlus size={15} /> Register</button>
      </div>
    </section>
  );
}
