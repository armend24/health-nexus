import { resolveMediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

export interface TenantBrandPreviewForm {
  title?: string | null;
  moto?: string | null;
  aboutText?: string | null;
  logo?: string | null;
  image?: string | null;
}

export interface TenantBrandPreviewBrand {
  backgroundColor?: string | null;
  foregroundColor?: string | null;
  borderColor?: string | null;
  accentColor?: string | null;
  headerFontFamily?: string | null;
  bodyFontFamily?: string | null;
}

export interface TenantBrandPreviewProps {
  form?: TenantBrandPreviewForm;
  brand?: TenantBrandPreviewBrand;
  showReadMore?: boolean;
  clampAboutText?: boolean;
  className?: string;
  heroClassName?: string;
}

function getInitials(value: string): string {
  return value
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function TenantBrandPreview({
  form,
  brand,
  showReadMore = true,
  clampAboutText = false,
  className,
  heroClassName,
}: TenantBrandPreviewProps) {
  const resolvedTitle =
    form?.title?.trim() || 'Landing section title';
  const resolvedMoto = form?.moto?.trim() || 'Moto preview';
  const resolvedAbout =
    form?.aboutText?.trim() ||
    'Your about text preview will appear here.';
  const logoUrl = resolveMediaUrl(form?.logo);
  const heroUrl = resolveMediaUrl(form?.image);

  const cardStyle: CSSProperties = {
    ...(brand?.backgroundColor &&
    brand.backgroundColor !== 'transparent'
      ? { backgroundColor: brand.backgroundColor }
      : undefined),
    ...(brand?.foregroundColor
      ? { color: brand.foregroundColor }
      : undefined),
    ...(brand?.borderColor
      ? { borderColor: brand.borderColor }
      : undefined),
    ...(brand?.bodyFontFamily
      ? { fontFamily: brand.bodyFontFamily }
      : undefined),
  };

  const accentStyle: CSSProperties = {
    ...(brand?.accentColor
      ? { color: brand.accentColor }
      : undefined),
  };

  const titleStyle: CSSProperties = {
    ...(brand?.headerFontFamily
      ? { fontFamily: brand.headerFontFamily }
      : undefined),
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-lg border shadow-sm',
        className
      )}
      style={cardStyle}
    >
      <div
        className={cn(
          'relative h-48 w-full shrink-0 bg-muted/40',
          heroClassName
        )}
      >
        {heroUrl ? (
          <img
            src={heroUrl}
            alt={resolvedTitle}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Hero image preview
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex shrink-0 items-start gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={resolvedTitle}
              className="h-10 w-10 rounded-lg border bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-xs font-semibold">
              {getInitials(resolvedTitle)}
            </div>
          )}
          <div className="min-w-0">
            <p
              className="truncate text-xs font-semibold uppercase tracking-[0.18em]"
              style={accentStyle}
            >
              {resolvedMoto}
            </p>
            <h3
              className="mt-1 text-lg font-semibold"
              style={titleStyle}
            >
              {resolvedTitle}
            </h3>
          </div>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <p
            className={cn(
              'text-sm leading-6 opacity-90',
              clampAboutText && 'line-clamp-4'
            )}
          >
            {resolvedAbout}
          </p>
          {showReadMore ? (
            <button
              type="button"
              className={cn(
                'mt-auto self-start pt-2 text-left text-xs font-semibold hover:underline',
                !brand?.accentColor && 'text-primary'
              )}
              style={accentStyle}
            >
              Read more
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
