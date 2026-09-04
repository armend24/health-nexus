import { RefreshCw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  ActionsDropdown,
  type ActionItem,
} from '@/components/molecules/actions-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { Contract, ContractStatus } from '@/interfaces/contract';
import type { ReactPdfModule } from '@/lib/pdf';
import {
  downloadBlob,
  formatDateTime,
  loadReactPdfModule,
} from '@/lib/utils';
import { getCurrentTenantWithFallback } from '@/routes/dashboard/tenant/-utils';
import { contractsService } from '@/services/contracts.service';
import { useAuthStore } from '@/stores/auth.store';
import { useDialogStore } from '@/stores/use-dialog-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ContractDialog } from './components/-contract-dialog';
import {
  ContractPdfDocument,
  type ReactPdfPrimitives,
} from './components/-contract-pdf-document';
import { SignatureModalContent } from './components/-signature-modal';

/** Small self-contained component for the terminate reason textarea,
 * used as `content` inside the global dialog. */
function TerminateReasonContent({
  onReasonChange,
}: {
  onReasonChange: (value: string) => void;
}) {
  const [reason, setReason] = React.useState('');
  return (
    <div className="space-y-2">
      <Label htmlFor="terminate-reason">Reason</Label>
      <Textarea
        id="terminate-reason"
        rows={4}
        placeholder="Termination reason"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          onReasonChange(e.target.value);
        }}
      />
    </div>
  );
}

/**
 * Sort newest updates first so admins always see most recently touched contracts first.
 */
function sortByUpdatedDesc(contracts: Contract[]): Contract[] {
  return [...contracts].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() -
      new Date(a.updated_at).getTime()
  );
}

function getStatusVariant(
  status: ContractStatus
): React.ComponentProps<typeof Badge>['variant'] {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DRAFT':
      return 'warning';
    case 'EXPIRED':
      return 'neutral';
    case 'TERMINATED':
      return 'destructive';
    default:
      return 'default';
  }
}

/**
 * Activation requires both signatures per backend business rules.
 */
function hasBothSignatures(contract: Contract): boolean {
  return Boolean(
    contract.doctor_signed_at && contract.hospital_signed_at
  );
}

