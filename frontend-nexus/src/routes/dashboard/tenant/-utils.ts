import type {
  TenantCurrentRead,
  TenantDepartmentWithServicesRead,
  TenantDetailsRead,
  TenantDetailsUpdate,
} from '@/interfaces';
import { isApiError } from '@/lib/api-client';
import { tenantsService } from '@/services/tenants.service';
import type { CSSProperties } from 'react';
import type {
  DepartmentDraft,
  DepartmentFormModalState,
  ProductFormState,
  ServiceFormState,
  TenantDetailsFormState,
} from './-constants';

export async function getCurrentTenantWithFallback(
  tenantIdFromStore?: string
): Promise<TenantCurrentRead> {
  try {
    return await tenantsService.getCurrentTenant();
  } catch (error) {
    if (!isApiError(error)) throw error;

    const hasNoTenantMessage = error.displayMessage
      .toLowerCase()
      .includes('no tenant assigned');
    const parsedTenantId = Number(tenantIdFromStore);

    if (
      !hasNoTenantMessage ||
      !Number.isFinite(parsedTenantId) ||
      parsedTenantId <= 0
    ) {
      throw error;
    }

    const publicTenants = await tenantsService.listPublicTenants();
    const matchedTenant = publicTenants.find(
      (tenant) => tenant.id === parsedTenantId
    );

    if (!matchedTenant) throw error;

    return {
      id: matchedTenant.id,
      name: matchedTenant.name,
      slug: matchedTenant.slug,
      email: '-',
      licence_number: '-',
      status: 'approved',
    };
  }
}

export function getErrorMessage(err: unknown): string {
  if (isApiError(err)) return err.displayMessage;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function createLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyDetailsForm(): TenantDetailsFormState {
  return {
    logo: '',
    image: '',
    moto: '',
    title: '',
    about_text: '',
    brand_id: null,
    font_id: null,
  };
}

export function mapDetailsToForm(
  details: TenantDetailsRead | null
): TenantDetailsFormState {
  return {
    logo: details?.logo ?? '',
    image: details?.image ?? '',
    moto: details?.moto ?? '',
    title: details?.title ?? '',
    about_text: details?.about_text ?? '',
    brand_id: details?.brand_id ?? null,
    font_id: details?.font_id ?? null,
  };
}

export function diffTenantDetailsPayload(
  form: TenantDetailsFormState,
  original: TenantDetailsRead | null
): TenantDetailsUpdate {
  const payload: TenantDetailsUpdate = {};
  const current = {
    logo: nullIfBlank(form.logo),
    image: nullIfBlank(form.image),
    moto: nullIfBlank(form.moto),
    title: nullIfBlank(form.title),
    about_text: nullIfBlank(form.about_text),
    brand_id: form.brand_id,
    font_id: form.font_id,
  };

  if ((original?.logo ?? null) !== current.logo)
    payload.logo = current.logo;
  if ((original?.image ?? null) !== current.image)
    payload.image = current.image;
  if ((original?.moto ?? null) !== current.moto)
    payload.moto = current.moto;
  if ((original?.title ?? null) !== current.title)
    payload.title = current.title;
  if ((original?.about_text ?? null) !== current.about_text) {
    payload.about_text = current.about_text;
  }
  if ((original?.brand_id ?? null) !== current.brand_id)
    payload.brand_id = current.brand_id;
  if ((original?.font_id ?? null) !== current.font_id)
    payload.font_id = current.font_id;

  return payload;
}

export function mapTenantDepartmentToDraft(
  item: TenantDepartmentWithServicesRead
): DepartmentDraft {
  return {
    local_id: createLocalId(),
    id: item.id,
    department_id: item.department_id,
    department_name: item.department_name,
    phone_number: item.phone_number ?? '',
    email: item.email ?? '',
    location: item.location ?? '',
    isEditing: false,
  };
}

export function emptyProductForm(): ProductFormState {
  return {
    name: '',
    description: '',
    price: '',
    stock_quantity: '0',
    is_available: true,
  };
}

export function emptyDepartmentForm(): DepartmentFormModalState {
  return {
    department_id: null,
    phone_number: '',
    email: '',
    location: '',
  };
}

export function emptyServiceForm(): ServiceFormState {
  return {
    name: '',
    price: '',
    description: '',
    is_active: true,
  };
}

function normalizeHexColor(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const hex = value.trim().toLowerCase();
  if (hex === 'transparent') return null;
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return null;
}

function hexToRgb(
  hex: string
): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = getRelativeLuminance(hexA);
  const luminanceB = getRelativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLinear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pickReadableTextColor(
  background: string,
  preferredText?: string | null
): string {
  if (
    preferredText &&
    contrastRatio(background, preferredText) >= 4.5
  )
    return preferredText;

  const light = '#f8fafc';
  const dark = '#0f172a';
  return contrastRatio(background, light) >=
    contrastRatio(background, dark)
    ? light
    : dark;
}

function mixHex(
  baseHex: string,
  overlayHex: string,
  amount: number
): string {
  const base = hexToRgb(baseHex);
  const overlay = hexToRgb(overlayHex);
  if (!base || !overlay) return baseHex;
  const ratio = Math.min(1, Math.max(0, amount));
  const r = Math.round(base.r + (overlay.r - base.r) * ratio);
  const g = Math.round(base.g + (overlay.g - base.g) * ratio);
  const b = Math.round(base.b + (overlay.b - base.b) * ratio);
  return rgbToHex(r, g, b);
}

export function buildPaletteCardColors(
  brand: {
    brand_color_background?: string | null;
    brand_color_foreground?: string | null;
    brand_color_primary?: string | null;
  },
  isSelected = false
): CSSProperties {
  const background =
    normalizeHexColor(brand.brand_color_background) ?? '#f8fafc';
  const preferredText = normalizeHexColor(
    brand.brand_color_foreground
  );
  const selectedAccent =
    normalizeHexColor(brand.brand_color_primary) ?? '#2563eb';
  const text = pickReadableTextColor(background, preferredText);
  const border = mixHex(background, text, 0.18);
  const gradientEnd = mixHex(background, text, 0.06);
  const selectedBorder = mixHex(selectedAccent, text, 0.2);
  const highlight = isSelected
    ? `linear-gradient(180deg, ${selectedAccent} 0 3px, transparent 3px), `
    : '';

  return {
    backgroundImage: `${highlight}linear-gradient(180deg, ${background}, ${gradientEnd})`,
    color: text,
    borderColor: isSelected ? selectedBorder : border,
  };
}
