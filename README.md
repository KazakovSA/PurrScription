# PurrScription

Collaborative audio/video annotation platform with AI pre-annotation, real-time editing, verification workflows, and quality gates.

## Features

- **Media Import**: Audio files and Gecko JSON annotations
- **AI Pre-annotation**: faster-whisper based transcription with confidence scores
- **Real-time Collaboration**: WebSocket-powered multi-user editing with presence, focus, and locks
- **Waveform Navigation**: WaveSurfer.js v7 integration with playback control
- **Segmentation**: Create, edit, and manage temporal segments with speaker tracking
- **Markers & Comments**: Annotate quality issues, create discussions within segments
- **Quality Firewall**: Automated validation before export
- **Verification Workflow**: Multi-role approval chain (assign → annotate → verify → export)
- **Secure Export**: Deterministic output with audit logs

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (build) + HMR
- TanStack Query (data fetching)
- Zustand (state management)
- WaveSurfer.js v7 (audio visualization)
- shadcn/ui + Tailwind CSS

### Backend
- Python 3.12 + FastAPI
- Pydantic v2 (validation)
- SQLAlchemy 2 (async ORM)
- Alembic (migrations)
- PostgreSQL + Redis
- WebSocket for real-time

### Testing & Quality
- Vitest + Playwright (frontend E2E)
- Pytest + HTTPX (backend)
- Docker Compose (local dev environment)

## Project Structure

```
purrscription/
├── apps/
│   ├── web/                 # React frontend (Vite)
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api/                 # Python FastAPI backend
│       ├── api/
│       ├── migrations/
│       ├── pyproject.toml
│       └── alembic.ini
├── packages/
│   └── contracts/           # Shared TypeScript types & contracts
│       └── src/
│           └── types/
├── infra/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── compose-demo.yml
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── api-contract.md
│   ├── realtime.md
│   └── definition-of-done.md
├── demo/
│   ├── audio/
│   ├── gecko-json/
│   └── seed-data/
├── tests/
│   ├── e2e/
│   └── fixtures/
├── .github/workflows/
├── package.json
├── .env.example
├── .editorconfig
├── .gitignore
├── docker-compose.yml
├── README.md
├── CONTRIBUTING.md
└── AGENTS.md
```

## Quick Start

### Prerequisites
- Node.js 18+, npm 9+
- Python 3.12
- Docker & Docker Compose
- Git

### Local Development

1. **Clone & Setup**
   ```bash
   git clone https://github.com/KazakovSA/PurrScription.git
   cd PurrScription
   cp .env.example .env
   npm install
   ```

