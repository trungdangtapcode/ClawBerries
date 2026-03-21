# Job Applicant Research Agent — Master Plan

## Executive Summary

An on-demand candidate research agent that autonomously verifies and enriches job applicant profiles from the open web. An HR manager forwards a CV to their **OpenClaw** agent on Telegram, and within 3 minutes receives a structured candidate brief — verified work history, actual projects shipped, inconsistencies detected, and tailored interview questions — powered by **TinyFish** parallel scraping agents and an LLM synthesis layer.

**Why this doesn't exist yet**: ATS tools manage pipelines. Nobody has built a live research agent that autonomously verifies and enriches candidate profiles from the open web on demand, delivered inside the chat app HR already uses.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      HR Manager (Telegram)                           │
│  "Screen this person before Thursday's interview"                    │
│  [Forwards CV as PDF/DOCX attachment]                                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                   MODULE 1: INTAKE (OpenClaw)                        │
│  Telegram Bot → CV Parser → Entity Extraction → Task Dispatcher      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ fires parallel agents
          ┌────────────────┼────────────────┬───────────────┐
          ▼                ▼                ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ MODULE 2A    │ │ MODULE 2B    │ │ MODULE 2C    │ │ MODULE 2D    │
│ LINKEDIN     │ │ GITHUB       │ │ PORTFOLIO    │ │ EMPLOYER     │
│ AGENT        │ │ AGENT        │ │ AGENT        │ │ VERIFICATION │
│ (TinyFish)   │ │ (TinyFish)   │ │ (TinyFish)   │ │ (TinyFish)   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       └────────────────┼────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                MODULE 3: LLM SYNTHESIS LAYER                         │
│  Aggregate → Cross-reference → Inconsistency Detection → Brief Gen   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                MODULE 4: DELIVERY (OpenClaw)                         │
│  Structured Brief → Telegram Message → HR Manager                    │
│  [< 3 minutes end-to-end]                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Module 1: Intake (OpenClaw Integration)

### 1.1 Telegram Bot Interface

**Entry Point**: HR manager sends a message to the OpenClaw Telegram bot.

Supported input formats:
| Input Type | Example | Handling |
|-----------|---------|----------|
| CV attachment (PDF/DOCX) | Forwarded email attachment | Parse document, extract entities |
| Plain text with name + links | "Check Nguyen Van A, github.com/nva, linkedin.com/in/nva" | NLP extraction |
| Forwarded message | Recruiter forwards candidate intro | Parse forwarded content |
| Voice message | "Screen the CV I just sent" | STT → text extraction |

**Commands**:
- `/screen <attachment>` — Full candidate research
- `/quick <name>` — Fast web search only (no deep analysis)
- `/status` — Check progress of running research
- `/history` — Last 20 candidate briefs

**Deadline awareness**: Parse natural language deadlines — "before Thursday's interview" → set priority, include deadline in brief header.

### 1.2 CV Parser

**Strategy**: LLM-first extraction (not rule-based)

Why: Vietnamese CVs have wildly inconsistent formats — no standard like US resumes. Rule-based parsers break constantly. An LLM handles layout variance natively.

**Pipeline**:
```
PDF/DOCX → Text extraction (PyMuPDF / python-docx)
         → Image extraction (profile photos, certificates)
         → LLM structured extraction prompt
         → CandidateProfile JSON
```

**CandidateProfile Schema**:
```json
{
  "full_name": "Nguyen Van A",
  "email": "nva@email.com",
  "phone": "+84...",
  "links": {
    "linkedin": "linkedin.com/in/nva",
    "github": "github.com/nva",
    "portfolio": "nva.dev",
    "other": ["behance.net/nva"]
  },
  "work_history": [
    {
      "company": "FPT Software",
      "title": "Senior Backend Engineer",
      "start_date": "2021-03",
      "end_date": "2023-11",
      "description": "Led microservices migration..."
    }
  ],
  "education": [...],
  "skills_claimed": ["Python", "Kubernetes", "AWS"],
  "certifications": [...],
  "languages": ["Vietnamese", "English"],
  "raw_text": "..."
}
```

### 1.3 Task Dispatcher

Once `CandidateProfile` is extracted, OpenClaw dispatches TinyFish agents **in parallel**:

