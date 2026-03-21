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

**Strategy**: Multimodal LLM extraction (Vision OCR + Parsing)

Why: Vietnamese CVs have wildly inconsistent formats — no standard like US resumes. Rule-based parsers break constantly, and standard text extraction (PyMuPDF) fails on image-based PDFs or complex multi-column layouts. A multimodal LLM performs native OCR and handles layout variance natively.

**Pipeline**:
```
PDF/DOCX → Convert pages to images
         → Multimodal LLM (Vision) for OCR + structured extraction prompt
         → Image extraction (profile photos, certificates)
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

> [!WARNING]
> TinyFish does not strictly guarantee well-formed JSON output. The OpenClaw dispatcher or LLM Synthesis Layer must use resilient parsing (e.g., regex fallback, fuzzy JSON parsing, or LLM-based structuring) when interpreting the outputs shown below.

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

### 2D: Employer Verification Agent (Nice to Have)

> [!NOTE]
> This agent is considered a "nice to have" and can be prioritized for later phases.

**Purpose**: Verify that claimed employers are real, credible, and the right size.

**Data Sources** (prioritized for Vietnam market):
1. **Vietnam National Business Registration Portal** — congthongtin.dkkd.gov.vn (official registry, search by name/tax code/registration number)
2. **masothue.com** — tax code lookup, company status verification
3. **AsiaVerify KYB API** — Vietnam-specific company verification with API integration
4. **LinkedIn Company Pages** (via Bright Data) — employee count, industry, description
5. **Google Search** — "{company name} Vietnam" for news, reviews
6. **Glassdoor / TopCV Vietnam** — employer reviews, size verification
7. **Crunchbase** — for tech companies (funding, team size)

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

### 2E: General Web Search Agent (Nice to Have)

> [!NOTE]
> This agent is considered a "nice to have" and can be prioritized for later phases.

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

## User Journey Stack (Complete Step-by-Step)

> Every step below defines: **WHAT** it is, **WHY** it exists, **WHO** owns it, **WHAT TO DO**, and **EXIT CRITERIA** before moving to the next step.

### Journey Overview (30,000-foot view)

```
  HR MANAGER                    SYSTEM                           DATA SOURCES
  ══════════                    ══════                           ════════════

  ┌─────────────┐
  │ STEP 1      │
  │ TRIGGER     │──── CV + command ────▶ ┌─────────────────┐
  │ (Telegram)  │                        │ STEP 2           │
  └─────────────┘              ◀── ack ──│ INTAKE &         │
                                         │ ACKNOWLEDGMENT   │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ STEP 3           │
                                         │ CV PARSING &     │
                                         │ ENTITY EXTRACT   │
                                         └────────┬────────┘
                                                  │ CandidateProfile
                                         ┌────────▼────────┐
                                         │ STEP 4           │
                                         │ TASK PLANNING &  │──── spawns ────▶ ┌──────────────┐
                                         │ DISPATCH         │                  │ STEP 5       │
                                         └────────┬────────┘                  │ PARALLEL     │
                                                  │                           │ RESEARCH     │
  ┌─────────────┐               progress updates  │                           │ (TinyFish)   │
  │ STEP 6      │◀──────────────────────────── ───┤                           └──────┬───────┘
  │ PROGRESS    │                                  │                                  │
  │ REPORTING   │                                  │◀──── agent results ──────────────┘
  └─────────────┘                         ┌────────▼────────┐
                                         │ STEP 7           │
                                         │ LLM SYNTHESIS    │
                                         │ & CROSS-CHECK    │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ STEP 8           │
                                         │ BRIEF ASSEMBLY   │
                                         │ & FORMATTING     │
                                         └────────┬────────┘
                                                  │
  ┌─────────────┐                        ┌────────▼────────┐
  │ STEP 9      │◀──── final brief ──────│ STEP 9           │
  │ DELIVERY    │                        │ DELIVERY         │
  │ (Telegram)  │                        │ (OpenClaw)       │
  └──────┬──────┘                        └─────────────────┘
         │
  ┌──────▼──────┐
  │ STEP 10     │
  │ POST-       │──── actions ───▶ [PDF / Share / ATS / Calendar]
  │ DELIVERY    │
  │ ACTIONS     │
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │ STEP 11     │
  │ DATA        │──── retention ──▶ [Cleanup / Audit / Analytics]
  │ LIFECYCLE   │
  └─────────────┘
