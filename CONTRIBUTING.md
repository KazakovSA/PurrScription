# Contributing to PurrScription

Thank you for contributing! Please follow these guidelines.

## Branch Strategy

```
main (stable)
↑
develop (integration)
↑
lead/bootstrap-* (bootstrap phase, engineer-led)
lead/integration-* (integration phase, team-led)
feature/* (feature branches from develop)
fix/* (bug fixes from main)
```

## Workflow

1. **Never commit to `main`** — use feature/lead branches only
2. **Pull from upstream before starting**: `git pull origin develop`
3. **Create descriptive branch name**:
   - `feature/gecko-import` - new feature
   - `fix/segment-conflict` - bug fix
   - `lead/bootstrap-contracts` - bootstrap task
4. **Commit with Conventional Commits**:
   ```
   type(scope): description
   
   [body with rationale]
   
   Closes #123
   ```

## Conventional Commits

Format: `type(scope): description`

**Types**:
- `feat` - new feature
- `fix` - bug fix
- `chore` - build, CI/CD, deps (no code change)
- `docs` - documentation
- `test` - test cases
- `refactor` - code restructure (no behavior change)
- `perf` - performance improvement
- `ci` - CI/CD configuration

**Scopes**:
- `web` - apps/web
- `api` - apps/api
- `contracts` - packages/contracts
- `infra` - infra/ (docker, etc)
- `docs` - docs/
- `demo` - demo/
- `tests` - tests/

**Examples**:
```
feat(api): add segment lock event
fix(web): resolve waveform resize issue
chore(infra): update dockerfile
docs(data-model): add marker entity
test(e2e): add login scenario
```

## Code Quality

### Before Push

1. **Lint**:
   ```bash
   npm run lint
   ```

2. **Type Check**:
   ```bash
   npm run type-check
   ```

3. **Tests**:
   ```bash
   npm run test
   npm run test:e2e
   ```

4. **Build**:
   ```bash
   npm run build
   ```

### CI/CD

GitHub Actions automatically:
- Lint on PR
- Run tests
- Type-check
- Build
- Check conventional commits

You cannot merge with failing checks.

## Workspace Rules

### Frontend (apps/web)

- Language: TypeScript
- Framework: React 18
- State: Zustand
- Data: TanStack Query
- Styling: Tailwind + shadcn/ui
- Testing: Vitest + Playwright
- Linting: ESLint + Prettier

Structure:
```
apps/web/
├── src/
│   ├── components/     # Reusable components
│   ├── pages/          # Route pages
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # Zustand stores
│   ├── queries/        # TanStack Query definitions
│   ├── types/          # Local TS types (use contracts for shared)
│   ├── utils/          # Utilities
│   ├── App.tsx
│   └── main.tsx
├── public/             # Static assets
├── tests/              # E2E tests
├── vite.config.ts
└── package.json
```

### Backend (apps/api)

- Language: Python 3.12
- Framework: FastAPI
- ORM: SQLAlchemy 2 async
- DB: PostgreSQL + Redis
- Validation: Pydantic v2
- Migrations: Alembic
- Testing: Pytest + HTTPX

Structure:
```
apps/api/
├── api/
│   ├── main.py                 # FastAPI app
│   ├── config.py               # Settings
│   ├── models/                 # SQLAlchemy models
│   ├── schemas/                # Pydantic schemas
│   ├── routes/
│   │   ├── auth.py
│   │   ├── projects.py
│   │   ├── tasks.py
│   │   ├── media.py
│   │   └── segments.py
│   ├── ws/                     # WebSocket handlers
│   ├── services/               # Business logic
│   ├── db/
│   │   ├── connection.py
│   │   └── session.py
│   ├── exc/                    # Custom exceptions
│   └── utils/
├── migrations/                 # Alembic migrations
├── tests/
├── pyproject.toml
└── alembic.ini
```

### Contracts (packages/contracts)