```python
# Pseudocode — OpenClaw dispatcher
async def dispatch_research(profile: CandidateProfile):
    tasks = []

    if profile.links.linkedin:
        tasks.append(tinyfish.spawn("linkedin_agent", {
            "url": profile.links.linkedin,
            "name": profile.full_name
        }))

    if profile.links.github:
        tasks.append(tinyfish.spawn("github_agent", {
            "url": profile.links.github,
            "skills_claimed": profile.skills_claimed
        }))

    if profile.links.portfolio:
        tasks.append(tinyfish.spawn("portfolio_agent", {
            "url": profile.links.portfolio
        }))

    for job in profile.work_history:
        tasks.append(tinyfish.spawn("employer_agent", {
            "company_name": job.company,
            "candidate_title": job.title,
            "period": f"{job.start_date} - {job.end_date}"
        }))

    # Always run a general web search agent
    tasks.append(tinyfish.spawn("web_search_agent", {
        "name": profile.full_name,
        "keywords": profile.skills_claimed[:5]
    }))

    # Parallel execution with 2.5 min timeout
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return results
```

**Timeout budget** (3-minute SLA):
| Phase | Budget |
|-------|--------|
| CV parsing + entity extraction | 15 sec |
| TinyFish parallel agents | 120 sec (2 min hard timeout) |
| LLM synthesis | 30 sec |
| Delivery formatting | 5 sec |
| Buffer | 10 sec |

---

## Module 2: TinyFish Research Agents

Each agent is a TinyFish cronjob/task that runs independently, scrapes a specific source, and returns structured findings.

### 2A: LinkedIn Agent

**Purpose**: Verify employment history, check endorsements, assess professional network.

**Data Sources** (updated — Proxycurl shut down July 2026 after LinkedIn lawsuit):
- **Bright Data LinkedIn API** (recommended — legal precedent from court victories, GDPR/CCPA compliant)
- **ScrapIn API** (alternative — real-time, no LinkedIn credentials required)
- Fallback: Google cache / LinkedIn public profile (no-auth fallback)

**Extracts**:
| Field | Verification Value |
|-------|-------------------|
| Current & past positions | Cross-reference with CV dates and titles |
| Endorsements & recommendations | Social proof of claimed skills |
| Connection count & quality | Professional network strength |
| Activity (posts, articles) | Thought leadership, engagement |
| Education verification | Cross-reference with CV |
| Profile completeness | Low completeness = yellow flag |

**Output**: `LinkedInReport`
```json
{
  "profile_found": true,
  "headline": "Senior Backend Engineer at FPT Software",
  "positions": [...],
  "education": [...],
  "endorsements": {"Python": 42, "Kubernetes": 18},
  "recommendations_count": 5,
  "connection_count": "500+",
  "recent_activity": [...],
  "profile_last_updated": "2024-01",
  "cv_discrepancies": [
    {
      "field": "title_at_fpt",
      "cv_says": "Tech Lead",
      "linkedin_says": "Senior Engineer",
      "severity": "medium"
    }
  ]
}
```

### 2B: GitHub Agent

**Purpose**: Verify technical skills through actual code contribution evidence.

**Data Source**: GitHub REST API v3 / GraphQL API v4 (public, no scraping needed)

**Extracts**:
| Metric | What It Reveals |
|--------|----------------|
| Commit frequency (last 12 months) | Active coder or dormant? |
| Language breakdown | Does actual code match claimed skills? |
| Repo stars & forks (owned) | Project impact |
| Contribution graph | Consistency of work |
| PR/issue activity on major repos | Open-source engagement |
| Code quality signals | README quality, test presence, CI setup |
| Organization memberships | Company affiliations |

**Output**: `GitHubReport`
```json
{
  "profile_found": true,
  "username": "nva",
  "public_repos": 23,
  "total_stars": 156,
  "total_commits_12m": 847,
  "top_languages": {"Python": 45, "TypeScript": 30, "Go": 15},
  "notable_repos": [
    {"name": "microservice-kit", "stars": 89, "description": "..."}
  ],
  "contribution_pattern": "consistent_weekday",
  "organizations": ["fpt-software"],
  "skills_evidence": {
    "Python": "strong — 45% of code, active commits",
    "Kubernetes": "no direct evidence in public repos",
    "AWS": "found in 3 repo configs (terraform files)"
  },
  "cv_discrepancies": []
}
```

### 2C: Portfolio/Website Agent

**Purpose**: Assess project quality, design sensibility, and self-presentation.

**Method**: Headless browser (Playwright via TinyFish) → scrape + screenshot

**Extracts**:
| Element | Analysis |
|---------|----------|
| Projects listed | Cross-reference with CV project claims |
| Tech stack used | Check against claimed skills (inspect page source, meta tags) |
| Design quality | Screenshot + LLM assessment |
| Content freshness | Last updated date, recent projects |
| Contact information | Consistency with CV |
| External links | Additional verification sources |

