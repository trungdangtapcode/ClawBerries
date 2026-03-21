# Automated Enterprise Lead Discovery & Outreach — Master Plan

## Executive Summary

A platform that empowers SMBs to discover, qualify, and engage enterprise prospects at scale — powered by **OpenClaw** (lead intelligence) and **TinyFish** (multi-channel outreach automation). The system replaces manual prospecting with an automated pipeline: discover leads via signals, score them, and execute personalized multi-channel outreach — with a feedback loop that continuously improves targeting and messaging.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SMB User Dashboard                            │
│  (ICP Config, Sequence Builder, Analytics, Lead Management)          │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────┐
│                         Core Platform                                │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ Module 1    │  │ Module 2     │  │ Module 3     │  │ Module 4 │ │
│  │ DISCOVERY   │→ │ QUALIFICATION│→ │ OUTREACH     │→ │ PERSONA- │ │
│  │ (OpenClaw)  │  │ (Scoring)    │  │ (TinyFish)   │  │ LIZATION │ │
│  └─────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Module 5: TRACKING & FEEDBACK LOOP                           │    │
│  │ (Engagement metrics → Score recalibration → Message tuning)  │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Module 1: Discovery (OpenClaw Integration)

### Purpose
Scan external data sources to identify enterprise companies whose pain points, tech stack, or business signals align with what the SMB offers.

### Key Components

**1.1 ICP (Ideal Customer Profile) Configuration Engine**
- Guided wizard for SMB users to define their target:
  - Industry verticals (SIC/NAICS codes)
  - Company size bands (employee count, revenue ranges)
  - Geographic targeting
  - Tech stack requirements (e.g., "uses Salesforce but not HubSpot")
  - Pain-point keywords (terms in job postings, forums, reviews)
  - Negative filters / exclusions (competitors, existing customers)
- MVP: wizard-style guided setup
- Phase 2: advanced boolean filter builder for power users

**1.2 Signal Ingestion Pipeline**
Each data source gets its own ingestion adapter behind a common interface.

| Source | Signal Value | MVP/Phase 2 |
|--------|-------------|-------------|
| Job postings (LinkedIn, Indeed) | High — hiring = budget + active need | MVP |
| Tech stack databases (BuiltWith, Wappalyzer) | High — direct stack fit indication | MVP |
| Funding events (Crunchbase) | High — budget availability | MVP |
| Intent data (G2/Bombora) | Very High — active research behavior | MVP |
| Social signals (LinkedIn posts, Twitter) | Medium — noisy | Phase 2 |
| Review platforms (G2 negative competitor reviews) | Medium — switching intent | Phase 2 |
| News & press releases | Medium — expansion signals | Phase 2 |
| Web presence changes | Medium — strategic shifts | Phase 2 |

Output: Normalized event records `{source, company_identifier, signal_type, signal_payload, timestamp, confidence}`

**1.3 Entity Resolution & Deduplication**
- Canonicalize company identities using domain name as primary key
- MVP: domain-based matching (covers ~80% of cases)
- Phase 2: fuzzy name matching, subsidiary detection, alias management

**1.4 OpenClaw Matching Engine**
- Hard filters first: eliminate companies failing must-have ICP criteria
- Soft scoring second: rank remaining companies by ICP dimension coverage
- Recency weighting: time-decay function on signals (job posting half-life ~30-60 days, funding ~3-6 months, tech stack ~6-12 months)
- Output: stream of `CandidateLead` records into Module 2

### Signal Strength Ranking (Strongest to Weakest)
1. Direct intent data (actively researching product category)
2. Relevant job postings (hiring for roles your product supports)
3. Competitor negative sentiment (switching readiness)
4. Tech stack gaps (complementary tools present, category you fill absent)
5. Funding events (budget available)
6. Expansion signals (new offices, markets, products)
7. Leadership changes (new CTO re-evaluates stack within 6 months)

---

## Module 2: Qualification (Lead Scoring & Prioritization)

### Scoring Model
- **MVP: Rule-based** with configurable weights (works from day one, no training data needed)
- **Phase 2: Hybrid** — ML layer adjusts weights based on conversion outcomes; rule-based as fallback + explainability

