from pathlib import Path

from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import get_storage_root
from app.auth.auth_router import router as auth_router
from app.routes.enrollment_me import router as enrollment_me_router
from app.routes import (
    role_router,
    enrollment_router,
    tenant_router,
    superadmin_tenant_router,
    department_router,
    user_router,
    font_router,
    brand_router,
    service_router,
    tenant_audit_log,
    user_tenant_plan_router,
    public_tenant_router,
    contract_router,
    tenant_subscription_router,
    subscription_plan_router,
    patients_router,
    appointment_router,
    doctor_appointment_router,
    patient_appointment_router,
    appointment_status_history_router,
    notification_router,
    sales_lead_router,
    consultation_bookings_router,
    feature_flag_router,
    offer_router,
    recommendation_router,
    ai_assistant_router,
    payment_router,
    product_router,
    cart_router,
    order_router,
    superadmin_subscription_router,
)

app = FastAPI(
    title="Healthcare SaaS API",
    version="0.1.0",
    swagger_ui_parameters={"persistAuthorization": True},
)

# Serve uploaded files at /uploads/ (e.g. /uploads/signatures/contract_1_doctor_xxx.png)
_uploads_dir = Path(get_storage_root())
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")

_allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:5173",
]

# CORS configuration for development - allows frontend on various ports
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Catch-all handler: ensures CORS headers are present even on unhandled 500s
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in _allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


# Include routers
app.include_router(role_router)
app.include_router(tenant_router, prefix="/api")
app.include_router(superadmin_tenant_router, prefix="/api/superadmin")
app.include_router(department_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(font_router, prefix="/api")
app.include_router(brand_router, prefix="/api")
app.include_router(service_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(public_tenant_router, prefix="/api/public")
app.include_router(patients_router, prefix="/api")
app.include_router(tenant_audit_log)
app.include_router(enrollment_me_router, prefix="/api")
app.include_router(enrollment_router, prefix="/api")
app.include_router(user_tenant_plan_router)
app.include_router(contract_router)
app.include_router(tenant_subscription_router, prefix="/api")
app.include_router(subscription_plan_router, prefix="/api")
app.include_router(appointment_router)
app.include_router(doctor_appointment_router)
app.include_router(patient_appointment_router)
app.include_router(appointment_status_history_router)
app.include_router(notification_router)
app.include_router(sales_lead_router, prefix="/api")
app.include_router(consultation_bookings_router, prefix="/api")
app.include_router(feature_flag_router)
app.include_router(offer_router)
app.include_router(recommendation_router)
app.include_router(ai_assistant_router)
app.include_router(payment_router, prefix="/api")
app.include_router(product_router)
app.include_router(cart_router)
app.include_router(order_router)
app.include_router(superadmin_subscription_router, prefix="/api")


@app.get("/")
def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
def health_endpoint():
    return {"status": "healthy"}