**Output**: `PortfolioReport`
```json
{
  "site_accessible": true,
  "url": "nva.dev",
  "projects_found": 5,
  "projects": [
    {
      "name": "E-commerce Platform",
      "tech_stack_detected": ["React", "Node.js", "PostgreSQL"],
      "live_demo_working": true,
      "github_link_valid": true
    }
  ],
  "last_updated_estimate": "2024-06",
  "screenshot_url": "s3://...",
  "cv_discrepancies": []
}
```

### 2D: Employer Verification Agent

**Purpose**: Verify that claimed employers are real, credible, and the right size.

**Data Sources** (prioritized for Vietnam market):
1. **Vietnam Business Registry** — masothue.com, dangkykinhdoanh.gov.vn (company registration lookup)
2. **LinkedIn Company Pages** — employee count, industry, description
3. **Google Search** — "{company name} Vietnam" for news, reviews
4. **Glassdoor / TopCV Vietnam** — employer reviews, size verification
5. **Crunchbase** — for tech companies (funding, team size)

**Extracts**:
| Check | Red Flag If... |
|-------|---------------|
| Company exists | No web presence, no registration |
| Company size | CV says "led 50-person team" but company has 20 employees |
| Industry match | Claimed "fintech" but company is F&B |
| Company active | Company dissolved/inactive during claimed employment |
| Tenure plausibility | 3 promotions in 6 months at a 10-person startup |

**Output**: `EmployerReport`
```json
{
  "company_name": "FPT Software",
  "verified": true,
  "employee_count": "27000+",
  "industry": "IT Services / Software",
  "founded": 1999,
  "headquarters": "Hanoi, Vietnam",
  "credibility_score": 95,
  "glassdoor_rating": 3.8,
  "notes": "Major Vietnamese IT outsourcing firm, Fortune Global 500 client base",
  "cv_discrepancies": []
}
```

### 2E: General Web Search Agent

**Purpose**: Catch-all for information not covered by specialized agents.

**Searches**:
- `"{candidate name}" site:linkedin.com OR site:github.com`
- `"{candidate name}" {company} {role}`
- `"{candidate name}" conference OR speaker OR presentation`
- `"{candidate name}" award OR recognition`
- News articles, blog posts, forum contributions

---

## Module 3: LLM Synthesis Layer

### 3.1 Aggregation

All TinyFish agent results are collected into a `ResearchBundle`:

```json
{
  "candidate_profile": { ... },       // From CV
  "linkedin_report": { ... },          // Agent 2A
  "github_report": { ... },            // Agent 2B
  "portfolio_report": { ... },         // Agent 2C
  "employer_reports": [ ... ],         // Agent 2D (one per company)
  "web_search_findings": [ ... ],      // Agent 2E
  "metadata": {
    "research_started_at": "...",
    "research_completed_at": "...",
    "agents_succeeded": 5,
    "agents_failed": 0,
    "agents_timed_out": 0
  }
}
```

### 3.2 Cross-Reference & Inconsistency Detection

The LLM receives the full `ResearchBundle` and performs:

**Consistency Checks**:
| Check | CV Field | Verified Against |
|-------|----------|-----------------|
| Employment dates | work_history[].start/end | LinkedIn positions |
| Job titles | work_history[].title | LinkedIn, company page |
| Skills claimed | skills_claimed[] | GitHub languages, portfolio tech |
| Education | education[] | LinkedIn education section |
| Company size claims | "managed 20-person team" | LinkedIn company employee count |
| Project claims | "built X at Y" | GitHub repos, portfolio projects |

**Severity Levels**:
| Level | Example | Action |
|-------|---------|--------|
| **Critical** | Company doesn't exist, fabricated degree | Flag prominently, recommend verification |
| **High** | 2-year gap in LinkedIn not on CV, title inflation | Highlight, suggest interview question |
| **Medium** | Minor date discrepancy (1-2 months), skill not evidenced | Note, low priority |
| **Low** | Profile photo mismatch, outdated portfolio | Mention in appendix |

### 3.3 Candidate Brief Generation

**LLM Prompt Strategy**: Structured output with explicit sections, Vietnamese + English bilingual support.

**Brief Template**:

