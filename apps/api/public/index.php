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

function password_reset_ttl_minutes(): int
{
    $ttl = (int) env_value('PASSWORD_RESET_TTL_MINUTES', '60');
    return max(10, min(1440, $ttl));
}

function password_reset_link(string $token): string
{
    $base = trim((string) env_value('PASSWORD_RESET_URL', ''));
    if ($base === '') {
        $base = rtrim((string) env_value('APP_URL', 'http://localhost'), '/') . '/';
    }

    $separator = str_contains($base, '?') ? '&' : '?';
    return $base . $separator . 'reset_token=' . rawurlencode($token);
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
             RETURNING id, workspace_id, name',
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

    if ($method === 'POST' && $path === '/password/forgot') {
        $data = input();
        require_fields($data, ['email']);

        $email = trim((string) $data['email']);
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $stmt = db()->prepare('SELECT * FROM users WHERE email = lower(:email) LIMIT 1');
            $stmt->execute(['email' => $email]);
            $resetUser = $stmt->fetch();

            if ($resetUser) {
                $token = bin2hex(random_bytes(32));
                $expiresAt = gmdate(DATE_ATOM, time() + (password_reset_ttl_minutes() * 60));
                $pdo = db();
                $pdo->beginTransaction();

                try {
                    $pdo->prepare(
                        'UPDATE password_reset_tokens
                         SET used_at = now()
                         WHERE user_id = :user_id AND used_at IS NULL',
                    )->execute(['user_id' => $resetUser['id']]);

                    $stmt = $pdo->prepare(
                        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                         VALUES (:user_id, :token_hash, :expires_at)',
                    );
                    $stmt->execute([
                        'user_id' => $resetUser['id'],
                        'token_hash' => hash('sha256', $token),
                        'expires_at' => $expiresAt,
                    ]);

                    $pdo->commit();
                } catch (Throwable $exception) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    throw $exception;
                }

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
            'mail' => [
                'driver' => strtolower((string) env_value('MAIL_MAILER', 'log')),
                'configured' => strtolower((string) env_value('MAIL_MAILER', 'log')) === 'smtp'
                    && trim((string) env_value('MAIL_HOST', '')) !== ''
                    && trim((string) env_value('MAIL_FROM_ADDRESS', '')) !== '',
            ],
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
        $mail = send_test_email($user);
        json_response([
            'mail' => $mail,
            'message' => $mail['message'] ?? 'SMTP test failed.',
        ], $mail['sent'] ? 200 : 422);
    }

    if ($method === 'GET' && $path === '/workspace/export') {
        json_response(workspace_export_payload($user, $workspace));
    }

    if ($method === 'POST' && $path === '/workspace/import') {
        json_response(['imported' => import_workspace_payload(input(), $workspaceId)]);
    }

    if ($method === 'GET' && $path === '/search') {
        $query = trim((string) ($_GET['q'] ?? ''));
        if (strlen($query) < 2) {
            json_response(['notebooks' => [], 'notes' => []]);
        }

        $search = '%' . addcslashes($query, "\\%_") . '%';

        $stmt = db()->prepare(
            'SELECT id, workspace_id, name
             FROM notebooks
             WHERE workspace_id = :workspace_id
               AND name ILIKE :query ESCAPE \'\\\'
             ORDER BY updated_at DESC, id DESC
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

        json_response([
            'notebooks' => $notebooks,
            'notes' => $stmt->fetchAll(),
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

        $templateKey = isset($data['template_key']) ? trim((string) $data['template_key']) : null;
        $notebook = create_notebook_with_template($workspaceId, trim((string) $data['name']), $templateKey);
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
