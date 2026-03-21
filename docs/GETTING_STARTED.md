# Getting Started — ClawBerries

> Automated Enterprise Lead Discovery & Outreach — Job Applicant Research Agent

---

## Prerequisites

| Tool             | Version   | Purpose                          |
|------------------|-----------|----------------------------------|
| **Node.js**      | ≥ 18      | Runtime                          |
| **pnpm**         | ≥ 10.13   | Package manager (workspace)      |
| **Docker**       | Latest    | PostgreSQL + Redis containers    |

---

## 1. Clone & Install

```bash
git clone <your-repo-url> ClawBerries
cd ClawBerries

# Install all workspace dependencies (root + web)
pnpm install
```

---

## 2. Start Infrastructure (Docker)

The project uses **PostgreSQL 17 (pgvector)** and **Redis 7**.

```bash
docker compose up -d
```

This spins up:

| Service    | Container                | Port  |
|------------|--------------------------|-------|
| PostgreSQL | `clawberries-postgres`   | 5432  |
| Redis      | `clawberries-redis`      | 6379  |

Default credentials (set in `docker-compose.yml`):
- **User:** `clawberries`
- **Password:** `clawberries`
- **Database:** `clawberries`

---

## 3. Configure Environment Variables

### Backend (`.env` in project root)

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

**Minimum required variables:**

```env
DATABASE_URL=postgres://clawberries:clawberries@localhost:5432/clawberries
GEMINI_API_KEY=<your-gemini-api-key>
TINYFISH_API_KEY=<your-tinyfish-api-key>
OPENAI_API_KEY=<your-openai-api-key>
```

See `.env.example` for the full list of optional variables (Redis, Telegram, LLM provider config, etc.).

### Frontend (`web/.env`)

```bash
cp web/.env.example web/.env
```

```env
# Backend API URL
VITE_API_URL=http://localhost:3001

# Google Calendar integration (optional)
VITE_GOOGLE_CLIENT_ID=<your-google-oauth2-client-id>
VITE_GOOGLE_API_KEY=<your-google-api-key>
```

> **Google Calendar Setup (optional):**
> 1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
> 2. Create an **OAuth 2.0 Client ID** (Web application type)
>    - Add `http://localhost:5173` to **Authorized JavaScript origins**
> 3. Create an **API Key** → Restrict to **Google Calendar API**

---

## 4. Run Database Migrations

Apply all SQL migrations to set up the database schema:

```bash
pnpm db:migrate
```

> This uses [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) to run migration files from the `drizzle/` folder.

To explore the DB visually:

```bash
pnpm db:studio
```

---

## 5. Start the Application

You need **two terminals** — one for the API server and one for the frontend:

### Terminal 1 — API Server (port 3001)

```bash
pnpm api:dev
```

### Terminal 2 — Frontend Dev Server (port 5173)

```bash
cd web
pnpm dev
```

Open your browser at: **http://localhost:5173**

---

## 6. Available Scripts

### Root (`package.json`)

| Command                  | Description                                      |
|--------------------------|--------------------------------------------------|
| `pnpm dev`               | Start the Telegram bot (main `src/index.ts`)     |
| `pnpm api:dev`           | Start the API server with hot-reload             |
| `pnpm db:migrate`        | Run database migrations                          |
| `pnpm db:generate`       | Generate migration files from schema changes     |
| `pnpm db:studio`         | Open Drizzle Studio (DB browser)                 |
| `pnpm test`              | Run unit tests                                   |
| `pnpm test:integration`  | Run integration tests                            |
| `pnpm check`             | Lint with Biome                                  |
| `pnpm check:fix`         | Auto-fix lint issues                             |
| `pnpm typecheck`         | TypeScript type checking                         |
| `pnpm build`             | Production build (tsup)                          |

### Frontend (`web/package.json`)

| Command          | Description                       |
|------------------|-----------------------------------|
| `pnpm dev`       | Start Vite dev server (port 5173) |
| `pnpm build`     | Production build                  |
| `pnpm preview`   | Preview production build          |
| `pnpm lint`      | Run ESLint                        |

---

## 7. Project Structure

```
ClawBerries/
├── src/
│   ├── api/server.ts        # HTTP API server (port 3001)
│   ├── index.ts             # Telegram bot entry point
│   ├── cli.ts               # CLI interface
│   ├── features/            # Business logic (pipeline steps)
│   └── shared/
│       └── db/
│           └── schema.ts    # Drizzle ORM schema
├── web/                     # React frontend (Vite + Tailwindcss v4)
│   └── src/
│       ├── App.tsx           # Router
│       ├── pages/            # Page components
│       ├── components/       # Shared UI components
│       └── hooks/            # Custom hooks (e.g. useGoogleCalendar)
├── drizzle/                 # SQL migration files
├── docs/                    # Documentation
├── uploads/                 # Uploaded CV files
├── docker-compose.yml       # PostgreSQL + Redis
├── drizzle.config.ts        # Drizzle Kit config
└── .env.example             # Environment variable template
```

---

## Troubleshooting

| Problem                          | Solution                                                      |
|----------------------------------|---------------------------------------------------------------|
| `ECONNREFUSED :5432`             | Run `docker compose up -d` to start PostgreSQL                |
| `relation does not exist`        | Run `pnpm db:migrate` to apply migrations                     |
| Frontend can't reach API         | Ensure `VITE_API_URL=http://localhost:3001` is set in `web/.env` |
| Google Calendar not connecting   | Set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` in `web/.env` |
| Port already in use              | Kill existing process: `lsof -i :<port>` then `kill <PID>`   |
