import { TenantBrandPreview } from '@/components/molecules/tenant-brand-preview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api-client';
import { tenantsService } from '@/services/tenants.service';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TenantDetailsFormState } from '../-constants';
import { QUERY_KEYS } from '../-constants';
import { Field } from '../-shared';
import {
  buildPaletteCardColors,
  diffTenantDetailsPayload,
  emptyDetailsForm,
  getErrorMessage,
  mapDetailsToForm,
} from '../-utils';

export function TenantDetailsEditor() {
  const queryClient = useQueryClient();

  const fontsQuery = useQuery({
    queryKey: QUERY_KEYS.fonts,
    queryFn: () => tenantsService.listFonts(),
  });
  const brandsQuery = useQuery({
    queryKey: QUERY_KEYS.brands,
    queryFn: () => tenantsService.listBrands(),
  });
  const detailsQuery = useQuery({
    queryKey: QUERY_KEYS.details,
    queryFn: async () => {
      try {
        return await tenantsService.getTenantDetails();
      } catch (err) {
        if (isApiError(err) && err.status === 404) return null;
        throw err;
      }
    },
  });

  const [form, setForm] = useState<TenantDetailsFormState>(
    emptyDetailsForm()
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(
    null
  );
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (detailsQuery.data === undefined) return;
    setForm(mapDetailsToForm(detailsQuery.data));
    setLogoFile(null);
    setHeroFile(null);
  }, [detailsQuery.data]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!heroFile) {
      setHeroPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(heroFile);
    setHeroPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [heroFile]);

  const selectedBrand =
    brandsQuery.data?.find((b) => b.id === form.brand_id) ?? null;
  const selectedFont =
    fontsQuery.data?.find((f) => f.id === form.font_id) ?? null;

  const saveMutation = useMutation({
    mutationFn: (
      payload: Parameters<
        typeof tenantsService.updateTenantDetails
      >[0]
    ) => tenantsService.updateTenantDetails(payload),
    onSuccess: () => {
      toast.success('Tenant details updated');
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.details,
      });
    },
    onError: (err) => {
      toast.error('Failed to update tenant details', {
        description: getErrorMessage(err),
      });
    },
  });

  const isLoading =
    fontsQuery.isLoading ||
    brandsQuery.isLoading ||
    detailsQuery.isLoading;
  const loadError =
    fontsQuery.error ?? brandsQuery.error ?? detailsQuery.error;

  const handleSave = () => {
    const payload = diffTenantDetailsPayload(
      form,
      detailsQuery.data ?? null
    );
    if (Object.keys(payload).length === 0 && !logoFile && !heroFile) {
      toast.info('No changes to save');
      return;
    }
    saveMutation.mutate({
      ...payload,
      ...(logoFile ? { logo_file: logoFile } : {}),
      ...(heroFile ? { image_file: heroFile } : {}),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
          <p className="text-muted-foreground">
            Edit logo, imagery, title, moto, brand palette, fonts, and
            about text used by the landing page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            loading={saveMutation.isPending}
            disabled={isLoading}
          >
            Save branding
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">
            {getErrorMessage(loadError)}
          </p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,35%)_minmax(0,65%)] lg:items-start">
              <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
                <Label>About Preview</Label>
                <TenantBrandPreview
                  form={{
                    title: form.title,
                    moto: form.moto,
                    aboutText: form.about_text,
                    logo: logoPreviewUrl ?? form.logo,
                    image: heroPreviewUrl ?? form.image,
                  }}
                  brand={{
                    backgroundColor:
                      selectedBrand?.brand_color_background,
                    foregroundColor:
                      selectedBrand?.brand_color_foreground,
                    borderColor: selectedBrand?.brand_color_muted,
                    accentColor:
                      selectedBrand?.brand_color_secondary ??
                      selectedBrand?.brand_color_primary,
                    headerFontFamily:
                      selectedFont?.header_font_family,
                    bodyFontFamily: selectedFont?.body_font_family,
                  }}
                  showReadMore={false}
                />
                <p className="text-xs text-muted-foreground">
                  Live preview updates as you type using the selected
                  font and brand colors.
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <Label htmlFor="tenant-logo-file">
                      Logo Image
                    </Label>
                    <Input
                      id="tenant-logo-file"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setLogoFile(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, or WebP up to 5MB.
                    </p>
                  </Field>
                  <Field>
                    <Label htmlFor="tenant-image-file">
                      Hero Image
                    </Label>
                    <Input
                      id="tenant-image-file"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setHeroFile(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, or WebP up to 5MB.
                    </p>
                  </Field>
                  <Field>
                    <Label htmlFor="tenant-moto">Moto</Label>
                    <Input
                      id="tenant-moto"
                      value={form.moto}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          moto: e.target.value,
                        }))
                      }
                      placeholder="Your health, our priority"
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="tenant-title">
                      Landing Title
                    </Label>
                    <Input
                      id="tenant-title"
                      value={form.title}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          title: e.target.value,
                        }))
                      }
                      placeholder="Bluestone Clinic"
                    />
                  </Field>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant-about">About Text</Label>
                  <textarea
                    id="tenant-about"
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-40 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    value={form.about_text}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        about_text: e.target.value,
                      }))
                    }
                    placeholder="Describe your clinic, specialties, and patient care approach..."
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">
                      Font Presets
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Click a font card to preview header and body
                      styles before saving.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(fontsQuery.data ?? []).map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          setForm((s) => ({
                            ...s,
                            font_id: font.id,
                          }))
                        }
                        className={[
                          'rounded-lg border p-4 text-left transition',
                          form.font_id === font.id
                            ? 'border-primary ring-primary/20 ring-2'
                            : 'hover:border-primary/50',
                        ].join(' ')}
                      >
                        <p className="font-medium">{font.name}</p>
                        <p
                          className="mt-2 text-base"
                          style={{
                            fontFamily: font.header_font_family,
                          }}
                        >
                          Heading Preview
                        </p>
                        <p
                          className="mt-1 text-sm text-muted-foreground"
                          style={{
                            fontFamily: font.body_font_family,
                          }}
                        >
                          Body preview for about text and content
                          sections.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {font.header_font_family} /{' '}
                          {font.body_font_family}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">
                      Brand Palettes
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Click a palette card to preview landing page
                      colors.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(brandsQuery.data ?? []).map((brand) => (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() =>
                          setForm((s) => ({
                            ...s,
                            brand_id: brand.id,
                          }))
                        }
                        className={[
                          'rounded-lg border p-4 text-left transition-all',
                          form.brand_id === brand.id
                            ? 'shadow-md -translate-y-0.5 scale-[1.01]'
                            : 'hover:border-primary/50 hover:shadow-sm',
                        ].join(' ')}
                        style={buildPaletteCardColors(
                          brand,
                          form.brand_id === brand.id
                        )}
                      >
                        <p className="font-medium">{brand.name}</p>
                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {[
                            ['P', brand.brand_color_primary],
                            ['S', brand.brand_color_secondary],
                            ['BG', brand.brand_color_background],
                            ['FG', brand.brand_color_foreground],
                            ['M', brand.brand_color_muted],
                          ].map(([label, hex]) => (
                            <div
                              key={String(label)}
                              className="space-y-1 text-center"
                            >
                              <div
                                className="h-8 rounded border"
                                style={{
                                  backgroundColor: String(hex),
                                }}
                                title={`${label}: ${hex}`}
                              />
                              <p className="text-[10px] opacity-70">
                                {label}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 space-y-1 text-[10px] opacity-75">
                          <p>Primary: {brand.brand_color_primary}</p>
                          <p>
                            Secondary: {brand.brand_color_secondary}
                          </p>
                          <p>
                            Background: {brand.brand_color_background}
                          </p>
                          <p>
                            Foreground: {brand.brand_color_foreground}
                          </p>
                          <p>Muted: {brand.brand_color_muted}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setForm(
                        mapDetailsToForm(detailsQuery.data ?? null)
                      );
                      setLogoFile(null);
                      setHeroFile(null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
