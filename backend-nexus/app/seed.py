from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from datetime import datetime, timezone, timedelta


from app.auth.auth_utils import hash_password
from app.lib.html_sanitize import sanitize_html
from app.lib.feature_flag_seed import SEED_FEATURE_FLAGS
from app.db import SessionLocal
from app.models import (
    BrandPalette,
    Contract,
    ContractStatus,
    Appointment,
    AppointmentStatus,
    AppointmentStatusHistory,
    BrandPalette,
    Department,
    Doctor,
    Enrollment,
    EnrollmentStatusHistory,
    OfferDelivery,
    Font,
    Lead,
    LeadStatus,
    Patient,
    Product,
    Recommendation,
    Role,
    Service,
    SubscriptionPlan,
    Tenant,
    TenantDepartment,
    TenantManager,
    TenantStatus,
    TenantSubscription,
    User,
    UserTenantPlan,
    FeatureFlag,
)
from app.models.enrollment import EnrollmentStatus
from app.models.offer_delivery import OfferDeliveryChannel, OfferDeliveryStatus

ROLE_NAMES = [
    "SUPER_ADMIN",
    "TENANT_MANAGER",
    "DOCTOR",
    "SALES",
    "CLIENT",
]


@dataclass(frozen=True)
class SeedUser:
    first_name: str
    last_name: str
    email: str
    password: str
    role_name: str


SEED_USERS = [
    SeedUser("Super", "Admin", "super.admin@seed.com", "Team2026@", "SUPER_ADMIN"),
    SeedUser("Tenant", "Manager", "tenant.manager@seed.com", "Team2026@", "TENANT_MANAGER"),
    SeedUser("Doctor", "One", "doctor.one@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Two", "doctor.two@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Three", "doctor.three@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Four", "doctor.four@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Five", "doctor.five@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Six", "doctor.six@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Seven", "doctor.seven@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Eight", "doctor.eight@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Nine", "doctor.nine@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Doctor", "Ten", "doctor.ten@seed.com", "Team2026@", "DOCTOR"),
    SeedUser("Sales", "Agent", "sales.agent@seed.com", "Team2026@", "SALES"),
    SeedUser("Sales", "Agent2", "sales.agent2@seed.com", "Team2026@", "SALES"),
    SeedUser("Client", "User", "client.user@seed.com", "Team2026@", "CLIENT"),
    SeedUser("Registered", "Client", "registered.client@seed.com", "Team2026@", "CLIENT"),
    SeedUser("Global", "Only", "global.only@seed.com", "Team2026@", "CLIENT"),
    SeedUser("Client", "NoEnroll", "client.noenroll@seed.com", "Team2026@", "CLIENT"),
    SeedUser("Client", "OtherTenant", "client.othertenant@seed.com", "Team2026@", "CLIENT"),
]

SEED_PATIENTS = [
    # Existing registration in tenant 1 -> POST /tenants/1/clients/register with this email returns 409.
    {
        "user_email": "registered.client@seed.com",
        "tenant_name": "Bluestone Clinic",
        "birthdate": date(1992, 1, 10),
        "gender": "female",
        "blood_type": "O+",
    },
    # Same global user in two tenants -> proves cross-tenant presence is valid.
    {
        "user_email": "client.user@seed.com",
        "tenant_name": "Bluestone Clinic",
        "birthdate": date(1991, 6, 15),
        "gender": "male",
        "blood_type": "A+",
    },
    {
        "user_email": "client.user@seed.com",
        "tenant_name": "Riverside Health Partners",
        "birthdate": date(1991, 6, 15),
        "gender": "male",
        "blood_type": "A+",
    },
    # For enrollment API testing: EXPIRED enrollment in Northgate
    {
        "user_email": "client.user@seed.com",
        "tenant_name": "Northgate Wellness",
        "birthdate": date(1991, 6, 15),
        "gender": "male",
        "blood_type": "A+",
    },
    # Feature/FUL-29 — patients for appointment booking
    {
        "user_email": "client.noenroll@seed.com",
        "tenant_name": "Bluestone Clinic",
        "birthdate": date(1994, 3, 22),
        "gender": "female",
        "blood_type": "B+",
    },
    {
        "user_email": "client.othertenant@seed.com",
        "tenant_name": "Riverside Health Partners",
        "birthdate": date(1988, 11, 5),
        "gender": "male",
        "blood_type": "O-",
    },
]


SEED_LEADS = [
    # New Pool (unclaimed, status=NEW)
    {
        "licence_number": "MED-2024-001",
        "organization_name": "Green Valley Medical Center",
        "contact_name": "Dr. Sarah Johnson",
        "contact_email": "sarah@greenvalley.com",
        "contact_phone": "+1-555-0101",
        "initial_message": "Interested in modernizing our patient management system",
        "source": "WEBSITE",
        "status": LeadStatus.NEW,
    },
    {
        "licence_number": "MED-2024-002",
        "organization_name": "Unity Healthcare Group",
        "contact_name": "John Martinez",
        "contact_email": "john@unityhealth.com",
        "contact_phone": "+1-555-0102",
        "initial_message": "Looking for digital transformation in healthcare",
        "source": "REFERRAL",
        "status": LeadStatus.NEW,
    },
    {
        "licence_number": "MED-2024-003",
        "organization_name": "Westside Clinic",
        "contact_name": "Emma Thompson",
        "contact_email": "emma@westside.com",
        "contact_phone": "+1-555-0103",
        "initial_message": None,
        "source": "WEBSITE",
        "status": LeadStatus.NEW,
    },
    # Dropped Leads (unclaimed, status=QUALIFIED)
    {
        "licence_number": "MED-2024-004",
        "organization_name": "Harmony Health Partners",
        "contact_name": "Michael Chen",
        "contact_email": "michael@harmonyhealth.com",
        "contact_phone": "+1-555-0104",
        "initial_message": "Previously qualified, needs follow-up",
        "source": "WEBSITE",
        "status": LeadStatus.QUALIFIED,
    },
    {
        "licence_number": "MED-2024-005",
        "organization_name": "Coastal Medical Associates",
        "contact_name": "Lisa Anderson",
        "contact_email": "lisa@coastalmed.com",
        "contact_phone": "+1-555-0105",
        "initial_message": "Contacted but no response recently",
        "source": "REFERRAL",
        "status": LeadStatus.CONTACTED,
    },
    {
        "licence_number": "MED-2024-006",
        "organization_name": "Premier Healthcare Solutions",
        "contact_name": "Robert Wilson",
        "contact_email": "robert@premierhc.com",
        "contact_phone": None,
        "initial_message": None,
        "source": "CAMPAIGN",
        "status": LeadStatus.QUALIFIED,
    },
    # Assigned to sales agent for testing (QUALIFIED status)
    {
        "licence_number": "MED-2024-007",
        "organization_name": "TechMed Solutions",
        "contact_name": "Victoria Price",
        "contact_email": "victoria@techmed.com",
        "contact_phone": "+1-555-0107",
        "initial_message": "Already qualified, working on contract",
        "source": "REFERRAL",
        "status": LeadStatus.CONSULTATION_SCHEDULED,
    },
]


SEED_TENANTS = [
    # Approved
    {
        "name": "Bluestone Clinic",
        "slug": "bluestone-clinic",
        "email": "contact@bluestone.com",
        "licence_number": "BLU-001",
        "status": TenantStatus.approved,
    },
    {
        "name": "Riverside Health Partners",
        "slug": "riverside-health-partners",
        "email": "contact@riverside.com",
        "licence_number": "RIV-002",
        "status": TenantStatus.approved,
    },
    {
        "name": "Apex Medical Group",
        "slug": "apex-medical-group",
        "email": "contact@apex.com",
        "licence_number": "APX-003",
        "status": TenantStatus.approved,
    },
    {
        "name": "Northgate Wellness",
        "slug": "northgate-wellness",
        "email": "contact@northgate.com",
        "licence_number": "NGT-004",
        "status": TenantStatus.approved,
    },
    {
        "name": "Sunrise Family Practice",
        "slug": "sunrise-family-practice",
        "email": "contact@sunrisefp.com",
        "licence_number": "SRF-005",
        "status": TenantStatus.approved,
    },
    {
        "name": "MetroCare Associates",
        "slug": "metrocare-associates",
        "email": "contact@metrocare.com",
        "licence_number": "MCA-006",
        "status": TenantStatus.approved,
    },
    # Pending
    {
        "name": "Valley View Medical",
        "slug": "valley-view-medical",
        "email": "contact@valleyview.com",
        "licence_number": "VVM-007",
        "status": TenantStatus.pending,
    },
    {
        "name": "Greenfield Clinic",
        "slug": "greenfield-clinic",
        "email": "contact@greenfield.com",
        "licence_number": "GFC-008",
        "status": TenantStatus.pending,
    },
    {
        "name": "Coastal Health Group",
        "slug": "coastal-health-group",
        "email": "contact@coastalhealth.com",
        "licence_number": "CHG-009",
        "status": TenantStatus.pending,
    },
    # Rejected
    {
        "name": "Downtown Wellness Hub",
        "slug": "downtown-wellness-hub",
        "email": "contact@downtownwellness.com",
        "licence_number": "DWH-010",
        "status": TenantStatus.rejected,
    },
    {
        "name": "Peak Performance Health",
        "slug": "peak-performance-health",
        "email": "contact@peakperformance.com",
        "licence_number": "PPH-011",
        "status": TenantStatus.rejected,
    },
    {
        "name": "Urban Care Clinic",
        "slug": "urban-care-clinic",
        "email": "contact@urbancare.com",
        "licence_number": "UCC-012",
        "status": TenantStatus.rejected,
    },
    # Suspended
    {
        "name": "Harbor Medical Center",
        "slug": "harbor-medical-center",
        "email": "contact@harbormed.com",
        "licence_number": "HMC-013",
        "status": TenantStatus.suspended,
    },
    {
        "name": "Summit Health Partners",
        "slug": "summit-health-partners",
        "email": "contact@summithealth.com",
        "licence_number": "SHP-014",
        "status": TenantStatus.suspended,
    },
    # Archived
    {
        "name": "Legacy Care Network",
        "slug": "legacy-care-network",
        "email": "contact@legacycare.com",
        "licence_number": "LCN-015",
        "status": TenantStatus.archived,
    },
    {
        "name": "Pioneer Medical Group",
        "slug": "pioneer-medical-group",
        "email": "contact@pioneermed.com",
        "licence_number": "PMG-016",
        "status": TenantStatus.archived,
    },
]