### Scoring Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Firmographic Fit | 20-25% | Company size, industry, geography, maturity match to ICP |
| Tech Stack Fit | 20-25% | Complementary tech presence, competitor product absence |
| Intent Signals | 25-30% | Active research, relevant job postings, content engagement |
| Recency & Momentum | 10-15% | Signal freshness, increasing signal frequency |
| Budget Indicators | 10-15% | Funding, revenue growth, hiring velocity |
| Engagement History | 5-10% | Website visits, prior email opens (Phase 2) |

### Lead Tiers

| Tier | Score | Action |
|------|-------|--------|
| **Hot** | 80-100 | Auto-qualify for immediate TinyFish outreach + alert user |
| **Warm** | 60-79 | Queue for outreach at lower priority / nurture sequences |
| **Cool** | 40-59 | Monitor — promote to Warm if score rises |
| **Cold** | 0-39 | Deprioritize, re-evaluate monthly |

Thresholds are configurable per SMB.

### Auto-Qualification Gates (ALL must pass)
1. **Signal diversity**: Signals from >= 2 different source categories
2. **Recency**: At least one signal from last 14 days
3. **No blockers**: Not on suppression list (existing customers, opt-outs, competitors)
4. **Contact availability**: At least one reachable contact (name + email or LinkedIn)
5. **Score threshold**: Composite score >= configured threshold (default: 75)

If any gate fails → lead stays in manual review queue, not auto-enrolled.

### Daily Digest
Each morning: surface top N leads that crossed a tier threshold in the last 24 hours.

---

## Module 3: Automated Multi-Channel Outreach (TinyFish Integration)

### Key Components

**3.1 Sequence Engine**
- Event-driven state machine (not cron-based)
- Maintains per-prospect state: current step, wait timers, pause/resume, exit conditions
- Schedules discrete future events into a delayed job queue
- MVP: linear sequences
- Phase 2: DAG-based sequences with conditional branching

**3.2 Channel Adapters**

| Channel | Key Constraints | MVP/Phase 2 |
|---------|----------------|-------------|
| Email | Domain warmup, sending reputation, daily volume caps | MVP |
| LinkedIn | ~25 connection requests/day, ~50 messages/day, anti-detection | MVP |
| SMS | TCPA consent required, 10DLC registration, quiet hours | Phase 2 |
| Phone/Voicemail | DNC list, state regulations | Phase 2 |

**3.3 Rate Limiter (Redis-backed)**
Multi-dimensional limits:
- Per-account (LinkedIn account X: 20 more connection requests today)
- Per-domain (max 5 emails to @acme.com per day)
- Per-channel global throughput
- Per-time-window (spread sends across business hours)

Implementation: Token bucket algorithm, each adapter calls `rate_limiter.acquire()` before sending. Denied → re-enqueue with backoff.

**3.4 Email Domain Warmup Schedule**
- Week 1: 50/day → Week 2: 100/day → Week 3: 200/day → Week 4: 500/day → Week 5+: 1000/day
- Auto-throttle if bounce rate > 5% or spam complaint rate > 0.1%

### Sequence Model

```
Sequence
├── entry_criteria (what triggers enrollment)
├── global_exit_conditions (reply, meeting booked, unsubscribe, manual)
├── steps[]
│   ├── channel (email | linkedin | sms | wait)
│   ├── delay_from_previous ("3 business days")
│   ├── send_window ("Tue-Thu 9am-11am prospect local time")
│   ├── message_template_id
│   └── conditions[] (Phase 2: branching)
└── ab_test_config (optional)
```

### Enrollment Triggers

| Trigger | Source |
|---------|--------|
| Lead qualification | OpenClaw scores lead above threshold |
| Signal detection | Funding event, new job posting |
| Manual enrollment | SDR adds from UI |
| Re-engagement | Cold lead re-activated after 60 days |
| CRM stage change | Deal moved to "Evaluating" |
| List import | CSV upload, webinar attendees |

Enrollment deduplication: check if prospect is already active in same/similar sequence.

### A/B Testing
- **MVP**: Message-level (2 variants per step, auto-promote winner after statistical significance)
- **Phase 2**: Sequence-level (compare entirely different sequences)

---

## Module 4: Personalization at Scale

### Approach: Hybrid (Recommended)

| Approach | Verdict |
|----------|---------|
| Template + variables only | Too robotic at scale |
| Full LLM generation | Too risky (hallucination) and expensive unsupervised |
| **Hybrid** | Human-authored message skeletons + LLM fills personalized sections |

