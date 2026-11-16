# SchoolOS

A pnpm/Turborepo monorepo for school operations management.

## Workspace

- `apps/web` — Next.js App Router, admin portal, and API route handlers
- `apps/mobile` — Expo React Native app
- `packages/core` — pure JavaScript domain rules, Zod schemas, and Vitest tests
- `packages/db` — Mongoose models and tenant-aware utilities (server only)
- `packages/i18n` — English, Bangla, and Arabic strings
- `docs/specs` — plain-language rule specifications by domain

## Requirements

- Node.js 18.18 or newer
- pnpm 9.12.0 (Corepack is recommended)

## Local development

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm dev
```

The root `pnpm dev` starts workspace packages with a `dev` script. To run one app:

```bash
pnpm dev:web
pnpm dev:mobile
```

The admin portal is available at `http://localhost:3000/admin/dashboard`. Its routes are under `apps/web/app/admin`; shared shell components are in `apps/web/components/admin`. Pages are UI scaffolds only—the authentication, authorization, tenant context, persistence, and real data integrations still need to be implemented before production use.

Useful checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The workspace manifest and package scripts are configured for local installation. Run `pnpm install` to resolve dependencies and generate `pnpm-lock.yaml` for your environment.