# id, name, primary, secondary, background, foreground, muted, sort_order
SEED_BRAND_PALETTES = [
    (1, "Ocean Blue", "#2563eb", "#0ea5e9", "#f0f9ff", "#1e293b", "#94a3b8", 0),
    (2, "Forest Green", "#059669", "#10b981", "#ecfdf5", "#134e4a", "#6b7280", 1),
    (3, "Royal Purple", "#7c3aed", "#a78bfa", "#f5f3ff", "#4c1d95", "#9ca3af", 2),
    (4, "Sunset Orange", "#ea580c", "#fb923c", "#fff7ed", "#9a3412", "#6b7280", 3),
    (5, "Teal Wave", "#0891b2", "#22d3ee", "#ecfeff", "#155e75", "#94a3b8", 4),
    (6, "Crimson Red", "#dc2626", "#f87171", "#fef2f2", "#991b1b", "#94a3b8", 5),
    (7, "Midnight Indigo", "#4f46e5", "#818cf8", "#eef2ff", "#312e81", "#9ca3af", 6),
    (8, "Mint Fresh", "#10b981", "#34d399", "#d1fae5", "#064e3b", "#6b7280", 7),
    (9, "Amber Gold", "#d97706", "#fbbf24", "#fffbeb", "#78350f", "#94a3b8", 8),
    (10, "Rose Pink", "#e11d48", "#fb7185", "#fff1f2", "#881337", "#94a3b8", 9),
]

# id, name, header_font_family, body_font_family, sort_order
SEED_FONTS = [
    (1, "Inter", "Inter", "Inter", 0),
    (2, "Poppins + Open Sans", "Poppins", "Open Sans", 1),
    (3, "Roboto Slab + Roboto", "Roboto Slab", "Roboto", 2),
    (4, "Montserrat + Lato", "Montserrat", "Lato", 3),
    (5, "Playfair + Source Sans", "Playfair Display", "Source Sans 3", 4),
]

# tenant_name -> tenant_id at seed time. brand_id -> brand_palettes. font_id -> fonts.
# SEED_BRAND_THEMES: 1 Ocean Blue, 2 Forest Green, 3 Royal Purple, 4 Sunset Orange, 5 Teal Wave, 6 Crimson Red, ...
SEED_TENANT_DETAILS = [
    {
        "tenant_name": "Bluestone Clinic",
        "logo": "https://marketplace.canva.com/EAGeAJxtMvc/1/0/1600w/canva-blue-and-white-simple-medical-health-logo-arM9aB02SLw.jpg",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Your health, our priority",
        "title": "Bluestone Clinic",
        "about_text": "Bluestone Clinic has served the community for over 20 years.",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Riverside Health Partners",
        "logo": "https://media.istockphoto.com/id/1624291952/vector/medical-health-logo-design-illustration.jpg?s=612x612&w=0&k=20&c=RdOq1SRcWwS_12_c5Zg2_QOUz1GD-YwGvfRodtOPN5w=",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Care close to home",
        "title": "Riverside Health Partners",
        "about_text": "Riverside Health Partners offers comprehensive care.",
        "brand_id": 2,
        "font_id": 2,
    },
    {
        "tenant_name": "Apex Medical Group",
        "logo": "https://img.freepik.com/free-vector/hospital-logo-design-vector-medical-cross_53876-136743.jpg?semt=ais_hybrid&w=740&q=80",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Excellence in urban healthcare",
        "title": "Apex Medical Group",
        "about_text": "Apex Medical Group has been the premier healthcare provider in the downtown metro area for over 25 years. Our state-of-the-art facility combines cutting-edge medical technology with a compassionate, patient-centered approach. We offer a full spectrum of services across six specialized departments—General Practice, Cardiology, Dermatology, Neurology, Orthopedics, and Pediatrics—staffed by board-certified physicians and dedicated support teams. From routine check-ups to advanced diagnostics and specialized treatments, Apex is your trusted partner for lasting health.",
        "brand_id": 3,
        "font_id": 3,
    },
    {
        "tenant_name": "Northgate Wellness",
        "logo": "https://marketplace.canva.com/EAGeAJxtMvc/1/0/1600w/canva-blue-and-white-simple-medical-health-logo-arM9aB02SLw.jpg",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Holistic care for better living",
        "title": "Northgate Wellness",
        "about_text": "Northgate Wellness focuses on holistic approaches.",
        "brand_id": 6,
        "font_id": 4,
    },
    {
        "tenant_name": "Sunrise Family Practice",
        "logo": "https://media.istockphoto.com/id/1624291952/vector/medical-health-logo-design-illustration.jpg?s=612x612&w=0&k=20&c=RdOq1SRcWwS_12_c5Zg2_QOUz1GD-YwGvfRodtOPN5w=",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Family care you can trust",
        "title": "Sunrise Family Practice",
        "about_text": "Sunrise Family Practice provides family-focused care.",
        "brand_id": 4,
        "font_id": 5,
    },
    {
        "tenant_name": "MetroCare Associates",
        "logo": "https://img.freepik.com/free-vector/hospital-logo-design-vector-medical-cross_53876-136743.jpg?semt=ais_hybrid&w=740&q=80",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Urban healthcare excellence",
        "title": "MetroCare Associates",
        "about_text": "MetroCare Associates offers metro-area healthcare.",
        "brand_id": 5,
        "font_id": 1,
    },
    {
        "tenant_name": "Valley View Medical",
        "logo": "https://marketplace.canva.com/EAGeAJxtMvc/1/0/1600w/canva-blue-and-white-simple-medical-health-logo-arM9aB02SLw.jpg",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Your valley healthcare partner",
        "title": "Valley View Medical",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Greenfield Clinic",
        "logo": "https://media.istockphoto.com/id/1624291952/vector/medical-health-logo-design-illustration.jpg?s=612x612&w=0&k=20&c=RdOq1SRcWwS_12_c5Zg2_QOUz1GD-YwGvfRodtOPN5w=",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Growing with your community",
        "title": "Greenfield Clinic",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Coastal Health Group",
        "logo": "https://img.freepik.com/free-vector/hospital-logo-design-vector-medical-cross_53876-136743.jpg?semt=ais_hybrid&w=740&q=80",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Coastal care at its best",
        "title": "Coastal Health Group",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Downtown Wellness Hub",
        "logo": "https://marketplace.canva.com/EAGeAJxtMvc/1/0/1600w/canva-blue-and-white-simple-medical-health-logo-arM9aB02SLw.jpg",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Downtown wellness solutions",
        "title": "Downtown Wellness Hub",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Peak Performance Health",
        "logo": "https://media.istockphoto.com/id/1624291952/vector/medical-health-logo-design-illustration.jpg?s=612x612&w=0&k=20&c=RdOq1SRcWwS_12_c5Zg2_QOUz1GD-YwGvfRodtOPN5w=",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Reach your health peak",
        "title": "Peak Performance Health",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Urban Care Clinic",
        "logo": "https://img.freepik.com/free-vector/hospital-logo-design-vector-medical-cross_53876-136743.jpg?semt=ais_hybrid&w=740&q=80",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Urban healthcare access",
        "title": "Urban Care Clinic",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Harbor Medical Center",
        "logo": "https://marketplace.canva.com/EAGeAJxtMvc/1/0/1600w/canva-blue-and-white-simple-medical-health-logo-arM9aB02SLw.jpg",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Your harbor for health",
        "title": "Harbor Medical Center",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Summit Health Partners",
        "logo": "https://media.istockphoto.com/id/1624291952/vector/medical-health-logo-design-illustration.jpg?s=612x612&w=0&k=20&c=RdOq1SRcWwS_12_c5Zg2_QOUz1GD-YwGvfRodtOPN5w=",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Partners in summit health",
        "title": "Summit Health Partners",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Legacy Care Network",
        "logo": "https://img.freepik.com/free-vector/hospital-logo-design-vector-medical-cross_53876-136743.jpg?semt=ais_hybrid&w=740&q=80",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Legacy of care",
        "title": "Legacy Care Network",
        "brand_id": 1,
        "font_id": 1,
    },
    {
        "tenant_name": "Pioneer Medical Group",
        "logo": "https://marketplace.canva.com/EAGeAJxtMvc/1/0/1600w/canva-blue-and-white-simple-medical-health-logo-arM9aB02SLw.jpg",
        "image": "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=80",
        "moto": "Pioneering better health",
        "title": "Pioneer Medical Group",
        "brand_id": 1,
        "font_id": 1,
    },
]

