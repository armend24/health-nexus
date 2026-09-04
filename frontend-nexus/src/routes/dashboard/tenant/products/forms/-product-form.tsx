import { FormField } from '@/components/atoms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolveMediaUrl } from '@/lib/media-url';
import {
  getProductCategoryLabel,
  PRODUCT_CATEGORY_OPTIONS,
} from '@/lib/product-categories';
import { Switch } from '@/components/ui/switch';
import { isApiError } from '@/lib/api-client';
import {
  useCreateProduct,
  useUpdateProduct,
  type Product,
} from '@/services/products.service';
import { useDialogStore } from '@/stores/use-dialog-store';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  productSchema,
  toProductPayload,
  type ProductFormValues,
} from '../schemas/-product-form.schema';

interface ProductFormProps {
  mode: 'create' | 'edit';
  tenantId: number;
  product?: Product;
}

export function ProductForm({
  mode,
  tenantId,
  product,
}: ProductFormProps) {
  const closeDialog = useDialogStore((state) => state.close);
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const isPending =
    createMutation.isPending || updateMutation.isPending;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(
    null
  );
  const [clearImage, setClearImage] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);
  const currentImagePreview =
    clearImage && !imagePreviewUrl
      ? null
      : imagePreviewUrl ?? resolveMediaUrl(product?.image_url);

  const onSubmit = (values: ProductFormValues) => {
    const payload = toProductPayload(values);
    if (mode === 'edit' && product) {
      updateMutation.mutate(
        {
          productId: product.product_id,
          payload: {
            ...payload,
            ...(imageFile ? { image_file: imageFile } : {}),
            ...(clearImage ? { clear_image: true } : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success('Product updated');
            closeDialog();
          },
          onError: (err) => {
            toast.error('Failed to update product', {
              description: isApiError(err)
                ? err.displayMessage
                : 'Request failed',
            });
          },
        }
      );
      return;
    }

    createMutation.mutate(
      {
        ...payload,
        tenant_id: tenantId,
        ...(imageFile ? { image_file: imageFile } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Product created');
          closeDialog();
        },
        onError: (err) => {
          toast.error('Failed to create product', {
            description: isApiError(err)
              ? err.displayMessage
              : 'Request failed',
          });
        },
      }
    );
  };

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? '',
      category: product?.category ?? '',
      price: String(product?.price ?? ''),
      stock_quantity: String(product?.stock_quantity ?? '0'),
      description: product?.description ?? '',
      is_available: product?.is_available !== false,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {mode === 'edit'
          ? 'Update product details for this tenant.'
          : 'Create a new product for this tenant.'}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          id="product-name"
          label="Name"
          placeholder="Vitamin D Supplement"
          required
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          id="product-price"
          label="Price"
          placeholder="25.00"
          inputMode="decimal"
          required
          error={errors.price?.message}
          {...register('price')}
        />
        <FormField
          id="product-stock"
          label="Stock Quantity"
          placeholder="0"
          inputMode="numeric"
          error={errors.stock_quantity?.message}
          {...register('stock_quantity')}
        />
        <div className="space-y-2">
          <Label htmlFor="product-category">Category</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value?.trim().toLowerCase() || 'NONE'}
                onValueChange={(value) =>
                  field.onChange(value === 'NONE' ? '' : value)
                }
              >
                <SelectTrigger
                  id="product-category"
                  className="w-full"
                  aria-invalid={!!errors.category}
                >
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">
                    No category
                  </SelectItem>
                  {field.value &&
                  field.value.trim() &&
                  !PRODUCT_CATEGORY_OPTIONS.some(
                    (option) =>
                      option.value ===
                      field.value.trim().toLowerCase()
                  ) ? (
                    <SelectItem
                      value={field.value.trim().toLowerCase()}
                    >
                      {getProductCategoryLabel(field.value)}
                    </SelectItem>
                  ) : null}
                  {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.category?.message ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.category.message}
            </p>
          ) : null}
        </div>
        <FormField
          id="product-description"
          label="Description"
          placeholder="Daily supplement"
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="product-image-upload">Product Image</Label>
          <Input
            id="product-image-upload"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setImageFile(file);
              if (file) setClearImage(false);
            }}
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or WebP up to 5MB.
          </p>
          {currentImagePreview ? (
            <div className="space-y-2">
              <div className="h-28 w-28 overflow-hidden rounded-lg border bg-muted/30">
                <img
                  src={currentImagePreview}
                  alt={product?.name ?? 'Product preview'}
                  className="h-full w-full object-cover"
                />
              </div>
              {mode === 'edit' && product?.image_url ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setImageFile(null);
                    setClearImage(true);
                    setImagePreviewUrl(null);
                  }}
                >
                  Remove image
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Controller
          name="is_available"
          control={control}
          render={({ field }) => (
            <label className="inline-flex items-center gap-3 text-sm md:col-span-2">
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              Available in shop
            </label>
          )}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={closeDialog}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" loading={isPending}>
          {mode === 'edit' ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
