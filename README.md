# QueryPanel Monorepo

Monorepo layout:

- `admin`: Next.js admin + landing site (deploy separately on Vercel)
- `api`: API service (deploy separately on Vercel)
- `admin/packages/react-sdk`: React SDK (managed as a git subtree)
- `admin/packages/node-sdk`: Node SDK (managed as a git subtree)
- `database`: Supabase project files and migrations
- `docs`: shared documentation

## Local workspace scripts

From repo root:

- `npm run dev:admin`
- `npm run dev:api`
- `npm run dev:react-sdk`
- `npm run dev:node-sdk`

## Vercel deployment model

Create independent Vercel projects and set each project's **Root Directory**:

- Admin project -> `admin`
- API project -> `api`
- React SDK Storybook project -> `admin/packages/react-sdk`

Each project deploys independently while living in one repository.

## Git subtree workflow for SDK packages

Use helper scripts:

- Pull updates from SDK repos:
  - `npm run subtree:pull:react-sdk`
  - `npm run subtree:pull:node-sdk`
- Push local SDK changes back:
  - `npm run subtree:push:react-sdk`
  - `npm run subtree:push:node-sdk`

Detailed instructions are in `docs/monorepo.md`.

## Git worktree workflow

Create parallel working directories for features:

- `npm run worktree:new -- feature/admin-redesign main`
- `npm run worktree:list`
- `npm run worktree:prune`

Worktrees are created under `.worktrees/`.
