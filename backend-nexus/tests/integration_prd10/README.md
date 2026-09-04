# PRD-10 Integration Tests - Acceptance Evidence Bundle

## Purpose

Integration acceptance evidence for PRD-10 (Checkout Initiation, Idempotency, Stripe Webhooks, and Payment Reconciliation).

This suite validates:

- Checkout initiation for orders, enrollments, and tenant subscriptions
- Idempotent replay behavior and different-key divergence
- Auth and validation failures
- Secure Stripe webhook rejection paths
- Webhook state transitions, deduplication, out-of-order handling, and dispute handling
- Reconciliation recovery for missed webhooks and partial activation failures

The tests run against the live API container and serve as slice acceptance evidence for FUL-32 Slice 2.

---

## Executed Command

```bash
docker exec health_api pytest -q tests/integration_prd10 -v
```

Execution date: 2026-03-10

---

## Result

```text
============================= test session starts ==============================
platform linux -- Python 3.11.15, pytest-9.0.2, pluggy-1.6.0
collected 35 items

tests/integration_prd10/test_checkout_initiate.py ...................... [ 62%]
......                                                                   [ 80%]
tests/integration_prd10/test_payment_reconciliation.py .......           [100%]

======================= 35 passed, 26 warnings in 52.08s =======================
```

All PRD-10 integration tests passed successfully.

---

## Acceptance Coverage

### 1. Checkout Initiation

- Order checkout creates `INITIATED` payment with Stripe intent and client secret
- Enrollment checkout creates `INITIATED` payment bound to the enrollment
- Tenant subscription checkout creates `INITIATED` payment bound to the subscription
- Same `Idempotency-Key` replays the same payment without duplicate rows
- Different `Idempotency-Key` values create distinct payments

### 2. Auth and Validation Guards

- Missing target resources return `404`
- Cross-tenant or wrong-user access returns `403`
- Non-manager tenant subscription checkout returns `403`
- Non-payable entity states return `409`
- Missing or blank `Idempotency-Key` headers are rejected
- Zero or negative payable amounts are rejected

### 3. Secure Webhook Handling

- Missing `Stripe-Signature` header returns `400`
- Malformed webhook payload returns `400`
- Invalid webhook signature returns `400`
- Successful payment webhooks capture payments and activate linked entities
- Failed and canceled events update payment state without activating entities

### 4. Webhook Consistency Controls

- Replayed webhook event IDs are deduplicated using `external_event_id`
- Out-of-order transitions such as `CAPTURED -> FAILED` are ignored
- `charge.dispute.created` moves payments to `DISPUTED`
- Dispute events suspend active enrollments and expire active tenant subscriptions

### 5. Reconciliation Workflow

- Missed webhooks are recovered from Stripe payment intent state
- Transient activation failures retry and recover on later runs
- Retry threshold escalates to `REQUIRES_MANUAL_INTERVENTION`
- Captured payments missing side effects are repaired
- Stale pending payments escalate for manual intervention
- Stripe/internal conflicts escalate for investigation

---

## Evidence Summary

- Secure webhook handling is implemented and now covered on negative security paths.
- Reconciliation workflow is implemented and covered by integration tests.
- End-to-end payment lifecycle coverage now includes signature rejection, deduplication, out-of-order events, and dispute suspension.
- PRD-10 now has an acceptance evidence bundle, not only a runbook.

---

## Notes

- The container run produced 26 warnings, all from existing dependency/schema deprecations outside this slice.
- PRD-10 acceptance validation should rely on this dedicated suite under `tests/integration_prd10`.