```markdown
# Candidate Brief: {name}
📋 Researched on {date} | ⏱️ Completed in {duration}

## 🟢🟡🔴 Overall Assessment
{one-paragraph executive summary with traffic-light rating}

## ✅ Verified Claims
- {list of CV claims confirmed by external sources}

## ⚠️ Inconsistencies Found
- {list of discrepancies with severity and source}

## 📊 Technical Evidence
- GitHub: {commit activity, top languages, notable repos}
- Portfolio: {projects found, tech stack detected}
- Skills gap: {claimed but not evidenced skills}

## 🏢 Employer Verification
| Company | Verified | Size | Industry | Notes |
|---------|----------|------|----------|-------|
| {for each employer} |

## 🎯 Suggested Interview Questions
1. {question targeting a specific gap or inconsistency}
2. {question probing an unverified claim}
3. {question about a strength to confirm depth}

## 📎 Sources
- LinkedIn: {url}
- GitHub: {url}
- Portfolio: {url}
```

### 3.4 LLM Model Selection

| Scenario | Model | Rationale |
|----------|-------|-----------|
| Standard screening | Claude Sonnet 4.6 | Fast, cheap, good enough for synthesis |
| Senior/executive candidates | Claude Opus 4.6 | Nuanced analysis, better inconsistency detection |
| Quick search only | Haiku 4.5 | Speed-optimized for simple lookups |

---

## Module 4: Delivery (OpenClaw)

### 4.1 Telegram Delivery Format

**Message 1** (immediate, < 5 sec after request):
```
🔍 Starting research on Nguyen Van A...
📄 CV parsed: 3 companies, 2 links found
🚀 Dispatching 5 research agents in parallel
⏱️ Estimated completion: ~2 minutes
```

**Message 2** (progress, ~60 sec):
```
📊 Progress: 3/5 agents complete
✅ LinkedIn verified
✅ GitHub analyzed (847 commits, 23 repos)
⏳ Portfolio scraping...
⏳ Employer verification (FPT Software)...
```

**Message 3** (final brief, < 3 min):
```
[Full structured brief as above]
```

**Attachments**: PDF version of the brief (for sharing in email/Slack)

### 4.2 Follow-up Actions

After delivering the brief, OpenClaw offers inline Telegram buttons:

| Button | Action |
|--------|--------|
| 📥 Download PDF | Generate and send PDF version |
| 🔄 Deep Dive | Run extended research (conference talks, publications, patents) |
| 📧 Share with Team | Forward brief to configured HR channel |
| 📅 Schedule Interview | Integrate with Google Calendar / Outlook |
| 🗄️ Save to ATS | Push candidate data to configured ATS |

---

## TinyFish Cronjob Configuration

### Agent Scheduling

TinyFish agents are **on-demand** (triggered by OpenClaw), not scheduled crons. But TinyFish also handles:

**Recurring Jobs**:
| Job | Schedule | Purpose |
|-----|----------|---------|
| `linkedin_cache_refresh` | Every 6 hours | Re-scrape recently viewed profiles for updates |
| `github_stats_prefetch` | Daily 2 AM | Pre-cache GitHub stats for candidates in pipeline |
| `employer_db_update` | Weekly Sunday | Refresh Vietnamese company registry cache |
| `data_cleanup` | Daily 3 AM | Purge research bundles older than 90 days |
| `health_check` | Every 5 min | Verify all agent endpoints responsive |

**On-Demand Task Spec**:
```yaml
# tinyfish-agent-spec.yaml
agents:
  linkedin_agent:
    timeout: 45s
    retries: 2
    fallback: google_cache_lookup
    rate_limit: 100/hour

  github_agent:
    timeout: 30s
    retries: 1
    rate_limit: 5000/hour  # GitHub API limit

  portfolio_agent:
    timeout: 60s  # Playwright rendering takes time
    retries: 1
    fallback: skip_with_note

  employer_agent:
    timeout: 45s
    retries: 2
    rate_limit: 50/hour  # Be polite to registries

  web_search_agent:
    timeout: 30s
    retries: 1
    rate_limit: 200/hour
```

---

## Multi-Agent Brainstorming Workflow

### Using Available AI Agents for Development

The development pipeline leverages multiple AI coding agents in parallel for maximum velocity:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT WORKFLOW                           │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌───────┐  ┌──────────────┐   │
│  │ Claude   │  │ Gemini CLI   │  │ Codex │  │ Deepagents   │   │
│  │ Code     │  │              │  │       │  │              │   │
│  │          │  │              │  │       │  │              │   │
│  │ SYSTEM   │  │ RESEARCH &   │  │ CODE  │  │ MULTI-AGENT  │   │
│  │ ARCH &   │  │ VALIDATION   │  │ IMPL  │  │ ORCHESTRATION│   │
│  │ PLANNING │  │              │  │       │  │              │   │
│  └──────────┘  └──────────────┘  └───────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Role Assignment

