# EnderConsents backend

NestJS + Prisma + PostgreSQL consent management API. Architecture and build
order are in [`../ARCHITECTURE.md`](../ARCHITECTURE.md); webhooks, the event
feed and idempotency keys are documented in [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md).

## Setting up from a fresh machine

Requires Git, Node.js 24+, and Docker Desktop.

```bash
git clone https://github.com/ImeW83/EnderConsents.git
cd EnderConsents

# PostgreSQL (host port 5434) and Redis (6379)
docker compose up -d

cd backend
cp .env.example .env     # then set JWT_SECRET (see below)
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
```

`.env` is git-ignored because it holds secrets. If you are restoring from a
backup, put the original file back instead of using the example. A new
`JWT_SECRET` works but signs out every existing session.

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Running

Two processes, so a slow customer endpoint can never slow down consent capture:

```bash
npm run start          # API on http://localhost:3000   (node dist/main)
npm run start:worker   # webhook delivery + consent expiry (node dist/worker)
```

Consent capture works with the worker stopped; webhook deliveries wait in the
database and are sent when it returns. Expiry events fire only while it runs.

Development with reload: `npm run start:dev` and `npm run start:worker:dev`.

## Tests

```bash
npm test
```

Some of the generated controller/service specs from the Nest scaffold were
already failing before any feature work (they need provider mocks). The
specs for the hash chains, receipts, webhook signing, SSRF rules and backoff
all pass. Feature behaviour was verified end to end against a running
instance rather than only through unit tests.

## Configuration

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API, worker | PostgreSQL connection string |
| `JWT_SECRET` | API | Signs dashboard login tokens |
| `PORT` | API | Default 3000 |
| `REDIS_URL` | worker | Default `redis://localhost:6379` |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS` | API, worker | `true` allows http/localhost webhook URLs. Development only, never in production |

## Backing up

Code is in git. Not in git: `backend/.env`, and the database (Docker volume
`enderconsents_postgres_data`). Back up the database with:

```bash
docker exec enderconsents-db pg_dump -U enderconsents enderconsents > backup.sql
```

Restore into a fresh database after `docker compose up -d`:

```bash
cat backup.sql | docker exec -i enderconsents-db psql -U enderconsents enderconsents
```

Redis holds only queue state; the webhook outbox lives in PostgreSQL, so Redis
can be lost without losing deliveries.
