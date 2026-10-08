# EnderConsents — Technical Architecture

**Product:** Multi-tenant SaaS Consent Management Platform
**Built by:** Endermonks
**Status:** Foundation phase

---

## 1. Core Principle

Every design decision follows this pipeline: COLLECT → VALIDATE → RECORD → PROVE → ENFORCE → AUDIT → INTEGRATE

And the product is fundamentally: IDENTITY + PURPOSE + NOTICE + CONSENT STATE + VERSIONING + EVIDENCE + AUDIT + ENFORCEMENT + INTEGRATION


**Never** model consent as `user_id + consent:boolean`. Consent is a *history*, not a flag.

---

## 2. Multi-Tenancy Strategy

**Approach:** Shared database, shared schema, tenant isolation via `organizationId` on every tenant-scoped table.

- Every query MUST filter by `organizationId` — enforced at the service layer, never trusted from client input alone
- `organizationId` is derived from the authenticated API key / JWT, never accepted as a raw request parameter for data access
- This is simpler to operate than database-per-tenant while still being safe, and is the standard approach for early-stage multi-tenant SaaS. Can migrate to schema-per-tenant or DB-per-tenant later if a large enterprise client demands it.

---

## 3. Database Schema (Core Entities)

Organization
id, name, slug, plan, status, createdAt

User (Organization staff / admins)
id, organizationId, email, passwordHash, role, mfaEnabled, createdAt

Role (RBAC)
id, organizationId, name, permissions[]

Subject (the end customer / data subject)
  id, organizationId, externalRef, email, phone, locale, createdAt

SubjectIdentifier (links a subject to multiple identifiers, hashed for lookup)
  id, subjectId, type (email|phone|external_ref|device_id),
  valueHash, valuePlain, createdAt
  [unique: type + valueHash]

Purpose
id, organizationId, key, name, description, category, isActive

PurposeVersion
id, purposeId, version, name, description, legalBasis, effectiveFrom, createdAt

NoticeVersion (Privacy Notice / Terms)
id, organizationId, version, language, content, effectiveFrom, createdAt

ConsentState (current snapshot — one row per subject+purpose)
  id, organizationId, subjectId, purposeId, status, expiresAt,
  purposeVersionId, noticeVersionId, updatedAt
  [unique: subjectId + purposeId]

ConsentEvent (immutable — the actual history)
  id, consentStateId, action (granted|withdrawn|renewed|expired),
  actorType (subject|admin|system), actorId, channel (web|mobile|qr|api|import),
  ipAddress, userAgent, purposeVersionId, noticeVersionId,
  previousEventHash, eventHash, timestamp
  — each event snapshots the exact purpose/notice version agreed to, and
    chains to the previous event's hash for tamper-evidence

ConsentReceipt (cryptographic proof, generated per event)
id, consentEventId, receiptHash, payload (JSON snapshot), issuedAt

AuditRecord (system-wide, append-only, covers non-consent actions too)
id, organizationId, actorType, actorId, action, entityType, entityId,
details, timestamp

ApiKey
id, organizationId, hashedKey, scopes[], createdAt, revokedAt

Webhook
id, organizationId, url, events[], secret, isActive


**Key rule:** `ConsentEvent` rows are NEVER updated or deleted. `ConsentState` is a derived snapshot that gets recalculated/updated when a new event is recorded — it exists purely for fast lookups ("is this subject currently consented to this purpose?"), while `ConsentEvent` is the source of truth for "what happened and when."

---

## 4. Module Structure (NestJS)

src/
├── modules/
│ ├── auth/ # OAuth/OIDC, JWT, API keys, MFA
│ ├── organizations/ # tenant management
│ ├── users/ # staff accounts + RBAC
│ ├── subjects/ # identity/subject management
│ ├── purposes/ # purpose + purpose versioning
│ ├── notices/ # privacy notice versioning
│ ├── consent/ # consent state machine + events (CORE MODULE)
│ ├── receipts/ # consent receipt generation
│ ├── audit/ # immutable audit log
│ ├── webhooks/ # outbound event delivery
│ ├── integrations/ # CRM/email/SMS/WhatsApp connectors
│ └── reporting/ # analytics, compliance reports
├── common/
│ ├── guards/ # tenant isolation guard, auth guards
│ ├── decorators/
│ ├── filters/
│ └── interceptors/
├── config/
└── main.ts


---

## 5. API Contract

- **Versioned from day one:** `/api/v1/...`
- **REST, OpenAPI/Swagger documented** — every endpoint self-documents
- **Auth:** Bearer JWT for dashboard users, API keys (`X-API-Key`) for server-to-server/SDK calls
- **All tenant-scoped endpoints** derive `organizationId` from the authenticated principal — never from the URL/body

Core endpoint groups:
/api/v1/auth/*
/api/v1/organizations/*
/api/v1/subjects/*
/api/v1/purposes/*
/api/v1/notices/*
/api/v1/consent/* ← the heart of the product
/api/v1/consent/:id/withdraw
/api/v1/consent/:id/renew
/api/v1/receipts/*
/api/v1/audit/*
/api/v1/webhooks/*
/api/v1/reports/*

/api/v1/auth/*
/api/v1/organizations/*
/api/v1/subjects/*
/api/v1/purposes/*
/api/v1/notices/*
/api/v1/consent/* ← the heart of the product
/api/v1/consent/:id/withdraw
/api/v1/consent/:id/renew
/api/v1/receipts/*
/api/v1/audit/*
/api/v1/webhooks/*
/api/v1/reports/*


---

## 6. Recommended Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, TanStack Query |
| Backend | Node.js, TypeScript, NestJS, Prisma |
| Database | PostgreSQL (primary), Redis (cache/queues) |
| Queue | BullMQ |
| Storage | S3-compatible object storage |
| Infra | Docker → AWS (or equivalent) |
| API Docs | OpenAPI/Swagger |
| Security | OAuth/OIDC, MFA, RBAC, TLS, KMS/secrets manager |

---

## 7. Build Order

**Phase 1 — Foundation (solo build)**
1. Repository + architecture ✅ (this document)
2. Database architecture
3. Multi-tenancy
4. Authentication
5. RBAC
6. Organization management
7. Subject/identity management
8. Purpose management
9. Purpose versioning
10. Privacy notice versioning
11. Consent state machine
12. Consent events
13. Immutable audit system

**Phase 2 — Product (bring in help here)**
14. Consent receipts
15. Consent APIs
16. Withdrawal APIs
17. Webhooks/event system
18. Admin dashboard
19. Preference centre
20. Web SDK

**Phase 3 — Go to market**
21. Consent banner/CMP
22. Hosted consent forms
23. QR/offline consent
24. Integrations (SMS, CRM, WhatsApp)
25. Reporting/analytics
26. Security hardening
27. Automated testing
28. CI/CD
29. Monitoring
30. Production deployment

**Golden rule:** Don't start with the dashboard. Build the consent engine and its data model first — the dashboard is just one interface to the real product.

---

## 8. Sri Lanka-First Differentiators (Phase 3)

English / Sinhala / Tamil · QR-based consent · offline/tablet collection · branch-based orgs · local SMS integrations · PDPA-aligned reporting

Built internationally from day one — Sri Lanka is the beachhead market, not a technical ceiling.