| Agent | Role | Invocation | Strengths for This Project |
|-------|------|-----------|---------------------------|
| **Claude Code** | System Architect & Orchestrator | Interactive session | Architecture design, plan review, complex reasoning about tradeoffs |
| **Gemini CLI** | Research & Validation Agent | `gemini -p "Research LinkedIn API scraping approaches for Vietnam market"` | Web-grounded research, fact-checking, exploring API docs |
| **Codex** | Implementation Agent | `codex exec "Implement the GitHub agent module per spec in agents/github_agent.py"` | Fast code generation, sandboxed execution, test writing |
| **Deepagents** | Multi-Agent Orchestration Testing | `deepagents -a researcher -m "Simulate the full candidate research pipeline for test CV"` | End-to-end simulation, multi-step task chains |

### Development Sprint Workflow

**Phase 1: Architecture & Spec (Claude Code leads)**
```bash
# Claude Code: Design system architecture, define interfaces
# Output: API contracts, data schemas, module boundaries
```

**Phase 2: Research & Spike (Gemini in parallel)**
```bash
# Gemini researches external dependencies
gemini -p "What are the rate limits and pricing for Proxycurl LinkedIn API? \
  Compare with Bright Data and PhantomBuster for Vietnamese profiles"

gemini -p "Research masothue.com API or scraping approach for \
  Vietnamese business registration verification"

gemini -p "What's the best approach to detect CV inconsistencies \
  using LLMs? Find papers or production examples"
```

**Phase 3: Implementation (Codex in parallel)**
```bash
# Codex implements individual modules
codex exec "Implement the CV parser module that extracts structured \
  CandidateProfile from PDF/DOCX using PyMuPDF and Claude API. \
  Include tests with sample Vietnamese CVs"

codex exec "Implement the GitHub research agent that uses GitHub API \
  to analyze a user's contribution history, language breakdown, \
  and notable repos. Return GitHubReport schema"

codex exec "Implement the employer verification agent that checks \
  Vietnamese company registries and LinkedIn company pages"
```

**Phase 4: Integration Testing (Deepagents orchestrates)**
```bash
# Deepagents runs the full pipeline end-to-end
deepagents -a coder -m "Wire up all research agents into the \
  OpenClaw dispatcher. Run integration test with 3 sample CVs. \
  Report any failures or timeout issues"
```

---

## Data Architecture

### PostgreSQL Schema (Core Tables)

```sql
-- Candidate research requests
CREATE TABLE research_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    telegram_message_id BIGINT,
    candidate_name TEXT NOT NULL,
    cv_file_url TEXT,
    deadline TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',  -- pending, researching, synthesizing, delivered, failed
    priority INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Parsed CV data
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES research_requests(id),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    links JSONB DEFAULT '{}',
    work_history JSONB DEFAULT '[]',
    education JSONB DEFAULT '[]',
    skills_claimed TEXT[] DEFAULT '{}',
    raw_text TEXT,
    parsed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual agent results
CREATE TABLE agent_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES research_requests(id),
    agent_type TEXT NOT NULL,  -- linkedin, github, portfolio, employer, web_search
    agent_target TEXT,         -- URL or company name being researched
    status TEXT DEFAULT 'pending',
    result JSONB,
    discrepancies JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    error_message TEXT
);

-- Generated briefs
CREATE TABLE candidate_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES research_requests(id),
    overall_rating TEXT,  -- green, yellow, red
    brief_markdown TEXT NOT NULL,
    brief_pdf_url TEXT,
    inconsistencies_count INT DEFAULT 0,
    verified_claims_count INT DEFAULT 0,
    interview_questions JSONB DEFAULT '[]',
    model_used TEXT,
    tokens_used INT,
    delivered_at TIMESTAMPTZ
);
```

### Redis Usage

| Key Pattern | Purpose | TTL |
|------------|---------|-----|
| `rate:{agent_type}:{hour}` | Per-agent rate limiting | 1 hour |
| `cache:linkedin:{profile_id}` | LinkedIn profile cache | 6 hours |
| `cache:github:{username}` | GitHub stats cache | 24 hours |
| `cache:company:{domain}` | Company info cache | 7 days |
| `progress:{request_id}` | Real-time research progress | 10 min |

