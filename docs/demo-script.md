# Demo Script

## Prerequisites

- Docker Compose running: `docker-compose up -d`
- Services healthy (5173 web, 8000 api, 5432 postgres, 6379 redis)
- Database seeded with demo accounts
- Demo audio file uploaded
- Demo Gecko JSON imported

## Demo Accounts

All passwords: `demo123`

| Role | Email |
|------|-------|
| admin | admin@purrscription.dev |
| supervisor | supervisor@purrscription.dev |
| annotator | annotator@purrscription.dev |
| verifier | verifier@purrscription.dev |
| ml_engineer | ml_engineer@purrscription.dev |
| customer | customer@purrscription.dev |

---

## Act 1: Setup & Import (Supervisor)

**Duration**: 5 minutes

### 1.1 Login as Supervisor
1. Open http://localhost:5173
2. Click "Login"
3. Email: `supervisor@purrscription.dev`
4. Password: `demo123`
5. ✓ Redirected to dashboard

### 1.2 Create Project
1. Click "New Project"
2. Name: "Q1 2024 - Customer Interviews"
3. Description: "Transcription project for customer research"
4. Click "Create"
5. ✓ Project created and visible in list

### 1.3 Upload Audio
1. Inside project, click "Upload Media"
2. Select `demo/audio/interview-001.wav` (3 min, mono, 16kHz)
3. Click "Upload"
4. ✓ Audio visible in media list (duration: 180.0s)

### 1.4 Import Gecko JSON
1. Click "Import Annotations"
2. Select `demo/gecko-json/demo-interview-001.json`
3. Click "Import"
4. ✓ 12 segments created from JSON
5. ✓ 3 markers pre-populated (low-confidence, crosstalk, overlap)

**Observations**:
- Segments have empty text (to be filled by annotator)
- Confidence scores vary (0.45-0.92)
- Speaker types: TATLIN, VEGMAN, [CROSSTALK], [OVERLAP], [SILENCE]
- Markers show quality issues in sidebar

---

## Act 2: Pre-annotation & AI Review (ML Engineer)

**Duration**: 3 minutes

### 2.1 ML Engineer Reviews Quality
1. Open new tab, login as `ml_engineer@purrscription.dev`
2. Go to project
3. View "Quality Metrics" dashboard
4. See: 
   - Low confidence segments (0.45, 0.52 from crosstalk)
   - Segment count: 12
   - Marker count: 3
5. ✓ Can see but cannot edit

### 2.2 Create Task & Assign
1. Switch to supervisor tab
2. Click "Create Task" in project
3. Name: "Interview 001 - Transcription"
4. Select media: "interview-001.wav"
5. Assign to: "annotator@purrscription.dev"
6. Click "Create"
7. ✓ Task status: "assigned"

**Observation**: Task automatically triggers ASR (happens in background, watch status bar)

---

## Act 3: Annotation & Collaboration (Two Annotators)

**Duration**: 10 minutes

### 3.1 Annotator 1 Opens Task
1. Open new tab, login as `annotator@purrscription.dev`
2. Click "Tasks" in sidebar
3. Click task "Interview 001 - Transcription"
4. See waveform + 12 segments
5. Status changes to "in_progress" automatically
6. ✓ Presence indicator shows "You are here"

### 3.2 Annotator 1 Edits First Segment
1. Click on first segment (seg-001, 0.5s - 5.2s, TATLIN)
2. Waveform highlights this region
3. Click "Play" button → audio plays from start to end of segment
4. Text field shows empty
5. Type: "Hello, thank you for joining today's interview."
6. Speaker dropdown: Already set to "TATLIN"
7. Click "Save"
8. ✓ Segment updated, toast: "Segment saved"
9. ✓ Version incremented to 1 (shown in segment header)

### 3.3 Real-time Presence & Focus
1. Open verifier in new tab, login as `verifier@purrscription.dev`
2. Verifier navigates to same task
3. Both annotator and verifier see presence panel: "Annotator (editing)" and "Verifier (viewing)"
4. Verifier hovers over first segment
5. ✓ See "Annotator focused on this segment" tooltip
6. Verifier clicks segment-2 → focus lock changes to seg-002

