<?php

declare(strict_types=1);

header('Content-Type: application/json');

function json_response(mixed $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function env_value(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function bool_env(string $key, bool $default = false): bool
{
    $value = env_value($key);
    if ($value === null || trim($value) === '') {
        return $default;
    }

    return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
}

function app_url(): string
{
    return rtrim((string) env_value('APP_URL', 'http://localhost'), '/');
}

function origin_from_url(?string $url): ?string
{
    if (!$url) {
        return null;
    }

    $scheme = parse_url($url, PHP_URL_SCHEME);
    $host = parse_url($url, PHP_URL_HOST);
    $port = parse_url($url, PHP_URL_PORT);

    if (!$scheme || !$host) {
        return null;
    }

    $origin = "{$scheme}://{$host}";
    if ($port) {
        $origin .= ":{$port}";
    }

    return $origin;
}

function configure_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = array_filter(array_unique([
        origin_from_url(env_value('APP_URL')),
        origin_from_url(env_value('NEXT_PUBLIC_APP_URL')),
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]));

    if ($origin !== '') {
        header('Vary: Origin');
        if (in_array($origin, $allowed, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
        } elseif (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(403);
            exit;
        }
    }

    header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

configure_cors();

function header_safe(string $value): string
{
    return trim(str_replace(["\r", "\n"], '', $value));
}

function smtp_read_response($socket): array
{
    $lines = [];

    while (($line = fgets($socket, 515)) !== false) {
        $lines[] = rtrim($line, "\r\n");
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }

    $last = end($lines) ?: '000 SMTP response missing';
    return [(int) substr($last, 0, 3), implode("\n", $lines)];
}

function smtp_command($socket, string $command, array $expected): string
{
    fwrite($socket, $command . "\r\n");
    [$code, $response] = smtp_read_response($socket);

    if (!in_array($code, $expected, true)) {
        throw new RuntimeException("SMTP command failed: {$response}");
    }

    return $response;
}

function smtp_send_message(string $to, string $subject, string $body): void
{
    $host = env_value('MAIL_HOST', '');
    if (!$host) {
        throw new RuntimeException('MAIL_HOST is not configured.');
    }

    $port = (int) env_value('MAIL_PORT', '587');
    $username = env_value('MAIL_USERNAME', '');
    $password = env_value('MAIL_PASSWORD', '');
    $encryption = strtolower((string) env_value('MAIL_ENCRYPTION', 'tls'));
    $fromAddress = header_safe((string) env_value('MAIL_FROM_ADDRESS', 'no-reply@obscribe.local'));
    $fromName = header_safe((string) env_value('MAIL_FROM_NAME', 'Obscribe'));
    $transport = $encryption === 'ssl' ? "ssl://{$host}" : $host;

    $socket = stream_socket_client(
        "{$transport}:{$port}",
        $errno,
        $errstr,
        20,
        STREAM_CLIENT_CONNECT,
    );

    if (!$socket) {
        throw new RuntimeException("Unable to connect to SMTP server: {$errstr}");
    }

    stream_set_timeout($socket, 20);
    [$code, $response] = smtp_read_response($socket);
    if ($code !== 220) {
        fclose($socket);
        throw new RuntimeException("SMTP greeting failed: {$response}");
    }

    try {
        $serverName = parse_url((string) env_value('APP_URL', 'http://localhost'), PHP_URL_HOST) ?: 'obscribe.local';
        smtp_command($socket, "EHLO {$serverName}", [250]);

        if ($encryption === 'tls') {
            smtp_command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Unable to start SMTP TLS encryption.');
            }
            smtp_command($socket, "EHLO {$serverName}", [250]);
        }

        if ($username !== '') {
            smtp_command($socket, 'AUTH LOGIN', [334]);
            smtp_command($socket, base64_encode($username), [334]);
            smtp_command($socket, base64_encode((string) $password), [235]);
        }

        smtp_command($socket, "MAIL FROM:<{$fromAddress}>", [250]);
        smtp_command($socket, "RCPT TO:<{$to}>", [250, 251]);
        smtp_command($socket, 'DATA', [354]);

        $headers = [
            "From: {$fromName} <{$fromAddress}>",
            "To: <" . header_safe($to) . ">",
            'Subject: ' . header_safe($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
        ];
        $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n.", "\n..", $body);
        fwrite($socket, $message . "\r\n.\r\n");

        [$dataCode, $dataResponse] = smtp_read_response($socket);
        if (!in_array($dataCode, [250], true)) {
            throw new RuntimeException("SMTP message failed: {$dataResponse}");
        }

        smtp_command($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function send_welcome_email(array $user): array
{
    $mailer = strtolower((string) env_value('MAIL_MAILER', 'log'));
    $subject = 'Welcome to Obscribe';
    $body = "Hi {$user['name']},\n\nYour Obscribe workspace is ready.\n\n" .
        "Open " . app_url() . " to start writing.\n";

    if ($mailer !== 'smtp') {
        error_log("Mail log: {$subject} -> {$user['email']}");
        return ['sent' => false, 'driver' => $mailer, 'message' => 'Mail is using the log driver.'];
    }

    try {
        smtp_send_message($user['email'], $subject, $body);
        return ['sent' => true, 'driver' => 'smtp'];
    } catch (Throwable $exception) {
        error_log('SMTP send failed: ' . $exception->getMessage());
        return ['sent' => false, 'driver' => 'smtp', 'message' => 'SMTP send failed. Check API logs.'];
    }
}

function send_test_email(array $user): array
{
    $mailer = strtolower((string) env_value('MAIL_MAILER', 'log'));
    $subject = 'Obscribe SMTP test';
    $body = "Hi {$user['name']},\n\nSMTP is working for this Obscribe install.\n\n" .
        "App URL: " . app_url() . "\n";

    if ($mailer !== 'smtp') {
        return ['sent' => false, 'driver' => $mailer, 'message' => 'Mail is using the log driver.'];
    }

    try {
        smtp_send_message($user['email'], $subject, $body);
        return ['sent' => true, 'driver' => 'smtp'];
    } catch (Throwable $exception) {
        error_log('SMTP test failed: ' . $exception->getMessage());
        return ['sent' => false, 'driver' => 'smtp', 'message' => $exception->getMessage()];
    }
}

function password_reset_ttl_minutes(): int
{
    $ttl = (int) env_value('PASSWORD_RESET_TTL_MINUTES', '60');
    return max(10, min(1440, $ttl));
}

function password_reset_link(string $token): string
{
    $base = trim((string) env_value('PASSWORD_RESET_URL', ''));
    if ($base === '') {
        $base = app_url() . '/';
    }

    $separator = str_contains($base, '?') ? '&' : '?';
    return $base . $separator . 'reset_token=' . rawurlencode($token);
}

function create_password_reset_token(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = gmdate(DATE_ATOM, time() + (password_reset_ttl_minutes() * 60));
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $pdo->prepare(
            'UPDATE password_reset_tokens
             SET used_at = now()
             WHERE user_id = :user_id AND used_at IS NULL',
        )->execute(['user_id' => $userId]);

        $stmt = $pdo->prepare(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES (:user_id, :token_hash, :expires_at)',
        );
        $stmt->execute([
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
            'expires_at' => $expiresAt,
        ]);

        $pdo->commit();
        return $token;
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function send_password_reset_email(array $user, string $token): void
{
    $mailer = strtolower((string) env_value('MAIL_MAILER', 'log'));
    $subject = 'Reset your Obscribe password';
    $ttl = password_reset_ttl_minutes();
    $link = password_reset_link($token);
    $body = "Hi {$user['name']},\n\nUse this link to reset your Obscribe password:\n{$link}\n\n" .
        "This link expires in {$ttl} minutes. If you did not request it, you can ignore this email.\n";

    if ($mailer !== 'smtp') {
        error_log("Mail log: {$subject} -> {$user['email']} ({$link})");
        return;
    }

    smtp_send_message($user['email'], $subject, $body);
}

function verification_link(string $token): string
{
    return app_url() . '/?verify_token=' . rawurlencode($token);
}

function send_email_verification_email(array $user, string $token): array
{
    $mailer = strtolower((string) env_value('MAIL_MAILER', 'log'));
    $subject = 'Verify your Obscribe email';
    $link = verification_link($token);
    $body = "Hi {$user['name']},\n\nVerify your email to activate your Obscribe workspace:\n{$link}\n\n" .
        "If you did not create this account, you can ignore this email.\n";

    if ($mailer !== 'smtp') {
        error_log("Mail log: {$subject} -> {$user['email']} ({$link})");
        return ['sent' => false, 'driver' => $mailer, 'message' => 'Mail is using the log driver.'];
    }

    try {
        smtp_send_message($user['email'], $subject, $body);
        return ['sent' => true, 'driver' => 'smtp'];
    } catch (Throwable $exception) {
        error_log('Verification email failed: ' . $exception->getMessage());
        return ['sent' => false, 'driver' => 'smtp', 'message' => 'Verification email failed. Check API logs.'];
    }
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = env_value('DB_HOST', 'db');
    $port = env_value('DB_PORT', '5432');
    $database = env_value('DB_DATABASE', 'obscribe');
    $username = env_value('DB_USERNAME', 'obscribe');
    $password = env_value('DB_PASSWORD', 'secret');

    $pdo = new PDO(
        "pgsql:host={$host};port={$port};dbname={$database}",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ],
    );

    return $pdo;
}

function migrate(): void
{
    static $migrated = false;
    if ($migrated) {
        return;
    }

    $schema = <<<SQL
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS workspaces (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS notebooks (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notebooks_workspace_updated_idx ON notebooks (workspace_id, pinned_at DESC NULLS LAST, updated_at DESC);

CREATE TABLE IF NOT EXISTS notes (
    id BIGSERIAL PRIMARY KEY,
    notebook_id BIGINT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_notebook_updated_idx ON notes (notebook_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS api_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_created_idx ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_created_idx ON email_verification_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx ON email_verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS invite_codes (
    id BIGSERIAL PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    email TEXT,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_codes_created_idx ON invite_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits (reset_at);

CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_name TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx ON analytics_events (event_name, created_at DESC);
SQL;

    db()->exec($schema);
    $migrated = true;
}

function input(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(['message' => 'Request body must be valid JSON.'], 422);
    }

    return $data;
}

function route_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = preg_replace('#^/api#', '', $path) ?: '/';
    return '/' . trim($path, '/');
}

function require_fields(array $data, array $fields): void
{
    foreach ($fields as $field) {
        if (!isset($data[$field]) || trim((string) $data[$field]) === '') {
            json_response(['message' => "{$field} is required."], 422);
        }
    }
}

function client_ip(): string
{
    $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($forwarded !== '') {
        return trim(explode(',', $forwarded)[0]);
    }

    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function rate_limit(string $scope, int $limit, int $windowSeconds): void
{
    $key = hash('sha256', $scope . '|' . client_ip());
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $pdo->prepare('DELETE FROM rate_limits WHERE reset_at < now()')->execute();
        $stmt = $pdo->prepare('SELECT hits, reset_at FROM rate_limits WHERE key = :key FOR UPDATE');
        $stmt->execute(['key' => $key]);
        $bucket = $stmt->fetch();

        if (!$bucket) {
            $resetAt = gmdate(DATE_ATOM, time() + $windowSeconds);
            $stmt = $pdo->prepare(
                'INSERT INTO rate_limits (key, hits, reset_at)
                 VALUES (:key, 1, :reset_at)',
            );
            $stmt->execute(['key' => $key, 'reset_at' => $resetAt]);
            $pdo->commit();
            return;
        }

        if ((int) $bucket['hits'] >= $limit) {
            $pdo->rollBack();
            json_response(['message' => 'Too many attempts. Please wait and try again.'], 429);
        }

        $stmt = $pdo->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE key = :key');
        $stmt->execute(['key' => $key]);
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function registration_mode(): string
{
    $mode = strtolower(trim((string) env_value('REGISTRATION_MODE', 'open')));
    return in_array($mode, ['open', 'invite', 'closed'], true) ? $mode : 'open';
}

function email_verification_required(): bool
{
    return bool_env('EMAIL_VERIFICATION_REQUIRED', false);
}

function admin_emails(): array
{
    $value = trim((string) env_value('ADMIN_EMAILS', ''));
    if ($value === '') {
        return [];
    }

    return array_values(array_filter(array_map(
        static fn (string $email): string => strtolower(trim($email)),
        explode(',', $value),
    )));
}

function is_admin_user(array $user): bool
{
    return in_array(strtolower(trim((string) $user['email'])), admin_emails(), true);
}

function require_admin(array $user): void
{
    if (!is_admin_user($user)) {
        json_response(['message' => 'Admin access required.'], 403);
    }
}

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'is_admin' => is_admin_user($user),
        'email_verified' => !empty($user['email_verified_at']),
        'disabled' => !empty($user['disabled_at']),
    ];
}

function create_email_verification_token(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = gmdate(DATE_ATOM, time() + (24 * 60 * 60));
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $pdo->prepare(
            'UPDATE email_verification_tokens
             SET used_at = now()
             WHERE user_id = :user_id AND used_at IS NULL',
        )->execute(['user_id' => $userId]);

        $stmt = $pdo->prepare(
            'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
             VALUES (:user_id, :token_hash, :expires_at)',
        );
        $stmt->execute([
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
            'expires_at' => $expiresAt,
        ]);

        $pdo->commit();
        return $token;
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function invite_code_hash(string $code): string
{
    return hash('sha256', strtoupper(trim($code)));
}

function consume_invite_code(?string $code, string $email): ?array
{
    if ($code === null || trim($code) === '') {
        json_response(['message' => 'Invite code is required.'], 422);
    }

    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT *
         FROM invite_codes
         WHERE code_hash = :code_hash
           AND disabled_at IS NULL
           AND used_count < max_uses
           AND (expires_at IS NULL OR expires_at > now())
         LIMIT 1
         FOR UPDATE',
    );
    $stmt->execute(['code_hash' => invite_code_hash($code)]);
    $invite = $stmt->fetch();

    if (!$invite) {
        json_response(['message' => 'Invite code is invalid or expired.'], 422);
    }

    if (!empty($invite['email']) && strtolower((string) $invite['email']) !== strtolower(trim($email))) {
        json_response(['message' => 'Invite code is assigned to a different email.'], 422);
    }

    $pdo->prepare('UPDATE invite_codes SET used_count = used_count + 1 WHERE id = :id')
        ->execute(['id' => $invite['id']]);

    return $invite;
}

function track_event(string $eventName, ?int $userId = null, array $metadata = []): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO analytics_events (user_id, event_name, metadata)
             VALUES (:user_id, :event_name, CAST(:metadata AS jsonb))',
        );
        $stmt->execute([
            'user_id' => $userId,
            'event_name' => $eventName,
            'metadata' => json_encode($metadata, JSON_UNESCAPED_SLASHES),
        ]);
    } catch (Throwable $exception) {
        error_log('Analytics event failed: ' . $exception->getMessage());
    }
}

function mail_config_status(): array
{
    $driver = strtolower((string) env_value('MAIL_MAILER', 'log'));
    return [
        'driver' => $driver,
        'host' => env_value('MAIL_HOST', ''),
        'from' => env_value('MAIL_FROM_ADDRESS', ''),
        'configured' => $driver === 'smtp'
            && trim((string) env_value('MAIL_HOST', '')) !== ''
            && trim((string) env_value('MAIL_FROM_ADDRESS', '')) !== '',
    ];
}

function latest_backup_file(): ?array
{
    $dir = rtrim((string) env_value('BACKUP_DIR', '/backups'), '/');
    if (!is_dir($dir)) {
        return null;
    }

    $files = glob($dir . '/obscribe-backup-*.tar.gz') ?: [];
    if (!$files) {
        return null;
    }

    usort($files, static fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));
    $file = $files[0];
    return [
        'name' => basename($file),
        'path' => $file,
        'size' => filesize($file) ?: 0,
        'created_at' => gmdate(DATE_ATOM, filemtime($file) ?: time()),
    ];
}

function current_workspace(int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT w.id, w.name
         FROM workspaces w
         INNER JOIN workspace_memberships wm ON wm.workspace_id = w.id
         WHERE wm.user_id = :user_id
         ORDER BY w.id ASC
         LIMIT 1',
    );
    $stmt->execute(['user_id' => $userId]);
    $workspace = $stmt->fetch();

    return $workspace ?: null;
}

function issue_token(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $stmt = db()->prepare('INSERT INTO api_tokens (user_id, token_hash) VALUES (:user_id, :token_hash)');
    $stmt->execute([
        'user_id' => $userId,
        'token_hash' => hash('sha256', $token),
    ]);

    return $token;
}

function authenticated_user(): array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
        json_response(['message' => 'Unauthenticated.'], 401);
    }

    $stmt = db()->prepare(
        'SELECT u.*
         FROM users u
         INNER JOIN api_tokens t ON t.user_id = u.id
         WHERE t.token_hash = :token_hash
         LIMIT 1',
    );
    $stmt->execute(['token_hash' => hash('sha256', trim($matches[1]))]);
    $user = $stmt->fetch();

    if (!$user) {
        json_response(['message' => 'Unauthenticated.'], 401);
    }

    if (!empty($user['disabled_at'])) {
        json_response(['message' => 'This account has been disabled.'], 403);
    }

    db()->prepare('UPDATE api_tokens SET last_used_at = now() WHERE token_hash = :token_hash')
        ->execute(['token_hash' => hash('sha256', trim($matches[1]))]);
    db()->prepare('UPDATE users SET last_seen_at = now() WHERE id = :id')
        ->execute(['id' => $user['id']]);

    return $user;
}

function notebook_for_workspace(int $id, int $workspaceId): array
{
    $stmt = db()->prepare('SELECT * FROM notebooks WHERE id = :id AND workspace_id = :workspace_id LIMIT 1');
    $stmt->execute(['id' => $id, 'workspace_id' => $workspaceId]);
    $notebook = $stmt->fetch();

    if (!$notebook) {
        json_response(['message' => 'Notebook not found.'], 404);
    }

    return $notebook;
}

function note_for_workspace(int $id, int $workspaceId): array
{
    $stmt = db()->prepare(
        'SELECT notes.*
         FROM notes
         INNER JOIN notebooks ON notebooks.id = notes.notebook_id
         WHERE notes.id = :id AND notebooks.workspace_id = :workspace_id
         LIMIT 1',
    );
    $stmt->execute(['id' => $id, 'workspace_id' => $workspaceId]);
    $note = $stmt->fetch();

    if (!$note) {
        json_response(['message' => 'Note not found.'], 404);
    }

    return $note;
}

function import_timestamp(mixed $value): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }

    return gmdate(DATE_ATOM, $timestamp);
}