```

### STEP 1: TRIGGER

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 1 — TRIGGER                                                │
│  Owner: HR Manager          Platform: Telegram                    │
│  Duration: ~5 seconds       Engine: OpenClaw Bot                  │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
The entry point where an HR manager initiates a candidate screening request through Telegram.

**Why does it exist?**
HR managers live in Telegram (especially in Vietnamese companies). Meeting them where they already work eliminates friction. No new app to learn, no dashboard to log into.

**What to do:**

| Action | Input Format | Example |
|--------|-------------|---------|
| **Forward a CV** | PDF/DOCX attachment + optional message | _[attaches CV]_ "Screen this person before Thursday's interview" |
| **Type a command** | `/screen` + attachment | `/screen` _[attaches CV]_ |
| **Quick lookup** | `/quick` + name + links | `/quick Nguyen Van A github.com/nva linkedin.com/in/nva` |
| **Send text only** | Plain text with candidate info | "Check this candidate: Tran Thi B, worked at FPT, GitHub is github.com/ttb" |
| **Voice message** | Voice note describing the request | "Screen the CV I just sent, interview is tomorrow" |

**Input validation rules:**
- At least one of: CV file, candidate name, or profile link must be present
- Supported file formats: `.pdf`, `.docx`, `.doc`
- Max file size: 20MB
- If ambiguous, bot asks: _"I found a file but no screening command. Would you like me to screen this candidate?"_

**Exit criteria:**
- ✅ A valid screening request is identified (file or text with extractable candidate info)
- ✅ Request is logged in `research_requests` table with status `pending`
- ✅ Move to **Step 2**

---

### STEP 2: INTAKE & ACKNOWLEDGMENT

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 2 — INTAKE & ACKNOWLEDGMENT                                │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: < 3 seconds      Engine: OpenClaw                      │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
The system receives the request, validates it, creates a tracking record, and sends an immediate acknowledgment back to the HR manager.

**Why does it exist?**
Users need instant feedback that their request was received. A 3-minute silent wait feels broken. This step sets expectations and builds trust.

**What to do:**

1. **Receive & validate** the Telegram message (check for CV or extractable info)
2. **Create research request** record in PostgreSQL:
   ```sql
   INSERT INTO research_requests (tenant_id, telegram_chat_id, telegram_message_id,
     candidate_name, cv_file_url, deadline, status, priority)
   VALUES (..., 'pending', ...);
   ```
3. **Parse deadline** from natural language:
   - "before Thursday's interview" → `deadline = next Thursday 09:00`
   - "urgent" / "ASAP" → `priority = 1`
   - No deadline mentioned → `priority = 5` (normal)
4. **Store CV file** to object storage (S3/MinIO), save URL
5. **Send acknowledgment message** immediately:
   ```
   Got it! Starting research on the attached CV...
   Estimated completion: ~2 minutes
   Request ID: #RR-20260321-001
   ```

**Exit criteria:**
- ✅ Request record exists in database with status `pending`
- ✅ CV file stored securely
- ✅ HR manager received acknowledgment message in Telegram
- ✅ Move to **Step 3**

---

### STEP 3: CV PARSING & ENTITY EXTRACTION

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 3 — CV PARSING & ENTITY EXTRACTION                         │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: 10-15 seconds    Engine: OpenClaw + LLM (Vision)       │
│  Budget: 15 sec of 3-min SLA                                      │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
The system extracts structured candidate data from the raw CV file. This transforms an unstructured document into a machine-readable `CandidateProfile`.

**Why does it exist?**
Everything downstream depends on knowing: Who is this person? Where did they work? What links do they have? Without structured extraction, no agents can be dispatched.

**What to do:**

1. **Convert document to processable format**:
   - PDF → render each page as image (for multimodal LLM)
   - DOCX → extract text + convert complex layouts to images
   - Fallback: `Docling` (IBM) for layout-aware text extraction

2. **Run multimodal LLM extraction** (Claude Sonnet with vision):
   ```
   Prompt: "Extract the following structured fields from this CV image.
   Return valid JSON matching the CandidateProfile schema.
   Handle Vietnamese names with diacritics.
   If a field is not found, set it to null."
   ```

3. **Extract entities into `CandidateProfile`**:

   | Field | Extraction Method | Example |
   |-------|------------------|---------|
   | `full_name` | LLM + regex fallback | "Nguyen Van A" |
   | `email` | Regex `[\w.-]+@[\w.-]+` + LLM | "nva@email.com" |
   | `phone` | Regex `\+?84[\d-]+` + LLM | "+84 912 345 678" |
   | `links.linkedin` | URL pattern matching | "linkedin.com/in/nva" |
   | `links.github` | URL pattern matching | "github.com/nva" |
   | `links.portfolio` | LLM identifies personal sites | "nva.dev" |
   | `work_history[]` | LLM structured extraction | Company, title, dates, description |
   | `education[]` | LLM structured extraction | School, degree, graduation year |
   | `skills_claimed[]` | LLM keyword extraction | ["Python", "Kubernetes", "AWS"] |

4. **Validate extracted data**:
   - Dates are chronologically valid (start < end)
   - No overlapping employment periods (flag if found)
   - Email format valid
   - Phone number format valid for Vietnam (+84)
   - URLs are syntactically valid

5. **Store profile** in `candidate_profiles` table

6. **Update acknowledgment** (amend Telegram message):
   ```
   Starting research on Nguyen Van A...
   CV parsed: 3 companies, 2 links found, 8 skills claimed
   Dispatching research agents now...
   ```

**Error handling:**

| Error | Action |
|-------|--------|
| Corrupted PDF | Send "CV file appears damaged. Can you re-send?" |
| No extractable text (scanned image) | Use OCR via multimodal LLM (slower, +5s) |
| Missing critical fields (no name) | Ask: "I couldn't extract a name from this CV. Can you type the candidate's name?" |
| Ambiguous data | Extract best guess, flag as `confidence: low` |

**Exit criteria:**
- ✅ `CandidateProfile` JSON is complete with at least `full_name` and one of: `work_history`, `links`, or `skills_claimed`
- ✅ Profile stored in database
- ✅ HR manager sees updated message with extraction summary
- ✅ Move to **Step 4**

---

### STEP 4: TASK PLANNING & DISPATCH

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 4 — TASK PLANNING & DISPATCH                               │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: < 2 seconds      Engine: OpenClaw -> TinyFish          │
│  Budget: ~2 sec of 3-min SLA                                      │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
The orchestrator examines the extracted profile, decides which research agents to launch, and dispatches them all in parallel via TinyFish.

**Why does it exist?**
Not every candidate has a GitHub. Not every CV has portfolio links. Blindly launching all agents wastes resources and time. This step intelligently plans which agents to fire based on available data.

**What to do:**

1. **Evaluate available data points** and build an agent plan:

   | Condition | Agent to Spawn | Priority |
   |-----------|---------------|----------|
   | `links.linkedin` exists | LinkedIn Agent (2A) | **Always** — most valuable for employment verification |
   | `links.github` exists | GitHub Agent (2B) | **Always** — strongest technical evidence |
   | `links.portfolio` exists | Portfolio Agent (2C) | If link available |
   | `work_history[]` is non-empty | Employer Agent (2D) x N | One per company (max 5 most recent) |
   | Always | Web Search Agent (2E) | **Always** — catch-all safety net |
   | No links at all | Enhanced Web Search | Search for LinkedIn/GitHub by name + company |

2. **Check rate limits** (Redis):
   ```
   GET rate:linkedin:{current_hour}  ->  if > 100, queue instead of immediate
   GET rate:github:{current_hour}    ->  if > 4500, throttle
   ```

3. **Dispatch agents in parallel via TinyFish**:
   ```python
   async def dispatch_research(profile: CandidateProfile):
       plan = build_agent_plan(profile)  # Step 4.1
       check_rate_limits(plan)            # Step 4.2

       tasks = [
           tinyfish.spawn(agent.type, agent.params, timeout=agent.timeout)
           for agent in plan.agents
       ]

       # Fire all simultaneously
       results = await asyncio.gather(*tasks, return_exceptions=True)
       return results
   ```

4. **Create agent tracking records**:
   ```sql
   INSERT INTO agent_results (request_id, agent_type, agent_target, status, started_at)
   VALUES
     ($req_id, 'linkedin', 'linkedin.com/in/nva', 'running', NOW()),
     ($req_id, 'github', 'github.com/nva', 'running', NOW()),
     ($req_id, 'employer', 'FPT Software', 'running', NOW()),
     ($req_id, 'web_search', 'Nguyen Van A', 'running', NOW());
   ```

5. **Set progress tracker** in Redis:
   ```
   SET progress:{request_id} '{"total": 5, "completed": 0, "agents": [...]}'
   EXPIRE progress:{request_id} 600
   ```

**Exit criteria:**
- ✅ All planned agents are dispatched and running in TinyFish
- ✅ Agent tracking records exist in `agent_results` table
- ✅ Progress tracker initialized in Redis
- ✅ Move to **Step 5** (agents run) + **Step 6** (progress reporting, concurrent)

---

### STEP 5: PARALLEL RESEARCH EXECUTION

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 5 — PARALLEL RESEARCH EXECUTION                            │
│  Owner: TinyFish Agents     Platform: TinyFish Workers            │
│  Duration: 30-120 seconds   Engine: TinyFish                      │
│  Budget: 120 sec hard timeout                                     │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
Multiple TinyFish agents run simultaneously, each researching a different data source. This is the core intelligence-gathering phase.

**Why does it exist?**
Sequential research would take 5-10 minutes. Parallel execution hits the 3-minute SLA. Each source provides a different facet of the candidate's profile — together they form a complete picture.

**What to do — per agent:**

**5A: LinkedIn Agent**

| Step | Action | Tool |
|------|--------|------|
| 1 | Call Bright Data / ScrapIn API with LinkedIn URL | REST API |
| 2 | Extract: positions, education, endorsements, recommendations, activity | JSON parsing |
| 3 | Compare positions against CV `work_history[]` | Diff logic |
| 4 | Flag discrepancies: title mismatches, date gaps, missing roles | Severity tagging |
| 5 | Return `LinkedInReport` JSON | — |
| **Timeout** | 45 sec | **Fallback**: Google cache search for LinkedIn profile |

**5B: GitHub Agent**

| Step | Action | Tool |
|------|--------|------|
| 1 | Call GitHub REST API: `/users/{username}` | REST API |
| 2 | Fetch repos: `/users/{username}/repos?sort=updated&per_page=30` | REST API |
| 3 | Fetch contribution stats: `/users/{username}/events` (last 90 days) | REST API |
| 4 | Calculate: top languages, commit frequency, star count | Aggregation |
| 5 | Cross-reference claimed skills against actual languages used | Diff logic |
| 6 | Identify notable repos (stars > 10, forks > 5) | Filtering |
| 7 | Return `GitHubReport` JSON | — |
| **Timeout** | 30 sec | **Fallback**: return partial data collected so far |

**5C: Portfolio Agent**

| Step | Action | Tool |
|------|--------|------|
| 1 | Launch Playwright headless browser | TinyFish worker |
| 2 | Navigate to portfolio URL, wait for JS rendering | Playwright |
| 3 | Take full-page screenshot | Playwright |
| 4 | Extract: project titles, descriptions, tech stack, links | BeautifulSoup parse |
| 5 | Check if linked GitHub repos / demos are live | HTTP HEAD requests |
| 6 | Assess freshness (last modified headers, copyright year, recent projects) | Heuristics |
| 7 | Return `PortfolioReport` JSON + screenshot URL | — |
| **Timeout** | 60 sec | **Fallback**: skip with note "Portfolio could not be accessed" |

**5D: Employer Verification Agent (per company)**

| Step | Action | Tool |
|------|--------|------|
| 1 | Search Vietnam National Business Registry by company name | Web scrape / API |
| 2 | Search masothue.com by company name for tax code verification | Web scrape |
| 3 | Optionally call AsiaVerify KYB API | REST API |
| 4 | Search LinkedIn Company Page via Bright Data for employee count | REST API |
| 5 | Google search for recent news / reviews | SerpAPI |
| 6 | Calculate credibility score (0-100) | Weighted scoring |
| 7 | Flag: company doesn't exist, dissolved, size mismatch, industry mismatch | Red flag logic |
| 8 | Return `EmployerReport` JSON | — |
| **Timeout** | 45 sec | **Fallback**: Google search results only |

**5E: Web Search Agent**

| Step | Action | Tool |
|------|--------|------|
| 1 | Search: `"{candidate name}" site:linkedin.com OR site:github.com` | SerpAPI |
| 2 | Search: `"{candidate name}" {most recent company}` | SerpAPI |
| 3 | Search: `"{candidate name}" conference OR speaker OR award` | SerpAPI |
| 4 | Compile findings: articles, mentions, conference talks, awards | Aggregation |
| 5 | Return `WebSearchReport` JSON | — |
| **Timeout** | 30 sec | **Fallback**: return whatever results gathered |

**Agent result handling:**
```
For EACH agent that completes:
  1. Update agent_results table: status -> 'completed', result -> JSON
  2. Update Redis progress counter: completed += 1
  3. If agent FAILED: status -> 'failed', error_message -> reason
  4. If agent TIMED OUT: status -> 'timeout', result -> partial data if any
