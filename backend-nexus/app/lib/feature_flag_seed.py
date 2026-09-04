"""
Canonical feature-flag seed defaults.

Shared by seed scripts and runtime reset endpoint to guarantee both use the
same plan-tier defaults.
"""

SEED_FEATURE_FLAGS: dict[str, dict[str, bool]] = {
    # Base appointments — available to everyone
    "basic_appointments": {
        "free": True,
        "small clinic": True,
        "medium clinic": True,
        "hospital": True,
    },
    # Reporting & analytics — not on free
    "advanced_reports": {
        "free": False,
        "small clinic": True,
        "medium clinic": True,
        "hospital": True,
    },
    # Custom branding (logo, colours) — not on free
    "custom_branding": {
        "free": False,
        "small clinic": True,
        "medium clinic": True,
        "hospital": True,
    },
    # Priority support — medium and above
    "priority_support": {
        "free": False,
        "small clinic": False,
        "medium clinic": True,
        "hospital": True,
    },
    # Video / telemedicine consultations — medium and above
    "telemedicine": {
        "free": False,
        "small clinic": False,
        "medium clinic": True,
        "hospital": True,
    },
    # Bulk data export — medium and above
    "bulk_export": {
        "free": False,
        "small clinic": False,
        "medium clinic": True,
        "hospital": True,
    },
    # Direct API access for integrations — hospital only
    "api_access": {
        "free": False,
        "small clinic": False,
        "medium clinic": False,
        "hospital": True,
    },
    # AI-powered insights dashboard — hospital only
    "ai_insights": {
        "free": False,
        "small clinic": False,
        "medium clinic": False,
        "hospital": True,
    },
    "post_appointment_offers": {
        "free": False,
        "small clinic": False,
        "medium clinic": True,
        "hospital": True,
    },
}
