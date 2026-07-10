# Definition of Done (DoD)

## Feature Development

Before marking a feature as "Done", ensure:

### Code Quality
- [ ] Code follows project conventions (CONTRIBUTING.md)
- [ ] Commits use Conventional Commits format
- [ ] No hardcoded secrets, TODOs, or debug code in commits
- [ ] No console.log or print statements (except error logging)
- [ ] Type-checked (TypeScript for frontend, type hints for Python backend)
- [ ] Linted (eslint, ruff)
- [ ] Formatted (prettier, black)

### Testing
- [ ] Unit tests added (if applicable)
- [ ] Integration tests added (if applicable)
- [ ] E2E test added (for user-facing features)
- [ ] All tests pass locally
- [ ] >80% code coverage for new code (frontend)
- [ ] >70% code coverage for new code (backend)

### Documentation
- [ ] Docstrings/comments for public functions
- [ ] README updated (if needed)
- [ ] Architecture docs updated (if affecting design)
- [ ] API contract updated (if new endpoints)
- [ ] WebSocket events documented (if broadcasting new events)
- [ ] Demo script updated (if affecting demo flow)

### Build & Deployment
- [ ] Builds without warnings
- [ ] No type errors (`tsc --noEmit`, `mypy`)
- [ ] Docker image builds successfully
- [ ] Environment variables documented in `.env.example`
- [ ] Database migrations idempotent and reversible
- [ ] Backward compatible with previous API version (no breaking changes)

### Security
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities (input sanitized)
- [ ] No exposed secrets in code or logs
- [ ] CORS correctly configured
- [ ] RBAC enforced on all endpoints

---

## Quality Firewall (Export Blocking)

Export is blocked if any of these conditions are true:

### Required Conditions (Block Export)
- ❌ **Segments Missing Text**: Segment.text is empty or null
- ❌ **Segments Missing Speaker**: Segment.speaker is empty or null
- ❌ **Critical Markers Unresolved**: Any Marker with severity="critical" and status="open"
- ❌ **Critical Comments Present**: Any Comment with severity="critical" and resolved=false
- ❌ **Checklist Not Passed**: Any ChecklistItem with required=true and completed=false
- ❌ **Task Not Accepted**: Task.status != "accepted" (from VerificationResult)
- ❌ **Version Conflicts**: Any Segment with version conflicts (segment_conflict event raised)

### Warning Conditions (Warn, Allow Export)
- ⚠️ **Low Confidence Segments**: >5% of segments with confidence < 0.7
- ⚠️ **High ASR Error Rate**: >10% of segments with ASR error flag
- ⚠️ **Unresolved Markers**: Open markers with severity="warning" or "error"
- ⚠️ **Unresolved Comments**: Unresolved comments present

### Quality Gate Response

**Block (422 Unprocessable Entity):**
```json
{
  "error": {
    "code": "QUALITY_GATE_FAILED",
    "message": "Export blocked by quality gate",
    "details": {
      "blockers": [
        "12 segments missing text",
        "5 critical markers unresolved",
        "Task status is 'review' (must be 'accepted')",
        "Checklist item 'Final QA approval' not completed"
      ]
    }
  }
}
```

**Warn (200 OK but warn user):**
```json
{
  "data": {
    "canExport": true,
    "warnings": [
      "8% of segments have low confidence (<0.7)",
      "3 info markers unresolved"
    ],
    "export": { /* ExportFile object */ }
  }
}
```

---

## Task Workflow (Role-Based)

### Role Permissions