2. **With Docker (Recommended)**
   ```bash
   docker-compose up -d
   ```
   Services: web (http://localhost:5173), api (http://localhost:8000)

3. **Without Docker**
   ```bash
   # Terminal 1: PostgreSQL + Redis
   docker-compose up postgres redis
   
   # Terminal 2: Backend
   cd apps/api
   pip install -e .
   alembic upgrade head
   python -m uvicorn api.main:app --reload
   
   # Terminal 3: Frontend
   npm run dev -w apps/web
   ```

### Accounts

Demo accounts (after seed):
- **admin**: admin@purrscription.dev / demo123
- **supervisor**: supervisor@purrscription.dev / demo123
- **annotator**: annotator@purrscription.dev / demo123
- **verifier**: verifier@purrscription.dev / demo123
- **ml_engineer**: ml_engineer@purrscription.dev / demo123
- **customer**: customer@purrscription.dev / demo123

## Commands

### Workspaces
```bash
npm run dev              # dev all workspaces
npm run build            # build all
npm run lint             # lint all
npm run test             # test all
npm run type-check       # type-check all
```

### Individual Apps
```bash
npm run dev -w apps/web
npm run dev -w apps/api
npm run build -w apps/web
npm run test -w apps/web
npm run test:e2e         # run E2E tests
```

### Docker
```bash
docker-compose up -d     # start services
docker-compose down      # stop services
docker-compose logs -f   # stream logs
```

### Database
```bash
cd apps/api
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

## API Endpoints

See [docs/api-contract.md](docs/api-contract.md)

### Authentication
- POST `/auth/register` - Register user
- POST `/auth/login` - Login (returns JWT)
- POST `/auth/logout` - Logout
- POST `/auth/refresh` - Refresh token

### Projects & Tasks
- GET `/projects` - List projects
- POST `/projects` - Create project
- GET `/tasks?project_id=...` - List tasks
- POST `/tasks` - Create task

### Media & Segments
- POST `/media/upload` - Upload audio
- POST `/media/import-gecko` - Import Gecko JSON
- GET `/tasks/{id}/segments` - Get segments
- PATCH `/segments/{id}` - Update segment

### Real-time
- WebSocket `/ws` - Subscribe to events

See [docs/realtime.md](docs/realtime.md) for events.

## Data Model

See [docs/data-model.md](docs/data-model.md) for complete ERD and entity definitions.

### Key Entities
- **User**: Roles (admin, supervisor, annotator, verifier, ml_engineer, customer)
- **Project**: Container for tasks
- **Task**: Statuses (new, assigned, in_progress, review, rework, fixed, accepted, exported)
- **MediaFile**: Audio source
- **Segment**: Temporal unit with text, speaker, confidence, version (optimistic concurrency)
- **Marker**: Quality issue marker
- **Comment**: Discussion
- **QualityCheck**: Validation result
- **ExportFile**: Immutable export artifact

## Concurrency Rules

- **Focus**: Non-blocking presence indicator
- **Text lock**: Soft lock (last-write-wins with optimistic concurrency via `Segment.version`)
- **Boundaries lock**: Hard lock (mutual exclusion on start/end change)
- **Conflict detection**: `Segment.version` mismatch triggers `segment_conflict` event
- **TTL**: 5 min; heartbeat every 30s
- **Reconnect**: Full REST snapshot

## Quality Firewall

Export is blocked if:
- ❌ Critical markers unresolved
- ❌ Critical comments present
- ❌ Checklist not passed
- ❌ Task not accepted
- ❌ Conflicting edits detected

See [docs/definition-of-done.md](docs/definition-of-done.md)

## Testing

### Frontend E2E
```bash
npm run test:e2e
```

Scenarios:
- Login with all roles
- Import Gecko JSON
- Edit segments, markers, comments
- Verify workflow (assign → review → accept)
- Export and quality gate
- Cross-browser (Chrome, Edge, Firefox, WebKit)

### Backend Tests
```bash
cd apps/api
pytest tests/ -v
```

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md)

### Branch Strategy
- `main` - stable
- `develop` - integration
- `feature/*` - feature branches
- `lead/bootstrap-*` - bootstrap phase
- `lead/integration-*` - integration phase

### Commit Format
```
type(scope): description

[body]

[footer]
```

Types: feat, fix, chore, docs, test, refactor, perf, ci
Scope: web, api, contracts, infra, docs, demo, tests

Example: `chore(contracts): add segment lock event`

## Status

### ✓ Bootstrap Phase (Lead)
- [x] Monorepo structure
- [x] Contracts v1 (roles, statuses, entities, events)
- [x] Configuration (env, docker-compose, lint, test)
- [x] Documentation skeleton
- [x] GitHub Actions CI/CD
- [x] Demo data & seed script
- [ ] Integration (on merge)

### 🚧 Integration Phase (Team)
- [ ] Frontend/Backend integration
- [ ] Gecko JSON import/export
- [ ] Quality Firewall
- [ ] E2E workflow tests
- [ ] Multi-browser testing
- [ ] Final README & demo script

### ⏳ Future
- [ ] TATLIN/VEGMAN speaker detection
- [ ] Cross-talk detection
- [ ] Batch export
- [ ] REST API versioning
- [ ] GraphQL schema

## Docs

- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [API Contract](docs/api-contract.md)
- [Real-time Events](docs/realtime.md)
- [Definition of Done](docs/definition-of-done.md)
- [Demo Script](docs/demo-script.md)
- [Agents](AGENTS.md)

## Troubleshooting

### Port already in use
```bash
# Find & kill process
lsof -i :5173     # web
lsof -i :8000     # api
lsof -i :5432     # postgres
kill -9 <PID>
```

### Docker issues
```bash
# Reset volumes
docker-compose down -v
docker-compose up --build
```

### Database migrations fail
```bash
cd apps/api
alembic downgrade base
alembic upgrade head
```

### WebSocket connection refused
- Check API is running on `localhost:8000`
- Check CORS in `.env`
- Browser console for ws:// URL

## License

Hackathon Project

## Contact

See [AGENTS.md](AGENTS.md)