- Language: TypeScript
- Purpose: Shared types, schemas, constants
- Zero dependencies on other packages

Structure:
```
packages/contracts/
├── src/
│   ├── types/
│   │   ├── user.ts
│   │   ├── project.ts
│   │   ├── task.ts
│   │   ├── segment.ts
│   │   ├── media.ts
│   │   ├── marker.ts
│   │   ├── comment.ts
│   │   ├── quality.ts
│   │   └── index.ts
│   ├── enums/
│   │   ├── roles.ts
│   │   ├── statuses.ts
│   │   └── index.ts
│   ├── events/
│   │   ├── presence.ts
│   │   ├── segment.ts
│   │   ├── marker.ts
│   │   ├── comment.ts
│   │   ├── quality.ts
│   │   └── index.ts
│   ├── schemas/
│   │   └── rest-envelope.ts
│   └── index.ts
└── package.json
```

## Documentation

Edit:
- `docs/architecture.md` - system design, flow diagrams
- `docs/data-model.md` - ERD, entity definitions
- `docs/api-contract.md` - REST endpoints, WebSocket API
- `docs/realtime.md` - WebSocket events, concurrency rules
- `docs/definition-of-done.md` - Quality criteria, checklists
- `docs/demo-script.md` - Step-by-step demo walkthrough

## Testing Standards

### Frontend E2E

✓ Real browser (Chrome, Firefox, WebKit)
✓ Real API (docker-compose up)
✓ Real database (clean seed before each test)
✓ No mocks of network or database

Example:
```typescript
test('annotator edits segment and sees real-time update', async ({ browser, page }) => {
  // 1. Login
  await page.goto('http://localhost:5173/login');
  await page.fill('[name="email"]', 'annotator@purrscription.dev');
  await page.fill('[name="password"]', 'demo123');
  await page.click('button:has-text("Login")');
  
  // 2. Open task
  await page.goto('http://localhost:5173/tasks/demo-task-id');
  
  // 3. Edit segment
  await page.click('.segment >> nth=0');
  await page.fill('[name="text"]', 'Updated text');
  await page.click('button:has-text("Save")');
  
  // 4. Verify saved (check API)
  const response = await page.request.get('http://localhost:8000/segments/demo-seg-id');
  const segment = await response.json();
  expect(segment.text).toBe('Updated text');
});
```

### Backend Tests

✓ Real database (fresh state per test)
✓ Test both happy path and errors
✓ Parametrize common scenarios

Example:
```python
def test_create_segment_success(client, db_session):
    task = create_demo_task(db_session)
    payload = {
        'task_id': task.id,
        'start': 0.0,
        'end': 5.0,
        'text': 'Hello',
        'speaker': 'TATLIN'
    }
    response = client.post('/segments', json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data['text'] == 'Hello'
    assert data['version'] == 1
```

## Secret Management

**❌ NEVER**:
- Commit `.env` (use `.env.example` only)
- Hardcode API keys, tokens, passwords
- Commit credentials in comments or TODO

**✓ DO**:
- Use environment variables
- Use `.env.example` for structure
- Document required vars in README

## No Rewrites

- Don't refactor others' code unless explicitly asked
- Respect existing patterns and conventions
- If you see tech debt, file an issue first

## PR Process

1. Push to your branch
2. Open PR against `develop` (or `main` for hotfixes)
3. Link issue: `Closes #123`
4. Write clear description of changes
5. Wait for CI/CD ✓
6. Request review from team
7. Address feedback
8. **Do NOT merge yourself** — reviewer handles merge

### PR Description Template

```markdown
## What
Brief description of changes.

## Why
Rationale and context.

## How
Implementation approach.

## Testing
How to verify manually.

## Checklist
- [ ] Code follows conventions
- [ ] Tests added/updated
- [ ] Docs updated
- [ ] No secrets committed
- [ ] Conventional commits used
```

## Questions?

See [AGENTS.md](../AGENTS.md) for team contacts and roles.
