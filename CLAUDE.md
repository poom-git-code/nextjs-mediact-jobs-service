# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun run start:dev          # Run with hot reload
bun run start              # Run without hot reload
nest build                 # Compile TypeScript output to dist/

# Testing (Vitest is primary, Jest is secondary)
TZ=Asia/Bangkok vitest run                                  # Run all tests once
TZ=Asia/Bangkok vitest                                      # Run in watch mode
TZ=Asia/Bangkok vitest run --coverage                      # With coverage report
vitest run --config ./test/vitest-e2e.config.ts            # E2E tests only
vitest run test/app/usecases/some.usecase.spec.ts          # Single test file

# Code quality
bun run lint               # ESLint with auto-fix
prettier --write "src/**/*.ts"  # Format source files

# Database
bunx prisma migrate dev --name <migration_name>   # Create and apply migration
bunx prisma generate                               # Regenerate Prisma client
```

## Architecture

**Stack:** NestJS 11 + Fastify adapter, Bun runtime, TypeScript, Prisma 7 (MySQL/MariaDB), Vitest

**Entry:** `src/main.ts` — Fastify, port 8084, Swagger at `/docs` (non-prod only). Global: `ValidationPipe`, `CustomResponseInterceptor`, `AllExceptionsFilter`, correlation middleware, language middleware.

### Layer Structure

```
Controller → Usecase → Service → Repository
                    ↘ External Service
```

- **Controllers** (`src/app/controllers/`) — HTTP + SQS message handlers. Four controllers: `api`, `consumer`, `internal-job`, `master-data`.
- **Usecases** (`src/app/usecases/`) — Business orchestration, coordinate repos/services, manage Prisma transactions. Throw `BussinessException` for domain errors.
- **Services** (`src/app/services/`) — `JobsService` (lifecycle), `JobMatchService` (matching algorithm), `RecipientGeneratorService` (notification targeting), `NotificationService` (external API).
- **Repositories** (`src/app/repositories/`) — Split into write repos (CUD operations) and read repos (queries with joins/projections). Always use read repos for SELECT-only paths.
- **Domains** (`src/app/domains/`) — Enums and value objects: `JobStatus`, `ApplicantStatus`, `Event`, `PublishGroup`, `RoleMapping`, `Topic`, `MatchCriteria`, `ExperienceRange`, `Localize`.

### Async Processing (SQS)

Two FIFO SQS queues handled in `ConsumerModule`:
- `job-recipient-queue` — generates notification recipient lists (max 3 retries, 400 users/batch)
- `job-match-queue` — job matching algorithm (max 1 retry)

### Key Configuration

- Custom headers: `x-api-key`, `x-user-id`, `x-language`
- Guards: `RequireApiKey` (API key validation), user ID extracted from `x-user-id` header
- Rate limit: 30 requests / 10 seconds globally
- DB connection pool: max 3 connections, 5s max wait, 10s transaction timeout
- Environments: `deployment/environment/{development,staging,qa,production}.env`

### Test Coverage Scope

Tests focus on **usecases and services** only. The following are intentionally excluded from coverage:
- `src/app/repositories/`
- `src/app/controllers/`
- `src/app/external-services/`
- `src/app-configs/`
- `src/modules/`

Test mocks live in `test/mock/`. Use `TZ=Asia/Bangkok` when running tests to match production timezone.

The implementation must align with the existing patterns and .instruction.md