### 3.4 Multi-user Conflict Scenario (OPTIONAL - Advanced)
1. **Annotator 1** edits seg-003 text, clicks Save (version=1)
2. **Annotator 2** (open in another browser context) also has seg-003 open (fetched version=1)
3. **Annotator 2** edits text and clicks Save before reloading
4. **System**: Detects version mismatch (expected=2, received=1)
5. ✓ WebSocket broadcasts `segment_conflict` event
6. **Annotator 2** sees conflict dialog:
   - "This segment was edited by Annotator 1"
   - Buttons: [Reload] [Merge] [Discard]
7. Click [Reload]
8. ✓ Segment reloads with latest version and Annotator 1's text

**Skip if time-limited**: This requires two annotators, can demo with notes.

### 3.5 Add Marker (Quality Issue)
1. Annotator clicks on seg-004 (crosstalk segment, confidence=0.45)
2. See existing marker: "Crosstalk detected" (severity=critical)
3. Click marker → shows resolution field (currently empty)
4. Annotator adds comment: "Manually listened and confirmed crosstalk between two speakers at 18.8s"
5. Click "Resolve"
6. ✓ Marker status: "resolved"
7. ✓ Resolved timestamp shown
8. ✓ Other users see update in real-time

### 3.6 Add Comment
1. Annotator clicks on seg-005
2. Click "Add Comment"
3. Type: "This segment sounds like background noise, verify if speaker"
4. Click "Post"
5. ✓ Comment appears below segment
6. ✓ Verifier sees comment in real-time

### 3.7 Complete Remaining Segments
1. Quickly fill remaining segments with sample text (or skip for demo)
2. Mark status complete (optional)

---

## Act 4: Playback & Waveform Features

**Duration**: 3 minutes

### 4.1 Play Segment
1. Click segment and click "Play"
2. Audio plays from start to end
3. Waveform shows playhead moving
4. ✓ Audio stops automatically at end
5. Click "Play" again
6. ✓ Restarts from beginning

### 4.2 Pause/Resume with Space
1. Click "Play"
2. Audio playing...
3. Press Space key
4. ✓ Audio pauses
5. Press Space again
6. ✓ Audio resumes

### 4.3 Playback Speed
1. See speed dropdown (default 1x)
2. Change to 0.5x
3. Click "Play"
4. ✓ Audio plays slower
5. Change to 1.5x
6. ✓ Audio plays faster
7. Try 2x
8. ✓ 2x speed works

### 4.4 Boundaries Lock (Drag Waveform)
1. Annotator 1 hovers over segment start marker
2. Click and drag start boundary left
3. ✓ Hard lock acquired (expires in 2 min)
4. ✓ Verifier tries to drag same segment → "Locked by Annotator 1" tooltip
5. Annotator 1 finishes dragging, clicks "Save"
6. ✓ Lock released automatically

---

## Act 5: Workflow - Submit & Verify

**Duration**: 5 minutes

### 5.1 Annotator Submits for Review
1. Annotator clicks "Submit for Review"
2. Pre-submission quality check:
   - ✓ 12/12 segments have text
   - ✓ All speakers assigned
   - ⚠️ 3 markers: 1 critical (crosstalk)
3. Dialog: "Review Quality Issues"
   - 1 critical marker unresolved
   - Confirm submit anyway?
4. Click "Submit"
5. ✓ Task status changes to "review"

### 5.2 Verifier Reviews
1. Verifier clicks task (shows status "review")
2. Verifier opens task
3. Reviews all segments
4. See comments & resolved markers
5. Checks: All text present? Speakers correct? Quality acceptable?

### 5.3 Verifier Accepts
1. Verifier clicks "Accept & Approve"
2. Modal: Add optional comment: "All segments verified, ready for export"
3. Click "Approve"
4. ✓ Task status → "accepted"
5. ✓ AuditLog created: "Verifier user-456 accepted task on 2024-01-15 10:45"

