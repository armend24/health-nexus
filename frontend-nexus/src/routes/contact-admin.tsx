import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/contact-admin')({
  component: ContactAdminPage,
});

function ContactAdminPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Contact Admin</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            This is a mock admin contact page. Please reach out to
            your clinic administrator for enrollment assistance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