---

## Vietnamese Market Specifics

### Data Sources Priority (Vietnam)

| Source | API/Method | Data Quality | Cost |
|--------|-----------|-------------|------|
| LinkedIn (Proxycurl) | REST API | High | $0.01/profile |
| GitHub | REST API | High | Free (5000 req/hr) |
| masothue.com | Web scrape | High for company verification | Free |
| TopDev.vn | Web scrape | Medium (tech jobs) | Free |
| VietnamWorks | Web scrape | Medium (general jobs) | Free |
| Google Search | SerpAPI | Variable | $50/5000 searches |
| Facebook | Graph API (limited) | Low (many VN professionals use FB) | Free |

### Vietnamese Name Handling

- Support diacritics: "Nguyễn Văn A" and "Nguyen Van A" should match
- Family name first convention: search both "Nguyen Van A" and "Van A Nguyen"
- Common name disambiguation: "Nguyen" is extremely common — always include company/school context

### Local Compliance

| Regulation | Requirement |
|-----------|-------------|
| Vietnam Cybersecurity Law (2018) | Data on Vietnamese citizens must be stored in Vietnam or comply with cross-border transfer rules |
| Personal Data Protection Decree (2023) | Consent required for processing personal data; legitimate interest exception for employment screening |
| Labor Code | Background checks must be relevant to the position |

---

## Error Handling & Graceful Degradation

| Failure | Impact | Fallback |
|---------|--------|----------|
| LinkedIn scrape blocked | No employment verification | Google cache + note "LinkedIn unavailable" |
| GitHub profile private/not found | No code verification | Note "No public GitHub profile found" |
| Portfolio site down | No project verification | Wayback Machine snapshot |
| Company registry timeout | No employer verification | Google search + LinkedIn company page |
| LLM synthesis fails | No brief generated | Template-based brief from raw agent data |
| All agents timeout | No research data | Return CV summary + "Research incomplete, manual verification needed" |

**SLA**: 95% of requests completed within 3 minutes. Remaining 5% get partial results with "still researching" follow-up within 5 minutes.

---

## Security & Privacy

| Concern | Mitigation |
|---------|-----------|
| Candidate PII in transit | TLS 1.3 everywhere, encrypted Telegram bot API |
| Data at rest | AES-256 encryption, per-tenant keys in KMS |
| Data retention | Auto-purge research bundles after 90 days (configurable) |
| Access control | Only requesting HR manager + configured team see results |
| Audit trail | Every research request logged with who, when, what |
| Web scraping legality | Use official APIs where available, respect robots.txt, rate limit |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| End-to-end latency (CV → Brief) | < 3 minutes (p95) |
| Inconsistency detection accuracy | > 85% precision |
| HR manager satisfaction (NPS) | > 60 |
| Briefs per day per HR manager | 10-20 |
| False positive rate (flagged but correct) | < 10% |
| Agent success rate (data retrieved) | > 90% per agent type |
| Cost per candidate research | < $0.50 |

---

## Phased Delivery

### MVP — Weeks 1-4

- Telegram bot with `/screen` command
- CV parser (PDF/DOCX → CandidateProfile)
- LinkedIn agent (Proxycurl)
- GitHub agent (GitHub API)
- Basic LLM synthesis (Claude Sonnet)
- Telegram delivery with markdown brief
- PostgreSQL + Redis infrastructure

### Phase 2 — Weeks 5-8

- Portfolio scraping agent (Playwright)
- Employer verification agent (Vietnamese registries)
- General web search agent
- Inconsistency detection with severity levels
- PDF brief generation
- Team sharing (forward to HR channel)
- Candidate history / search

### Phase 3 — Weeks 9-12

- Batch screening (upload 10 CVs at once)
- ATS integration (push to Greenhouse, Lever, BambooHR)
- Calendar integration for interview scheduling
- Vietnamese language brief option
- Analytics dashboard (screening volume, common red flags, time saved)
- Custom screening criteria per job posting

---

## Cost Estimate (Monthly, 500 candidates)

| Item | Cost |
|------|------|
| Proxycurl (LinkedIn) | $5 (500 lookups) |
| SerpAPI (web search) | $50 (5000 searches) |
| Claude Sonnet API (synthesis) | $15 (~500 briefs) |
| GitHub API | Free |
| Infrastructure (Cloud Run + DB) | $100 |
| **Total** | **~$170/month** |

At 500 candidates/month, that's **$0.34 per candidate** — vs. 15-30 minutes of HR time per manual Google search.
