# FUL-276: Follow-up Workflow Tests and Evidence

## Scope

- Validate follow-up states/reminder behavior for sales leads
- Add integration tests for lead-to-consultation path
- Provide acceptance evidence for QA handoff

## Added Integration Tests

File: `backend-nexus/tests/test_sales_followup_workflow.py`

### Follow-up workflow coverage

1. `test_follow_up_owner_can_update_and_read_back_state`

- Creates lead through public endpoint
- Claims lead as sales owner
- Updates follow-up fields (`next_action`, `next_action_due_at`)
- Verifies persisted values via `GET /api/leads/{lead_id}`

2. `test_follow_up_non_owner_is_forbidden`

- Owner claims lead
- Second sales user attempts follow-up update
- Verifies `403` access control

### Lead-to-consultation path coverage

3. `test_lead_to_consultation_happy_path`

- Creates lead
- Claims as sales owner
- Transitions lead: `NEW -> QUALIFIED -> CONTACTED -> CONSULTATION_SCHEDULED`
- Creates consultation via `POST /api/leads/{lead_id}/consultations`
- Verifies consultation is created with `status=SCHEDULED`

4. `test_consultation_creation_non_owner_forbidden`

- Owner claims lead
- Non-owner attempts consultation creation
- Verifies `403` access control

## API Endpoints Exercised

- `POST /api/leads`
- `POST /api/leads/{lead_id}/owner?action=claim`
- `PATCH /api/leads/{lead_id}/follow-up`
- `GET /api/leads/{lead_id}`
- `POST /api/leads/{lead_id}/transition`
- `POST /api/leads/{lead_id}/consultations`

## Validation Notes

- Local venv command failed due missing dependency (`python-multipart`) in host Python env.
  - `.venv/bin/python -m pytest -q backend-nexus/tests/test_sales_followup_workflow.py`
- Verified successfully in Dockerized backend test environment:
  - `docker compose run --rm api pytest -q tests/test_sales_followup_workflow.py`
  - Result: `4 passed` (warnings present, no test failures)

## UI/Acceptance Evidence Checklist

Attach the following screenshots to Linear ticket:

1. Sales lead detail page with follow-up context visible
2. Follow-up update success state (owner flow)
3. Non-owner forbidden scenario (API response / UI error state)
4. Lead transitioned to `CONSULTATION_SCHEDULED`
5. Consultation creation success response (`status=SCHEDULED`)