SEED_SUBSCRIPTION_PLANS = [
    {
        "name": "FREE",
        "price": Decimal("0.00"),
        "duration": 30,
        "max_doctors": 5,
        "max_patients": 100,
        "max_departments": 3,
    },
    {
        "name": "Small Clinic",
        "price": Decimal("1499.00"),
        "duration": 30,
        "max_doctors": 15,
        "max_patients": 1000,
        "max_departments": 8,
    },
    {
        "name": "Medium Clinic",
        "price": Decimal("3999.00"),
        "duration": 30,
        "max_doctors": 50,
        "max_patients": 5000,
        "max_departments": 20,
    },
    {
        "name": "Hospital",
        "price": Decimal("9999.00"),
        "duration": 30,
        "max_doctors": 200,
        "max_patients": 20000,
        "max_departments": 50,
    },
]

# tenant_managers model payloads
SEED_TENANT_MANAGERS = [
    {
        "user_email": "tenant.manager@seed.com",
        "tenant_name": "Bluestone Clinic",
    },
    {
        "user_email": "tenant.manager@seed.com",
        "tenant_name": "Riverside Health Partners",
    },
]

# user_tenant_plans model payloads
SEED_USER_TENANT_PLANS = [
    {
        "tenant_name": "Bluestone Clinic",
        "name": "FREE",
        "description": "Starter plan",
        "price": 0,
        "duration": 30,
        "max_appointments": 10,
        "max_consultations": 10,
        "is_active": True,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "name": "PREMIUM",
        "description": "Premium monthly plan",
        "price": 99,
        "duration": 30,
        "max_appointments": 20,
        "max_consultations": 20,
        "is_active": True,
    },
    {
        "tenant_name": "Riverside Health Partners",
        "name": "FREE",
        "description": "Starter plan",
        "price": 0,
        "duration": 30,
        "max_appointments": 10,
        "max_consultations": 10,
        "is_active": True,
    },
    {
        "tenant_name": "Northgate Wellness",
        "name": "FREE",
        "description": "Starter plan",
        "price": 0,
        "duration": 30,
        "max_appointments": 10,
        "max_consultations": 10,
        "is_active": True,
    },
]

# enrollments model payloads
# Used for enrollment API testing: PENDING, ACTIVE, CANCELLED, EXPIRED
SEED_ENROLLMENTS = [
    # PENDING - can transition to ACTIVE or CANCELLED
    {
        "tenant_name": "Bluestone Clinic",
        "patient_user_email": "client.user@seed.com",
        "plan_name": "FREE",
        "created_by_email": "tenant.manager@seed.com",
        "status": EnrollmentStatus.PENDING,
        "activated_at": None,
        "cancelled_at": None,
        "expires_at": None,
    },
    # ACTIVE - can transition to CANCELLED or EXPIRED (when past expires_at)
    {
        "tenant_name": "Riverside Health Partners",
        "patient_user_email": "client.user@seed.com",
        "plan_name": "FREE",
        "created_by_email": "tenant.manager@seed.com",
        "status": EnrollmentStatus.ACTIVE,
        "activated_at": datetime.now(timezone.utc) - timedelta(days=5),
        "cancelled_at": None,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=25),
    },
    # CANCELLED - no further transitions
    {
        "tenant_name": "Bluestone Clinic",
        "patient_user_email": "registered.client@seed.com",
        "plan_name": "PREMIUM",
        "created_by_email": "tenant.manager@seed.com",
        "status": EnrollmentStatus.CANCELLED,
        "activated_at": datetime.now(timezone.utc) - timedelta(days=10),
        "cancelled_at": datetime.now(timezone.utc) - timedelta(days=2),
        "expires_at": None,
    },
    # EXPIRED - no further transitions (was ACTIVE, past expires_at)
    {
        "tenant_name": "Northgate Wellness",
        "patient_user_email": "client.user@seed.com",
        "plan_name": "FREE",
        "created_by_email": "super.admin@seed.com",
        "status": EnrollmentStatus.EXPIRED,
        "activated_at": datetime.now(timezone.utc) - timedelta(days=35),
        "cancelled_at": None,
        "expires_at": datetime.now(timezone.utc) - timedelta(days=5),
    },
]

# enrollment_status_history model payloads
# Schema requires old_status NOT NULL; use PENDING for "creation" records
SEED_ENROLLMENT_STATUS_HISTORY = [
    # Bluestone client.user FREE - creation
    {
        "tenant_name": "Bluestone Clinic",
        "patient_user_email": "client.user@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.PENDING,
        "changed_by_email": "tenant.manager@seed.com",
        "changed_by_role": "TENANT_MANAGER",
        "reason": "Initial enrollment created",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=1),
    },
    # Riverside client.user FREE - creation then activation
    {
        "tenant_name": "Riverside Health Partners",
        "patient_user_email": "client.user@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.PENDING,
        "changed_by_email": "tenant.manager@seed.com",
        "changed_by_role": "TENANT_MANAGER",
        "reason": "Initial enrollment created",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=6),
    },
    {
        "tenant_name": "Riverside Health Partners",
        "patient_user_email": "client.user@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.ACTIVE,
        "changed_by_email": "tenant.manager@seed.com",
        "changed_by_role": "TENANT_MANAGER",
        "reason": "Enrollment activated",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=5),
    },
    # Bluestone registered.client PREMIUM - creation, activation, cancellation
    {
        "tenant_name": "Bluestone Clinic",
        "patient_user_email": "registered.client@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.PENDING,
        "changed_by_email": "tenant.manager@seed.com",
        "changed_by_role": "TENANT_MANAGER",
        "reason": "Initial enrollment created",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=12),
    },
    {
        "tenant_name": "Bluestone Clinic",
        "patient_user_email": "registered.client@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.ACTIVE,
        "changed_by_email": "tenant.manager@seed.com",
        "changed_by_role": "TENANT_MANAGER",
        "reason": "Enrollment activated",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=10),
    },
    {
        "tenant_name": "Bluestone Clinic",
        "patient_user_email": "registered.client@seed.com",
        "old_status": EnrollmentStatus.ACTIVE,
        "new_status": EnrollmentStatus.CANCELLED,
        "changed_by_email": "tenant.manager@seed.com",
        "changed_by_role": "TENANT_MANAGER",
        "reason": "Patient requested cancellation",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=2),
    },
    # Northgate client.user FREE - creation, activation, expiration
    {
        "tenant_name": "Northgate Wellness",
        "patient_user_email": "client.user@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.PENDING,
        "changed_by_email": "super.admin@seed.com",
        "changed_by_role": "SUPER_ADMIN",
        "reason": "Initial enrollment created",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=36),
    },
    {
        "tenant_name": "Northgate Wellness",
        "patient_user_email": "client.user@seed.com",
        "old_status": EnrollmentStatus.PENDING,
        "new_status": EnrollmentStatus.ACTIVE,
        "changed_by_email": "super.admin@seed.com",
        "changed_by_role": "SUPER_ADMIN",
        "reason": "Enrollment activated",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=35),
    },
    {
        "tenant_name": "Northgate Wellness",
        "patient_user_email": "client.user@seed.com",
        "old_status": EnrollmentStatus.ACTIVE,
        "new_status": EnrollmentStatus.EXPIRED,
        "changed_by_email": "super.admin@seed.com",
        "changed_by_role": "SUPER_ADMIN",
        "reason": "Plan expired",
        "changed_at": datetime.now(timezone.utc) - timedelta(days=5),
    },
]