### How It Works
1. **Human-authored skeletons** define structure, CTA, and brand voice
2. **LLM fills constrained personalized sections** using enriched prospect data
3. **Post-generation guardrails** validate output before sending

### Enrichment Data Pipeline

| Source | Data Provided |
|--------|--------------|
| OpenClaw | Name, title, company, industry, size |
| Company news feed | Recent funding, launches, hires |
| LinkedIn profile | Role tenure, career history, recent posts |
| Technographic data | Tech stack |
| Intent signals | Research topics |
| Prior engagement | Past opens, clicks, conversations |

All compiled into a **Prospect Context Object** (structured JSON) as single input to personalization.

### LLM Model Tiering (Phase 2)
- **Tier 1** (score >= 90): Frontier model (Claude Opus / GPT-4) — max quality
- **Tier 2** (standard): Mid-tier model (Claude Sonnet / GPT-4o-mini) — 5-10x cheaper
- **Tier 3** (bulk/low-priority): Template-only, no LLM call

Cost estimate at 10K prospects/month, 4 messages each: ~$240/month in LLM costs.

### Brand Voice Configuration
Per-tenant document:
- Tone descriptors, vocabulary rules, prohibited phrases
- Example "good" and "bad" messages (few-shot LLM examples)
- Per-channel tone adjustments

### Guardrail Pipeline (every message)
1. **Factual grounding**: Every claim must trace to Prospect Context Object
2. **Prohibited content filter**: No competitor mentions, price guarantees, sensitive topics
3. **Brand voice compliance**: Score against brand voice config
4. **Channel compliance**: CAN-SPAM headers/unsubscribe (email), opt-out instructions (SMS)
5. **Human review queue**: First N messages of new templates go to human review

Fallback: If guardrails fail after 2 retries → send template-only version (degrade gracefully).

---

## Module 5: Tracking & Feedback Loop

### Engagement Metrics

| Channel | Metrics Tracked |
|---------|----------------|
| Email | Open rate, click rate, reply rate, bounce rate, unsubscribe |
| LinkedIn | Connection acceptance, message reply, profile view-back |
| SMS | Delivery rate, response rate |
| Conversion | Meeting booked, demo completed, opportunity created, deal closed |

### Closed-Loop Feedback Architecture

```
[Outreach Event] → [Engagement Tracker] → [Event Bus]
    ├──→ Lead Scoring Service (update engagement score in real-time)
    ├──→ Message Optimizer Service (update variant performance stats)
    └──→ Sequence Engine (decide next step / exit conditions)
```

### Lead Score Modification (MVP)

| Event | Score Delta |
|-------|------------|
| Email opened | +2 |
| Email link clicked | +5 |
| Email replied (positive) | +15 |
| Email replied (negative) | -20 |
| LinkedIn connection accepted | +10 |
| LinkedIn message replied | +15 |
| Meeting booked | +30 |
| No response after full sequence | -10 |
| Hard bounce | -50 |

Phase 2: Replace with logistic regression trained on conversion data per tenant.

### Automatic Sequence Adjustments (MVP)
1. **Positive reply** → Pause sequence, alert sales rep
2. **Negative reply / unsubscribe** → Remove from sequence, add to suppression
3. **Channel failover** → Email bounces → try LinkedIn → try SMS
4. **Timing adjustment** → Opens but no reply → increase delay; clicks links → decrease delay
5. **Circuit breaker** → Sequence reply rate < 1% after 200+ sends → pause and alert

Phase 2: ML-driven send-time optimization, multi-armed bandit for channel sequencing.

### Attribution
- **MVP**: Last-touch attribution
- **Phase 2**: Multi-touch weighted (40% first touch, 40% last touch, 20% middle touches)

### Dashboards

**Dashboard 1: "How's my outreach doing?" (Home)**
- Meetings booked this week/month (hero metric)
- Active leads in sequences, reply rate, health score
- Top/bottom 3 performing sequences

**Dashboard 2: "What's working?" (Optimization)**
- Channel comparison, best subject lines, best templates
- Best time/day heatmap, ICP segment performance
- A/B test results

**Dashboard 3: "Pipeline" (Phase 2)**
- Funnel: Sourced → Contacted → Engaged → Meeting → Opportunity → Closed
- Channel attribution, revenue attribution, cohort analysis

---

## System Architecture

