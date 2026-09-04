from datetime import datetime, timedelta, timezone

import pytest

from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.order import OrderStatus
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.user_tenant_plan import UserTenantPlan
from app.services.reconciliation_service import reconcile_payments, reconcile_stale_payments

from tests.integration_prd10.fixtures import create_order_in_db, register_client_via_api


@pytest.mark.prd10
def test_reconciliation_recovers_missed_webhook(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon1@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    order = create_order_in_db(
        db_session,
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        total_amount=10.0,
        status=OrderStatus.PENDING,
    )

    payment = Payment(
        payment_type=PaymentType.ORDER,
        price=10.0,
        tenant_id=tenant_a.id,
        reference_id=order.id,
        reference_type="order",
        idempotency_key="key-recon-succ",
        status=PaymentStatus.INITIATED,
        stripe_payment_intent_id="pi_recon_success",
    )
    db_session.add(payment)
    db_session.flush()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    db_session.commit()

    def fake_retrieve(intent_id, **kwargs):
        return {"id": intent_id, "status": "succeeded"}

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve", fake_retrieve
    )

    result = reconcile_stale_payments(db_session)
    assert result["processed"] >= 1
    assert result["recovered"] >= 1

    db_session.refresh(payment)
    db_session.refresh(order)
    assert payment.status.value == "CAPTURED"
    assert "recovered captured payment" in (payment.audit_notes or "").lower()
    assert order.status.value == "PAID"


@pytest.mark.prd10
def test_reconciliation_fails_transiently_reaches_threshold(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon2@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    order = create_order_in_db(
        db_session,
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        total_amount=10.0,
        status=OrderStatus.PENDING,
    )

    payment = Payment(
        payment_type=PaymentType.ORDER,
        price=10.0,
        tenant_id=tenant_a.id,
        reference_id=order.id,
        reference_type="order",
        idempotency_key="key-recon-fail",
        status=PaymentStatus.INITIATED,
        stripe_payment_intent_id="pi_recon_fail",
        retry_count=4,
    )
    db_session.add(payment)
    db_session.flush()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    db_session.commit()

    def fake_retrieve(intent_id, **kwargs):
        return {"id": intent_id, "status": "succeeded"}

    def fake_mark_payment(*args, **kwargs):
        raise Exception("Database timeout")

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve", fake_retrieve
    )
    monkeypatch.setattr(
        "app.services.reconciliation_service._mark_payment_as_captured", fake_mark_payment
    )

    result = reconcile_stale_payments(db_session)
    assert result["failures"] == 1
    assert result["manual_intervention"] == 1

    db_session.refresh(payment)
    db_session.refresh(order)
    assert payment.retry_count == 5
    assert payment.status.value == "REQUIRES_MANUAL_INTERVENTION"
    assert "timeout" in (payment.last_error or "").lower()
    assert "manual intervention" in (payment.audit_notes or "").lower()


@pytest.mark.prd10
def test_reconciliation_retry_succeeds_after_transient_failure(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon3@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    order = create_order_in_db(
        db_session,
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        total_amount=10.0,
        status=OrderStatus.PENDING,
    )
    payment = Payment(
        payment_type=PaymentType.ORDER,
        price=10.0,
        tenant_id=tenant_a.id,
        reference_id=order.id,
        reference_type="order",
        idempotency_key="key-recon-retry",
        status=PaymentStatus.INITIATED,
        stripe_payment_intent_id="pi_recon_retry",
    )
    db_session.add(payment)
    db_session.flush()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    db_session.commit()

    def fake_retrieve(intent_id, **kwargs):
        return {"id": intent_id, "status": "succeeded"}

    original_mark = __import__(
        "app.services.reconciliation_service", fromlist=["_mark_payment_as_captured"]
    )._mark_payment_as_captured
    call_count = {"value": 0}

    def flaky_mark(*args, **kwargs):
        call_count["value"] += 1
        if call_count["value"] == 1:
            raise Exception("Temporary activation failure")
        return original_mark(*args, **kwargs)

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve", fake_retrieve
    )
    monkeypatch.setattr("app.services.reconciliation_service._mark_payment_as_captured", flaky_mark)

    first = reconcile_payments(db_session)
    db_session.refresh(payment)
    assert first["failures"] == 1
    assert payment.status.value == "INITIATED"
    assert payment.retry_count == 1

    second = reconcile_payments(db_session)
    db_session.refresh(payment)
    db_session.refresh(order)
    assert second["recovered"] == 1
    assert payment.status.value == "CAPTURED"
    assert order.status.value == "PAID"


