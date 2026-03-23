# Project Requirements: InventoryFlow

## Overview
InventoryFlow is a multi-tenant SaaS platform for real-time inventory management across warehouses, retail stores, and e-commerce channels. The system tracks stock levels, handles purchase orders, processes incoming shipments, and synchronizes inventory across sales channels (Shopify, WooCommerce, custom POS).

## Architecture

### Backend Services
- **API Gateway**: Express.js with rate limiting, JWT auth, tenant isolation middleware
- **Inventory Service**: Core business logic — stock movements, reservations, adjustments
- **Sync Service**: Channel integrations — polls external APIs, reconciles discrepancies
- **Notification Service**: Alerts for low stock, failed syncs, order fulfillment delays
- **Worker Service**: Background jobs — nightly reconciliation, report generation, data archival

### Data Layer
- **Primary DB**: PostgreSQL 16 with row-level security for tenant isolation
- **Cache**: Redis 7 for hot inventory counts, session storage, job queues (BullMQ)
- **Search**: Elasticsearch for product catalog full-text search
- **Object Storage**: S3-compatible for import/export CSV files, report PDFs

### Infrastructure
- Docker containers orchestrated with Docker Compose (dev) / Kubernetes (prod)
- CI/CD via GitHub Actions
- Monitoring: Grafana + Prometheus + Loki
- Error tracking: Sentry

## Technical Requirements

### Language & Runtime
- TypeScript 5.x strict mode everywhere
- Node.js 20 LTS
- bun as package manager and test runner

### API Standards
- RESTful with OpenAPI 3.1 specs generated from code annotations
- Consistent error response format: `{ error: { code, message, details } }`
- Pagination via cursor-based approach (not offset)
- API versioning via URL prefix (`/v1/`, `/v2/`)

### Database Rules
- All schema changes through Prisma migrations (no raw DDL)
- Every table has `created_at`, `updated_at`, `tenant_id` columns
- Soft deletes only (`deleted_at` timestamp, never hard delete)
- Foreign keys and constraints enforced at DB level

### Security
- OWASP Top 10 compliance
- Input validation at API boundary (Zod schemas)
- SQL injection prevention via parameterized queries (Prisma handles this)
- Rate limiting: 100 req/min per tenant for standard tier
- Secrets in environment variables, never in code

### Testing
- Unit tests with vitest (>=80% coverage on business logic)
- Integration tests against real PostgreSQL (testcontainers)
- API contract tests validating OpenAPI spec compliance
- Load tests with k6 for critical endpoints (P99 < 200ms at 1000 RPS)

### Logging & Observability
- Structured JSON logging via pino
- Request correlation IDs on all logs
- OpenTelemetry traces for cross-service calls
- Custom metrics: inventory_sync_duration, order_fulfillment_time

## Non-Goals
- No frontend in this repo (separate Next.js app)
- No mobile app support (API-only)
- No real-time WebSocket feeds (v2 feature)
- No multi-region deployment (single region for MVP)
