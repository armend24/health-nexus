import { z } from 'zod';
import { nullIfBlank } from '../../-utils';

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  category: z.string().optional(),
  price: z
    .string()
    .min(1, 'Price is required')
    .refine(
      (v) => Number.isFinite(Number(v)),
      'Price must be a valid number'
    ),
  stock_quantity: z
    .string()
    .refine(
      (v) => Number.isInteger(Number(v)),
      'Stock quantity must be an integer'
    ),
  description: z.string().optional(),
  is_available: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export function toProductPayload(values: ProductFormValues) {
  return {
    name: values.name.trim(),
    description: nullIfBlank(values.description ?? ''),
    category: nullIfBlank(values.category ?? ''),
    price: Number(values.price),
    stock_quantity: Number(values.stock_quantity),
    is_available: values.is_available,
  };
}