@pytest.mark.prd10
def test_reconciliation_recovers_captured_payment_missing_activation(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon4@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    order = create_order_in_db(
        db_session,
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        total_amount=10.0,
        status=OrderStatus.PENDING,
    )
    payment = Payment(
        payment_type=PaymentType.ORDER,
        price=10.0,
        tenant_id=tenant_a.id,
        reference_id=order.id,
        reference_type="order",
        idempotency_key="key-recon-captured",
        status=PaymentStatus.CAPTURED,
        stripe_payment_intent_id="pi_recon_captured",
    )
    db_session.add(payment)
    db_session.commit()

    def fake_retrieve(intent_id, **kwargs):
        return {"id": intent_id, "status": "succeeded"}

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve", fake_retrieve
    )

    result = reconcile_payments(db_session)
    assert result["recovered"] == 1

    db_session.refresh(payment)
    db_session.refresh(order)
    assert payment.status.value == "CAPTURED"
    assert order.status.value == "PAID"
    assert "re-applied post-payment activation" in (payment.audit_notes or "").lower()


@pytest.mark.prd10
def test_reconciliation_marks_stale_pending_payment_for_manual_intervention(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon5@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    order = create_order_in_db(
        db_session,
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        total_amount=10.0,
        status=OrderStatus.PENDING,
    )
    payment = Payment(
        payment_type=PaymentType.ORDER,
        price=10.0,
        tenant_id=tenant_a.id,
        reference_id=order.id,
        reference_type="order",
        idempotency_key="key-recon-stale",
        status=PaymentStatus.INITIATED,
        stripe_payment_intent_id="pi_recon_stale",
    )
    db_session.add(payment)
    db_session.flush()
    payment.created_at = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.commit()

    def fake_retrieve(intent_id, **kwargs):
        return {"id": intent_id, "status": "processing"}

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve", fake_retrieve
    )

    result = reconcile_payments(db_session)
    assert result["manual_intervention"] == 1

    db_session.refresh(payment)
    db_session.refresh(order)
    assert payment.status.value == "REQUIRES_MANUAL_INTERVENTION"
    assert "pending too long" in (payment.last_error or "").lower()
    assert order.status.value == "PENDING"


@pytest.mark.prd10
def test_reconciliation_conflict_escalates_captured_payment(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon6@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    order = create_order_in_db(
        db_session,
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        total_amount=10.0,
        status=OrderStatus.PAID,
    )
    payment = Payment(
        payment_type=PaymentType.ORDER,
        price=10.0,
        tenant_id=tenant_a.id,
        reference_id=order.id,
        reference_type="order",
        idempotency_key="key-recon-conflict",
        status=PaymentStatus.CAPTURED,
        stripe_payment_intent_id="pi_recon_conflict",
    )
    db_session.add(payment)
    db_session.commit()

    def fake_retrieve(intent_id, **kwargs):
        return {"id": intent_id, "status": "canceled"}

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve", fake_retrieve
    )
    monkeypatch.setattr(
        "app.services.reconciliation_service._activation_complete",
        lambda db, payment: False,
    )

    result = reconcile_payments(db_session)
    assert result["conflicts"] == 1
    assert result["manual_intervention"] == 1

    db_session.refresh(payment)
    assert payment.status.value == "REQUIRES_MANUAL_INTERVENTION"
    assert "conflict detected" in (payment.last_error or "").lower()


