import logging
from app.db import SessionLocal
from app.services.reconciliation_service import reconcile_payments

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    logger.info("Starting payment reconciliation job...")
    db = SessionLocal()
    try:
        result = reconcile_payments(db)
        logger.info(
            "Reconciliation sweep complete. "
            "processed=%s recovered=%s manual_intervention=%s ignored_pending=%s conflicts=%s failures=%s",
            result["processed"],
            result["recovered"],
            result["manual_intervention"],
            result["ignored_pending"],
            result["conflicts"],
            result["failures"],
        )
    except Exception:
        logger.exception("Error running reconciliation job")
    finally:
        db.close()


if __name__ == "__main__":
    main()
