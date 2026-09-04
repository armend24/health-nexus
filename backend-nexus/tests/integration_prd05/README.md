# PRD-05 Integration Tests — Acceptance Evidence Bundle

## Purpose

Tenant-boundary integration test suite for PRD-05 (Client Registration & Tenant-Aware Enrollment).

This suite validates:

- End-to-end registration and enrollment flow
- Enrollment lifecycle state transitions
- Cross-tenant access denial
- Duplicate registration handling
- Strict tenant-boundary enforcement

The tests run against a live API instance (Docker) and serve as Sprint 2 acceptance evidence.

---

## How to Run

1. Start services:

   ```bash
   docker compose up -d
   ```

2. Execute the PRD-05 integration suite:

   ```bash
   docker exec health_api pytest -q tests/integration_prd05 -v
   ```

---

## Covered Scenarios

### 1. Happy Path (End-to-End)

- Register client under Tenant A
- Create enrollment
- Retrieve enrollment
- Perform valid transition (PENDING → ACTIVE)
- Retrieve operational status
- Validate tenant consistency throughout

### 2. Cross-Tenant Access Denial

- GET enrollment from another tenant → denied
- Transition attempt from another tenant → denied
- Status read from another tenant → denied

### 3. Invalid State Transitions

- ACTIVE → PENDING → rejected
- CANCELLED → ACTIVE → rejected
- Unknown/invalid state transition → rejected

### 4. Duplicate Registration Handling

- Duplicate registration in same tenant → handled (409 or defined behavior)
- Same email across different tenants → handled per business rules

---

## Deterministic Multi-Tenant Fixtures

The suite includes isolated fixtures for:

- Tenant A / Tenant B
- Tenant-scoped plans
- Role-scoped users (patient, tenant manager)
- Controlled authentication headers
- Clean database session handling

This ensures reproducible and deterministic multi-tenant scenarios.

---

## Sample Output (Current State)

```
platform linux -- Python 3.11.x
collected 9 items
tests/integration_prd05/... 9 passed in ~10s
```

All PRD-05 integration tests pass successfully.

---

## Notes

- This suite is intentionally isolated under `tests/integration_prd05`.
- Legacy tests outside this folder may fail due to unrelated schema/auth changes.
- PRD-05 acceptance validation should rely on this dedicated integration suite.
