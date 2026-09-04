import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import * as React from 'react';

export interface FormFieldProps extends Omit<
  React.ComponentProps<typeof Input>,
  'id'
> {
  id: string;
  label: string;
  error?: string;
  wrapperClassName?: string;
  required?: boolean;
}

const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      id,
      label,
      error,
      wrapperClassName,
      className,
      required,
      ...inputProps
    },
    ref
  ) => (
    <div className={cn('space-y-2', wrapperClassName)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive -ml-0.5" aria-hidden>
            *
          </span>
        )}
      </Label>
      <Input
        id={id}
        ref={ref}
        aria-invalid={!!error}
        aria-required={required}
        aria-describedby={error ? `${id}-error` : undefined}
        className={className}
        required={required}
        {...inputProps}
      />
      {error && (
        <p
          id={`${id}-error`}
          className="text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
);

FormField.displayName = 'FormField';

export { FormField };
