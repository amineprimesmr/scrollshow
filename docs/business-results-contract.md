# Business results implementation contract

Worktree: `/Users/amine/.codex/worktrees/scrollshow-business-results`.
All work must target this isolated worktree. Existing production billing is unrelated and must remain unchanged. Read `/Users/amine/Desktop/scrollshow/CLAUDE.md` for current project conventions too.

## Ownership

- Data agent: `lib/business-analytics/model.ts`, `repository.ts`, `metrics.ts`, Drizzle schema and migration, data/metrics tests. May add Drizzle dependencies to package and lock. No existing store restructuring.
- Integrations agent: `lib/business-analytics/connectors/*`, `connections.ts`, `crypto.ts`, `oauth.ts`, `sync.ts`, provider OAuth callback/connect routes under `/api/business/connectors/*`, provider webhook route under `/api/business/webhooks/*`, connector tests. Coordinate model/repository contracts with data agent.
- UI agent: `components/studio/BusinessResultsView.tsx`, `BusinessConnectionsView.tsx`, `business-results.css`, `/app/analytics`, `/app/business-connections`, navigation link and integration in existing ConnectionsView. No API implementation. Use same design system and French/English.
- Root: common `/api/business/*` CRUD/report/tracking/import routes outside connectors/webhooks, public tracking redirect and bio, optional client snippet, MCP integration, creation workflow hooks, deletion, cron, integration and deployment.

## Common server API

API namespace `/api/business`. Every authenticated endpoint uses `readStudioSession` and session `id` + validated `projectId`; never trusts a request owner/project id. No business data in existing billing objects.

GET `/api/business/dashboard?days=30&horizon=30&currency=EUR`: returns dashboard built by metrics helper plus `settings`, public `connections`, `publications`, `links`, `costs`, `experiments`, `events`, `capabilities`. Data agent defines exact types and reports ASAP.
POST `/api/business/publications`: register/update a publication using a selected existing post/channel or validated URL/date; fields `contentId`, `channelId`, `externalId`, `title`, `publishedAt`, `format`, `hook`, `cta`, `destinationUrl`. User-supplied social counters never accepted.
POST `/api/business/links`: `{publicationId?, campaign?, label, destinationUrl}` -> tracked link.
POST `/api/business/costs`: `{publicationId?, contentId?, name, amountMinor, currency, category, incurredAt}`.
POST `/api/business/events`: manually recorded lead/activation/survey with explicit `source=manual`, never a provider-verified payment.
POST `/api/business/experiments`: `{name, hypothesis, metric, publicationIds, status}`.
PATCH `/api/business/settings`: `{currency, attributionWindowDays, horizonDays, siteUrl, bioSlug?, bioEnabled?}`.
POST `/api/business/import`: `{provider:'manual', csv:string, dryRun:boolean}` returns preview/errors; apply only valid explicit transaction rows, source clearly imported not provider verified.
GET `/api/business/export?kind=transactions|publications`: safe CSV, excludes secrets/customer identity.
POST `/api/business/connections`: provider setup keyed/manual fallback; integration agent defines exact interface.
POST `/api/business/connections/[id]/sync`, DELETE `/api/business/connections/[id]`: calls connector service, scope enforced.
GET `/api/business/connectors/[provider]/authorize` and callback: OAuth by integrations agent, only available with configured client and actual provider flow.
POST `/api/business/tracking/keys`: provision/rotate project ingestion key, plaintext returned once only. Readiness and installer instructions in dashboard.
POST `/api/business/tracking/ingest`: authenticated server-side ingestion, canonical events/signups/identities and conversion links; no unauthenticated claimed sales.

## UX invariants

No fake data or enabled-looking connection before verified; installed/live connection vs tracking working are separate. Empty states are functional. Provider OAuth approval missing = configuration required with real fallback only. Unknown is null, not zero. Separate calendar cash and mature publication horizons, preserve refunds and renewals. No magical attribution from a common bio link. Every proposed experiment stays observational unless genuinely randomized. Source, currency, scope, freshness and coverage always present. Existing content/recipe vs per-account publication distinct.

## Data contract workflow

Data agent publishes model.ts first. Other agents read it and send requests rather than changing it concurrently. Provider transaction IDs are stable per account/environment; event retry is not a sale. Currency integer minor units. Secret fields must never leave explicit server-only projections. No unbounded store JSON for events.