# tenant_name, name, price, description
SEED_PRODUCTS = [
    # Bluestone Clinic (tenant.manager@seed.com)
    {
        "tenant_name": "Bluestone Clinic",
        "name": "Consultation Package",
        "price": 150.00,
        "description": "Three-session telehealth consultation bundle with follow-up notes.",
        "category": "wellness-essentials",
        "image_url": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=900&q=80",
        "stock_quantity": 25,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "name": "Health Check-Up",
        "price": 99.00,
        "description": "Guided home screening kit for routine wellness tracking.",
        "category": "diagnostics",
        "image_url": "https://images.unsplash.com/photo-1584515933487-779824d29309?w=900&q=80",
        "stock_quantity": 18,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "name": "Blood Pressure Monitor",
        "price": 45.00,
        "description": "Compact upper-arm monitor with irregular heartbeat alerts.",
        "category": "home-monitoring",
        "image_url": "https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=900&q=80",
        "stock_quantity": 34,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "name": "First Aid Kit",
        "price": 28.00,
        "description": "Travel-ready first aid kit for home, office, or car.",
        "category": "first-aid",
        "image_url": "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=900&q=80",
        "stock_quantity": 42,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "name": "Thermometer",
        "price": 18.00,
        "description": "Non-contact thermometer with quick forehead readings.",
        "category": "diagnostics",
        "image_url": "https://images.unsplash.com/photo-1584367369853-66f7f4f3c3b8?w=900&q=80",
        "stock_quantity": 30,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Vitamin D Supplement",
        "price": 25.00,
        "description": "High-strength daily vitamin D softgels for bone support.",
        "category": "vitamins",
        "image_url": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&q=80",
        "stock_quantity": 60,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Multivitamin Pack",
        "price": 35.00,
        "description": "Thirty-day multivitamin pack for daily nutritional support.",
        "category": "vitamins",
        "image_url": "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=900&q=80",
        "stock_quantity": 48,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Blood Pressure Monitor",
        "price": 45.00,
        "description": "Easy-read blood pressure monitor with memory storage.",
        "category": "home-monitoring",
        "image_url": "https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=900&q=80",
        "stock_quantity": 26,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Thermometer",
        "price": 15.00,
        "description": "Fast-reading digital thermometer for routine home use.",
        "category": "diagnostics",
        "image_url": "https://images.unsplash.com/photo-1584367369853-66f7f4f3c3b8?w=900&q=80",
        "stock_quantity": 40,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "First Aid Kit",
        "price": 30.00,
        "description": "Comprehensive household first aid kit with refillable layout.",
        "category": "first-aid",
        "image_url": "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=900&q=80",
        "stock_quantity": 24,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Face Masks (50-pack)",
        "price": 20.00,
        "description": "Disposable protective face masks for clinic and home use.",
        "category": "protective-equipment",
        "image_url": "https://images.unsplash.com/photo-1584634731339-252c581abfc5?w=900&q=80",
        "stock_quantity": 75,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Hand Sanitizer (500ml)",
        "price": 12.00,
        "description": "Alcohol-based hand sanitizer with aloe for frequent use.",
        "category": "personal-care",
        "image_url": "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=900&q=80",
        "stock_quantity": 80,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Blood Glucose Meter",
        "price": 55.00,
        "description": "Portable glucose meter with starter lancets and strips.",
        "category": "medical-devices",
        "image_url": "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=900&q=80",
        "stock_quantity": 22,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Pulse Oximeter",
        "price": 40.00,
        "description": "Finger pulse oximeter for oxygen saturation monitoring.",
        "category": "home-monitoring",
        "image_url": "https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?w=900&q=80",
        "stock_quantity": 31,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Heating Pad",
        "price": 28.00,
        "description": "Electric heating pad for muscle recovery and pain relief.",
        "category": "wellness-essentials",
        "image_url": "https://images.unsplash.com/photo-1511174511562-5f7f18b874f8?w=900&q=80",
        "stock_quantity": 20,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Omega-3 Softgels",
        "price": 24.00,
        "description": "Daily omega-3 supplement with concentrated fish oil for heart support.",
        "category": "supplements",
        "image_url": "https://images.unsplash.com/photo-1577460551100-9070b7d6b6b5?w=900&q=80",
        "stock_quantity": 52,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Magnesium Glycinate Capsules",
        "price": 22.00,
        "description": "Gentle magnesium formula designed for muscle recovery and evening relaxation.",
        "category": "supplements",
        "image_url": "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=900&q=80",
        "stock_quantity": 41,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Probiotic Daily Blend",
        "price": 27.50,
        "description": "Shelf-stable probiotic blend to support gut health and daily balance.",
        "category": "supplements",
        "image_url": "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=900&q=80",
        "stock_quantity": 36,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Collagen Peptides Powder",
        "price": 34.00,
        "description": "Unflavored collagen peptides powder for skin, joints, and recovery routines.",
        "category": "supplements",
        "image_url": "https://images.unsplash.com/photo-1611078489935-0cb964de46d6?w=900&q=80",
        "stock_quantity": 29,
    },
    {
        "tenant_name": "Apex Medical Group",
        "name": "Electrolyte Hydration Mix",
        "price": 19.00,
        "description": "Single-serve electrolyte packets for hydration during travel, workouts, or recovery.",
        "category": "supplements",
        "image_url": "https://images.unsplash.com/photo-1622484212850-eb596d769edc?w=900&q=80",
        "stock_quantity": 64,
    },
]

SEED_DEPARTMENTS = [
    "General Practice",
    "Cardiology",
    "Pediatrics",
    "Dermatology",
    "Orthopedics",
    "Neurology",
]

# tenant_name, department_name, contact info
SEED_TENANT_DEPARTMENTS = [
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "General Practice",
        "phone_number": "+1-555-1001",
        "email": "gp@bluestone.com",
        "location": "Building A, Floor 1",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "Cardiology",
        "phone_number": "+1-555-1002",
        "email": "cardio@bluestone.com",
        "location": "Building A, Floor 2",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "Pediatrics",
        "phone_number": "+1-555-1003",
        "email": "pediatrics@bluestone.com",
        "location": "Building B, Floor 1",
    },
    {
        "tenant_name": "Riverside Health Partners",
        "department_name": "General Practice",
        "phone_number": "+1-555-2001",
        "email": "info@riverside.com",
        "location": "Main Street 100",
    },
    {
        "tenant_name": "Riverside Health Partners",
        "department_name": "Pediatrics",
        "phone_number": "+1-555-2002",
        "email": "pediatrics@riverside.com",
        "location": "Main Street 100, Wing B",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "General Practice",
        "phone_number": "+1-555-3001",
        "email": "gp@apex.com",
        "location": "Downtown Plaza, Level 1",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Cardiology",
        "phone_number": "+1-555-3002",
        "email": "cardio@apex.com",
        "location": "Downtown Plaza, Level 2",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Dermatology",
        "phone_number": "+1-555-3003",
        "email": "derma@apex.com",
        "location": "Downtown Plaza, Suite 301",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Neurology",
        "phone_number": "+1-555-3004",
        "email": "neuro@apex.com",
        "location": "Downtown Plaza, Level 3",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Orthopedics",
        "phone_number": "+1-555-3005",
        "email": "ortho@apex.com",
        "location": "Downtown Plaza, Suite 401",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Pediatrics",
        "phone_number": "+1-555-3006",
        "email": "pediatrics@apex.com",
        "location": "Downtown Plaza, Level 1, Wing B",
    },
    {
        "tenant_name": "Northgate Wellness",
        "department_name": "General Practice",
        "phone_number": "+1-555-4001",
        "email": "wellness@northgate.com",
        "location": "Northgate Center",
    },
    {
        "tenant_name": "Sunrise Family Practice",
        "department_name": "General Practice",
        "phone_number": "+1-555-5001",
        "email": "family@sunrisefp.com",
        "location": "Sunrise Mall",
    },
    {
        "tenant_name": "MetroCare Associates",
        "department_name": "General Practice",
        "phone_number": "+1-555-6001",
        "email": "metro@metrocare.com",
        "location": "Metro Tower",
    },
    {
        "tenant_name": "MetroCare Associates",
        "department_name": "Orthopedics",
        "phone_number": "+1-555-6002",
        "email": "ortho@metrocare.com",
        "location": "Metro Tower, Level 2",
    },
]

# user_email, tenant_name, specialization, licence_number, education, working_hours (optional)
# working_hours keys must match strftime("%A").lower() → "monday", "tuesday", etc.
_WEEKDAY_HOURS = {
    "monday": ["09:00", "17:00"],
    "tuesday": ["09:00", "17:00"],
    "wednesday": ["09:00", "17:00"],
    "thursday": ["09:00", "17:00"],
    "friday": ["09:00", "17:00"],
}

SEED_DOCTORS = [
    {
        "user_email": "doctor.one@seed.com",
        "tenant_name": "Bluestone Clinic",
        "specialization": "General Practice",
        "licence_number": "MD-BLU-001",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.two@seed.com",
        "tenant_name": "Bluestone Clinic",
        "specialization": "Cardiology",
        "licence_number": "MD-BLU-002",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.seven@seed.com",
        "tenant_name": "Bluestone Clinic",
        "specialization": "General Practice",
        "licence_number": "MD-BLU-003",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.eight@seed.com",
        "tenant_name": "Bluestone Clinic",
        "specialization": "Cardiology",
        "licence_number": "MD-BLU-004",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.nine@seed.com",
        "tenant_name": "Bluestone Clinic",
        "specialization": "Pediatrics",
        "licence_number": "MD-BLU-005",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.ten@seed.com",
        "tenant_name": "Bluestone Clinic",
        "specialization": "Dermatology",
        "licence_number": "MD-BLU-006",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.three@seed.com",
        "tenant_name": "Riverside Health Partners",
        "specialization": "General Practice",
        "licence_number": "MD-RIV-001",
        "working_hours": _WEEKDAY_HOURS,
    },
    {
        "user_email": "doctor.four@seed.com",
        "tenant_name": "Riverside Health Partners",
        "specialization": "Pediatrics",
        "licence_number": "MD-RIV-002",
        "working_hours": _WEEKDAY_HOURS,
    },
    # Apex Medical Group - full example
    {
        "user_email": "doctor.five@seed.com",
        "tenant_name": "Apex Medical Group",
        "specialization": "General Practice",
        "licence_number": "MD-APX-001",
        "education": "MD, Harvard Medical School; Residency at Johns Hopkins",
        "working_hours": {
            "monday": ["08:00", "17:00"],
            "tuesday": ["08:00", "17:00"],
            "wednesday": ["08:00", "17:00"],
            "thursday": ["08:00", "17:00"],
            "friday": ["08:00", "15:00"],
        },
    },
    {
        "user_email": "doctor.six@seed.com",
        "tenant_name": "Apex Medical Group",
        "specialization": "Dermatology",
        "licence_number": "MD-APX-002",
        "education": "MD, Stanford; Dermatology fellowship at Mayo Clinic",
        "working_hours": {
            "monday": ["09:00", "16:00"],
            "wednesday": ["09:00", "16:00"],
            "friday": ["09:00", "14:00"],
        },
    },
]