```

**Exit criteria:**
- ✅ All agents completed, failed, or timed out (hard limit: 120 seconds)
- ✅ Each agent's result stored in `agent_results` table
- ✅ At least 1 agent returned usable data (otherwise -> early failure path)
- ✅ Move to **Step 7**

---

### STEP 6: PROGRESS REPORTING (concurrent with Step 5)

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 6 — PROGRESS REPORTING                                     │
│  Owner: OpenClaw Engine     Platform: Telegram                    │
│  Duration: Runs during Step 5   Engine: OpenClaw                  │
│  Concurrency: Parallel with research execution                    │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
Real-time progress updates sent to the HR manager while research agents are running.

**Why does it exist?**
A 2-minute wait with no feedback feels like the system is broken. Progress updates maintain trust and give the HR manager useful early signals (e.g., "LinkedIn verified" = already valuable info).

**What to do:**

1. **Poll Redis progress tracker** every 10 seconds
2. **Send progress update** at ~50% completion (or after 60 seconds, whichever comes first):
   ```
   Progress: 3/5 agents complete
   - LinkedIn — profile found, 3 positions verified
   - GitHub — 847 commits, 23 repos analyzed
   - Employer — FPT Software verified (27,000+ employees)
   - Portfolio — scraping nva.dev...
   - Web search — searching public mentions...
   ```
3. **If any critical finding surfaces early**, send immediately:
   ```
   Early finding: LinkedIn title is "Senior Engineer" but CV says "Tech Lead" at FPT Software
   ```

**Message throttling:**
- Max 2 progress messages (avoid spam)
- Minimum 30 seconds between messages
- Skip progress message if research completes in < 45 seconds total

**Exit criteria:**
- ✅ HR manager is informed of progress (or research was fast enough to skip)
- ✅ This step ends when Step 5 completes

---

### STEP 7: LLM SYNTHESIS & CROSS-REFERENCING

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 7 — LLM SYNTHESIS & CROSS-REFERENCING                     │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: 15-30 seconds    Engine: LLM (Claude Sonnet/Opus)      │
│  Budget: 30 sec of 3-min SLA                                      │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
The LLM receives ALL research results and the original CV, then performs intelligent cross-referencing, inconsistency detection, and generates an analysis.

**Why does it exist?**
Raw data from 5 agents is noise. The LLM transforms scattered data points into a coherent narrative with actionable insights. This is where "data" becomes "intelligence."

**What to do:**

1. **Assemble the `ResearchBundle`**:
   ```json
   {
     "candidate_profile": { "..." },
     "linkedin_report": { "..." },
     "github_report": { "..." },
     "portfolio_report": { "..." },
     "employer_reports": [ "..." ],
     "web_search_findings": [ "..." ],
     "metadata": {
       "agents_succeeded": 4,
       "agents_failed": 1,
       "total_research_time_ms": 87000
     }
   }
   ```

2. **Run Cross-Reference Analysis** (LLM prompt):
   ```
   You are a senior HR analyst. Given the candidate's CV data and
   independent research from multiple sources, perform the following:

   A) VERIFY each CV claim against external evidence
   B) DETECT inconsistencies (title inflation, date mismatches,
      fabricated companies, unverifiable skills)
   C) RATE each inconsistency by severity: critical / high / medium / low
   D) IDENTIFY strengths evidenced by external data but NOT on the CV
   E) GENERATE 3 tailored interview questions targeting gaps
   F) PRODUCE an overall traffic-light rating (GREEN / YELLOW / RED)
   ```

3. **Specific cross-checks performed**:

   | CV Claim | Checked Against | Discrepancy Example |
   |----------|----------------|---------------------|
   | "Tech Lead at FPT, 2021-2023" | LinkedIn: "Senior Engineer, 2021-2023" | Title inflation -> **High** |
   | "Built microservices platform" | GitHub: no relevant repos | Unverifiable -> **Medium** |
   | "Expert in Kubernetes" | GitHub: 0 k8s-related code | Skill overclaim -> **Medium** |
   | "BSc Computer Science, HUST" | LinkedIn: same | Verified |
   | "Led 20-person team at FPT" | FPT has 27,000 employees | Plausible -> Verified |

4. **Generate interview questions** targeting gaps:
   - Gap: Title discrepancy -> _"Can you walk me through your exact role progression at FPT? What was your official title vs. your day-to-day responsibilities?"_
   - Gap: Unverifiable skill -> _"You listed Kubernetes expertise. Can you describe a production cluster you managed — how many nodes, what orchestration challenges?"_
   - Strength probe -> _"Your GitHub shows strong Python contributions. Can you talk about the microservice-kit project and the design decisions behind it?"_

5. **Select model based on candidate seniority**:

   | Seniority Signal | Model | Reason |
   |-----------------|-------|--------|
   | Junior (< 3 years exp) | Claude Sonnet 4.6 | Fast, cost-effective |
   | Mid/Senior (3-10 years) | Claude Sonnet 4.6 | Good balance |
   | Executive / Director | Claude Opus 4.6 | Nuanced analysis needed |

**Exit criteria:**
- ✅ All cross-references completed
- ✅ Inconsistencies identified and severity-rated
- ✅ Interview questions generated
- ✅ Overall rating assigned (GREEN/YELLOW/RED)
- ✅ Move to **Step 8**

---

### STEP 8: BRIEF ASSEMBLY & FORMATTING

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 8 — BRIEF ASSEMBLY & FORMATTING                            │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: 3-5 seconds      Engine: OpenClaw (template engine)    │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
Takes the LLM synthesis output and formats it into a polished, scannable brief optimized for Telegram delivery + a PDF version.

**Why does it exist?**
Raw LLM output is too long and inconsistent for Telegram. This step applies a strict template that HR managers can scan in 30 seconds.

**What to do:**

1. **Apply Telegram-optimized template**:
   ```
   ===================================
   CANDIDATE BRIEF: Nguyen Van A
   Researched: 21 Mar 2026 | 2m 14s
   ===================================

   OVERALL: YELLOW — PROCEED WITH CAUTION
   Strong technical profile, but title discrepancy
   found between CV and LinkedIn. 4/5 claims verified.

   -- VERIFIED CLAIMS ----------------
   * Worked at FPT Software (2021-2023)
   * BSc Computer Science, HUST
   * Active GitHub: 847 commits/year, Python-heavy
   * Portfolio site live with 5 projects

   -- INCONSISTENCIES -----------------
   [HIGH] CV says "Tech Lead" at FPT, LinkedIn
          shows "Senior Engineer"
   [MED]  Claims Kubernetes expertise, no evidence
          in public GitHub repos
   [MED]  Portfolio last updated Jun 2024 (9 months ago)

   -- TECHNICAL SNAPSHOT ---------------
   GitHub: 23 repos | 156 stars | Top: Python 45%, TS 30%
   Notable: microservice-kit (89 stars)
   Skills evidence: Python YES | K8s NO | AWS ~partial

   -- EMPLOYERS ------------------------
   FPT Software: Verified | 27,000+ emp | IT Services
   ABC Startup:  Verified | ~50 emp | Fintech

   -- INTERVIEW QUESTIONS --------------
   1. "Walk me through your role progression at FPT.
       What was your official title?"
   2. "Describe a production Kubernetes cluster you
       managed. How many nodes?"
   3. "Tell me about your microservice-kit project —
       what problem does it solve?"

   -- SOURCES --------------------------
   linkedin.com/in/nva
   github.com/nva
   nva.dev
   ===================================
   ```

2. **Generate PDF version**:
   - Convert markdown brief to styled PDF (company branding)
   - Include screenshots (portfolio, GitHub contribution graph)
   - Store in S3, generate signed URL (24-hour expiry)

3. **Store brief**:
   ```sql
   INSERT INTO candidate_briefs (request_id, overall_rating, brief_markdown,
     brief_pdf_url, inconsistencies_count, verified_claims_count,
     interview_questions, model_used, tokens_used)
   VALUES ($req_id, 'yellow', $markdown, $pdf_url, 3, 4, $questions,
     'claude-sonnet-4-6', 2847);
   ```

4. **Calculate Telegram message chunking**:
   - Telegram max message: 4096 characters
   - If brief > 4096 chars: split into 2 messages (main brief + details)
   - Always keep the first message under 4096 (it has the rating + key findings)

**Exit criteria:**
- ✅ Telegram-formatted brief ready
- ✅ PDF generated and stored
- ✅ Brief record saved in database
- ✅ Move to **Step 9**

---

### STEP 9: DELIVERY

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 9 — DELIVERY                                               │
│  Owner: OpenClaw Engine     Platform: Telegram                    │
│  Duration: < 2 seconds      Engine: OpenClaw -> Telegram Bot API  │
│  SLA CHECK: Total elapsed must be < 3 minutes                     │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
The final candidate brief is delivered to the HR manager on Telegram, completing the core workflow.

**Why does it exist?**
This is the payoff. All prior steps culminate in this moment — the HR manager gets actionable intelligence before their interview.

**What to do:**

1. **Send the formatted brief** (from Step 8) as a Telegram message
2. **Attach inline action buttons** (Telegram InlineKeyboardMarkup):
   ```
   [Download PDF]  [Deep Dive]
   [Share with Team]  [Schedule Interview]
   ```
3. **Update request status**:
   ```sql
   UPDATE research_requests
   SET status = 'delivered', completed_at = NOW()
   WHERE id = $req_id;
   ```
4. **Log delivery metrics**:
   - Total elapsed time (trigger -> delivery)
   - Agents completed vs. failed
   - Inconsistencies found
   - Model used + tokens consumed

5. **If SLA breached** (> 3 minutes):
   - Log SLA breach event for monitoring
   - Still deliver (late is better than never)
   - Append note: _"This research took longer than usual due to slow external sources"_

**Exit criteria:**
- ✅ HR manager has the brief in their Telegram chat
- ✅ Action buttons are visible and functional
- ✅ Request status = `delivered` in database
- ✅ Metrics logged
- ✅ Core journey complete — move to **Step 10** (optional actions)

---

### STEP 10: POST-DELIVERY ACTIONS

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 10 — POST-DELIVERY ACTIONS                                 │
│  Owner: HR Manager (trigger) + OpenClaw (execute)                 │
│  Duration: On-demand         Engine: OpenClaw                     │
│  Trigger: Inline button press or follow-up command                │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
Optional follow-up actions the HR manager can take after receiving the brief. These extend the value of the research.

**Why does it exist?**
The brief is step one. HR managers need to share it, schedule interviews, or dig deeper. Meeting those needs in Telegram keeps everything in one place.

**What to do (per action):**

| Button | What Happens | Implementation |
|--------|-------------|----------------|
| **Download PDF** | Send the pre-generated PDF as a Telegram document | Retrieve from S3, send via `sendDocument` API |
| **Deep Dive** | Launch extended research: conference talks, publications, patents, academic citations | Spawn additional TinyFish agents -> deliver supplementary report in ~5 min |
| **Share with Team** | Forward the brief to a pre-configured HR team channel or specific colleagues | Send to configured `team_channel_id` or prompt for recipient |
| **Schedule Interview** | Open a calendar integration to book the interview | Google Calendar API / Outlook integration -> propose 3 time slots |
| **Save to ATS** | Push structured candidate data to the company's ATS | API integration: Greenhouse, Lever, BambooHR, or custom webhook |

**Follow-up commands:**

| Command | Action |
|---------|--------|
| `/compare <candidate1> <candidate2>` | Side-by-side comparison of two researched candidates |
| `/history` | List last 20 screened candidates |
| `/re-screen <request_id>` | Re-run research (useful if profile was recently updated) |

**Exit criteria:**
- ✅ Requested action completed
- ✅ HR manager confirmed receipt (or action completed silently)

---

### STEP 11: DATA LIFECYCLE & BACKGROUND OPERATIONS

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 11 — DATA LIFECYCLE & BACKGROUND OPERATIONS                │
│  Owner: TinyFish Scheduler  Platform: Background crons            │
│  Duration: Ongoing          Engine: TinyFish Cronjobs             │
│  Trigger: Scheduled (not user-initiated)                          │
└──────────────────────────────────────────────────────────────────┘
```

