import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AiProvider = 'openai' | 'anthropic' | 'google' | 'xai';
type EncryptedVault = { version: 1; alg: 'aes-256-gcm'; iv: string; tag: string; ciphertext: string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const vaultSecret = process.env.AI_VAULT_ENCRYPTION_KEY;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function keyBytes() {
  if (!vaultSecret || vaultSecret.length < 32) throw new Error('AI_VAULT_ENCRYPTION_KEY must be set to at least 32 characters.');
  return createHash('sha256').update(vaultSecret).digest();
}

function encryptApiKey(apiKey: string): EncryptedVault {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { version: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: tag.toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function decryptApiKey(vault: EncryptedVault) {
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(vault.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(vault.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

async function authedClient(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return { error: json({ error: 'Sign in before syncing an AI key.' }, 401) };
  const client = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: 'Your session expired. Sign in again before syncing an AI key.' }, 401) };
  return { client, userId: data.user.id };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authedClient(request);
    if ('error' in auth) return auth.error;
    const { data, error } = await auth.client.from('user_ai_vaults').select('provider, encrypted_vault, updated_at').eq('user_id', auth.userId).maybeSingle();
    if (error) return json({ error: `AI key sync is not ready: ${error.message}` }, 503);
    if (!data) return json({ connected: false });
    const apiKey = decryptApiKey(data.encrypted_vault as EncryptedVault);
    return json({ connected: true, provider: data.provider, apiKey, updatedAt: data.updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load synced AI key.';
    return json({ error: message }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authedClient(request);
    if ('error' in auth) return auth.error;
    const body = await request.json() as { provider?: AiProvider; apiKey?: string };
    if (!body.provider || !['openai', 'anthropic', 'google', 'xai'].includes(body.provider)) return json({ error: 'Choose a valid AI provider.' }, 400);
    if (!body.apiKey?.trim()) return json({ error: 'Paste an API key before saving.' }, 400);
    const encryptedVault = encryptApiKey(body.apiKey.trim());
    const { error } = await auth.client.from('user_ai_vaults').upsert({ user_id: auth.userId, provider: body.provider, encrypted_vault: encryptedVault, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return json({ error: `AI key sync is not ready: ${error.message}` }, 503);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not sync AI key.';
    return json({ error: message }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authedClient(request);
    if ('error' in auth) return auth.error;
    const { error } = await auth.client.from('user_ai_vaults').delete().eq('user_id', auth.userId);
    if (error) return json({ error: `Could not remove synced AI key: ${error.message}` }, 503);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove synced AI key.';
    return json({ error: message }, 503);
  }
}