# tenant_name, user_email (doctor), status, salary, terms_content, start_date, end_date
SEED_CONTRACTS = [
    {
        "tenant_name": "Bluestone Clinic",
        "user_email": "doctor.one@seed.com",
        "status": ContractStatus.ACTIVE,
        "salary": 85000,
        "terms_content": "<h2>Employment Contract</h2><p>This agreement is between Bluestone Clinic and Dr. One.</p><p><strong>Salary:</strong> $85,000/year</p><p><strong>Term:</strong> 12 months from start date.</p>",
        "start_date": None,
        "end_date": None,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "user_email": "doctor.two@seed.com",
        "status": ContractStatus.ACTIVE,
        "salary": 95000,
        "terms_content": "<h2>Cardiology Specialist Contract</h2><p>Employment terms for Cardiology department.</p><p><strong>Salary:</strong> $95,000/year</p>",
        "start_date": None,
        "end_date": None,
    },
    {
        "tenant_name": "Bluestone Clinic",
        "user_email": "doctor.one@seed.com",
        "status": ContractStatus.DRAFT,
        "salary": 90000,
        "terms_content": "<p>Proposed contract renewal - pending review.</p>",
        "start_date": None,
        "end_date": None,
    },
]

# tenant_name, department_name, name, price, description
SEED_SERVICES = [
    # Bluestone Clinic
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "General Practice",
        "name": "Initial Consultation",
        "price": 120.00,
        "description": "First visit assessment",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "General Practice",
        "name": "Follow-up Visit",
        "price": 80.00,
        "description": "Routine follow-up",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "General Practice",
        "name": "Blood Test",
        "price": 45.00,
        "description": "Basic blood panel",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "Cardiology",
        "name": "ECG",
        "price": 150.00,
        "description": "Electrocardiogram",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "Cardiology",
        "name": "Stress Test",
        "price": 250.00,
        "description": "Cardiac stress test",
    },
    {
        "tenant_name": "Bluestone Clinic",
        "department_name": "Cardiology",
        "name": "Echocardiogram",
        "price": 320.00,
        "description": "Heart ultrasound",
    },
    # Riverside Health Partners
    {
        "tenant_name": "Riverside Health Partners",
        "department_name": "General Practice",
        "name": "General Check-up",
        "price": 100.00,
        "description": "Annual health check",
    },
    {
        "tenant_name": "Riverside Health Partners",
        "department_name": "General Practice",
        "name": "Vaccination",
        "price": 65.00,
        "description": "Routine vaccination",
    },
    {
        "tenant_name": "Riverside Health Partners",
        "department_name": "Pediatrics",
        "name": "Child Wellness Visit",
        "price": 90.00,
        "description": "Pediatric wellness exam",
    },
    {
        "tenant_name": "Riverside Health Partners",
        "department_name": "Pediatrics",
        "name": "Newborn Check",
        "price": 85.00,
        "description": "Newborn examination",
    },
    # Apex Medical Group - fullest example
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "General Practice",
        "name": "Initial Consultation",
        "price": 125.00,
        "description": "Comprehensive first-visit assessment",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "General Practice",
        "name": "Follow-up Visit",
        "price": 85.00,
        "description": "Routine follow-up consultation",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "General Practice",
        "name": "Annual Physical",
        "price": 150.00,
        "description": "Complete annual health examination",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "General Practice",
        "name": "Blood Panel",
        "price": 55.00,
        "description": "Comprehensive blood work",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Cardiology",
        "name": "ECG",
        "price": 160.00,
        "description": "Electrocardiogram",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Cardiology",
        "name": "Stress Test",
        "price": 275.00,
        "description": "Exercise stress test",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Cardiology",
        "name": "Echocardiogram",
        "price": 350.00,
        "description": "Heart ultrasound",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Dermatology",
        "name": "Skin Screening",
        "price": 135.00,
        "description": "Full body skin cancer screening",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Dermatology",
        "name": "Mole Removal",
        "price": 225.00,
        "description": "Minor surgical removal",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Dermatology",
        "name": "Acne Treatment",
        "price": 95.00,
        "description": "Acne consultation and treatment plan",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Neurology",
        "name": "Neurological Exam",
        "price": 185.00,
        "description": "Comprehensive neurological assessment",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Neurology",
        "name": "EEG",
        "price": 290.00,
        "description": "Electroencephalogram",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Neurology",
        "name": "Headache Consultation",
        "price": 120.00,
        "description": "Specialized headache evaluation",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Orthopedics",
        "name": "Joint Assessment",
        "price": 195.00,
        "description": "Orthopedic joint evaluation",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Orthopedics",
        "name": "X-Ray",
        "price": 95.00,
        "description": "Diagnostic imaging",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Orthopedics",
        "name": "Physical Therapy Referral",
        "price": 75.00,
        "description": "PT evaluation and referral",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Pediatrics",
        "name": "Well Child Visit",
        "price": 115.00,
        "description": "Pediatric wellness exam",
    },
    {
        "tenant_name": "Apex Medical Group",
        "department_name": "Pediatrics",
        "name": "Vaccination",
        "price": 70.00,
        "description": "Immunization administration",
    },
    # Northgate Wellness
    {
        "tenant_name": "Northgate Wellness",
        "department_name": "General Practice",
        "name": "Wellness Visit",
        "price": 95.00,
        "description": "Holistic wellness assessment",
    },
    {
        "tenant_name": "Northgate Wellness",
        "department_name": "General Practice",
        "name": "Nutrition Consultation",
        "price": 75.00,
        "description": "Diet and nutrition advice",
    },
    # Sunrise Family Practice
    {
        "tenant_name": "Sunrise Family Practice",
        "department_name": "General Practice",
        "name": "Family Consultation",
        "price": 105.00,
        "description": "Family medicine consult",
    },
    {
        "tenant_name": "Sunrise Family Practice",
        "department_name": "General Practice",
        "name": "School Physical",
        "price": 55.00,
        "description": "School sports physical",
    },
    # MetroCare Associates
    {
        "tenant_name": "MetroCare Associates",
        "department_name": "General Practice",
        "name": "Office Visit",
        "price": 115.00,
        "description": "Standard office visit",
    },
    {
        "tenant_name": "MetroCare Associates",
        "department_name": "Orthopedics",
        "name": "Joint Assessment",
        "price": 180.00,
        "description": "Orthopedic joint evaluation",
    },
    {
        "tenant_name": "MetroCare Associates",
        "department_name": "Orthopedics",
        "name": "X-Ray",
        "price": 95.00,
        "description": "Diagnostic imaging",
    },
]


def seed_brand_palettes(session):
    existing = {b.id: b for b in session.query(BrandPalette).all()}
    for row in SEED_BRAND_PALETTES:
        bid, name, p, s, bg, fg, m, sort_order = row
        if bid not in existing:
            session.add(
                BrandPalette(
                    id=bid,
                    name=name,
                    brand_color_primary=p,
                    brand_color_secondary=s,
                    brand_color_background=bg,
                    brand_color_foreground=fg,
                    brand_color_muted=m,
                    sort_order=sort_order,
                )
            )
    session.flush()


def seed_fonts(session):
    existing = {f.id: f for f in session.query(Font).all()}
    for row in SEED_FONTS:
        fid, name, header, body, sort_order = row
        if fid not in existing:
            session.add(
                Font(
                    id=fid,
                    name=name,
                    header_font_family=header,
                    body_font_family=body,
                    sort_order=sort_order,
                )
            )
    session.flush()
    return {f.id: f for f in session.query(Font).all()}


def seed_roles(session):
    roles_by_name = {role.name: role for role in session.query(Role).all()}

    for name in ROLE_NAMES:
        if name not in roles_by_name:
            role = Role(name=name)
            session.add(role)
            roles_by_name[name] = role

    session.flush()
    return roles_by_name


def seed_tenants(session):
    existing = {tenant.name: tenant for tenant in session.query(Tenant).all()}

    for payload in SEED_TENANTS:
        tenant = existing.get(payload["name"])
        if tenant is None:
            session.add(Tenant(**payload))
            continue
        elif not tenant.slug and payload.get("slug"):
            tenant.slug = payload["slug"]
        # Keep seeded tenants deterministic on reseed.
        tenant.email = payload["email"]
        tenant.licence_number = payload["licence_number"]
        tenant.status = payload["status"]


def seed_tenant_details(session, tenants_by_name):
    from app.models import TenantDetails

    existing = {detail.tenant_id: detail for detail in session.query(TenantDetails).all()}
    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}

    for payload in SEED_TENANT_DETAILS:
        tenant = tenants_by_name.get(payload["tenant_name"])
        if not tenant:
            continue
        detail = existing.get(tenant.id)
        if detail is None:
            p = {k: v for k, v in payload.items() if k != "tenant_name"}
            p["tenant_id"] = tenant.id
            session.add(TenantDetails(**p))
        else:
            for key in ("image", "brand_id", "font_id"):
                if key in payload and getattr(detail, key, None) is None:
                    setattr(detail, key, payload[key])


def seed_subscription_plans(session):
    existing = {
        subscription_plan.name: subscription_plan
        for subscription_plan in session.query(SubscriptionPlan).all()
    }

    for payload in SEED_SUBSCRIPTION_PLANS:
        plan = existing.get(payload["name"])
        if plan is None:
            session.add(SubscriptionPlan(**payload))


