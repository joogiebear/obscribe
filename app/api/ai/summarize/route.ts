import { createDecipheriv, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

type AiProvider = 'openai' | 'anthropic' | 'google' | 'xai';
type EncryptedVault = { version: 1; alg: 'aes-256-gcm'; iv: string; tag: string; ciphertext: string };
type AuthResult = { client: SupabaseClient; userId: string } | { error: NextResponse };
type KeyResult = { provider: AiProvider; apiKey: string } | { error: NextResponse };

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

function decryptApiKey(vault: EncryptedVault) {
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(vault.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(vault.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

async function authedClient(request: NextRequest): Promise<AuthResult> {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return { error: json({ error: 'Sign in before using AI actions.' }, 401) };
  const client = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: 'Your session expired. Sign in again before using AI actions.' }, 401) };
  return { client, userId: data.user.id };
}

async function loadProviderKey(request: NextRequest): Promise<KeyResult> {
  const auth = await authedClient(request);
  if ('error' in auth) return auth;
  const { data, error } = await auth.client.from('user_ai_vaults').select('provider, encrypted_vault').eq('user_id', auth.userId).maybeSingle();
  if (error) return { error: json({ error: `AI key sync is not ready: ${error.message}` }, 503) };
  if (!data) return { error: json({ error: 'Add and sync an AI provider key in Settings first.' }, 400) };
  return { provider: data.provider as AiProvider, apiKey: decryptApiKey(data.encrypted_vault as EncryptedVault) };
}

async function summarizeWithOpenAI(apiKey: string, title: string, text: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: 'You summarize notebook pages clearly and concisely. Return only the summary text. Use short bullets when useful.' },
        { role: 'user', content: `Title: ${title || 'Untitled'}\n\nPage text:\n${text.slice(0, 24000)}` }
      ],
      max_output_tokens: 450
    })
  });
  const payload = await response.json().catch(() => null) as { output_text?: string; error?: { message?: string }; output?: Array<{ content?: Array<{ text?: string }> }> } | null;
  if (!response.ok) throw new Error(payload?.error?.message || 'OpenAI summarize request failed.');
  const fromOutput = payload?.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join('\n').trim();
  return (payload?.output_text || fromOutput || '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { title?: string; text?: string };
    const text = body.text?.trim() ?? '';
    if (text.length < 20) return json({ error: 'Write a little more on this page before summarizing.' }, 400);
    const key = await loadProviderKey(request);
    if ('error' in key) return key.error;
    if (key.provider !== 'openai') return json({ error: 'Summarize is currently wired for OpenAI keys first. Other providers are next.' }, 400);
    const summary = await summarizeWithOpenAI(key.apiKey, body.title ?? 'Untitled', text);
    if (!summary) return json({ error: 'OpenAI returned an empty summary. Try again.' }, 502);
    return json({ summary, provider: key.provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not summarize this page.';
    return json({ error: message }, 500);
  }
}
