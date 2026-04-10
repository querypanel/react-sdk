# Monorepo Setup and Workflow

This document defines how to run QueryPanel as one repo while keeping deploy and release boundaries clear.

## 1) Vercel projects (independent deployments)

Create separate Vercel projects from the same Git repository:

- `querypanel-admin` with root directory `admin`
- `querypanel-api` with root directory `api`
- `querypanel-react-sdk-storybook` with root directory `admin/packages/react-sdk`

Set environment variables per Vercel project. Do not rely on shared envs unless intended.

## 2) Workspace dependency linking

`admin` and `api` consume local SDK code via:

- `@querypanel/react-sdk: workspace:*`
- `@querypanel/node-sdk: workspace:*`

This allows monorepo-local development while SDKs remain publishable.

## 3) Git subtree policy for SDKs

SDK source-of-truth repos:

- `git@github.com:querypanel/react-sdk.git`
- `git@github.com:querypanel/node-sdk.git`

Use:

- Pull upstream SDK changes into monorepo:
  - `npm run subtree:pull:react-sdk`
  - `npm run subtree:pull:node-sdk`
- Push monorepo SDK changes back upstream:
  - `npm run subtree:push:react-sdk`
  - `npm run subtree:push:node-sdk`

Helper script: `scripts/subtree-sync.sh`

## 4) Migrating from nested repos to subtree-managed folders

If folders currently include embedded `.git` directories, convert them once:

1. Back up current state.
2. Remove embedded git metadata from folders that should be monorepo-owned:
   - `admin/.git`
   - `api/.git`
   - `database/.git`
   - `admin/packages/react-sdk/.git`
   - `admin/packages/node-sdk/.git`
3. Re-introduce SDK folders via `git subtree add` to preserve linkage.

Example:

```bash
git remote add react-sdk git@github.com:querypanel/react-sdk.git
git remote add node-sdk git@github.com:querypanel/node-sdk.git
git subtree add --prefix=admin/packages/react-sdk react-sdk main --squash
git subtree add --prefix=admin/packages/node-sdk node-sdk main --squash
```

After migration, never commit nested `.git` directories.

## 5) Git worktrees for parallel streams

Create a parallel branch workspace:

```bash
npm run worktree:new -- feature/api-rate-limits main
```

List:

```bash
git worktree list
```

Prune stale:

```bash
npm run worktree:prune
```

Helper script: `scripts/worktree-new.sh`
