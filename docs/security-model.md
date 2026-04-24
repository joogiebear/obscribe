# Obscribe Security Model

Obscribe starts with a single shared database for the SaaS version, but every record is scoped through users, workspaces, memberships, roles, and policies.

## Core Principle

No controller, job, query, or API endpoint should access notebook data without resolving the current user's workspace context first.

## Primary Scope Chain

```txt
User -> WorkspaceMembership -> Workspace -> Notebook -> Note
```

## Tenant Scoped Tables

Most product tables should include `workspace_id`.

Examples:

- notebooks
- notes
- folders
- tags
- note_versions
- attachments
- billing_entitlements
- audit_logs

## Required Security Controls

### 1. Laravel Policies

Every protected model must have a policy.

Examples:

- NotebookPolicy
- NotePolicy
- WorkspacePolicy
- AttachmentPolicy

Controllers should use policy checks before returning or mutating records.

### 2. Scoped Queries

Never query notebook data globally.

Bad:

```php
Notebook::findOrFail($id);
```

Good:

```php
$currentWorkspace->notebooks()->whereKey($id)->firstOrFail();
```

### 3. Workspace Middleware

Authenticated requests should resolve the active workspace and ensure the user is a member.

### 4. Role-Based Access Control

Initial roles:

- owner
- admin
- editor
- viewer

### 5. Database Constraints

Use foreign keys, unique constraints, and indexes that include `workspace_id` where appropriate.

Example:

```txt
unique(workspace_id, slug)
index(workspace_id, created_at)
```

### 6. Audit Logging

Important actions should be logged:

- login
- notebook created/deleted
- note exported
- user invited/removed
- billing plan changed

### 7. File Isolation

Object storage keys should include workspace and notebook identifiers.

Example:

```txt
workspaces/{workspace_id}/notebooks/{notebook_id}/attachments/{uuid}
```

### 8. API Response Filtering

Never expose internal IDs, billing data, or cross-workspace metadata unless explicitly required.

## SaaS vs Self-Hosted

Self-hosted instances can run with `OBSCRIBE_EDITION=selfhosted`, but still use the same security model. Self-hosted users get unlimited limits, not weaker authorization.