export function ContractsPage({
  tenantIdProp,
}: {
  tenantIdProp?: number | null;
} = {}) {
  const queryClient = useQueryClient();
  const tenantIdFromStore = useAuthStore((state) => state.tenantId);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const {
    data: tenant,
    isLoading: isLoadingTenant,
    isError: isErrorTenant,
    error: errorTenant,
  } = useQuery({
    queryKey: ['tenant-manager', 'current'],
    queryFn: () => getCurrentTenantWithFallback(tenantIdFromStore),
    enabled: tenantIdProp == null,
  });

  const tenantId = tenantIdProp ?? tenant?.id;

  const { open: openDialog, close: closeDialog } = useDialogStore();

  const {
    data: contracts,
    isLoading,
    refetch: refetchTenantContracts,
  } = useQuery({
    queryKey: ['tenant-contracts', tenantId],
    queryFn: () => contractsService.getContracts(tenantId as number),
    enabled: tenantId != null,
    select: sortByUpdatedDesc,
  });

  const handleCreateClick = () => {
    openDialog({
      title: 'New Contract',
      content: <ContractDialog mode="create" tenantId={tenantId} />,
    });
  };

  const handleEditClick = (contract: Contract) => {
    openDialog({
      title: 'Edit Contract',
      content: <ContractDialog mode="edit" contract={contract} />,
    });
  };

  const handleActivate = async (contract: Contract) => {
    if (!hasBothSignatures(contract)) {
      toast.error(
        'Contract cannot be activated until both signatures are present.'
      );
      return;
    }

    try {
      await contractsService.transitionContract(
        contract.id,
        'ACTIVE'
      );
      refetchTenantContracts();
      toast.success(`Contract #${contract.id} activated.`);
    } catch (error) {
      toast.error('Unable to activate contract.', {
        description: (error as Error).message,
      });
    }
  };

  const handleExpire = async (contract: Contract) => {
    try {
      await contractsService.transitionContract(
        contract.id,
        'EXPIRED'
      );
      await refetchTenantContracts();
      toast.success(`Contract #${contract.id} expired.`);
    } catch (error) {
      toast.error('Unable to expire contract.', {
        description: (error as Error).message,
      });
    }
  };

  const openSignDoctorModal = async (contract: Contract) => {
    openDialog({
      title: 'Sign as Doctor',
      content: (
        <SignatureModalContent
          contractId={contract.id}
          role="doctor"
        />
      ),
    });
  };

  const openSignHospitalModal = async (contract: Contract) => {
    openDialog({
      title: 'Sign as Hospital',
      content: (
        <SignatureModalContent
          contractId={contract.id}
          role="hospital"
        />
      ),
    });
  };

  const handleDownloadPdf = async (contract: Contract) => {
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

      downloadBlob(blob, `contract_${contract.id}.pdf`);
      toast.success(`Downloaded contract_${contract.id}.pdf`);
    } catch (error) {
      toast.error('Unable to generate PDF.', {
        description:
          (error as Error).message ||
          'Install @react-pdf/renderer and retry PDF generation.',
      });
    }
  };

  const openTerminateDialog = (contract: Contract) => {
    let reason = '';
    openDialog({
      title: 'Terminate Contract',
      content: (
        <>
          <p className="text-muted-foreground text-sm">
            Provide a termination reason for contract #{contract.id}.
          </p>
          <TerminateReasonContent
            onReasonChange={(v) => {
              reason = v;
            }}
          />
        </>
      ),
      footer: (
        <>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              const trimmed = reason.trim();
              if (!trimmed) {
                toast.error('Termination reason is required.');
                return;
              }
              try {
                await contractsService.transitionContract(
                  contract.id,
                  'TERMINATED',
                  trimmed
                );
                await queryClient.invalidateQueries({
                  queryKey: ['tenant-contracts'],
                });
                toast.success(`Contract #${contract.id} terminated.`);
                closeDialog();
              } catch (error) {
                toast.error('Unable to terminate contract.', {
                  description: (error as Error).message,
                });
              }
            }}
          >
            Terminate
          </Button>
        </>
      ),
    });
  };

  const handleCopyDoctorSignLink = (contract: Contract) => {
    if (contract.doctor_signed_at) {
      toast.info('Doctor has already signed this contract.');
      return;
    }
    const url = `${window.location.origin}/dashboard/contract-sign-doctor/${contract.id}`;
    void navigator.clipboard.writeText(url).then(
      () =>
        toast.success('Link copied. Send it to the doctor to sign.'),
      () => toast.error('Failed to copy link.')
    );
  };

  const getActions = (contract: Contract): ActionItem[] => {
    const actions: ActionItem[] = [];

    if (contract.status === 'DRAFT' || contract.status === 'ACTIVE') {
      actions.push({
        label: 'Edit',
        onClick: () => handleEditClick(contract),
      });

      const isCurrentUserDoctor =
        currentUserId != null &&
        String(contract.doctor_user_id) === currentUserId;
      if (isCurrentUserDoctor && !contract.doctor_signed_at) {
        actions.push({
          label: 'Sign Doctor',
          onClick: () => void openSignDoctorModal(contract),
        });
      }

      if (!contract.doctor_signed_at) {
        actions.push({
          label: 'Copy link for doctor to sign',
          onClick: () => handleCopyDoctorSignLink(contract),
        });
      }

      if (!contract.hospital_signed_at) {
        actions.push({
          label: 'Sign Hospital',
          onClick: () => void openSignHospitalModal(contract),
        });
      }
    }

    if (contract.status === 'DRAFT') {
      // We still show Activate for discoverability, but keep it disabled until both signatures exist.
      actions.push({
        label: 'Activate',
        disabled: !hasBothSignatures(contract),
        onClick: () => {
          void handleActivate(contract);
        },
      });
    }

    if (contract.status === 'ACTIVE') {
      actions.push({
        label: 'Expire',
        onClick: () => {
          void handleExpire(contract);
        },
      });
    }

    if (contract.status === 'DRAFT' || contract.status === 'ACTIVE') {
      actions.push({
        label: 'Terminate',
        variant: 'destructive',
        onClick: () => openTerminateDialog(contract),
      });
    }

    actions.push({
      label: 'Download PDF',
      onClick: () => {
        void handleDownloadPdf(contract);
      },
    });

    return actions;
  };

  if (tenantIdProp == null) {
    if (isLoadingTenant || (tenantId == null && !isErrorTenant)) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <h1 className="text-2xl font-bold sm:text-3xl">
            Contracts
          </h1>
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Loading tenant context...
            </CardContent>
          </Card>
        </div>
      );
    }

    if (isErrorTenant || tenantId == null) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <h1 className="text-2xl font-bold sm:text-3xl">
            Contracts
          </h1>
          <Card>
            <CardContent className="pt-6 text-destructive">
              Failed to load tenant context. You may not be authorized
              as a tenant manager, or no tenant is assigned to your
              account.
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Contracts</h1>
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            Loading contracts...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorTenant ? (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {errorTenant.message}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Contracts
            </h1>
            <p className="text-muted-foreground">
              Manage doctor contracts, signatures, transitions, and
              exports.
            </p>
            <CardDescription>
              {contracts?.length} contract
              {contracts?.length === 1 ? '' : 's'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                void refetchTenantContracts().then(() =>
                  toast.success('Contracts refreshed.')
                )
              }
              disabled={isLoadingTenant}
              title="Refresh"
            >
              <RefreshCw
                className={`size-4 ${isLoadingTenant ? 'animate-spin' : ''}`}
              />
              <span className="sr-only">Refresh</span>
            </Button>
            <Button onClick={handleCreateClick}>New Contract</Button>
          </div>
        </CardHeader>
        <CardContent>
          {contracts?.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No contracts yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Doctor Signed</TableHead>
                    <TableHead>Hospital Signed</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts?.map((contract) => {
                    const actions = getActions(contract);

                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="text-muted-foreground">
                          {contract.doctor_name ?? 'Assigned doctor'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusVariant(
                              contract.status
                            )}
                          >
                            {contract.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contract.salary} €
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(contract.start_date)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(contract.end_date)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contract.doctor_signed_at
                            ? formatDateTime(
                                contract.doctor_signed_at
                              )
                            : 'No'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contract.hospital_signed_at
                            ? formatDateTime(
                                contract.hospital_signed_at
                              )
                            : 'No'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(contract.updated_at)}
                        </TableCell>
                        <TableCell>
                          {actions.length > 0 ? (
                            <div className="flex justify-end">
                              <ActionsDropdown
                                actions={actions}
                                trigger="icon"
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