**What is it?**
Background maintenance jobs that keep the system healthy, compliant, and performant.

**Why does it exist?**
Candidate data is sensitive (PII). Vietnamese data protection law requires proper retention policies. Caches must stay fresh. The system must self-heal.

**What to do:**

| Cronjob | Schedule | Action | Owner |
|---------|----------|--------|-------|
| `data_cleanup` | Daily 3:00 AM | Purge research bundles older than 90 days from PostgreSQL + S3 | TinyFish |
| `linkedin_cache_refresh` | Every 6 hours | Re-fetch cached LinkedIn profiles for candidates still in active pipeline | TinyFish |
| `github_stats_prefetch` | Daily 2:00 AM | Pre-cache GitHub stats for candidates with upcoming interviews | TinyFish |
| `employer_db_update` | Weekly Sunday 1:00 AM | Refresh Vietnamese company registry cache from congthongtin.dkkd.gov.vn | TinyFish |
| `health_check` | Every 5 minutes | Verify: API keys valid, external services reachable, queue depth normal | TinyFish |
| `metrics_rollup` | Hourly | Aggregate: requests/day, avg latency, SLA compliance %, cost per candidate | TinyFish |
| `audit_log_export` | Weekly Monday | Export audit trails for compliance review | TinyFish |

**Monitoring & Alerts:**