def seed_feature_flags(session):
    """
    Seed plan-level feature flag defaults from SEED_FEATURE_FLAGS.
    Idempotent: skips rows that already exist, updates enabled if they do.
    """
    existing: dict[tuple[str, str], FeatureFlag] = {
        (flag.plan_tier, flag.feature_key): flag
        for flag in session.query(FeatureFlag).filter(FeatureFlag.tenant_id.is_(None)).all()
    }

    for feature_key, tier_map in SEED_FEATURE_FLAGS.items():
        for plan_tier, enabled in tier_map.items():
            key = (plan_tier, feature_key)
            if key in existing:
                existing[key].enabled = enabled
            else:
                session.add(
                    FeatureFlag(
                        tenant_id=None,
                        feature_key=feature_key,
                        plan_tier=plan_tier,
                        enabled=enabled,
                    )
                )

    count = len(SEED_FEATURE_FLAGS) * len(next(iter(SEED_FEATURE_FLAGS.values())))
    print(f"  [seed_feature_flags] Seeded {count} plan-level feature flag defaults.")


def seed_tenant_subscriptions(session, tenants_by_name):
    from app.models.tenant_subscription import SubscriptionStatus
    from datetime import timedelta

    # Get all subscription plans
    free_plan = session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "FREE").first()
    small_clinic_plan = (
        session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "Small Clinic").first()
    )
    medium_clinic_plan = (
        session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "Medium Clinic").first()
    )
    hospital_plan = (
        session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "Hospital").first()
    )

    if not free_plan:
        raise Exception("FREE subscription plan not found")

    existing_subscriptions = {
        (sub.tenant_id, sub.subscription_plan_id): sub
        for sub in session.query(TenantSubscription).all()
    }

    # Map specific tenants to their subscription plans (non-FREE)
    specific_subscriptions = {
        "Bluestone Clinic": medium_clinic_plan,  # Tenant manager's clinic gets Medium plan
        "Riverside Health Partners": small_clinic_plan,  # Small Clinic plan
        "Apex Medical Group": hospital_plan,  # Hospital plan
    }

    # Create subscriptions for all approved tenants
    for tenant_name, tenant in tenants_by_name.items():
        if tenant.status == TenantStatus.approved:
            # Check if this tenant has a specific plan assigned
            specific_plan = specific_subscriptions.get(tenant_name)
            plan_to_use = specific_plan if specific_plan else free_plan

            key = (tenant.id, plan_to_use.id)

            # Skip if subscription already exists
            if key in existing_subscriptions:
                continue

            # Create subscription
            activated_at = datetime.now(timezone.utc)
            expires_at = activated_at + timedelta(days=plan_to_use.duration)

            subscription = TenantSubscription(
                tenant_id=tenant.id,
                subscription_plan_id=plan_to_use.id,
                activated_at=activated_at,
                expires_at=expires_at,
                status=SubscriptionStatus.ACTIVE,
            )

            session.add(subscription)


def seed_users(session, roles_by_name):
    existing = {user.email: user for user in session.query(User).all()}

    for user in SEED_USERS:
        if user.email in existing:
            continue

        session.add(
            User(
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                password=hash_password(user.password),
                role_id=roles_by_name[user.role_name].id,
            )
        )
    session.flush()
    return {user.email: user for user in session.query(User).all()}


def seed_patients(session, users_by_email):
    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}
    existing = {
        (patient.tenant_id, patient.user_id): patient for patient in session.query(Patient).all()
    }

    for payload in SEED_PATIENTS:
        user = users_by_email.get(payload["user_email"])
        tenant = tenants_by_name.get(payload["tenant_name"])
        if user is None or tenant is None:
            continue

        key = (tenant.id, user.id)
        patient = existing.get(key)
        if patient is None:
            session.add(
                Patient(
                    tenant_id=tenant.id,
                    user_id=user.id,
                    birthdate=payload["birthdate"],
                    gender=payload["gender"],
                    blood_type=payload["blood_type"],
                )
            )
            continue

        patient.birthdate = payload["birthdate"]
        patient.gender = payload["gender"]
        patient.blood_type = payload["blood_type"]
    session.flush()


def seed_user_tenant_plans(session):
    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}
    existing = {(plan.tenant_id, plan.name): plan for plan in session.query(UserTenantPlan).all()}

    for payload in SEED_USER_TENANT_PLANS:
        tenant = tenants_by_name.get(payload["tenant_name"])
        if tenant is None:
            continue

        key = (tenant.id, payload["name"])
        plan = existing.get(key)
        if plan is None:
            session.add(
                UserTenantPlan(
                    tenant_id=tenant.id,
                    name=payload["name"],
                    description=payload["description"],
                    price=payload["price"],
                    duration=payload["duration"],
                    max_appointments=payload["max_appointments"],
                    max_consultations=payload["max_consultations"],
                    is_active=payload["is_active"],
                )
            )
            continue

        plan.description = payload["description"]
        plan.price = payload["price"]
        plan.duration = payload["duration"]
        plan.max_appointments = payload["max_appointments"]
        plan.max_consultations = payload["max_consultations"]
        plan.is_active = payload["is_active"]
    session.flush()


def seed_enrollments(session, users_by_email):
    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}
    plans_by_tenant_and_name = {
        (plan.tenant_id, plan.name): plan for plan in session.query(UserTenantPlan).all()
    }
    patients_by_tenant_user = {(p.tenant_id, p.user_id): p for p in session.query(Patient).all()}
    existing = {
        (enrollment.tenant_id, enrollment.patient_user_id): enrollment
        for enrollment in session.query(Enrollment).all()
    }
    created = 0

    for payload in SEED_ENROLLMENTS:
        tenant = tenants_by_name.get(payload["tenant_name"])
        patient_user = users_by_email.get(payload["patient_user_email"])
        created_by = users_by_email.get(payload["created_by_email"])
        if tenant is None:
            print(f"  [seed_enrollments] Skip: tenant '{payload['tenant_name']}' not found")
            continue
        if patient_user is None:
            print(f"  [seed_enrollments] Skip: user '{payload['patient_user_email']}' not found")
            continue
        if created_by is None:
            print(
                f"  [seed_enrollments] Skip: created_by '{payload['created_by_email']}' not found"
            )
            continue

        # Enrollment FK requires (tenant_id, patient_user_id) to exist in patients(tenant_id, user_id)
        patient = patients_by_tenant_user.get((tenant.id, patient_user.id))
        if patient is None:
            print(
                f"  [seed_enrollments] Skip: no Patient for tenant={tenant.name} user={payload['patient_user_email']} "
                "(run seed_patients first; add SEED_PATIENTS entry if needed)"
            )
            continue

        plan = plans_by_tenant_and_name.get((tenant.id, payload["plan_name"]))
        if plan is None:
            print(
                f"  [seed_enrollments] Skip: plan '{payload['plan_name']}' for tenant '{tenant.name}' not found"
            )
            continue

        key = (tenant.id, patient_user.id)
        enrollment = existing.get(key)
        if enrollment is None:
            new_enrollment = Enrollment(
                tenant_id=tenant.id,
                patient_user_id=patient_user.id,
                user_tenant_plan_id=plan.id,
                created_by=created_by.id,
                status=payload["status"],
                activated_at=payload["activated_at"],
                cancelled_at=payload["cancelled_at"],
                expires_at=payload["expires_at"],
            )
            session.add(new_enrollment)
            session.flush()
            existing[key] = new_enrollment
            created += 1
            continue

        enrollment.user_tenant_plan_id = plan.id
        enrollment.created_by = created_by.id
        enrollment.status = payload["status"]
        enrollment.activated_at = payload["activated_at"]
        enrollment.cancelled_at = payload["cancelled_at"]
        enrollment.expires_at = payload["expires_at"]

    if created > 0:
        print(f"  [seed_enrollments] Created {created} enrollment(s)")


def seed_enrollment_status_history(session, users_by_email):
    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}
    enrollments_by_tenant_and_patient = {
        (enrollment.tenant_id, enrollment.patient_user_id): enrollment
        for enrollment in session.query(Enrollment).all()
    }

    for payload in SEED_ENROLLMENT_STATUS_HISTORY:
        tenant = tenants_by_name.get(payload["tenant_name"])
        patient_user = users_by_email.get(payload["patient_user_email"])
        if tenant is None or patient_user is None:
            continue

        enrollment = enrollments_by_tenant_and_patient.get((tenant.id, patient_user.id))
        if enrollment is None:
            continue

        changed_by = users_by_email.get(payload["changed_by_email"])

        duplicate = (
            session.query(EnrollmentStatusHistory)
            .filter(
                EnrollmentStatusHistory.enrollment_id == enrollment.id,
                EnrollmentStatusHistory.old_status == payload["old_status"],
                EnrollmentStatusHistory.new_status == payload["new_status"],
                EnrollmentStatusHistory.changed_at == payload["changed_at"],
            )
            .first()
        )
        if duplicate is not None:
            continue

        session.add(
            EnrollmentStatusHistory(
                enrollment_id=enrollment.id,
                tenant_id=tenant.id,
                old_status=payload["old_status"],
                new_status=payload["new_status"],
                changed_by=changed_by.id if changed_by else None,
                changed_by_role=payload["changed_by_role"],
                reason=payload["reason"],
                changed_at=payload["changed_at"],
            )
        )


# def seed_tenant_managers(session, users_by_email):
#    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}

