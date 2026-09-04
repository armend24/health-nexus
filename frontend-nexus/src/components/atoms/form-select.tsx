import * as React from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FormSelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps {
  id: string;
  label: string;
  options: FormSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
  'aria-invalid'?: boolean;
}

export const FormSelect = React.forwardRef<
  HTMLButtonElement,
  FormSelectProps
>(
  (
    {
      id,
      label,
      options,
      value,
      onValueChange,
      placeholder = 'Select…',
      disabled = false,
      error,
      helperText,
      wrapperClassName,
      triggerClassName,
      contentClassName,
      'aria-invalid': ariaInvalid,
    },
    ref
  ) => {
    return (
      <div className={cn('w-full space-y-2', wrapperClassName)}>
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        >
          <SelectTrigger
            ref={ref}
            id={id}
            className={cn('w-full', triggerClassName)}
            aria-invalid={ariaInvalid ?? !!error}
            aria-describedby={
              error
                ? `${id}-error`
                : helperText
                  ? `${id}-helper`
                  : undefined
            }
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className={cn('max-h-72', contentClassName)}
          >
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p
            id={`${id}-error`}
            className="text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            id={`${id}-helper`}
            className="text-xs text-muted-foreground"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

FormSelect.displayName = 'FormSelect';