| Action | admin | supervisor | annotator | verifier | ml_engineer | customer |
|--------|-------|-----------|-----------|----------|-------------|----------|
| Create project | ✓ | ✓ | | | | |
| Import media | ✓ | ✓ | | | | |
| Create task | ✓ | ✓ | | | | |
| Assign task | ✓ | ✓ | | | | |
| View assigned task | ✓ | ✓ | ✓ (own) | ✓ (to verify) | ✓ | ✓ (if customer) |
| Edit segments | ✓ | ✓ | ✓ (own) | | | |
| Add markers | ✓ | ✓ | ✓ (own) | ✓ | ✓ | |
| Add comments | ✓ | ✓ | ✓ | ✓ | | |
| Submit for review | ✓ | ✓ | ✓ (own) | | | |
| Verify/approve | ✓ | ✓ | | ✓ | | |
| Run quality checks | ✓ | ✓ | | | ✓ | |
| Export | ✓ | ✓ | | | | ✓ (if customer_id matches) |
| Override quality gate | ✓ | ✓ | | | | |

### Task Lifecycle

```
1. NEW (created by supervisor/admin)
   ├─ Supervisor assigns to annotator
   └─ Status → ASSIGNED

2. ASSIGNED (waiting for annotator to start)
   ├─ Annotator starts editing
   └─ Status → IN_PROGRESS

3. IN_PROGRESS (annotator editing segments)
   ├─ Annotator submits when done
   └─ Status → REVIEW

4. REVIEW (waiting for verifier)
   ├─ Verifier accepts
   │  └─ Status → ACCEPTED
   └─ Verifier rejects
      └─ Status → REWORK

5. REWORK (annotator re-edits after rejection)
   ├─ Annotator fixes and resubmits
   └─ Status → REVIEW (loop back)

6. FIXED (verifier re-reviewed after rework)
   ├─ Verifier accepts final version
   └─ Status → ACCEPTED

7. ACCEPTED (ready for export)
   ├─ Run quality checks
   ├─ If pass → Status → EXPORTED
   └─ If fail → show export blockers

8. EXPORTED (final state, immutable)
   └─ Download ExportFile
```

---

## E2E Test Coverage

### Scenarios

| Scenario | Actors | Steps | Browser |
|----------|--------|-------|---------|
| Admin creates project | admin | 1. Login 2. Create project | Chrome |
| Supervisor imports media | supervisor | 1. Login 2. Navigate project 3. Upload audio | Firefox |
| Annotator edits segments | supervisor, annotator | 1. Supervisor creates task 2. Assigns to annotator 3. Annotator edits | Chrome + Firefox |
| Annotator adds marker | annotator | 1. Open segment 2. Click "Add marker" 3. Select type/severity | WebKit |
| Annotator comments | annotator | 1. Open segment 2. Add comment 3. Submit | Chrome |
| Annotator submits | annotator | 1. Edit all segments 2. Submit task for review | Chrome |
| Verifier reviews | verifier | 1. Login 2. View tasks to verify 3. Accept/reject | Chrome |
| Verifier rejects (rework) | annotator, verifier | 1. Verifier rejects 2. Annotator re-edits 3. Verifier re-accepts | Chrome + Firefox |
| Quality gate blocks export | supervisor | 1. Task with low confidence 2. Try export 3. See blocker | Chrome |
| Quality gate allows export | supervisor | 1. Task complete/verified 2. Export 3. Download file | Chrome |
| Real-time segment update | annotator, verifier | 1. Annotator edits segment 2. Verifier sees update in real-time | Chrome + Firefox |
| Conflict resolution | annotator, annotator | 1. Two annotators open same segment 2. Both edit simultaneously 3. Show conflict | Chrome x2 (two browser contexts) |
| Focus lock (soft) | annotator, annotator | 1. Annotator 1 clicks segment 2. Annotator 2 sees "User X viewing" | Chrome + Firefox |
| Boundaries lock (hard) | annotator, annotator | 1. Annotator 1 drags start marker 2. Annotator 2 tries to drag (blocked) | Chrome + Firefox |
| Play segment | annotator | 1. Click play button 2. Waveform highlights 3. Audio plays 4. Stops at end | Chrome |
| Playback speed | annotator | 1. Set speed to 0.5x, 1x, 1.5x, 2x 2. Verify audio speed | Chrome |
| Space pause/resume | annotator | 1. Play segment 2. Press space (pause) 3. Press space (resume) | Chrome |
| Offline & reconnect | annotator | 1. Edit segment 2. Disable network 3. Show "offline" 4. Enable network 5. Auto-reconnect | Chrome |
| Login all roles | all | 1. Login admin 2. Login supervisor ... | Chrome |
| Cross-browser UI (Chrome, Edge, Firefox, Safari) | annotator | Same action on each browser | Chrome, Edge, Firefox, WebKit |

