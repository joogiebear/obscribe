<?php

declare(strict_types=1);

header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

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

        json_response([
            'token' => issue_token((int) $user['id']),
            'user' => public_user($user),
            'workspace' => ['id' => (int) $workspace['id'], 'name' => $workspace['name']],
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

    json_response(['message' => 'Route not found.'], 404);
} catch (PDOException $exception) {
    $status = str_contains($exception->getMessage(), 'users_email_key') ? 422 : 500;
    $message = $status === 422 ? 'An account with that email already exists.' : 'Database error.';
    json_response(['message' => $message], $status);
} catch (Throwable $exception) {
    json_response(['message' => 'Server error.'], 500);
}