| Alert Condition | Action |
|----------------|--------|
| SLA breach rate > 10% in 1 hour | Page on-call engineer |
| LinkedIn API returning 403s | Switch to fallback provider, alert team |
| Database connection pool exhausted | Auto-scale, alert team |
| Cost per candidate > $1.00 | Alert finance + engineering |

**Exit criteria:**
- ✅ This step never "exits" — it runs continuously as long as the system is live

---

### Complete Timing Budget

```
┌─────────────────────────────────────────────────────────┐
│  3-MINUTE SLA BREAKDOWN                                   │
│                                                           │
│  Step 1: Trigger .............. 0s    (user action)       │
│  Step 2: Intake ............... 3s    ====                 │
│  Step 3: CV Parsing .......... 15s   ============         │
│  Step 4: Dispatch ............. 2s    ==                   │
│  Step 5: Research ........... 120s   (max) ============== │
│  Step 6: Progress ............ --     (concurrent w/ 5)   │
│  Step 7: LLM Synthesis ....... 25s   ================     │
│  Step 8: Formatting ........... 3s   ===                  │
│  Step 9: Delivery ............. 2s   ==                   │
│                               -----                       │
│  TOTAL ...................... 170s   (2m 50s target)       │
│  BUFFER ...................... 10s                         │
│  SLA ........................ 180s   (3m 00s hard limit)   │
└─────────────────────────────────────────────────────────┘
```