#    for payload in SEED_TENANT_MANAGERS:
#        manager = users_by_email.get(payload["user_email"])
#        tenant = tenants_by_name.get(payload["tenant_name"])
#        if manager is None or tenant is None:
#            continue

#        existing = (
#            session.query(TenantManager)
#            .filter(
#                TenantManager.user_id == manager.id,
#                TenantManager.tenant_id == tenant.id,
#            )
#            .first()
#        )
#        if existing is not None:
#            continue

#        session.add(TenantManager(user_id=manager.id, tenant_id=tenant.id))
#    return {u.email: u for u in session.query(User).all()}


def seed_tenant_managers(session, users_by_email):
    tenants_by_name = {tenant.name: tenant for tenant in session.query(Tenant).all()}

    for payload in SEED_TENANT_MANAGERS:
        manager = users_by_email.get(payload["user_email"])
        tenant = tenants_by_name.get(payload["tenant_name"])
        if manager is None or tenant is None:
            continue

        exists = (
            session.query(TenantManager)
            .filter(
                TenantManager.user_id == manager.id,
                TenantManager.tenant_id == tenant.id,
            )
            .first()
        )

        if not exists:
            session.add(
                TenantManager(
                    user_id=manager.id,
                    tenant_id=tenant.id,
                )
            )


def seed_departments(session):
    existing = {d.name: d for d in session.query(Department).all()}
    for name in SEED_DEPARTMENTS:
        if name not in existing:
            session.add(Department(name=name))
            existing[name] = None
    session.flush()
    return {d.name: d for d in session.query(Department).all()}


def seed_tenant_departments(session, tenants_by_name, departments_by_name):
    existing_keys = set()
    for td in session.query(TenantDepartment).join(Tenant).join(Department).all():
        # build key from the objects we'd get - we need tenant and dept from the query
        pass
    # Simpler: check existing by querying
    for payload in SEED_TENANT_DEPARTMENTS:
        tenant = tenants_by_name.get(payload["tenant_name"])
        dept = departments_by_name.get(payload["department_name"])
        if not tenant or not dept:
            continue
        exists = (
            session.query(TenantDepartment)
            .filter(
                TenantDepartment.tenant_id == tenant.id,
                TenantDepartment.department_id == dept.id,
            )
            .first()
        )
        if exists:
            continue
        session.add(
            TenantDepartment(
                tenant_id=tenant.id,
                department_id=dept.id,
                phone_number=payload.get("phone_number"),
                email=payload.get("email"),
                location=payload.get("location"),
            )
        )
    session.flush()


def _get_tenant_department(
    session, tenant_name, department_name, tenants_by_name, departments_by_name
):
    tenant = tenants_by_name.get(tenant_name)
    dept = departments_by_name.get(department_name)
    if not tenant or not dept:
        return None
    return (
        session.query(TenantDepartment)
        .filter(
            TenantDepartment.tenant_id == tenant.id,
            TenantDepartment.department_id == dept.id,
        )
        .first()
    )


def seed_doctors(session, users_by_email, tenants_by_name):
    departments_by_name = {d.name: d for d in session.query(Department).all()}
    existing_doctor_user_ids = {d.user_id for d in session.query(Doctor).all()}
    for payload in SEED_DOCTORS:
        user = users_by_email.get(payload["user_email"])
        tenant = tenants_by_name.get(payload["tenant_name"])
        if not user or not tenant:
            continue
        if user.id in existing_doctor_user_ids:
            continue
        # Look up tenant_department via specialization → department name
        dept = departments_by_name.get(payload.get("specialization"))
        td = None
        if dept:
            td = (
                session.query(TenantDepartment)
                .filter(
                    TenantDepartment.tenant_id == tenant.id,
                    TenantDepartment.department_id == dept.id,
                )
                .first()
            )
        if not td:
            print(
                f"  [seed_doctors] Skip {payload['user_email']}: "
                f"no TenantDepartment for {payload['tenant_name']}/{payload.get('specialization')}"
            )
            continue
        session.add(
            Doctor(
                user_id=user.id,
                tenant_id=tenant.id,
                tenant_department_id=td.id,
                specialization=payload.get("specialization"),
                licence_number=payload.get("licence_number"),
                education=payload.get("education"),
                working_hours=payload.get("working_hours"),
                is_active=True,
            )
        )
        existing_doctor_user_ids.add(user.id)
    session.flush()


def seed_services(session, tenants_by_name, departments_by_name):
    existing = set()
    for s in session.query(Service).all():
        existing.add((s.tenant_departments_id, s.name))
    for payload in SEED_SERVICES:
        td = _get_tenant_department(
            session,
            payload["tenant_name"],
            payload["department_name"],
            tenants_by_name,
            departments_by_name,
        )
        if not td or (td.id, payload["name"]) in existing:
            continue
        tenant = tenants_by_name.get(payload["tenant_name"])
        session.add(
            Service(
                name=payload["name"],
                price=Decimal(str(payload["price"])),
                description=payload.get("description"),
                tenant_departments_id=td.id,
                tenant_id=tenant.id,
                is_active=True,
            )
        )
        existing.add((td.id, payload["name"]))


def seed_contracts(session, users_by_email, tenants_by_name):
    """Seed contracts for doctors. Bluestone Clinic (tenant 1) gets contracts."""
    now = datetime.now(timezone.utc)
    existing_count = session.query(Contract).count()
    if existing_count > 0:
        return  # Already seeded
    for payload in SEED_CONTRACTS:
        tenant = tenants_by_name.get(payload["tenant_name"])
        user = users_by_email.get(payload["user_email"])
        if not tenant or not user:
            continue
        doctor = (
            session.query(Doctor)
            .filter(
                Doctor.user_id == user.id,
                Doctor.tenant_id == tenant.id,
            )
            .first()
        )
        if not doctor:
            continue
        start = payload.get("start_date") or (now - timedelta(days=30))
        end = payload.get("end_date") or (now + timedelta(days=335))
        activated = now - timedelta(days=15) if payload["status"] == ContractStatus.ACTIVE else None
        session.add(
            Contract(
                tenant_id=tenant.id,
                doctor_user_id=doctor.user_id,
                status=payload["status"],
                salary=Decimal(str(payload["salary"])),
                terms_content=(
                    sanitize_html(payload.get("terms_content"))
                    if payload.get("terms_content")
                    else None
                ),
                start_date=start,
                end_date=end,
                activated_at=activated,
            )
        )
    session.flush()


def seed_products(session, tenants_by_name):
    existing_products = {
        (product.tenant_id, product.name): product
        for product in session.query(Product).all()
    }
    for payload in SEED_PRODUCTS:
        tenant = tenants_by_name.get(payload["tenant_name"])
        if not tenant:
            continue
        key = (tenant.id, payload["name"])
        product = existing_products.get(key)
        if product is None:
            product = Product(
                tenant_id=tenant.id,
                name=payload["name"],
            )
            session.add(product)
            existing_products[key] = product

        product.description = payload.get("description")
        product.category = payload.get("category")
        product.image_url = payload.get("image_url")
        product.price = Decimal(str(payload["price"]))
        product.stock_quantity = int(payload.get("stock_quantity", 0))
        product.is_available = bool(payload.get("is_available", True))
    session.flush()


def seed_leads(session):
    """Seed test leads for sales agent testing (unclaimed, various statuses)."""
    for lead_data in SEED_LEADS:
        # Check if lead already exists (by email)
        existing = session.query(Lead).filter_by(contact_email=lead_data["contact_email"]).first()
        if existing:
            continue
        
        lead = Lead(
            licence_number=lead_data["licence_number"],
            organization_name=lead_data["organization_name"],
            contact_name=lead_data["contact_name"],
            contact_email=lead_data["contact_email"],
            contact_phone=lead_data.get("contact_phone"),
            initial_message=lead_data.get("initial_message"),
            source=lead_data.get("source"),
            status=lead_data["status"],
            assigned_sales_user_id=None,  # All leads unclaimed
        )
        session.add(lead)
    
    session.commit()


def seed_lead_assignments(session):
    """Assign leads to sales agent for testing my-leads endpoint."""
    sales_agent = session.query(User).filter_by(email="sales.agent@seed.com").first()
    if not sales_agent:
        return
    
    # Get leads by email and assign to sales agent
    leads_to_assign = ["sarah@greenvalley.com", "victoria@techmed.com"]
    for email in leads_to_assign:
        lead = session.query(Lead).filter_by(contact_email=email).first()
        if lead:
            lead.assigned_sales_user_id = sales_agent.id
    
    session.commit()


def seed_enrollment(session):
    enrollment_targets = [
        {"email": "client.user@seed.com", "tenant_name": "Bluestone Clinic"},
        {
            "email": "client.othertenant@seed.com",
            "tenant_name": "Riverside Health Partners",
        },
    ]

    for target in enrollment_targets:
        patient_user = session.query(User).filter_by(email=target["email"]).first()
        if not patient_user:
            continue

        tenant = session.query(Tenant).filter_by(name=target["tenant_name"]).first()
        if tenant is None:
            continue

        plan = session.query(UserTenantPlan).filter_by(tenant_id=tenant.id, name="FREE").first()
        if plan is None:
            continue

        existing = (
            session.query(Enrollment)
            .filter_by(tenant_id=tenant.id, patient_user_id=patient_user.id)
            .first()
        )
        if existing:
            continue

        enrollment = Enrollment(
            tenant_id=tenant.id,
            patient_user_id=patient_user.id,
            user_tenant_plan_id=plan.id,
            created_by=patient_user.id,
            status=EnrollmentStatus.ACTIVE,
        )
        session.add(enrollment)

    session.commit()