function workspace_export_payload(array $user, array $workspace): array
{
    $workspaceId = (int) $workspace['id'];
    $stmt = db()->prepare(
        'SELECT id, name
         FROM notebooks
         WHERE workspace_id = :workspace_id
         ORDER BY updated_at DESC, id DESC',
    );
    $stmt->execute(['workspace_id' => $workspaceId]);
    $notebooks = [];

    foreach ($stmt->fetchAll() as $notebook) {
        $notesStmt = db()->prepare(
            'SELECT content, created_at, updated_at
             FROM notes
             WHERE notebook_id = :notebook_id
             ORDER BY updated_at DESC, id DESC',
        );
        $notesStmt->execute(['notebook_id' => $notebook['id']]);

        $notebooks[] = [
            'name' => $notebook['name'],
            'notes' => array_map(
                static fn (array $note): array => [
                    'content' => $note['content'],
                    'created_at' => $note['created_at'],
                    'updated_at' => $note['updated_at'],
                ],
                $notesStmt->fetchAll(),
            ),
        ];
    }

    return [
        'version' => 1,
        'exported_at' => gmdate(DATE_ATOM),
        'user' => public_user($user),
        'workspace' => ['id' => $workspaceId, 'name' => $workspace['name']],
        'notebooks' => $notebooks,
    ];
}