### E2E Test Code Example

```typescript
test('Annotator edits segment and sees real-time update in verifier view', async ({ browser }) => {
  // Setup
  const annotator = await browser.newContext();
  const verifier = await browser.newContext();
  
  // Annotator login
  await annotator.goto('http://localhost:5173/login');
  await annotator.fill('[name="email"]', 'annotator@purrscription.dev');
  await annotator.fill('[name="password"]', 'demo123');
  await annotator.click('button:has-text("Login")');
  await annotator.waitForURL('**/dashboard');
  
  // Verifier login (different browser context)
  await verifier.goto('http://localhost:5173/login');
  await verifier.fill('[name="email"]', 'verifier@purrscription.dev');
  await verifier.fill('[name="password"]', 'demo123');
  await verifier.click('button:has-text("Login")');
  await verifier.waitForURL('**/dashboard');
  
  // Both open same task
  const taskId = 'demo-task-id';
  await annotator.goto(`http://localhost:5173/tasks/${taskId}`);
  await verifier.goto(`http://localhost:5173/tasks/${taskId}`);
  
  // Annotator edits first segment
  await annotator.click('.segment >> nth=0');
  await annotator.fill('[name="text"]', 'Updated segment text');
  await annotator.click('button:has-text("Save")');
  
  // Verifier should see real-time update (via WebSocket)
  const verifierSegmentText = verifier.locator('.segment-text >> nth=0');
  await expect(verifierSegmentText).toContainText('Updated segment text', { timeout: 5000 });
});
```

---

## Performance Targets

- **Page Load**: <3s (Time to Interactive)
- **Segment Update**: <100ms (REST response)
- **WebSocket Event Delivery**: <50ms (message broadcast to client)
- **Waveform Render**: <500ms (for 1-hour audio)
- **Playback Latency**: <100ms (click play → audio starts)
- **Export Generation**: <10s (for 1-hour audio)

---

## Accessibility

- ✓ WCAG 2.1 AA compliance
- ✓ Keyboard navigation (Tab, Enter, Arrow keys)
- ✓ Screen reader compatible (semantic HTML)
- ✓ Focus visible on all interactive elements
- ✓ Color contrast >4.5:1 on text
- ✓ Form labels associated with inputs

---

## Demo Flow Verification

### Demo Script Checklist

- [ ] No hardcoded demo credentials in code (use .env)
- [ ] Demo data seed runs cleanly (idempotent)
- [ ] All demo accounts login successfully
- [ ] Demo project visible in UI
- [ ] Demo audio plays without errors
- [ ] All 12 demo segments load
- [ ] Markers visible (pre-created)
- [ ] Workflow: edit → submit → verify → export works
- [ ] Export download succeeds
- [ ] Quality Firewall catches demo blockers

---

## Security Checklist

- [ ] No SQL injection (parameterized queries)
- [ ] No XSS (input sanitized, output encoded)
- [ ] No secrets in code/logs (use .env)
- [ ] CORS headers correct
- [ ] HTTPS enforced (production)
- [ ] Rate limiting configured
- [ ] RBAC enforced on all endpoints
- [ ] Audit logs created for all mutations
- [ ] Password hashing (bcrypt, not plaintext)
- [ ] JWT signature verified
- [ ] CSRF tokens (if applicable)

---

## Release Checklist

- [ ] All tests passing (unit, integration, E2E)
- [ ] Code reviewed & approved
- [ ] Changelog updated
- [ ] Version bumped (semantic versioning)
- [ ] Migrations tested (up & down)
- [ ] Deployment docs updated
- [ ] Rollback plan documented
- [ ] Performance tested (load test)
- [ ] Security audit passed
- [ ] Dependencies updated (no vulnerabilities)
