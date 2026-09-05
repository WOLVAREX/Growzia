# Growzia — SMM Panel Backend

TypeScript + Express + MongoDB backend for the Growzia social media boosting panel. Growzia resells engagement services by syncing two upstream catalogues, keeping only the cheapest source per canonical service, applying a configurable profit margin, and serving everything from MongoDB.

Upstream sources are never exposed on any customer-facing response. Provider identity, provider service ids, and raw base costs are stored with `select: false` and only reachable through authenticated admin endpoints.

---

## Quick start

```bash
npm install
cp .env.example .env      # then fill in real values
npm run build
npm start
```

Development mode with reload:

```bash
npm run dev
```

Tests and type checking:

```bash
npm test
npm run typecheck
```

Requirements: Node.js 18+ (native `fetch`), a reachable MongoDB instance.

If any required environment variable is missing or invalid, startup aborts with a plain list of what is wrong instead of a stack trace.

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | — | MongoDB connection string |
| `JWT_SECRET` | yes | — | JWT signing secret, minimum 16 characters |
| `PORT` | no | `5000` | HTTP port |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `FRONTEND_ORIGIN` | no | `http://localhost:5173` | Allowed CORS origins, comma separated |
| `ADMIN_EMAIL` | yes | — | Admin login email, also the admin authorization check |
| `ADMIN_USERNAME` | yes | — | Alternative admin login identifier |
| `ADMIN_PASSWORD` | yes | — | Admin login password |
| `BWM_API` | yes | — | Bearer token for the first upstream |
| `BWM_API_URL` | no | `https://xmdapis.bwmxmd.co.ke/api` | First upstream base URL |
| `CHEAPGAINS_API_KEY` | yes | — | API key for the second upstream |
| `CHEAPGAINS_API_URL` | no | `https://cheapgainske.co.ke/api/v2` | Second upstream base URL |
| `CHEAPGAINS_ACCOUNT_CURRENCY` | no | `KES` | Display currency of that upstream account, converted to KES during sync |
| `DEFAULT_MARGIN_PERCENT` | no | `15` | Markup applied on top of the cheapest base price |
| `DEFAULT_CURRENCY` | no | `KES` | Currency used when a request omits one |
| `USD_TO_KES` | no | `130` | Base FX anchor for the conversion table |
| `CATALOGUE_SYNC_INTERVAL_MINUTES` | no | `30` | Catalogue sync cadence |
| `ORDER_STATUS_SYNC_INTERVAL_MINUTES` | no | `10` | Open-order refresh cadence |
| `PROVIDER_TIMEOUT_MS` | no | `20000` | Outbound upstream request timeout |
| `CATALOG_CACHE_TTL_SECONDS` | no | `300` | In-memory catalogue cache TTL |

Every variable listed here is referenced by the code, and every variable referenced by the code is listed in `.env.example`.

---

## How pricing works

1. Both upstream catalogues are fetched in parallel on a schedule and on demand from the admin panel. If one upstream fails, the sync continues with whichever succeeded and records the failure in `SyncLog`.
2. Each raw service is normalized into `{ platformId, serviceType, isRegionVariant, baseKesPer1000 }`. Prices from the second upstream are converted to KES using `CHEAPGAINS_ACCOUNT_CURRENCY` before any comparison.
3. A canonical key is built as `${platformId}:${serviceType}:${isRegionVariant ? region : "global"}`.
4. Within each canonical key the entry with the lowest `baseKesPer1000` wins and is written to `ServiceCatalog`. Losers stay in `ProviderRawService` for auditing only.
5. `sellKesPer1000 = baseKesPer1000 * (1 + marginPercent / 100)`, rounded to 2 decimals. `marginPercent` comes from `AppSettings` when set by an admin, otherwise from `DEFAULT_MARGIN_PERCENT`.
6. Customer-facing prices are converted from KES into the requested currency at read time. Internal math always stays in KES.

Example: base 70 KES/1k from one upstream versus 400 KES/1k from the other for `instagram:Followers:global` resolves to the 70 KES entry, sold at 80.50 KES/1k with a 15% margin.

Catalogue reads never touch an upstream. They are served from MongoDB through an in-memory cache that returns stale data immediately and refreshes in the background, blocking only on the first cold read.

---

## Order flow

1. Validate `min`/`max` against the stored catalogue entry.
2. Compute cost in KES from `sellKesPer1000`, plus the display amount in the selected currency.
3. Deduct the balance atomically, guarding against banned accounts and insufficient funds.
4. Create the order as `pending`, then place it upstream using the stored winning source.
5. On success store the upstream reference and normalized status. On failure refund the balance, mark the order `failed`, and return a generic message that reveals nothing about the upstream.
6. A cron refreshes non-terminal orders, and `GET /api/boost/orders/:id/refresh` forces a refresh on demand.

Status strings are normalized into `pending | processing | completed | partial | failed | refunded`, case-insensitively and ignoring spaces, dashes, and underscores.

---

## API

### Customer authentication (`/api/auth`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | Create an account, returns a JWT |
| POST | `/login` | Log in, returns a JWT |
| GET | `/me` | Current account |
| POST | `/api-key` | Issue (or rotate) the account API key, shown once |
| DELETE | `/api-key` | Revoke the API key |

### Boost API (`/api/boost`)

Accepts a session JWT (`Authorization: Bearer <token>`) or an `X-API-Key` header. All routes return `503` while maintenance mode is on.

