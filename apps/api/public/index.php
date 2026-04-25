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
        "Open " . env_value('APP_URL', 'http://localhost') . " to start writing.\n";

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
        "App URL: " . env_value('APP_URL', 'http://localhost') . "\n";

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

CREATE INDEX IF NOT EXISTS notebooks_workspace_updated_idx ON notebooks (workspace_id, updated_at DESC);

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

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
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

    db()->prepare('UPDATE api_tokens SET last_used_at = now() WHERE token_hash = :token_hash')
        ->execute(['token_hash' => hash('sha256', trim($matches[1]))]);

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

try {
    migrate();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = route_path();

    if ($method === 'GET' && $path === '/health') {
        json_response(['status' => 'ok', 'app' => 'obscribe-api']);
    }

    if ($method === 'POST' && $path === '/register') {
        $data = input();
        require_fields($data, ['name', 'email', 'password']);

        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            json_response(['message' => 'A valid email is required.'], 422);
        }

        if (strlen((string) $data['password']) < 8) {
            json_response(['message' => 'Password must be at least 8 characters.'], 422);
        }

        $pdo = db();
        $pdo->beginTransaction();

        $stmt = $pdo->prepare(
            'INSERT INTO users (name, email, password_hash)
             VALUES (:name, lower(:email), :password_hash)
             RETURNING *',
        );
        $stmt->execute([
            'name' => trim((string) $data['name']),
            'email' => trim((string) $data['email']),
            'password_hash' => password_hash((string) $data['password'], PASSWORD_DEFAULT),
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

        $mail = send_welcome_email($user);

        json_response([
            'token' => issue_token((int) $user['id']),
            'user' => public_user($user),
            'workspace' => ['id' => (int) $workspace['id'], 'name' => $workspace['name']],
            'mail' => $mail,
        ], 201);
    }

    if ($method === 'POST' && $path === '/login') {
        $data = input();
        require_fields($data, ['email', 'password']);

        $stmt = db()->prepare('SELECT * FROM users WHERE email = lower(:email) LIMIT 1');
        $stmt->execute(['email' => trim((string) $data['email'])]);
        $user = $stmt->fetch();

        if (!$user || !password_verify((string) $data['password'], $user['password_hash'])) {
            json_response(['message' => 'Invalid credentials.'], 422);
        }

        $workspace = current_workspace((int) $user['id']);

        json_response([
            'token' => issue_token((int) $user['id']),
            'user' => public_user($user),
            'workspace' => $workspace ? ['id' => (int) $workspace['id'], 'name' => $workspace['name']] : null,
        ]);
    }

    $user = authenticated_user();
    $workspace = current_workspace((int) $user['id']);
    if (!$workspace) {
        json_response(['message' => 'Workspace not found.'], 404);
    }
    $workspaceId = (int) $workspace['id'];

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
        $mail = send_test_email($user);
        json_response([
            'mail' => $mail,
            'message' => $mail['message'] ?? 'SMTP test failed.',
        ], $mail['sent'] ? 200 : 422);
    }

    if ($method === 'GET' && $path === '/notebooks') {
        $stmt = db()->prepare(
            'SELECT id, workspace_id, name
             FROM notebooks
             WHERE workspace_id = :workspace_id
             ORDER BY updated_at DESC, id DESC',
        );
        $stmt->execute(['workspace_id' => $workspaceId]);
        json_response(['notebooks' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && $path === '/notebooks') {
        $data = input();
        require_fields($data, ['name']);

        $stmt = db()->prepare(
            'INSERT INTO notebooks (workspace_id, name)
             VALUES (:workspace_id, :name)
             RETURNING id, workspace_id, name',
        );
        $stmt->execute([
            'workspace_id' => $workspaceId,
            'name' => trim((string) $data['name']),
        ]);

        json_response($stmt->fetch(), 201);
    }

    if ($method === 'PUT' && preg_match('#^/notebooks/(\d+)$#', $path, $matches)) {
        notebook_for_workspace((int) $matches[1], $workspaceId);
        $data = input();
        require_fields($data, ['name']);

        $stmt = db()->prepare(
            'UPDATE notebooks
             SET name = :name, updated_at = now()
             WHERE id = :id AND workspace_id = :workspace_id
             RETURNING id, workspace_id, name',
        );
        $stmt->execute([
            'id' => (int) $matches[1],
            'workspace_id' => $workspaceId,
            'name' => trim((string) $data['name']),
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
        $stmt = db()->prepare(
            'INSERT INTO notes (notebook_id, content)
             VALUES (:notebook_id, :content)
             RETURNING id, notebook_id, content, updated_at',
        );
        $stmt->execute([
            'notebook_id' => $notebook['id'],
            'content' => '',
        ]);

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