### Quick Reference: Who Owns What

| Component | Engine | Role |
|-----------|--------|------|
| Telegram Bot interface | **OpenClaw** | Receives messages, sends responses, manages buttons |
| CV parsing & entity extraction | **OpenClaw** + LLM | Converts documents to structured data |
| Task orchestration & dispatch | **OpenClaw** | Decides which agents to run, manages lifecycle |
| LinkedIn research | **TinyFish** | On-demand agent, API calls to Bright Data/ScrapIn |
| GitHub research | **TinyFish** | On-demand agent, GitHub REST API |
| Portfolio scraping | **TinyFish** | On-demand agent, Playwright headless browser |
| Employer verification | **TinyFish** | On-demand agent, Vietnamese registries + APIs |
| Web search | **TinyFish** | On-demand agent, SerpAPI |
| LLM synthesis | **OpenClaw** + LLM | Cross-referencing, inconsistency detection, brief generation |
| Brief delivery | **OpenClaw** | Formats and sends via Telegram |
| Background maintenance | **TinyFish** | Scheduled crons: cleanup, cache refresh, health checks |
| HR board notifications | **OpenClaw** | Team sharing, alerts, compliance reports |

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
| LinkedIn (Bright Data) | REST API | High | ~$0.02/profile |
| LinkedIn (ScrapIn) | REST API | High | ~$0.015/profile |
| GitHub | REST API | High | Free (5000 req/hr) |
| congthongtin.dkkd.gov.vn | National Business Registry portal | High (official) | Free |
| masothue.com | Web scrape | High for tax/company verification | Free |
| VietnamWorks | OAuth2 REST API | Medium (general jobs) | Free |
| TopDev.vn / itviec.com | Web scrape | Medium (tech jobs) | Free |
| AsiaVerify | KYB API | High (Vietnam-specific) | Per-query pricing |
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
- LinkedIn agent (Bright Data / ScrapIn API)
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
| Bright Data / ScrapIn (LinkedIn) | $10 (500 lookups) |
| SerpAPI (web search) | $50 (5000 searches) |
| Claude Sonnet API (synthesis) | $15 (~500 briefs) |
| GitHub API | Free |
| Infrastructure (Cloud Run + DB) | $100 |
| **Total** | **~$170/month** |

At 500 candidates/month, that's **$0.34 per candidate** — vs. 15-30 minutes of HR time per manual Google search.