### Pattern: Modular Monolith (MVP) → Event-Driven Services (Phase 2)

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│               (Auth, Rate Limiting, Routing)             │
├──────────┬──────────┬──────────┬────────────────────────┤
│  Lead    │ Sequence │ Engage-  │   Analytics &          │
│  Module  │ Module   │ ment     │   Attribution          │
│          │          │ Tracker  │   Module               │
├──────────┴──────────┴──────────┴────────────────────────┤
│            Internal Event Bus (in-process)               │
│       (upgradeable to external broker in Phase 2)        │
├─────────────────────────────────────────────────────────┤
│            Shared Infrastructure Layer                    │
│       (PostgreSQL, Redis, Queue, Tenant Context)         │
└──────────┬──────────────────────────────┬───────────────┘
           │                              │
      ┌────┴────┐                   ┌─────┴─────┐
      │ OpenClaw │                   │ TinyFish   │
      │  API     │                   │   API      │
      └─────────┘                   └───────────┘
```

**Why modular monolith for MVP**: Small team (3-8 engineers), avoids distributed systems overhead, clean module boundaries allow extraction later.

**Phase 2 extraction order**: (1) Engagement Tracker (highest event volume, write-heavy), (2) Sequence Engine (needs independent scaling, isolation from dashboard).

### Database

**PostgreSQL** (primary — handles everything at MVP):
- Lead data, sequences, engagement events, analytics rollups, tenant data
- JSONB for flexible enrichment data
- Table partitioning by `tenant_id` and `created_at`
- Row-Level Security for multi-tenant isolation
- Full-text search (replace with Elasticsearch in Phase 2 if needed)

**Redis** (operational):
- Rate limiting counters, caching, real-time dedup, session management

Phase 2 additions: TimescaleDB/ClickHouse for analytics at scale, Elasticsearch for advanced lead search.

### Job Queue
- **MVP**: PostgreSQL-backed (pgBoss / Graphile Worker) — no extra infra, transactional job creation
- **Phase 2**: External broker (SQS+SNS or Cloud Pub/Sub) when services are extracted

### Internal Event Bus
Events: `lead.created`, `lead.enriched`, `lead.scored`, `sequence.enrollment.created`, `sequence.step.executed`, `engagement.event.received`, `conversion.detected`

### External API Integration
Adapter/anti-corruption layer wrapping OpenClaw and TinyFish APIs:
- Isolates external data models from core domain
- Single-file change if API version changes or provider swapped
- Circuit breakers, retries, rate limiting at adapter level

### Multi-Tenancy
- Shared database, shared schema, row-level isolation
- Every table has `tenant_id`, every query is scoped
- PostgreSQL Row-Level Security as defense-in-depth
- Tenant-scoped indexes (leading `tenant_id` column)
- Channel credentials encrypted with per-tenant key in KMS

### API Design
- REST for CRUD, WebSocket for real-time notifications
- JWT auth with short-lived access tokens (15 min) + refresh tokens (7 days)
- Role-based access: Owner, Admin, Member, Viewer

---

## Compliance

| Regulation | Channel | Key Requirements |
|------------|---------|-----------------|
| CAN-SPAM | Email | Physical address, unsubscribe link, accurate From, honor opt-outs within 10 days |
| GDPR | All (EU) | Legitimate interest basis, right to erasure, data minimization |
| TCPA | SMS/Phone | Prior express written consent, DNC registry, quiet hours (8am-9pm local) |
| LinkedIn ToS | LinkedIn | Prohibits automation — mitigate with multi-account rotation, human-like delays, daily limits below actual |

---

## Infrastructure

### Deployment
- **MVP**: Single-region, containerized (ECS Fargate or Cloud Run)
- Blue-green deployments, backward-compatible migrations
- **Phase 2**: Multi-region with read replica

### Monitoring & Alerting
- Metrics: Prometheus + Grafana or Datadog
- Critical alerts: API error rate > 5%, queue backing up, DB connections exhausted, deliverability drops
- Structured JSON logs with `tenant_id`, `request_id`
- Phase 2: OpenTelemetry distributed tracing

### Data Retention
| Data | Hot | Archive | Delete |
|------|-----|---------|--------|
| Lead data | While tenant active | N/A | On tenant/lead deletion |
| Engagement events | 12 months | 12-36 months (Parquet in S3) | After 36 months |
| Analytics rollups | 24 months | Indefinite | On tenant deletion |
| Logs | 30 days | 90 days | After 90 days |

### Disaster Recovery
- RPO: 1 hour | RTO: 4 hours
- PostgreSQL: daily snapshots + continuous WAL archiving
- Redis: ephemeral, rebuilt from PostgreSQL on failure
- Phase 2: multi-region active-passive with 15-minute failover

---

## Phased Delivery Roadmap

### MVP — Months 1-3 (Team: 3-4 engineers)

**Discovery**: ICP wizard, 4 ingestion adapters (jobs, tech stack, funding, intent), domain-based entity resolution, hard-filter matching with soft scoring

**Qualification**: Rule-based scoring with configurable weights, 4-tier prioritization, qualification gates, daily digest, manual override, suppression list

**Outreach**: Linear sequences (email + LinkedIn only), basic rate limiting, manual + auto enrollment, message-level A/B testing (2 variants), exit conditions (reply, manual), email event webhooks

**Personalization**: Hybrid skeletons + LLM, basic enrichment (OpenClaw data + news), single model tier, prohibited content filter + CAN-SPAM checks, human review for first 10 messages per template, template-only fallback

**Tracking**: Core engagement metrics, rule-based score updates, last-touch attribution, home + optimization dashboards, rule-based sequence adjustments

**Infrastructure**: Modular monolith, PostgreSQL + Redis, pgBoss queue, single-region deployment, basic monitoring + alerting

### Phase 2 — Months 4-6

- Additional signal sources (social, reviews, news, web changes)
- ML scoring layer trained on conversion data
- DAG-based sequences with conditional branching
- SMS channel (TCPA compliance)
- Model tiering for personalization (frontier/mid/template)
- Factual grounding verification in guardrails
- Multi-touch attribution
- Send-time optimization
- Advanced analytics dashboards (pipeline, cohort, revenue)
- Extract Engagement Tracker + Sequence Engine into services

### Phase 3 — Months 7+

- Phone/voicemail channel
- AI SDR (automated reply handling, objection handling)
- Dynamic sequence optimization (auto-adjust timing, channel mix, step count)
- Lookalike modeling ("find more companies similar to this converted lead")
- Multi-language support
- Multi-region deployment with automated failover
- CRM deep integration (Salesforce, HubSpot)

---

## Key Architectural Decisions & Trade-offs

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scoring model | Rule-based → Hybrid | Cold start problem — ML needs data you don't have at launch |
| Architecture | Modular monolith → Extract | Small team, avoid distributed systems overhead |
| Database | PostgreSQL for everything | One DB to operate, JSONB handles flexible data, RLS handles tenancy |
| Personalization | Hybrid (skeleton + LLM) | Template = too robotic, Full LLM = hallucination risk |
| Job queue | PostgreSQL-backed | Zero extra infra, transactional consistency |
| Entity resolution | Domain-based (MVP) | Covers 80% of cases, defer complexity |
| Attribution | Last-touch (MVP) | Simple, explainable, sufficient for SMBs |
| Multi-tenancy | Shared schema + RLS | Many small tenants, can't operate DB-per-tenant |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Email deliverability degradation | High — core channel stops working | Domain warmup, auto-throttle, monitoring, bounce rate alerts |
| LinkedIn account bans | Medium — channel loss | Multi-account rotation, human-like delays, conservative limits |
| LLM hallucination in outreach | High — brand damage | Factual grounding checks, guardrails, human review queue, template fallback |
| Data source API changes | Medium — signal ingestion breaks | Adapter pattern isolates changes, monitoring, fallback to cached data |
| Cold start for new tenants | Medium — poor initial results | Rule-based scoring works without data, guided ICP setup, industry benchmarks |
| Compliance violation | High — legal liability | Built-in CAN-SPAM/GDPR/TCPA checks, consent tracking, suppression lists |
| Tenant data leak | Critical — trust destruction | Row-Level Security, encrypted credentials in KMS, audit logging |

---

## Success Metrics

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Meetings booked per SMB per month | 10-20 |
| Average reply rate (positive) | > 3% |
| Lead-to-meeting conversion rate | > 2% |
| Time from ICP setup to first outreach | < 24 hours |
| Email deliverability rate | > 95% |
| Platform DAU/MAU ratio | > 40% |
| SMB churn rate | < 5% monthly |