**Alternative: Reject for Rework**
1. If verifier rejects:
   - Task status → "rework"
   - Reason visible to annotator
   - Annotator can re-edit
   - Re-submit to verifier

---

## Act 6: Quality Firewall & Export

**Duration**: 5 minutes

### 6.1 Quality Firewall Check
1. Supervisor navigates to task
2. Clicks "Prepare Export"
3. System runs quality checks:
   - ✓ All segments have text
   - ✓ All segments have speaker
   - ✓ All critical markers resolved ✓ Task status = "accepted"
   - ✓ Checklist passed (optional)
4. Result: "All checks passed, ready to export"
5. Show warnings (if any low-confidence segments)

### 6.2 Export Options
1. Click "Export"
2. Format dropdown: "VTT" (default)
3. Options: JSON, SRT, TXT, VTT
4. Select VTT
5. Click "Generate Export"

### 6.3 Export Download
1. Export completes (3-5 seconds for 3-min audio)
2. ✓ ExportFile created with checksum
3. ✓ Download button shows: "Interview-001.vtt (125 KB)"
4. Click download
5. ✓ File downloads locally
6. ✓ Open file → shows VTT format:
   ```
   00:00:00,500 --> 00:00:05,200
   [TATLIN]
   Hello, thank you for joining today's interview.

   00:00:05,500 --> 00:00:12,800
   [VEGMAN]
   ...
   ```
7. ✓ Task status → "exported"

### 6.4 Customer Download (Optional)
1. Login as `customer@purrscription.dev`
2. See project and task (read-only)
3. Click task
4. See "Download Export" button
5. ✓ Download previous export

---

## Act 7: Cross-Browser Verification (Optional)

**Duration**: 5 minutes (if time permits)

### 7.1 Chrome
- ✓ All features work
- ✓ Waveform renders smoothly
- ✓ WebSocket events real-time

### 7.2 Firefox
1. Open same task in Firefox
2. ✓ UI matches Chrome
3. ✓ Playback works
4. ✓ Real-time updates from other browser

### 7.3 Safari/WebKit (if available)
- ✓ Waveform renders
- ✓ Audio plays
- ✓ Segments editable

---

## Demo Talking Points

### Architecture
- Monorepo (web, api, contracts, infra)
- React frontend + FastAPI backend
- PostgreSQL + Redis + WebSocket
- Optimistic concurrency (version field)
- Quality Firewall gates export

### Real-time Features
- Presence (who's online, inactive)
- Focus lock (soft - informational)
- Boundaries lock (hard - mutual exclusion)
- Conflict detection (version mismatch)
- Auto-reconnect with state snapshot

### Workflow
- Role-based: annotator → verifier → export
- Quality checks before export
- Audit trail (who edited what, when)
- Markers & comments for collaboration

### Quality
- E2E tests cover all scenarios
- Cross-browser tested (Chrome, Firefox, Safari, Edge)
- Accessibility (WCAG 2.1 AA)
- Performance (<3s page load, <100ms segment update)

---

## Troubleshooting

### Audio Won't Play
- Check browser speaker volume
- Verify CORS headers (should be `*` in dev)
- Check network tab (no 404 on audio file)

### Real-time Updates Not Showing
- Check WebSocket connection (DevTools → Network → WS)
- Verify JWT token is valid (refresh if needed)
- Check browser console for errors

### Export Blocked
- Check Quality Firewall blockers in error response
- Resolve critical markers first
- Ensure task status is "accepted"
- Fill all segment text

### Slow Waveform Rendering
- Reduce audio length for demo (use shorter file)
- Check browser performance (DevTools → Performance)
- Close other tabs

---

## Notes

- Demo audio file: 3 minutes, mono, 16kHz (for quick testing)
- Demo Gecko JSON: 12 segments with realistic markers
- All demo accounts have password: `demo123`
- Demo data is idempotent (can re-seed safely)
- No production data in demo flow
- All markers & comments are pre-created for demo