@pytest.mark.prd10
def test_reconciliation_failed_enrollment_payment_cancels_enrollment(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon8@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    user_plan = UserTenantPlan(
        tenant_id=tenant_a.id,
        name="Ful32 failed payment plan",
        description="failed payment plan",
        price=12.0,
        duration=30,
        max_appointments=1,
        max_consultations=1,
        is_active=True,
    )
    db_session.add(user_plan)
    db_session.flush()

    enrollment = Enrollment(
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        user_tenant_plan_id=user_plan.id,
        created_by=reg["user_id"],
        status=EnrollmentStatus.PENDING,
    )
    db_session.add(enrollment)
    db_session.flush()

    payment = Payment(
        payment_type=PaymentType.ENROLLMENT,
        price=12.0,
        tenant_id=tenant_a.id,
        reference_id=enrollment.id,
        reference_type="enrollment",
        idempotency_key="key-recon-enrollment-failed",
        status=PaymentStatus.INITIATED,
        stripe_payment_intent_id="pi_recon_enrollment_failed",
    )
    db_session.add(payment)
    db_session.flush()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    db_session.commit()

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve",
        lambda intent_id, **kwargs: {"id": intent_id, "status": "requires_payment_method"},
    )

    result = reconcile_payments(db_session)
    assert result["processed"] >= 1

    db_session.refresh(payment)
    db_session.refresh(enrollment)
    assert payment.status.value == "FAILED"
    assert enrollment.status.value == "CANCELLED"
    assert enrollment.cancelled_at is not None


@pytest.mark.prd10
def test_activation_failure_after_webhook_success_is_recovered_by_reconciliation(
    prd10_client, db_session, tenant_a, role_patient, monkeypatch
):
    reg = register_client_via_api(
        prd10_client,
        tenant_a.id,
        email="recon7@prd10.foo.com",
        password="P!",
        db_session=db_session,
        role=role_patient,
    )
    user_plan = UserTenantPlan(
        tenant_id=tenant_a.id,
        name="Ful32 retry plan",
        description="retry plan",
        price=12.0,
        duration=30,
        max_appointments=1,
        max_consultations=1,
        is_active=True,
    )
    db_session.add(user_plan)
    db_session.flush()

    enrollment = Enrollment(
        tenant_id=tenant_a.id,
        patient_user_id=reg["user_id"],
        user_tenant_plan_id=user_plan.id,
        created_by=reg["user_id"],
        status=EnrollmentStatus.PENDING,
    )
    db_session.add(enrollment)
    db_session.flush()

    payment = Payment(
        payment_type=PaymentType.ENROLLMENT,
        price=12.0,
        tenant_id=tenant_a.id,
        reference_id=enrollment.id,
        reference_type="enrollment",
        idempotency_key="key-recon-enrollment",
        status=PaymentStatus.INITIATED,
        stripe_payment_intent_id="pi_recon_enrollment",
    )
    db_session.add(payment)
    db_session.commit()

    original_activation = __import__(
        "app.services.payment_service",
        fromlist=["_apply_post_payment_activation"],
    )._apply_post_payment_activation

    def broken_activation(db, payment_obj):
        raise RuntimeError("activation exploded")

    monkeypatch.setattr(
        "app.services.payment_service._apply_post_payment_activation", broken_activation
    )

    event = {
        "id": "evt_recon_activation",
        "type": "payment_intent.succeeded",
        "data": {"object": {"id": "pi_recon_enrollment"}},
    }
    with pytest.raises(RuntimeError):
        prd10_client.post(
            "/api/checkout/webhook/stripe",
            json=event,
            headers={"Stripe-Signature": "t=stripe,v1=fake"},
        )

    db_session.refresh(payment)
    db_session.refresh(enrollment)
    assert payment.status.value == "INITIATED"
    assert enrollment.status.value == "PENDING"

    monkeypatch.setattr(
        "app.services.reconciliation_service.stripe.PaymentIntent.retrieve",
        lambda intent_id, **kwargs: {"id": intent_id, "status": "succeeded"},
    )
    monkeypatch.setattr(
        "app.services.payment_service._apply_post_payment_activation",
        original_activation,
    )
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    db_session.commit()

    result = reconcile_payments(db_session)
    assert result["recovered"] == 1

    db_session.refresh(payment)
    db_session.refresh(enrollment)
    assert payment.status.value == "CAPTURED"
    assert enrollment.status.value == "ACTIVE"