function import_workspace_payload(array $data, int $workspaceId): array
{
    if (!isset($data['notebooks']) || !is_array($data['notebooks'])) {
        json_response(['message' => 'notebooks must be an array.'], 422);
    }

    if (count($data['notebooks']) > 200) {
        json_response(['message' => 'Import is limited to 200 notebooks.'], 422);
    }

    $notebooksToImport = [];
    $totalNotes = 0;
    foreach ($data['notebooks'] as $notebook) {
        if (!is_array($notebook)) {
            json_response(['message' => 'Each notebook must be an object.'], 422);
        }

        $name = trim((string) ($notebook['name'] ?? ''));
        if ($name === '') {
            json_response(['message' => 'Notebook name is required.'], 422);
        }

        $notes = $notebook['notes'] ?? [];
        if (!is_array($notes)) {
            json_response(['message' => 'Notebook notes must be an array.'], 422);
        }

        $totalNotes += count($notes);
        if ($totalNotes > 10000) {
            json_response(['message' => 'Import is limited to 10000 notes.'], 422);
        }

        $notesToImport = [];
        foreach ($notes as $note) {
            if (!is_array($note)) {
                json_response(['message' => 'Each note must be an object.'], 422);
            }

            $content = array_key_exists('content', $note) ? (string) $note['content'] : '';
            if (strlen($content) > 1048576) {
                json_response(['message' => 'Each note is limited to 1MB.'], 422);
            }

            $createdAt = import_timestamp($note['created_at'] ?? null);
            $updatedAt = import_timestamp($note['updated_at'] ?? null) ?? $createdAt;
            $notesToImport[] = [
                'content' => $content,
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ];
        }

        $notebooksToImport[] = ['name' => $name, 'notes' => $notesToImport];
    }

    $pdo = db();
    $importedNotebooks = 0;
    $importedNotes = 0;
    $pdo->beginTransaction();

    try {
        foreach ($notebooksToImport as $notebook) {
            $stmt = $pdo->prepare(
                'INSERT INTO notebooks (workspace_id, name)
                 VALUES (:workspace_id, :name)
                 RETURNING id',
            );
            $stmt->execute([
                'workspace_id' => $workspaceId,
                'name' => $notebook['name'],
            ]);
            $createdNotebook = $stmt->fetch();
            $importedNotebooks++;

            foreach ($notebook['notes'] as $note) {
                $stmt = $pdo->prepare(
                    'INSERT INTO notes (notebook_id, content, created_at, updated_at)
                     VALUES (
                         :notebook_id,
                         :content,
                         COALESCE(CAST(:created_at AS timestamptz), now()),
                         COALESCE(CAST(:updated_at AS timestamptz), now())
                     )',
                );
                $stmt->execute([
                    'notebook_id' => $createdNotebook['id'],
                    'content' => $note['content'],
                    'created_at' => $note['created_at'],
                    'updated_at' => $note['updated_at'],
                ]);
                $importedNotes++;
            }
        }

        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    return ['notebooks' => $importedNotebooks, 'notes' => $importedNotes];
}

function notebook_templates(): array
{
    return [
        'meeting-notes' => [
            'name' => 'Meeting Notes',
            'notes' => [
                "Meeting Notes\n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- [ ] Owner - task - due date\n\n## Follow-ups\n- ",
                "1:1 Notes\n\n## Wins\n- \n\n## Blockers\n- \n\n## Next Steps\n- [ ] ",
                "Decision Log\n\n## Decision\n\n## Context\n\n## Owner\n\n## Date\n",
            ],
        ],
        'project-hub' => [
            'name' => 'Project Hub',
            'notes' => [
                "Project Overview\n\n## Goal\n\n## Scope\n\n## Success Criteria\n\n## Key Links\n- ",
                "Tasks\n\n- [ ] Define requirements\n- [ ] Assign owners\n- [ ] Set milestone dates\n- [ ] Review risks",
                "Milestones\n\n## Now\n\n## Next\n\n## Later\n",
                "Risks and Decisions\n\n## Risks\n- \n\n## Decisions\n- ",
            ],
        ],
        'client-workspace' => [
            'name' => 'Client Workspace',
            'notes' => [
                "Client Profile\n\n## Contacts\n- \n\n## Goals\n\n## Preferences\n\n## Important Links\n- ",
                "Call Notes\n\n## Date\n\n## Topics\n- \n\n## Commitments\n- [ ] ",
                "Requirements\n\n## Must Have\n- \n\n## Nice to Have\n- \n\n## Questions\n- ",
            ],
        ],
        'research-notebook' => [
            'name' => 'Research Notebook',
            'notes' => [
                "Research Brief\n\n## Question\n\n## Hypothesis\n\n## What Good Looks Like\n",
                "Sources\n\n- [ ] Source - note\n- [ ] Source - note\n",
                "Findings\n\n## Themes\n- \n\n## Contradictions\n- \n\n## Summary\n",
            ],
        ],
        'content-planner' => [
            'name' => 'Content Planner',
            'notes' => [
                "Content Ideas\n\n## Backlog\n- \n\n## In Progress\n- \n\n## Published\n- ",
                "Draft Template\n\n## Hook\n\n## Main Points\n- \n\n## CTA\n",
                "Publishing Checklist\n\n- [ ] Draft complete\n- [ ] Review complete\n- [ ] Assets ready\n- [ ] Scheduled\n",
            ],
        ],
        'startup-os' => [
            'name' => 'Startup Operating System',
            'notes' => [
                "Company Overview\n\n## Mission\n\n## Customer\n\n## Problem\n\n## Positioning\n\n## Key Links\n- ",
                "Weekly Priorities\n\n## Week Of\n\n## Top Priorities\n- [ ] \n- [ ] \n- [ ] \n\n## Blockers\n- \n\n## Decisions Needed\n- ",
                "Product Roadmap\n\n## Now\n- \n\n## Next\n- \n\n## Later\n- \n\n## Open Questions\n- ",
                "Metrics\n\n## North Star\n\n## Current Snapshot\n- Revenue: \n- Active users: \n- Conversion: \n- Retention: \n\n## Notes\n",
                "Investor Updates\n\n## Highlights\n- \n\n## Metrics\n- \n\n## Challenges\n- \n\n## Asks\n- ",
            ],
        ],
        'product-management' => [
            'name' => 'Product Management',
            'notes' => [
                "Product Brief\n\n## Problem\n\n## Audience\n\n## Goals\n\n## Non-goals\n\n## Success Metrics\n",
                "User Feedback\n\n## Themes\n- \n\n## Quotes\n- \n\n## Requests\n- \n\n## Follow-ups\n- [ ] ",
                "Feature Specs\n\n## Feature\n\n## User Story\n\n## Requirements\n- \n\n## Edge Cases\n- \n\n## Launch Notes\n",
                "Release Plan\n\n## Target Date\n\n## Scope\n- \n\n## QA Checklist\n- [ ] \n\n## Rollout\n",
                "Decision Log\n\n## Decision\n\n## Context\n\n## Options\n- \n\n## Owner\n\n## Date\n",
            ],
        ],
        'sales-pipeline' => [
            'name' => 'Sales Pipeline',
            'notes' => [
                "Leads\n\n## New Leads\n- Company - contact - next step\n\n## Qualified\n- \n\n## Not Now\n- ",
                "Discovery Calls\n\n## Account\n\n## Pain\n\n## Budget\n\n## Timeline\n\n## Next Step\n- [ ] ",
                "Objections\n\n## Objection\n\n## Response\n\n## Proof Needed\n\n## Follow-up\n- [ ] ",
                "Follow-ups\n\n## Today\n- [ ] \n\n## This Week\n- [ ] \n\n## Waiting On\n- ",
                "Closed Won and Lost Notes\n\n## Account\n\n## Outcome\n\n## Why\n\n## Lessons\n\n## Next Opportunity\n",
            ],
        ],
        'hiring-pipeline' => [
            'name' => 'Hiring Pipeline',
            'notes' => [
                "Role Brief\n\n## Role\n\n## Outcomes\n\n## Must Have\n- \n\n## Nice to Have\n- \n\n## Interview Loop\n",
                "Candidate Notes\n\n## Candidate\n\n## Source\n\n## Strengths\n- \n\n## Concerns\n- \n\n## Next Step\n",
                "Interview Questions\n\n## Screen\n- \n\n## Technical\n- \n\n## Values\n- \n\n## Closing\n- ",
                "Scorecard\n\n## Candidate\n\n## Skills\n\n## Communication\n\n## Ownership\n\n## Recommendation\n",
                "Offer Process\n\n## Candidate\n\n## Compensation\n\n## Approvals\n- [ ] \n\n## Start Date\n",
            ],
        ],
        'learning-notebook' => [
            'name' => 'Learning Notebook',
            'notes' => [
                "Study Plan\n\n## Topic\n\n## Goal\n\n## Schedule\n- \n\n## Milestones\n- [ ] ",
                "Reading Notes\n\n## Source\n\n## Key Ideas\n- \n\n## Questions\n- \n\n## Actions\n- [ ] ",
                "Concepts\n\n## Concept\n\n## Explanation\n\n## Example\n\n## Related Ideas\n- ",
                "Practice Log\n\n## Date\n\n## Exercise\n\n## Result\n\n## Mistakes\n\n## Next Practice\n",
                "Summary\n\n## What I Learned\n\n## What Still Feels Fuzzy\n\n## Next Steps\n- [ ] ",
            ],
        ],
        'personal-knowledge-base' => [
            'name' => 'Personal Knowledge Base',
            'notes' => [
                "Inbox\n\n- \n\n## To Process\n- [ ] ",
                "People\n\n## Name\n\n## Context\n\n## Last Contact\n\n## Notes\n\n## Follow-up\n- [ ] ",
                "Ideas\n\n## Idea\n\n## Why It Matters\n\n## Next Step\n- [ ] ",
                "References\n\n## Topic\n\n## Links\n- \n\n## Notes\n",
                "Weekly Review\n\n## Wins\n- \n\n## Lessons\n- \n\n## Carry Forward\n- [ ] ",
            ],
        ],
        'support-desk' => [
            'name' => 'Support Desk',
            'notes' => [
                "Open Issues\n\n## Critical\n- \n\n## Normal\n- \n\n## Waiting On Customer\n- ",
                "Customer Reports\n\n## Customer\n\n## Report\n\n## Environment\n\n## Impact\n\n## Next Step\n- [ ] ",
                "Bug Reproduction\n\n## Steps\n1. \n2. \n3. \n\n## Expected\n\n## Actual\n\n## Evidence\n",
                "Resolutions\n\n## Issue\n\n## Root Cause\n\n## Fix\n\n## Customer Reply\n",
                "FAQ Drafts\n\n## Question\n\n## Short Answer\n\n## Detailed Answer\n\n## Links\n- ",
            ],
        ],
        'content-studio' => [
            'name' => 'Content Studio',
            'notes' => [
                "Content Calendar\n\n## This Week\n- \n\n## Next Week\n- \n\n## Scheduled\n- ",
                "Ideas\n\n## Backlog\n- \n\n## Strong Hooks\n- \n\n## Research Needed\n- ",
                "Drafts\n\n## Title\n\n## Hook\n\n## Outline\n- \n\n## Draft Notes\n",
                "Distribution Checklist\n\n- [ ] Publish\n- [ ] Email\n- [ ] Social\n- [ ] Repurpose\n- [ ] Archive assets\n",
                "Performance Notes\n\n## Piece\n\n## Views\n\n## Engagement\n\n## Lessons\n\n## Next Iteration\n",
            ],
        ],
        'agency-client-hub' => [
            'name' => 'Agency Client Hub',
            'notes' => [
                "Client Brief\n\n## Client\n\n## Goals\n\n## Audience\n\n## Constraints\n\n## Success Criteria\n",
                "Deliverables\n\n## Active\n- [ ] \n\n## Waiting Approval\n- \n\n## Delivered\n- ",
                "Meeting Notes\n\n## Date\n\n## Attendees\n\n## Decisions\n- \n\n## Action Items\n- [ ] ",
                "Approvals\n\n## Item\n\n## Sent Date\n\n## Status\n\n## Feedback\n\n## Next Step\n- [ ] ",
                "Billing Notes\n\n## Scope\n\n## Invoices\n- \n\n## Change Requests\n- \n\n## Renewal Notes\n",
            ],
        ],
        'dev-journal' => [
            'name' => 'Dev Journal',
            'notes' => [
                "Architecture Notes\n\n## System\n\n## Components\n- \n\n## Tradeoffs\n\n## Open Questions\n",
                "Bugs\n\n## Bug\n\n## Reproduction\n\n## Cause\n\n## Fix\n\n## Follow-up\n- [ ] ",
                "Commands\n\n## Local\n```\n\n```\n\n## Server\n```\n\n```\n",
                "Deploy Notes\n\n## Version\n\n## Changes\n- \n\n## Checks\n- [ ] Build\n- [ ] Health check\n- [ ] Rollback ready\n",
                "Postmortems\n\n## Incident\n\n## Impact\n\n## Timeline\n\n## Root Cause\n\n## Prevention\n- [ ] ",
            ],
        ],
    ];
}

function create_notebook_with_template(int $workspaceId, string $name, ?string $templateKey): array
{
    $template = null;
    if ($templateKey !== null && $templateKey !== '') {
        $templates = notebook_templates();
        if (!isset($templates[$templateKey])) {
            json_response(['message' => 'Unknown notebook template.'], 422);
        }
        $template = $templates[$templateKey];
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO notebooks (workspace_id, name)
             VALUES (:workspace_id, :name)
             RETURNING id, workspace_id, name, pinned_at',
        );
        $stmt->execute([
            'workspace_id' => $workspaceId,
            'name' => $name,
        ]);
        $notebook = $stmt->fetch();

        if ($template) {
            $noteStmt = $pdo->prepare(
                'INSERT INTO notes (notebook_id, content)
                 VALUES (:notebook_id, :content)',
            );

            foreach ($template['notes'] as $content) {
                $noteStmt->execute([
                    'notebook_id' => $notebook['id'],
                    'content' => $content,
                ]);
            }
        }

        $pdo->commit();
        return $notebook;
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

try {
    migrate();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = route_path();

    if ($method === 'GET' && $path === '/health') {
        json_response(['status' => 'ok', 'app' => 'obscribe-api']);
    }

    if ($method === 'GET' && $path === '/config') {
        json_response([
            'registration_mode' => registration_mode(),
            'email_verification_required' => email_verification_required(),
            'plans' => [
                ['key' => 'trial', 'name' => 'Hosted Trial', 'price' => '$0', 'notes' => '14-day hosted trial for early users.'],
                ['key' => 'personal', 'name' => 'Hosted Personal', 'price' => '$8/mo', 'notes' => 'Private hosted workspace, backups, and email support.'],
                ['key' => 'team', 'name' => 'Hosted Team', 'price' => '$12/user/mo', 'notes' => 'Shared workspaces, admin controls, and priority support.'],
                ['key' => 'selfhost-support', 'name' => 'Self-host Support', 'price' => '$19/mo', 'notes' => 'Updates, install help, and operational support for self-hosters.'],
            ],
        ]);
    }

    if ($method === 'POST' && $path === '/email/verify') {
        rate_limit('email-verify', 20, 15 * 60);
        $data = input();
        require_fields($data, ['token']);

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare(
                'SELECT id, user_id
                 FROM email_verification_tokens
                 WHERE token_hash = :token_hash
                   AND used_at IS NULL
                   AND expires_at > now()
                 LIMIT 1
                 FOR UPDATE',
            );
            $stmt->execute(['token_hash' => hash('sha256', trim((string) $data['token']))]);
            $verification = $stmt->fetch();

            if (!$verification) {
                $pdo->rollBack();
                json_response(['message' => 'Invalid or expired verification link.'], 422);
            }

            $pdo->prepare('UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = :id')
                ->execute(['id' => $verification['user_id']]);
            $pdo->prepare('UPDATE email_verification_tokens SET used_at = now() WHERE id = :id')
                ->execute(['id' => $verification['id']]);
            $pdo->commit();
            track_event('email_verified', (int) $verification['user_id']);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        json_response(['verified' => true]);
    }

    if ($method === 'POST' && $path === '/email/resend') {
        rate_limit('email-resend', 5, 15 * 60);
        $data = input();
        require_fields($data, ['email']);

        $stmt = db()->prepare('SELECT * FROM users WHERE email = lower(:email) LIMIT 1');
        $stmt->execute(['email' => trim((string) $data['email'])]);
        $targetUser = $stmt->fetch();

        if ($targetUser && empty($targetUser['email_verified_at'])) {
            $token = create_email_verification_token((int) $targetUser['id']);
            send_email_verification_email($targetUser, $token);
        }

        json_response(['sent' => true]);
    }

    if ($method === 'POST' && $path === '/register') {
        rate_limit('register', 8, 60 * 60);
        $data = input();
        require_fields($data, ['name', 'email', 'password']);

        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            json_response(['message' => 'A valid email is required.'], 422);
        }

        if (strlen((string) $data['password']) < 8) {
            json_response(['message' => 'Password must be at least 8 characters.'], 422);
        }

        $email = strtolower(trim((string) $data['email']));
        $isAdminEmail = in_array($email, admin_emails(), true);
        $mode = registration_mode();

        if ($mode === 'closed' && !$isAdminEmail) {
            json_response(['message' => 'Registration is currently closed.'], 403);
        }

        $stmt = db()->prepare('SELECT id FROM users WHERE email = lower(:email) LIMIT 1');
        $stmt->execute(['email' => $email]);
        if ($stmt->fetch()) {
            json_response(['message' => 'An account with that email already exists.'], 422);
        }

        $pdo = db();
        $pdo->beginTransaction();

        if ($mode === 'invite' && !$isAdminEmail) {
            consume_invite_code(isset($data['invite_code']) ? (string) $data['invite_code'] : null, $email);
        }

        $verifiedAt = (!email_verification_required() || $isAdminEmail) ? gmdate(DATE_ATOM) : null;
        $stmt = $pdo->prepare(
            'INSERT INTO users (name, email, password_hash, email_verified_at)
             VALUES (:name, lower(:email), :password_hash, :email_verified_at)
             RETURNING *',
        );
        $stmt->execute([
            'name' => trim((string) $data['name']),
            'email' => $email,
            'password_hash' => password_hash((string) $data['password'], PASSWORD_DEFAULT),
            'email_verified_at' => $verifiedAt,
        ]);
        $user = $stmt->fetch();

        $workspaceName = explode('@', $user['email'])[0] . "'s workspace";
        $stmt = $pdo->prepare('INSERT INTO workspaces (name) VALUES (:name) RETURNING id, name');
        $stmt->execute(['name' => $workspaceName]);
        $workspace = $stmt->fetch();

        $stmt = $pdo->prepare(
            'INSERT INTO workspace_memberships (user_id, workspace_id, role)
             VALUES (:user_id, :workspace_id, :role)',
        );
        $stmt->execute([
            'user_id' => $user['id'],
            'workspace_id' => $workspace['id'],
            'role' => 'owner',
        ]);

        $pdo->commit();

        track_event('registered', (int) $user['id'], ['mode' => $mode]);

        if (email_verification_required() && empty($user['email_verified_at'])) {
            $verificationToken = create_email_verification_token((int) $user['id']);
            $mail = send_email_verification_email($user, $verificationToken);

            json_response([
                'needs_verification' => true,
                'user' => public_user($user),
                'workspace' => ['id' => (int) $workspace['id'], 'name' => $workspace['name']],
                'mail' => $mail,
            ], 201);
        }

        $mail = send_welcome_email($user);

        json_response([
            'token' => issue_token((int) $user['id']),
            'user' => public_user($user),
            'workspace' => ['id' => (int) $workspace['id'], 'name' => $workspace['name']],
            'mail' => $mail,
        ], 201);
    }

    if ($method === 'POST' && $path === '/login') {
        rate_limit('login', 12, 15 * 60);
        $data = input();
        require_fields($data, ['email', 'password']);

        $stmt = db()->prepare('SELECT * FROM users WHERE email = lower(:email) LIMIT 1');
        $stmt->execute(['email' => trim((string) $data['email'])]);
        $user = $stmt->fetch();

        if (!$user || !password_verify((string) $data['password'], $user['password_hash'])) {
            json_response(['message' => 'Invalid credentials.'], 422);
        }

        if (!empty($user['disabled_at'])) {
            json_response(['message' => 'This account has been disabled.'], 403);
        }

        if (email_verification_required() && empty($user['email_verified_at']) && !is_admin_user($user)) {
            json_response(['message' => 'Please verify your email before signing in.'], 403);
        }

        $workspace = current_workspace((int) $user['id']);
        track_event('login', (int) $user['id']);

        json_response([
            'token' => issue_token((int) $user['id']),
            'user' => public_user($user),
            'workspace' => $workspace ? ['id' => (int) $workspace['id'], 'name' => $workspace['name']] : null,
        ]);
    }

    if ($method === 'POST' && $path === '/password/forgot') {
        rate_limit('password-forgot', 6, 15 * 60);
        $data = input();
        require_fields($data, ['email']);

        $email = trim((string) $data['email']);
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $stmt = db()->prepare('SELECT * FROM users WHERE email = lower(:email) LIMIT 1');
            $stmt->execute(['email' => $email]);
            $resetUser = $stmt->fetch();

            if ($resetUser) {
                $token = create_password_reset_token((int) $resetUser['id']);

                try {
                    send_password_reset_email($resetUser, $token);
                } catch (Throwable $exception) {
                    error_log('Password reset email failed: ' . $exception->getMessage());
                }
            }
        }

        json_response(['sent' => true]);
    }

    if ($method === 'POST' && $path === '/password/reset') {
        rate_limit('password-reset', 10, 15 * 60);
        $data = input();
        require_fields($data, ['token', 'new_password']);

        if (strlen((string) $data['new_password']) < 8) {
            json_response(['message' => 'New password must be at least 8 characters.'], 422);
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare(
                'SELECT id, user_id
                 FROM password_reset_tokens
                 WHERE token_hash = :token_hash
                   AND used_at IS NULL
                   AND expires_at > now()
                 LIMIT 1
                 FOR UPDATE',
            );
            $stmt->execute(['token_hash' => hash('sha256', trim((string) $data['token']))]);
            $reset = $stmt->fetch();

            if (!$reset) {
                $pdo->rollBack();
                json_response(['message' => 'Invalid or expired reset token.'], 422);
            }

            $stmt = $pdo->prepare(
                'UPDATE users
                 SET password_hash = :password_hash, updated_at = now()
                 WHERE id = :id',
            );
            $stmt->execute([
                'id' => $reset['user_id'],
                'password_hash' => password_hash((string) $data['new_password'], PASSWORD_DEFAULT),
            ]);

            $pdo->prepare('UPDATE password_reset_tokens SET used_at = now() WHERE id = :id')
                ->execute(['id' => $reset['id']]);
            $pdo->prepare('DELETE FROM api_tokens WHERE user_id = :user_id')
                ->execute(['user_id' => $reset['user_id']]);

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        json_response(['reset' => true]);
    }

    $user = authenticated_user();
    $workspace = current_workspace((int) $user['id']);
    if (!$workspace) {
        json_response(['message' => 'Workspace not found.'], 404);
    }
    $workspaceId = (int) $workspace['id'];

    if ($method === 'GET' && $path === '/status') {
        require_admin($user);

        $stmt = db()->prepare('SELECT count(*) AS total FROM notebooks WHERE workspace_id = :workspace_id');
        $stmt->execute(['workspace_id' => $workspaceId]);
        $notebookCount = (int) $stmt->fetch()['total'];

        $stmt = db()->prepare(
            'SELECT count(*) AS total
             FROM notes
             INNER JOIN notebooks ON notebooks.id = notes.notebook_id
             WHERE notebooks.workspace_id = :workspace_id',
        );
        $stmt->execute(['workspace_id' => $workspaceId]);
        $noteCount = (int) $stmt->fetch()['total'];

        json_response([
            'status' => 'ok',
            'user' => public_user($user),
            'workspace' => ['id' => $workspaceId, 'name' => $workspace['name']],
            'counts' => ['notebooks' => $notebookCount, 'notes' => $noteCount],
            'mail' => mail_config_status(),
        ]);
    }

    if ($method === 'GET' && $path === '/me') {
        json_response([
            'user' => public_user($user),
            'workspace' => ['id' => $workspaceId, 'name' => $workspace['name']],
        ]);
    }

    if ($method === 'POST' && $path === '/me/password') {
        $data = input();
        require_fields($data, ['current_password', 'new_password']);

        if (!password_verify((string) $data['current_password'], $user['password_hash'])) {
            json_response(['message' => 'Current password is incorrect.'], 422);
        }

        if (strlen((string) $data['new_password']) < 8) {
            json_response(['message' => 'New password must be at least 8 characters.'], 422);
        }

        $stmt = db()->prepare(
            'UPDATE users
             SET password_hash = :password_hash, updated_at = now()
             WHERE id = :id',
        );
        $stmt->execute([
            'id' => $user['id'],
            'password_hash' => password_hash((string) $data['new_password'], PASSWORD_DEFAULT),
        ]);

        json_response(['updated' => true]);
    }

    if ($method === 'POST' && $path === '/mail/test') {
        require_admin($user);
        rate_limit('mail-test-' . $user['id'], 5, 15 * 60);

        $mail = send_test_email($user);
        json_response([
            'mail' => $mail,
            'message' => $mail['message'] ?? 'SMTP test failed.',
        ], $mail['sent'] ? 200 : 422);
    }

    if ($method === 'GET' && $path === '/admin/users') {
        require_admin($user);

        $stmt = db()->query(
            'SELECT u.id, u.name, u.email, u.email_verified_at, u.disabled_at, u.last_seen_at, u.created_at,
                    (SELECT count(*) FROM workspace_memberships wm WHERE wm.user_id = u.id) AS workspace_count
             FROM users u
             ORDER BY u.created_at DESC
             LIMIT 250',
        );

        json_response([
            'users' => array_map(
                static fn (array $row): array => [
                    ...$row,
                    'id' => (int) $row['id'],
                    'workspace_count' => (int) $row['workspace_count'],
                    'is_admin' => in_array(strtolower((string) $row['email']), admin_emails(), true),
                ],
                $stmt->fetchAll(),
            ),
        ]);
    }

    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/disable$#', $path, $matches)) {
        require_admin($user);
        $targetId = (int) $matches[1];
        if ($targetId === (int) $user['id']) {
            json_response(['message' => 'You cannot disable your own account.'], 422);
        }

        $data = input();
        $disabled = (bool) ($data['disabled'] ?? true);
        $stmt = db()->prepare(
            'UPDATE users
             SET disabled_at = ' . ($disabled ? 'now()' : 'NULL') . ', updated_at = now()
             WHERE id = :id
             RETURNING *',
        );
        $stmt->execute(['id' => $targetId]);
        $target = $stmt->fetch();
        if (!$target) {
            json_response(['message' => 'User not found.'], 404);
        }

        if ($disabled) {
            db()->prepare('DELETE FROM api_tokens WHERE user_id = :user_id')->execute(['user_id' => $targetId]);
        }

        json_response(['user' => public_user($target)]);
    }

    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/verification$#', $path, $matches)) {
        require_admin($user);
        $stmt = db()->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => (int) $matches[1]]);
        $target = $stmt->fetch();
        if (!$target) {
            json_response(['message' => 'User not found.'], 404);
        }

        $token = create_email_verification_token((int) $target['id']);
        $mail = send_email_verification_email($target, $token);
        json_response(['sent' => true, 'mail' => $mail]);
    }

    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/password-reset$#', $path, $matches)) {
        require_admin($user);
        $stmt = db()->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => (int) $matches[1]]);
        $target = $stmt->fetch();
        if (!$target) {
            json_response(['message' => 'User not found.'], 404);
        }

        $token = create_password_reset_token((int) $target['id']);
        send_password_reset_email($target, $token);
        json_response(['sent' => true]);
    }

    if ($method === 'GET' && $path === '/admin/invites') {
        require_admin($user);
        $stmt = db()->query(
            'SELECT id, email, max_uses, used_count, expires_at, disabled_at, created_at
             FROM invite_codes
             ORDER BY created_at DESC
             LIMIT 100',
        );
        json_response(['invites' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && $path === '/admin/invites') {
        require_admin($user);
        $data = input();
        $code = strtoupper(bin2hex(random_bytes(4)));
        $expiresDays = max(1, min(365, (int) ($data['expires_days'] ?? 30)));
        $maxUses = max(1, min(100, (int) ($data['max_uses'] ?? 1)));
        $email = isset($data['email']) && trim((string) $data['email']) !== '' ? strtolower(trim((string) $data['email'])) : null;
        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['message' => 'Invite email must be valid.'], 422);
        }
        $expiresAt = gmdate(DATE_ATOM, time() + ($expiresDays * 24 * 60 * 60));

        $stmt = db()->prepare(
            'INSERT INTO invite_codes (code_hash, email, max_uses, expires_at, created_by_user_id)
             VALUES (:code_hash, :email, :max_uses, :expires_at, :created_by)
             RETURNING id, email, max_uses, used_count, expires_at, disabled_at, created_at',
        );
        $stmt->execute([
            'code_hash' => invite_code_hash($code),
            'email' => $email,
            'max_uses' => $maxUses,
            'expires_at' => $expiresAt,
            'created_by' => $user['id'],
        ]);

        json_response(['invite' => $stmt->fetch(), 'code' => $code], 201);
    }

    if ($method === 'DELETE' && preg_match('#^/admin/invites/(\d+)$#', $path, $matches)) {
        require_admin($user);
        db()->prepare('UPDATE invite_codes SET disabled_at = now() WHERE id = :id')
            ->execute(['id' => (int) $matches[1]]);
        json_response(['disabled' => true]);
    }

    if ($method === 'GET' && $path === '/admin/health') {
        require_admin($user);
        $backup = latest_backup_file();
        json_response([
            'app' => [
                'url' => app_url(),
                'domain' => env_value('APP_DOMAIN', 'localhost'),
                'edition' => env_value('OBSCRIBE_EDITION', 'selfhosted'),
                'version' => env_value('APP_VERSION', 'unknown'),
                'environment' => env_value('APP_ENV', 'production'),
            ],
            'launch' => [
                'registration_mode' => registration_mode(),
                'email_verification_required' => email_verification_required(),
            ],
            'ssl' => [
                'managed_by' => 'Caddy',
                'expected' => str_starts_with(app_url(), 'https://'),
            ],
            'mail' => mail_config_status(),
            'backup' => $backup ? [
                'available' => true,
                'name' => $backup['name'],
                'size' => $backup['size'],
                'created_at' => $backup['created_at'],
            ] : ['available' => false],
        ]);
    }

    if ($method === 'GET' && $path === '/admin/backups/latest') {
        require_admin($user);
        $backup = latest_backup_file();
        if (!$backup) {
            json_response(['message' => 'No backup file is available to download.'], 404);
        }

        header_remove('Content-Type');
        header('Content-Type: application/gzip');
        header('Content-Disposition: attachment; filename="' . $backup['name'] . '"');
        header('Content-Length: ' . $backup['size']);
        readfile($backup['path']);
        exit;
    }

    if ($method === 'GET' && $path === '/admin/analytics') {
        require_admin($user);
        $stmt = db()->query(
            'SELECT event_name, count(*) AS total
             FROM analytics_events
             WHERE created_at > now() - interval \'30 days\'
             GROUP BY event_name
             ORDER BY event_name ASC',
        );
        json_response(['events' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && $path === '/workspace/export') {
        json_response(workspace_export_payload($user, $workspace));
    }

    if ($method === 'POST' && $path === '/workspace/import') {
        json_response(['imported' => import_workspace_payload(input(), $workspaceId)]);
    }

    if ($method === 'GET' && $path === '/notes/recent') {
        $stmt = db()->prepare(
            'SELECT notes.id, notes.notebook_id, notebooks.name AS notebook_name, notes.content, notes.updated_at
             FROM notes
             INNER JOIN notebooks ON notebooks.id = notes.notebook_id
             WHERE notebooks.workspace_id = :workspace_id
             ORDER BY notes.updated_at DESC, notes.id DESC
             LIMIT 12',
        );
        $stmt->execute(['workspace_id' => $workspaceId]);
        json_response(['notes' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && $path === '/search') {
        $query = trim((string) ($_GET['q'] ?? ''));
        if (strlen($query) < 2) {
            json_response(['notebooks' => [], 'notes' => []]);
        }

        $search = '%' . addcslashes($query, "\\%_") . '%';

        $stmt = db()->prepare(
            'SELECT id, workspace_id, name, pinned_at
             FROM notebooks
             WHERE workspace_id = :workspace_id
               AND name ILIKE :query ESCAPE \'\\\'
             ORDER BY pinned_at DESC NULLS LAST, updated_at DESC, id DESC
             LIMIT 10',
        );
        $stmt->execute([
            'workspace_id' => $workspaceId,
            'query' => $search,
        ]);
        $notebooks = $stmt->fetchAll();

        $stmt = db()->prepare(
            'SELECT notes.id, notes.notebook_id, notebooks.name AS notebook_name, notes.content, notes.updated_at
             FROM notes
             INNER JOIN notebooks ON notebooks.id = notes.notebook_id
             WHERE notebooks.workspace_id = :workspace_id
               AND notes.content ILIKE :query ESCAPE \'\\\'
             ORDER BY notes.updated_at DESC, notes.id DESC
             LIMIT 20',
        );
        $stmt->execute([
            'workspace_id' => $workspaceId,
            'query' => $search,
        ]);
        $searchNotes = array_map(
            static function (array $note) use ($query): array {
                $content = (string) ($note['content'] ?? '');
                $position = stripos($content, $query);
                $start = $position === false ? 0 : max(0, $position - 55);
                $snippet = trim(substr($content, $start, 150));
                if ($start > 0) {
                    $snippet = '...' . $snippet;
                }
                if ($start + 150 < strlen($content)) {
                    $snippet .= '...';
                }
                $note['snippet'] = $snippet;
                return $note;
            },
            $stmt->fetchAll(),
        );

        json_response([
            'notebooks' => $notebooks,
            'notes' => $searchNotes,
        ]);
    }

    if ($method === 'GET' && $path === '/notebooks') {
        $stmt = db()->prepare(
            'SELECT id, workspace_id, name, pinned_at
             FROM notebooks
             WHERE workspace_id = :workspace_id
             ORDER BY pinned_at DESC NULLS LAST, updated_at DESC, id DESC',
        );
        $stmt->execute(['workspace_id' => $workspaceId]);
        json_response(['notebooks' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && $path === '/notebooks') {
        $data = input();
        require_fields($data, ['name']);

        $templateKey = isset($data['template_key']) ? trim((string) $data['template_key']) : null;
        $notebook = create_notebook_with_template($workspaceId, trim((string) $data['name']), $templateKey);
        track_event($templateKey ? 'notebook_template_created' : 'notebook_created', (int) $user['id'], [
            'template_key' => $templateKey,
        ]);
        json_response($notebook, 201);
    }

    if ($method === 'PUT' && preg_match('#^/notebooks/(\d+)$#', $path, $matches)) {
        notebook_for_workspace((int) $matches[1], $workspaceId);
        $data = input();
        require_fields($data, ['name']);

        $stmt = db()->prepare(
            'UPDATE notebooks
             SET name = :name, updated_at = now()
             WHERE id = :id AND workspace_id = :workspace_id
             RETURNING id, workspace_id, name, pinned_at',
        );
        $stmt->execute([
            'id' => (int) $matches[1],
            'workspace_id' => $workspaceId,
            'name' => trim((string) $data['name']),
        ]);

        json_response($stmt->fetch());
    }

    if ($method === 'POST' && preg_match('#^/notebooks/(\d+)/pin$#', $path, $matches)) {
        notebook_for_workspace((int) $matches[1], $workspaceId);
        $data = input();
        $pinned = (bool) ($data['pinned'] ?? true);

        $stmt = db()->prepare(
            'UPDATE notebooks
             SET pinned_at = ' . ($pinned ? 'now()' : 'NULL') . ', updated_at = now()
             WHERE id = :id AND workspace_id = :workspace_id
             RETURNING id, workspace_id, name, pinned_at',
        );
        $stmt->execute([
            'id' => (int) $matches[1],
            'workspace_id' => $workspaceId,
        ]);

        json_response($stmt->fetch());
    }

    if ($method === 'DELETE' && preg_match('#^/notebooks/(\d+)$#', $path, $matches)) {
        notebook_for_workspace((int) $matches[1], $workspaceId);
        $stmt = db()->prepare('DELETE FROM notebooks WHERE id = :id AND workspace_id = :workspace_id');
        $stmt->execute([
            'id' => (int) $matches[1],
            'workspace_id' => $workspaceId,
        ]);

        json_response(['deleted' => true]);
    }

    if ($method === 'GET' && preg_match('#^/notebooks/(\d+)/notes$#', $path, $matches)) {
        $notebook = notebook_for_workspace((int) $matches[1], $workspaceId);
        $stmt = db()->prepare(
            'SELECT id, notebook_id, content, updated_at
             FROM notes
             WHERE notebook_id = :notebook_id
             ORDER BY updated_at DESC, id DESC',
        );
        $stmt->execute(['notebook_id' => $notebook['id']]);
        json_response(['notes' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && preg_match('#^/notebooks/(\d+)/notes$#', $path, $matches)) {
        $notebook = notebook_for_workspace((int) $matches[1], $workspaceId);
        $data = input();
        $content = array_key_exists('content', $data) ? (string) $data['content'] : '';
        $stmt = db()->prepare(
            'INSERT INTO notes (notebook_id, content)
             VALUES (:notebook_id, :content)
             RETURNING id, notebook_id, content, updated_at',
        );
        $stmt->execute([
            'notebook_id' => $notebook['id'],
            'content' => $content,
        ]);

        track_event('note_created', (int) $user['id'], ['notebook_id' => (int) $notebook['id']]);
        json_response($stmt->fetch(), 201);
    }

    if ($method === 'POST' && preg_match('#^/notes/(\d+)/duplicate$#', $path, $matches)) {
        $source = note_for_workspace((int) $matches[1], $workspaceId);
        $content = (string) ($source['content'] ?? '');
        $parts = explode("\n", $content, 2);
        $title = trim($parts[0] ?? '');
        if ($title !== '') {
            $parts[0] = $title . ' copy';
            $content = implode("\n", $parts);
        }

        $stmt = db()->prepare(
            'INSERT INTO notes (notebook_id, content)
             VALUES (:notebook_id, :content)
             RETURNING id, notebook_id, content, updated_at',
        );
        $stmt->execute([
            'notebook_id' => $source['notebook_id'],
            'content' => $content,
        ]);
        track_event('note_duplicated', (int) $user['id'], ['source_note_id' => (int) $source['id']]);

        json_response($stmt->fetch(), 201);
    }

    if ($method === 'PUT' && preg_match('#^/notes/(\d+)$#', $path, $matches)) {
        note_for_workspace((int) $matches[1], $workspaceId);
        $data = input();
        $content = array_key_exists('content', $data) ? (string) $data['content'] : '';

        $stmt = db()->prepare(
            'UPDATE notes
             SET content = :content, updated_at = now()
             WHERE id = :id
             RETURNING id, notebook_id, content, updated_at',
        );
        $stmt->execute([
            'id' => (int) $matches[1],
            'content' => $content,
        ]);

        json_response($stmt->fetch());
    }

    if ($method === 'DELETE' && preg_match('#^/notes/(\d+)$#', $path, $matches)) {
        note_for_workspace((int) $matches[1], $workspaceId);
        $stmt = db()->prepare('DELETE FROM notes WHERE id = :id');
        $stmt->execute(['id' => (int) $matches[1]]);

        json_response(['deleted' => true]);
    }

    json_response(['message' => 'Route not found.'], 404);
} catch (PDOException $exception) {
    $status = str_contains($exception->getMessage(), 'users_email_key') ? 422 : 500;
    $message = $status === 422 ? 'An account with that email already exists.' : 'Database error.';
    json_response(['message' => $message], $status);
} catch (Throwable $exception) {
    json_response(['message' => 'Server error.'], 500);
}
