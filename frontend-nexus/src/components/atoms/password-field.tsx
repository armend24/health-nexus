import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

export interface PasswordFieldProps extends Omit<
  React.ComponentProps<typeof Input>,
  'id' | 'type'
> {
  id: string;
  label: string;
  error?: string;
  wrapperClassName?: string;
  required?: boolean;
}

const PasswordField = React.forwardRef<
  HTMLInputElement,
  PasswordFieldProps
>(
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
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className={cn('space-y-2', wrapperClassName)}>
        <Label htmlFor={id}>
          {label}
          {required && (
            <span className="text-destructive -ml-0.5" aria-hidden>
              *
            </span>
          )}
        </Label>
        <div className="relative">
          <Input
            id={id}
            ref={ref}
            type={showPassword ? 'text' : 'password'}
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn('pr-10', className)}
            required={required}
            {...inputProps}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword((p) => !p)}
            aria-label={
              showPassword ? 'Hide password' : 'Show password'
            }
          >
            {showPassword ? (
              <EyeOff className="size-4 text-muted-foreground" />
            ) : (
              <Eye className="size-4 text-muted-foreground" />
            )}
          </Button>
        </div>
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
    );
  }
);

PasswordField.displayName = 'PasswordField';

export { PasswordField };
