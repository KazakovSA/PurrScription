# AGENTS.md - Team Roles & Responsibilities

## Bootstrap Phase (Current)

### Principal Engineer (Lead)
- **Scope**: Architecture, contracts, bootstrap setup, integration coordination
- **Responsible for**:
  - Monorepo structure
  - Contracts v1 (roles, statuses, entities, WebSocket events)
  - Configuration (env, docker-compose, CI/CD)
  - Documentation skeleton
  - Demo data & seed script
  - Quality gates for PR merge to main
- **PR**: `chore: bootstrap PurrScription architecture and contracts`
- **Status**: 🚧 In Progress

## Integration Phase (After Bootstrap Merge)

### Frontend Engineer
- **Scope**: React/Vite app, UI, state management, real-time UI updates
- **Responsible for**:
  - Component library (WaveSurfer integration, segment UI, markers/comments)
  - TanStack Query & Zustand setup
  - Form validation (Gecko JSON upload)
  - WebSocket real-time updates (presence, focus, locks, events)
  - E2E tests (Playwright)
- **Files**:
  - `apps/web/src/**`
  - `tests/e2e/**` (web scenarios)
- **Status**: ⏳ Waiting for bootstrap merge

### Backend Engineer
- **Scope**: FastAPI, database, ORM, WebSocket server, business logic
- **Responsible for**:
  - SQLAlchemy models & migrations
  - FastAPI routes (auth, projects, tasks, media, segments, quality)
  - WebSocket server implementation
  - Optimistic concurrency (version tracking)
  - Quality Firewall validation
  - Error handling & audit logs
  - Unit & integration tests (Pytest)
- **Files**:
  - `apps/api/**`
  - `tests/api/**` (Pytest)
- **Status**: ⏳ Waiting for bootstrap merge

### DevOps / Infra Engineer
- **Scope**: Docker, deployment, CI/CD, database migrations
- **Responsible for**:
  - Dockerfile optimization
  - Docker Compose improvements
  - GitHub Actions workflows
  - Database seed script
  - Health checks & logging
- **Files**:
  - `infra/**`
  - `.github/workflows/**`
  - Database migrations
- **Status**: ⏳ Waiting for bootstrap merge

### QA / Test Engineer
- **Scope**: E2E testing, cross-browser validation, quality gates
- **Responsible for**:
  - E2E test scenarios (Playwright)
  - Cross-browser testing (Chrome, Edge, Firefox, WebKit)
  - Test data fixtures
  - Demo scenario validation
  - Performance & stability testing
- **Files**:
  - `tests/e2e/**`
  - `tests/fixtures/**`
  - `docs/demo-script.md`
- **Status**: ⏳ Waiting for bootstrap merge

### Documentation / Product Owner
- **Scope**: Docs, demo script, Definition of Done, API contract
- **Responsible for**:
  - Architecture diagrams
  - Data model ERD
  - API contract documentation
  - Real-time events documentation
  - Definition of Done checklist
  - Demo script walkthrough
  - Roadmap & feature specs
- **Files**:
  - `docs/**`
  - `CONTRIBUTING.md`
  - `README.md`
- **Status**: ⏳ Waiting for bootstrap merge

## Communication & Escalation

### Sync Points (Bootstrap Phase)
1. **Kickoff**: Review bootstrap plan, contracts, and architecture
2. **Blockers**: Report immediately in team channel
3. **Merge**: Principal engineer validates PR before merge to main
4. **Handoff**: Integration team starts after merge notification

### During Integration Phase
- **Daily standup**: 15 min (sync status)
- **PR reviews**: 24-hour SLA
- **Blockers**: Escalate same day
- **Integration sync**: Tuesday & Friday (cross-functional)

### Decision Making
- **Architecture**: Principal engineer + team consensus
- **API contracts**: Backend engineer + frontend engineer
- **Quality gates**: QA engineer + principal engineer
- **Deployments**: Principal engineer approval

## No Overlapping Scope

| Area | Owner | Backup |
|------|-------|--------|
| Contracts (types, enums, events) | Principal | Frontend |
| Frontend UI & state | Frontend | Principal |
| Backend models & routes | Backend | Principal |
| Docker & CI/CD | DevOps | Principal |
| E2E & test scenarios | QA | Backend |
| Docs & demo script | Docs | Principal |

**Rule**: Don't modify another team member's workspace without permission. File issues or start discussions first.

## Code Review Checklist

Reviewers must validate:
- [ ] Follows `CONTRIBUTING.md` conventions
- [ ] Commits are conventional format
- [ ] No secrets in code/docs
- [ ] Tests added & passing
- [ ] Type-checks pass
- [ ] Lints cleanly
- [ ] Documentation updated
- [ ] No scope creep (stays in assigned area)

## Roles for Demo Accounts

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| admin | admin@purrscription.dev | demo123 | Full system access, user management, quality override |
| supervisor | supervisor@purrscription.dev | demo123 | Create projects, assign tasks, approve reviews |
| annotator | annotator@purrscription.dev | demo123 | Edit segments, add markers/comments, submit |
| verifier | verifier@purrscription.dev | demo123 | Review annotations, accept/reject, initiate rework |
| ml_engineer | ml_engineer@purrscription.dev | demo123 | Configure ASR, monitor quality metrics |
| customer | customer@purrscription.dev | demo123 | View projects (read-only), download exports |

See [docs/definition-of-done.md](docs/definition-of-done.md) for role-based workflows.

## Success Criteria

### Bootstrap Phase
- ✓ PR `chore: bootstrap...` merged to main
- ✓ All CI/CD checks pass
- ✓ Demo data loads cleanly
- ✓ Contracts locked (immutable v1)
- ✓ Team can start integration

### Integration Phase
- ✓ Full workflow E2E tests pass (all browsers)
- ✓ Cross-browser compatibility verified
- ✓ Quality Firewall blocks invalid exports
- ✓ Real-time updates work smoothly
- ✓ Demo scenario executes flawlessly
- ✓ No secrets in demo flow
- ✓ Audit logs complete

## Questions?

- **Architecture**: Principal engineer
- **Frontend**: Frontend engineer
- **Backend**: Backend engineer
- **DevOps**: DevOps engineer
- **QA**: QA engineer
- **Documentation**: Docs / PO
- **Process**: Principal engineer (acting scrum master)

## Continuity

If a team member is unavailable:
- **Principal** → Senior backend engineer
- **Frontend** → Backend engineer (can pick up styling)
- **Backend** → Principal engineer (can review)
- **DevOps** → Principal engineer
- **QA** → Frontend engineer
- **Docs** → Principal engineer

**Always pair** on handoffs to maintain context.
