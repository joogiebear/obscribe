'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { CreditCard, Database, KeyRound, LogIn, LogOut, Palette, Save, Settings, Sparkles, Trash2, UserCircle, UserPlus, X } from 'lucide-react';
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

function accountName(user: User | null) {
  const name = userName(user).trim();
  if (name) return name;
  const email = user?.email ?? '';
  return email.includes('@') ? email.split('@')[0] : 'Obscribe user';
}

type AiProvider = 'openai' | 'anthropic' | 'google' | 'xai';

const aiProviderLabels: Record<AiProvider, string> = {
  openai: 'OpenAI / ChatGPT API',
  anthropic: 'Anthropic / Claude API',
  google: 'Google / Gemini API',
  xai: 'xAI / Grok API'
};

const aiProviderKeyLinks: Record<AiProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/app/apikey',
  xai: 'https://console.x.ai/'
};

type AiKeyVault = { version: 1; provider: AiProvider; salt: string; iv: string; ciphertext: string };
const aiVaultKey = 'obscribe-ai-key-vault';
const legacyAiProviderKey = 'obscribe-ai-provider';
const legacyAiApiKey = 'obscribe-ai-api-key';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveVaultKey(passphrase: string, salt: BufferSource) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptAiKey(provider: AiProvider, apiKey: string, passphrase: string): Promise<AiKeyVault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt.buffer as ArrayBuffer);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, new TextEncoder().encode(apiKey)));
  return { version: 1, provider, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decryptAiKey(vault: AiKeyVault, passphrase: string) {
  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const key = await deriveVaultKey(passphrase, salt.buffer as ArrayBuffer);
  const ciphertext = base64ToBytes(vault.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ciphertext.buffer as ArrayBuffer);
  return new TextDecoder().decode(plaintext);
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
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiPassphrase, setAiPassphrase] = useState('');
  const [hasSavedAiKey, setHasSavedAiKey] = useState(false);
  const [aiKeyUnlocked, setAiKeyUnlocked] = useState(false);

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

  useEffect(() => {
    if (!settingsOpen) return;
    const vaultRaw = localStorage.getItem(aiVaultKey);
    const legacyProvider = localStorage.getItem(legacyAiProviderKey) as AiProvider | null;
    const legacyKey = localStorage.getItem(legacyAiApiKey) ?? '';
    if (vaultRaw) {
      try {
        const vault = JSON.parse(vaultRaw) as AiKeyVault;
        if (vault.provider in aiProviderLabels) setAiProvider(vault.provider);
        setHasSavedAiKey(true);
        setAiApiKey('');
        setAiKeyUnlocked(false);
        return;
      } catch {
        localStorage.removeItem(aiVaultKey);
      }
    }
    if (legacyProvider && legacyProvider in aiProviderLabels) setAiProvider(legacyProvider);
    setAiApiKey(legacyKey);
    setHasSavedAiKey(Boolean(legacyKey));
    setAiKeyUnlocked(Boolean(legacyKey));
    if (legacyKey) setSettingsMessage('Existing AI key found. Save it with a passphrase to encrypt it.');
  }, [settingsOpen]);

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

  async function saveAiSettings() {
    if (!aiApiKey.trim()) return;
    if (aiPassphrase.length < 8) {
      setSettingsMessage('Use an encryption passphrase with at least 8 characters.');
      return;
    }
    setSettingsBusy(true);
    setSettingsMessage(null);
    try {
      const vault = await encryptAiKey(aiProvider, aiApiKey.trim(), aiPassphrase);
      localStorage.setItem(aiVaultKey, JSON.stringify(vault));
      localStorage.removeItem(legacyAiProviderKey);
      localStorage.removeItem(legacyAiApiKey);
      setHasSavedAiKey(true);
      setAiKeyUnlocked(true);
      setSettingsMessage(`${aiProviderLabels[aiProvider]} encrypted and saved on this device.`);
    } catch {
      setSettingsMessage('Could not encrypt AI key in this browser.');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function unlockAiSettings() {
    const vaultRaw = localStorage.getItem(aiVaultKey);
    if (!vaultRaw) return;
    if (!aiPassphrase) {
      setSettingsMessage('Enter your AI vault passphrase to unlock the saved key.');
      return;
    }
    setSettingsBusy(true);
    setSettingsMessage(null);
    try {
      const vault = JSON.parse(vaultRaw) as AiKeyVault;
      const decrypted = await decryptAiKey(vault, aiPassphrase);
      setAiProvider(vault.provider);
      setAiApiKey(decrypted);
      setAiKeyUnlocked(true);
      setSettingsMessage('AI key unlocked for this session.');
    } catch {
      setSettingsMessage('Could not unlock AI key. Check your passphrase.');
    } finally {
      setSettingsBusy(false);
    }
  }

  function clearAiSettings() {
    localStorage.removeItem(aiVaultKey);
    localStorage.removeItem(legacyAiProviderKey);
    localStorage.removeItem(legacyAiApiKey);
    setAiProvider('openai');
    setAiApiKey('');
    setAiPassphrase('');
    setHasSavedAiKey(false);
    setAiKeyUnlocked(false);
    setSettingsMessage('AI provider key removed from this device.');
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
    const visibleName = accountName(user);
    const avatar = userAvatar(user);
    return (
      <>
        <section className="sidebar-account">
          <div className="account-main">
            <div className="avatar">{avatar ? <img src={avatar} alt="" /> : avatarLabel(user.email, name)}</div>
            <div className="account-copy">
              <strong title={visibleName}>{visibleName}</strong>
              <span>Free Alpha plan</span>
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
                    <div className="avatar large">{avatarUrl ? <img src={avatarUrl} alt="" /> : avatarLabel(user.email, displayName || visibleName)}</div>
                    <div><strong>{displayName || visibleName}</strong><span>Profile visible in Obscribe</span></div>
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

                <section className="settings-card ai-card">
                  <div className="settings-card-title"><Sparkles size={18} /><h3>AI provider</h3></div>
                  <p>Bring your own API key for AI features. Usage is billed by your provider, not Obscribe.</p>
                  <label className="modal-field">Provider
                    <select value={aiProvider} onChange={(event) => setAiProvider(event.target.value as AiProvider)}>
                      {Object.entries(aiProviderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <a className="provider-key-link" href={aiProviderKeyLinks[aiProvider]} target="_blank" rel="noreferrer">Get an API key for {aiProviderLabels[aiProvider]}</a>
                  <label className="modal-field">API key<input type="password" value={aiApiKey} onChange={(event) => { setAiApiKey(event.target.value); setAiKeyUnlocked(Boolean(event.target.value)); }} placeholder={hasSavedAiKey && !aiKeyUnlocked ? 'Encrypted key saved — unlock to view or replace' : 'Paste provider API key'} autoComplete="off" /></label>
                  <label className="modal-field">Encryption passphrase<input type="password" value={aiPassphrase} onChange={(event) => setAiPassphrase(event.target.value)} placeholder="Not saved by Obscribe" autoComplete="off" /></label>
                  <p className="settings-note">Alpha note: the API key is encrypted with your passphrase before being stored locally in this browser. Obscribe does not save the passphrase, so you’ll need it to unlock the key on this device.</p>
                  <div className="settings-actions"><button className="new" onClick={saveAiSettings} disabled={settingsBusy || !aiApiKey.trim()}><Save size={16} /> Encrypt & save</button><button className="ghost-button" onClick={unlockAiSettings} disabled={settingsBusy || !hasSavedAiKey || !aiPassphrase}>Unlock</button><button className="ghost-button" onClick={clearAiSettings} disabled={!hasSavedAiKey && !aiApiKey}><Trash2 size={16} /> Remove</button></div>
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