| Method | Path | Purpose |
|---|---|---|
| GET | `/services` | Catalogue, supports `?q=`, `?category=`, `?currency=` |
| GET | `/categories` | Distinct categories |
| GET | `/currencies` | Supported display currencies |
| POST | `/order` | Place an order — `{ serviceId, link, quantity, currency }` |
| GET | `/orders` | Current account's orders plus per-status stats |
| GET | `/orders/:id/refresh` | Force a status refresh |

### Reseller API (`/api/v2`)

Standard form-encoded SMM v2 interface, so Growzia's own customers can automate against it. Authenticate with `key` in the body.

| Action | Params | Response |
|---|---|---|
| `services` | `key`, `action` | Array of `{ service, name, type, category, rate, min, max, ... }` |
| `add` | `key`, `action`, `service`, `link`, `quantity` | `{ order }` |
| `status` | `key`, `action`, `order` | `{ charge, start_count, status, remains, currency }` |
| `balance` | `key`, `action` | `{ balance, currency }` |

### Admin API (`/api/admin`)

Every route except `/auth/login` and `/auth/logout` requires a JWT whose email matches `ADMIN_EMAIL`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Validate against the admin env credentials, issue a JWT and cookie |
| POST | `/auth/logout` | Clear the cookie |
| GET | `/auth/session` | Current admin session |
| GET | `/stats` | Users, orders (all-time and today), revenue, status breakdown, catalogue meta |
| GET | `/orders` | Paginated orders, filter by `status`, `user`, `service`, `providerOrderId` |
| POST | `/orders/:id/complete` | Manual completion override |
| POST | `/orders/:id/refresh` | Force an upstream status refresh |
| GET | `/catalog/meta` | Last sync, counts per source, merged count |
| POST | `/catalog/sync` | Trigger a sync now |
| GET | `/catalog/raw` | Side-by-side raw prices per canonical key with the winner marked |
| GET | `/catalog/sync-logs` | Recent sync runs |
| GET / POST | `/settings/maintenance` | Read or set maintenance mode |
| GET / POST | `/settings/margin` | Read or set the margin, repricing the catalogue on write |
| GET / POST | `/settings/disabled-services` | Hide or restore canonical services |
| GET | `/users` | Users, balances, ban status, API key usage |
| POST | `/users/:id/ban` | Ban an account |
| POST | `/users/:id/unban` | Lift a ban |
| POST | `/users/:id/balance` | Adjust a balance by `amountKes` |

`GET /api/health` reports process and database status.

---

## Upstream integrations

Both clients implement one shared interface (`ProviderClient`) with `fetchServices`, `placeOrder`, and `getOrderStatus`, so business logic never branches on a specific source.

### Source A (`BWM_API_URL`)

- JSON in, JSON out, `Authorization: Bearer ${BWM_API}`.
- `GET /services` → `{ data: [{ id, name, category, provider, price_per_1000_ksh, min, max }] }`, price already in KES per 1000.
- `POST /services/order` with `{ service_id, provider, link, quantity }` → `{ data: { order_id, status, cost_xd } }`.
- `GET /services/order/:orderId` → `{ data: { status, quantity } }`.
- A non-2xx response or `{ success: false, error: { message } }` is treated as a failure.

### Source B (`CHEAPGAINS_API_URL`)

- Single form-encoded endpoint, `key` in the body, `action` selects behavior.
- `action=services` → array of `{ service, name, category, rate, min, max, dripfeed, refill, cancel }`, where `rate` is per 1000 in `CHEAPGAINS_ACCOUNT_CURRENCY` and is converted to KES during sync.
- `action=add` with `service`, `link`, `quantity` → `{ order }`.
- `action=status` with `order` → `{ charge, start_count, status, remains, currency }`.
- `action=balance` → `{ balance, currency }`.

Keys for both sources live only in the environment and are used server-side only.

---

## Data model

| Collection | Purpose |
|---|---|
| `users` | Accounts, KES balance, ban flag, hashed API key with prefix and usage counters |
| `provider_raw_services` | Full audit trail of every raw entry from every sync run, no dedupe |
| `service_catalog` | Public deduplicated cheapest-wins catalogue with `sellKesPer1000` |
| `orders` | Customer orders, cost in KES and display currency, normalized status |
| `app_settings` | Key/value settings: `maintenanceMode`, `marginPercent`, `disabledServices` |
| `sync_logs` | One record per sync run with counts and any errors |

Indexes: unique `service_catalog.canonicalKey`, `service_catalog.platformId`, `orders.userId + createdAt`, `orders.status + createdAt`, `orders.providerOrderId`, `users.email`, and `provider_raw_services.providerCode + providerServiceId + syncedAt`.

---

## Project structure

```
src/
  lib/          env, db, logger, tokens, http errors, async handler
  models/       User, ProviderRawService, ServiceCatalog, Order, AppSettings, SyncLog
  services/     catalogSync, pricing, orders, statusNormalizer, classify, settings, providers/
  middleware/   auth, apiKeyAuth, sessionOrApiKey, adminAuth, maintenanceCheck, rateLimit, errorHandler
  routes/       auth, boost/, publicApiV2, admin/
  jobs/         catalogSyncCron, orderStatusCron
  app.ts        express assembly
  index.ts      entrypoint
tests/          pricing, catalog merge, route auth
```

---

## Security

- Upstream credentials stay server-side and are never returned by any endpoint.
- Passwords are bcrypt hashed, API keys are stored as SHA-256 hashes with a display prefix only.
- Order placement, customer login, admin login, and the reseller API are rate limited per IP and account.
- The centralized error handler returns `{ error: string }` and hides internal messages in production.
- Admin authorization requires both an `admin` role claim and an email match against `ADMIN_EMAIL`.
