import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  useNavigate,
} from '@tanstack/react-router';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Contract } from '@/interfaces/contract';
import { requireAuth } from '@/lib/guards/requireAuth';
import type { ReactPdfModule } from '@/lib/pdf';
import { loadReactPdfModule } from '@/lib/utils';
import {
  ContractPdfDocument,
  type ReactPdfPrimitives,
} from '@/routes/dashboard/tenant/contracts/components/-contract-pdf-document';
import { SignatureModalContent } from '@/routes/dashboard/tenant/contracts/components/-signature-modal';
import { contractsService } from '@/services/contracts.service';
import { useAuthStore } from '@/stores/auth.store';
import { useDialogStore } from '@/stores/use-dialog-store';
import { CheckIcon } from 'lucide-react';

export const Route = createFileRoute(
  '/dashboard/contract-sign-doctor/$contractId'
)({
  beforeLoad: requireAuth(),
  component: ContractSignDoctorPage,
});

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEuro(value?: string | number | null): string {
  if (value == null || value === '') return '-';
  return `€${String(value)}`;
}

function statusBadgeVariant(status: Contract['status']) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'EXPIRED') return 'secondary';
  if (status === 'TERMINATED') return 'destructive';
  return 'warning';
}

function ContractSignDoctorPage() {
  const { contractId } = Route.useParams();
  const navigate = useNavigate();
  const { open: openDialog } = useDialogStore();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const contractQuery = useQuery({
    queryKey: ['contract-detail', Number(contractId)],
    queryFn: () => contractsService.getContract(contractId),
  });
  const contract = contractQuery.data ?? null;
  const isLoading = contractQuery.isLoading;
  const errorMessage = contractQuery.isError
    ? ((contractQuery.error as Error)?.message ??
      'Failed to load contract.')
    : null;
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = React.useState(false);

  const isAssignedDoctor =
    contract != null &&
    currentUserId != null &&
    String(contract.doctor_user_id) === currentUserId;

  const canSign =
    isAssignedDoctor &&
    contract != null &&
    !contract.doctor_signed_at &&
    (contract.status === 'DRAFT' || contract.status === 'ACTIVE');

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function buildPdfPreview() {
      if (!contract) return;
      setIsPdfLoading(true);
      try {
        const reactPdf =
          await loadReactPdfModule<
            ReactPdfModule<ReactPdfPrimitives>
          >();
        const blob = await reactPdf
          .pdf(
            <ContractPdfDocument
              contract={contract}
              primitives={reactPdf as ReactPdfPrimitives}
            />
          )
          .toBlob();

        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPdfUrl(objectUrl);
      } catch {
        if (!cancelled) setPdfUrl(null);
      } finally {
        if (!cancelled) setIsPdfLoading(false);
      }
    }

    void buildPdfPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [contract]);

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Sign Contract
        </h1>
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            Loading contract...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (errorMessage || !contract) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Sign Contract
        </h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">
              {errorMessage ?? 'Contract not found.'}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate({ to: '/dashboard' })}
            >
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAssignedDoctor) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Sign Contract
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Not authorized</CardTitle>
            <CardDescription>
              Only the assigned doctor can sign this contract. If you
              believe this is an error, please contact your tenant
              manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/dashboard' })}
            >
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/dashboard"
            className="mb-2 inline-block text-sm text-muted-foreground hover:text-primary"
          >
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Sign Contract #{contract.id}
          </h1>
          <p className="text-muted-foreground">
            Review the contract below and sign as the assigned doctor.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
          <CardDescription>
            <span className="flex flex-wrap items-center gap-2">
              Doctor: {contract.doctor_name ?? 'Assigned doctor'} ·
              Tenant:{' '}
              {contract.tenant_name ?? `ID ${contract.tenant_id}`} ·
              Status:{' '}
              <Badge variant={statusBadgeVariant(contract.status)}>
                {contract.status}
              </Badge>
              · Salary: {formatEuro(contract.salary)} ·{' '}
              {formatDate(contract.start_date)} –{' '}
              {formatDate(contract.end_date)}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Assigned Doctor
              </p>
              <p className="font-medium">
                {contract.doctor_name ?? '-'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Hospital Signature
              </p>
              <p className="font-medium">
                {contract.hospital_signed_at
                  ? formatDate(contract.hospital_signed_at)
                  : 'Not signed yet'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Doctor Signature
              </p>
              <p className="font-medium">
                {contract.doctor_signed_at
                  ? formatDate(contract.doctor_signed_at)
                  : 'Pending your signature'}
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Terms
            </h3>
            <div
              className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-4"
              dangerouslySetInnerHTML={{
                __html:
                  contract.terms_content ||
                  "<p class='text-muted-foreground'>No terms specified.</p>",
              }}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Contract PDF
            </h3>
            <div className="rounded-lg border bg-muted/20 p-3">
              {isPdfLoading ? (
                <p className="text-sm text-muted-foreground">
                  Generating PDF preview...
                </p>
              ) : pdfUrl ? (
                <>
                  <iframe
                    title={`Contract #${contract.id} PDF preview`}
                    src={pdfUrl}
                    className="h-[420px] w-full rounded border bg-background"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const anchor = document.createElement('a');
                        anchor.href = pdfUrl;
                        anchor.download = `contract_${contract.id}.pdf`;
                        anchor.click();
                      }}
                    >
                      Download PDF
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  PDF preview unavailable right now. Please try
                  refreshing this page.
                </p>
              )}
            </div>
          </div>

          {contract.doctor_signed_at ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <p className="font-medium flex items-center gap-2 text-green-800 dark:text-green-200">
                <CheckIcon className="size-4" /> You have signed this
                contract on {formatDate(contract.doctor_signed_at)}.
              </p>
            </div>
          ) : canSign ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="mb-3 text-sm font-medium">
                Please sign this contract to confirm your acceptance
                of the terms.
              </p>
              <Button
                onClick={() =>
                  openDialog({
                    title: 'Sign as Doctor',
                    content: (
                      <SignatureModalContent
                        contractId={contract.id}
                        role="doctor"
                      />
                    ),
                  })
                }
              >
                Sign as Doctor
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              This contract cannot be signed at this time (status:{' '}
              {contract.status}
              ).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
