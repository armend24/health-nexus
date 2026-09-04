/**
 * Types for tenant landing and public tenant list (match backend schemas/landing.py)
 */

export interface TenantPublicCard {
  id: number;
  slug: string | null;
  name: string;
  moto: string | null;
  about_text: string | null;
  logo: string | null;
  image: string | null;
  brand_color_primary: string | null;
  brand_color_secondary: string | null;
  brand_color_background: string | null;
  brand_color_foreground: string | null;
  brand_color_muted: string | null;
}

export interface ServiceLandingItem {
  id: number;
  name: string;
  price: number;
  description: string | null;
  is_active: boolean;
}

export interface DepartmentLandingItem {
  id: number;
  name: string;
  phone_number: string | null;
  email: string | null;
  location: string | null;
  services: ServiceLandingItem[];
}

export interface TenantLandingRead {
  id: number;
  name: string;
  slug: string | null;
  email: string;
  licence_number: string;
}

export interface DoctorLandingItem {
  user_id: number;
  first_name: string;
  last_name: string;
  specialization: string | null;
  education: string | null;
  licence_number: string | null;
  is_active: boolean;
  working_hours: Record<string, unknown> | null;
}

export interface ProductLandingItem {
  product_id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price: number;
  stock_quantity: number;
  is_available: boolean;
}

export interface TenantDetailsLandingRead {
  tenant_id: number;
  logo: string | null;
  image: string | null;
  moto: string | null;
  brand_color_primary: string | null;
  brand_color_secondary: string | null;
  brand_color_background: string | null;
  brand_color_foreground: string | null;
  brand_color_muted: string | null;
  title: string | null;
  slogan: string | null;
  about_text: string | null;
  font_key: string | null;
  font_id: number | null;
  font_name: string | null;
  font_header_family: string | null;
  font_body_family: string | null;
}

export interface PlanLandingItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  duration: number | null;
  max_appointments: number | null;
  max_consultations: number | null;
  is_active: boolean;
}

export interface TenantLandingPageResponse {
  tenant: TenantLandingRead;
  details: TenantDetailsLandingRead | null;
  departments: DepartmentLandingItem[];
  doctors: DoctorLandingItem[];
  products: ProductLandingItem[];
  plans: PlanLandingItem[];
}
