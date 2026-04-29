'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { CreditCard, Database, KeyRound, LogIn, LogOut, Palette, Save, Settings, UserCircle, UserPlus, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function avatarLabel(email?: string, name?: string) {
  return (name?.[0] || email?.[0] || 'O').toUpperCase();
}

function userName(user: User | null) {
  return typeof user?.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : '';
}

function userAvatar(user: User | null) {
  return typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '';
}

export default function AuthPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setDisplayName(userName(user));
    setAvatarUrl(userAvatar(user));
  }, [user]);

  async function saveProfile() {
    if (!supabase) return;
    setSettingsBusy(true);
    setSettingsMessage(null);
    const { data, error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim(), avatar_url: avatarUrl.trim() } });
    setSettingsBusy(false);
    if (error) {
      setSettingsMessage(error.message);
      return;
    }
    setUser(data.user ?? user);
    setSettingsMessage('Profile updated.');
  }

  async function changePassword() {
    if (!supabase || !newPassword) return;
    setSettingsBusy(true);
    setSettingsMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSettingsBusy(false);
    if (error) {
      setSettingsMessage(error.message);
      return;
    }
    setNewPassword('');
    setSettingsMessage('Password updated.');
  }

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
    const name = userName(user);
    const avatar = userAvatar(user);
    return (
      <>
        <section className="sidebar-account">
          <div className="account-main">
            <div className="avatar">{avatar ? <img src={avatar} alt="" /> : avatarLabel(user.email, name)}</div>
            <div className="account-copy">
              <strong title={name || user.email}>{name || user.email}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="sidebar-auth-actions">
            <button className="sidebar-auth-button" onClick={() => setSettingsOpen(true)}><Settings size={14} /> Settings</button>
            <button className="sidebar-auth-button" onClick={signOut}><LogOut size={14} /> Sign out</button>
          </div>
          {message && <small>{message}</small>}
        </section>

        {settingsOpen && (
          <div className="modal-backdrop settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
            <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="settings-header">
                <div>
                  <p className="eyebrow">Account</p>
                  <h2>User settings</h2>
                  <p>Profile, security, plan, and workspace preferences.</p>
                </div>
                <button className="icon-danger" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18} /></button>
              </div>

              <div className="settings-grid">
                <section className="settings-card profile-card">
                  <div className="settings-card-title"><UserCircle size={18} /><h3>Profile</h3></div>
                  <div className="profile-preview">
                    <div className="avatar large">{avatarUrl ? <img src={avatarUrl} alt="" /> : avatarLabel(user.email, displayName)}</div>
                    <div><strong>{displayName || 'Obscribe user'}</strong><span>{user.email}</span></div>
                  </div>
                  <label className="modal-field">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="What should Obscribe call you?" /></label>
                  <label className="modal-field">Avatar image URL<input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://example.com/avatar.png" /></label>
                  <button className="new" onClick={saveProfile} disabled={settingsBusy}><Save size={16} /> Save profile</button>
                </section>

                <section className="settings-card">
                  <div className="settings-card-title"><KeyRound size={18} /><h3>Security</h3></div>
                  <p>Change your password for this Obscribe account.</p>
                  <label className="modal-field">New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" autoComplete="new-password" /></label>
                  <button className="ghost-button" onClick={changePassword} disabled={settingsBusy || !newPassword}>Update password</button>
                </section>

                <section className="settings-card">
                  <div className="settings-card-title"><CreditCard size={18} /><h3>Plan</h3></div>
                  <p><strong>Cloud Alpha</strong></p>
                  <p>Billing and subscription management will live here when paid sync/AI plans are ready.</p>
                  <button className="ghost-button" disabled>Manage subscription soon</button>
                </section>

                <section className="settings-card">
                  <div className="settings-card-title"><Database size={18} /><h3>Workspace</h3></div>
                  <p>Your signed-in notebooks sync to Supabase. Signed-out workspaces stay local to this browser.</p>
                  <button className="ghost-button" disabled>Export data soon</button>
                </section>

                <section className="settings-card">
                  <div className="settings-card-title"><Palette size={18} /><h3>Preferences</h3></div>
                  <p>Theme, editor density, accent color, and writing preferences belong here next.</p>
                  <button className="ghost-button" disabled>Customize soon</button>
                </section>
              </div>
              {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
            </section>
          </div>
        )}
      </>
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