def seed_appointments(session):
    from app.models import Appointment

    doctor = session.query(Doctor).first()
    patient = session.query(Patient).first()

    if not doctor or not patient:
        return

    appointment_dt = datetime(2026, 3, 10, 10, 0, tzinfo=timezone.utc)

    existing = (
        session.query(Appointment)
        .filter_by(
            doctor_user_id=doctor.user_id,
            patient_user_id=patient.user_id,
            appointment_datetime=appointment_dt,
        )
        .first()
    )

    if existing:
        return

    appointment = Appointment(
        tenant_id=doctor.tenant_id,
        doctor_user_id=doctor.user_id,
        patient_user_id=patient.user_id,
        appointment_datetime=appointment_dt,
        description="Initial consultation",
        status=AppointmentStatus.CONFIRMED,
    )

    session.add(appointment)
    session.commit()


def seed_prd12_offer_fixture(session):
    tenant = session.query(Tenant).filter_by(name="Bluestone Clinic").first()
    doctor_user = session.query(User).filter_by(email="doctor.one@seed.com").first()
    client_user = session.query(User).filter_by(email="client.user@seed.com").first()

    if tenant is None or doctor_user is None or client_user is None:
        return

    doctor = (
        session.query(Doctor)
        .filter_by(tenant_id=tenant.id, user_id=doctor_user.id)
        .first()
    )
    patient = (
        session.query(Patient)
        .filter_by(tenant_id=tenant.id, user_id=client_user.id)
        .first()
    )
    plan = session.query(UserTenantPlan).filter_by(tenant_id=tenant.id, name="FREE").first()
    manager = session.query(User).filter_by(email="tenant.manager@seed.com").first()

    if doctor is None or patient is None or plan is None or manager is None:
        return

    enrollment = (
        session.query(Enrollment)
        .filter_by(tenant_id=tenant.id, patient_user_id=client_user.id)
        .first()
    )
    if enrollment is None:
        enrollment = Enrollment(
            tenant_id=tenant.id,
            patient_user_id=client_user.id,
            user_tenant_plan_id=plan.id,
            created_by=manager.id,
            status=EnrollmentStatus.ACTIVE,
            activated_at=datetime.now(timezone.utc) - timedelta(days=7),
            expires_at=datetime.now(timezone.utc) + timedelta(days=23),
        )
        session.add(enrollment)
        session.flush()
    else:
        enrollment.user_tenant_plan_id = plan.id
        enrollment.created_by = manager.id
        enrollment.status = EnrollmentStatus.ACTIVE
        enrollment.activated_at = datetime.now(timezone.utc) - timedelta(days=7)
        enrollment.cancelled_at = None
        enrollment.expires_at = datetime.now(timezone.utc) + timedelta(days=23)

    appointment_dt = datetime(2026, 3, 9, 14, 0, tzinfo=timezone.utc)
    appointment = (
        session.query(Appointment)
        .filter_by(
            tenant_id=tenant.id,
            doctor_user_id=doctor.user_id,
            patient_user_id=client_user.id,
            appointment_datetime=appointment_dt,
        )
        .first()
    )
    if appointment is None:
        appointment = Appointment(
            tenant_id=tenant.id,
            doctor_user_id=doctor.user_id,
            patient_user_id=client_user.id,
            appointment_datetime=appointment_dt,
            description="PRD-12 completed appointment with seeded recommendations",
            status=AppointmentStatus.COMPLETED,
        )
        session.add(appointment)
        session.flush()
    else:
        appointment.description = "PRD-12 completed appointment with seeded recommendations"
        appointment.status = AppointmentStatus.COMPLETED

    history_entries = [
        (None, AppointmentStatus.REQUESTED, datetime(2026, 3, 7, 9, 0, tzinfo=timezone.utc)),
        (
            AppointmentStatus.REQUESTED,
            AppointmentStatus.CONFIRMED,
            datetime(2026, 3, 8, 11, 0, tzinfo=timezone.utc),
        ),
        (
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.COMPLETED,
            datetime(2026, 3, 9, 15, 0, tzinfo=timezone.utc),
        ),
    ]
    for old_status, new_status, changed_at in history_entries:
        exists = (
            session.query(AppointmentStatusHistory)
            .filter(
                AppointmentStatusHistory.appointment_id == appointment.id,
                AppointmentStatusHistory.old_status == old_status,
                AppointmentStatusHistory.new_status == new_status,
                AppointmentStatusHistory.changed_at == changed_at,
            )
            .first()
        )
        if exists is None:
            session.add(
                AppointmentStatusHistory(
                    appointment_id=appointment.id,
                    old_status=old_status,
                    new_status=new_status,
                    changed_by=manager.id,
                    changed_at=changed_at,
                )
            )

    recommendation_payloads = [
        {
            "category": "CARE_PLAN",
            "recommendation_type": "Nutrition care plan",
            "approved": True,
        },
        {
            "category": "FOLLOW_UP",
            "recommendation_type": "Follow-up consultation in two weeks",
            "approved": True,
        },
        {
            "category": "UNSUPPORTED",
            "recommendation_type": "Should be filtered out",
            "approved": True,
        },
        {
            "category": "LAB_TEST",
            "recommendation_type": "Unapproved lab recommendation",
            "approved": False,
        },
    ]
    existing_recommendations = {
        (rec.appointment_id, rec.category, rec.recommendation_type): rec
        for rec in session.query(Recommendation).filter_by(appointment_id=appointment.id).all()
    }
    for payload in recommendation_payloads:
        key = (appointment.id, payload["category"], payload["recommendation_type"])
        recommendation = existing_recommendations.get(key)
        if recommendation is None:
            session.add(
                Recommendation(
                    appointment_id=appointment.id,
                    doctor_id=doctor.user_id,
                    client_id=client_user.id,
                    category=payload["category"],
                    recommendation_type=payload["recommendation_type"],
                    approved=payload["approved"],
                )
            )
            continue

        recommendation.doctor_id = doctor.user_id
        recommendation.client_id = client_user.id
        recommendation.approved = payload["approved"]

    session.flush()

    approved_recommendations = (
        session.query(Recommendation)
        .filter(
            Recommendation.appointment_id == appointment.id,
            Recommendation.doctor_id == doctor.user_id,
            Recommendation.client_id == client_user.id,
            Recommendation.approved == True,
            Recommendation.category.in_(
                ["FOLLOW_UP", "CARE_PLAN", "LAB_TEST", "THERAPY", "WELLNESS", "SUPPLEMENT"]
            ),
        )
        .all()
    )
    existing_deliveries = {
        (offer.recommendation_id, offer.client_id): offer
        for offer in session.query(OfferDelivery)
        .filter(OfferDelivery.client_id == client_user.id)
        .all()
    }
    sent_at = datetime.now(timezone.utc) - timedelta(days=1)
    expires_at = datetime.now(timezone.utc) + timedelta(days=13)
    for recommendation in approved_recommendations:
        key = (recommendation.id, client_user.id)
        offer = existing_deliveries.get(key)
        if offer is None:
            session.add(
                OfferDelivery(
                    recommendation_id=recommendation.id,
                    client_id=client_user.id,
                    offer_status=OfferDeliveryStatus.DELIVERED,
                    delivery_channel=OfferDeliveryChannel.IN_APP,
                    sent_at=sent_at,
                    expires_at=expires_at,
                )
            )
            continue

        offer.offer_status = OfferDeliveryStatus.DELIVERED
        offer.delivery_channel = OfferDeliveryChannel.IN_APP
        offer.sent_at = sent_at
        offer.expires_at = expires_at

    session.commit()


def run_seed() -> None:
    session = SessionLocal()
    try:
        seed_brand_palettes(session)
        seed_fonts(session)
        roles_by_name = seed_roles(session)
        seed_tenants(session)
        session.commit()  # Ensure tenants are saved and IDs exist
        tenants_by_name = {t.name: t for t in session.query(Tenant).all()}
        seed_tenant_details(session, tenants_by_name)
        seed_subscription_plans(session)
        seed_feature_flags(session)
        session.flush()  # Flush to make SubscriptionPlan records available for query
        seed_tenant_subscriptions(session, tenants_by_name)
        users_by_email = seed_users(session, roles_by_name)
        seed_patients(session, users_by_email)
        seed_user_tenant_plans(session)
        seed_tenant_managers(session, users_by_email)
        seed_enrollments(session, users_by_email)
        seed_enrollment_status_history(session, users_by_email)
        session.commit()
        departments_by_name = seed_departments(session)
        seed_tenant_departments(session, tenants_by_name, departments_by_name)
        seed_doctors(session, users_by_email, tenants_by_name)
        seed_contracts(session, users_by_email, tenants_by_name)
        seed_services(session, tenants_by_name, departments_by_name)
        seed_products(session, tenants_by_name)
        session.commit()
        seed_enrollment(session)
        seed_leads(session)
        seed_lead_assignments(session)
        seed_appointments(session)
        seed_prd12_offer_fixture(session)
        enrollment_count = session.query(Enrollment).count()
        history_count = session.query(EnrollmentStatusHistory).count()
        leads_count = session.query(Lead).count()
        print("Seed completed.")
        print(f"  Enrollments: {enrollment_count} | Enrollment status history: {history_count} | Leads: {leads_count}")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    run_seed()
