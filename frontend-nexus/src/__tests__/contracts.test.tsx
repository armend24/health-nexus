import { jest } from '@jest/globals';
import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Contract } from '@/interfaces/contract';
import * as ContractsPageModule from '@/routes/dashboard/tenant/contracts/index';
import { contractsService } from '@/services/contracts.service';
import { useAuthStore } from '@/stores/auth.store';

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function setTenantContext(tenantId: string) {
  useAuthStore.setState((state) => ({
    ...state,
    tenantId,
  }));
}

function makeContract(overrides: Partial<Contract>): Contract {
  return {
    id: 100,
    tenant_id: 1,
    doctor_user_id: 77,
    status: 'DRAFT',
    salary: '12000',
    terms_content: '<p>Default terms</p>',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    activated_at: null,
    expires_at: null,
    terms_metadata: null,
    terminated_reason: null,
    doctor_signed_at: null,
    doctor_signature: null,
    hospital_signed_at: null,
    hospital_signature: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ContractsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTenantContext('1');
  });

  it('DRAFT without both signatures keeps Activate hidden/disabled', async () => {
    const unsignedDraft = makeContract({
      status: 'DRAFT',
    });

    const getContractsSpy = jest
      .spyOn(contractsService, 'getContracts')
      .mockResolvedValue([unsignedDraft]);
    const transitionSpy = jest.spyOn(
      contractsService,
      'transitionContract'
    );

    const user = userEvent.setup();
    render(<ContractsPageModule.ContractsPage />);

    await screen.findByText(
      'Doctor booking eligibility: 0 eligible / 1 not eligible'
    );

    const row = screen
      .getByText(String(unsignedDraft.doctor_user_id))
      .closest('tr');
    expect(row).not.toBeNull();

    await user.click(
      within(row as HTMLTableRowElement).getByRole('button', {
        name: /open menu/i,
      })
    );

    const activateItem = screen.getByRole('menuitem', {
      name: 'Activate',
    });
    expect(activateItem).toHaveAttribute('data-disabled');

    // Disabled action must not trigger transition calls.
    await user.click(activateItem);
    expect(transitionSpy).not.toHaveBeenCalled();
    getContractsSpy.mockRestore();
    transitionSpy.mockRestore();
  });

  it('after doctor + hospital signatures, Activate appears enabled and ACTIVE updates eligibility banner', async () => {
    const draftUnsigned = makeContract({
      id: 201,
      doctor_user_id: 501,
      status: 'DRAFT',
      doctor_signed_at: null,
      hospital_signed_at: null,
    });

    const draftDoctorSigned = makeContract({
      ...draftUnsigned,
      doctor_signed_at: '2026-01-05T10:00:00.000Z',
      doctor_signature: '/uploads/doctor-sign-201.png',
    });

    const draftFullySigned = makeContract({
      ...draftDoctorSigned,
      hospital_signed_at: '2026-01-06T10:00:00.000Z',
      hospital_signature: '/uploads/hospital-sign-201.png',
    });

    const activeEligible = makeContract({
      ...draftFullySigned,
      status: 'ACTIVE',
      activated_at: '2026-01-07T10:00:00.000Z',
      updated_at: '2026-01-07T10:00:00.000Z',
    });

    // Contract list refreshes after each action, so we return staged backend states.
    const getContractsSpy = jest
      .spyOn(contractsService, 'getContracts')
      .mockResolvedValueOnce([draftUnsigned])
      .mockResolvedValueOnce([draftDoctorSigned])
      .mockResolvedValueOnce([draftFullySigned])
      .mockResolvedValueOnce([activeEligible])
      .mockResolvedValue([activeEligible]);

    const signDoctorSpy = jest
      .spyOn(contractsService, 'signDoctor')
      .mockResolvedValue(draftDoctorSigned);
    const signHospitalSpy = jest
      .spyOn(contractsService, 'signHospital')
      .mockResolvedValue(draftFullySigned);
    const transitionSpy = jest
      .spyOn(contractsService, 'transitionContract')
      .mockResolvedValue(activeEligible);

    const user = userEvent.setup();
    render(<ContractsPageModule.ContractsPage />);

    await screen.findByText(
      'Doctor booking eligibility: 0 eligible / 1 not eligible'
    );

    const row = screen
      .getByText(String(draftUnsigned.doctor_user_id))
      .closest('tr');
    expect(row).not.toBeNull();

    await user.click(
      within(row as HTMLTableRowElement).getByRole('button', {
        name: /open menu/i,
      })
    );
    await user.click(
      screen.getByRole('menuitem', {
        name: 'Sign Doctor',
      })
    );

    await waitFor(() => {
      expect(signDoctorSpy).toHaveBeenCalledWith(
        draftUnsigned.id,
        expect.any(File)
      );
    });

    await user.click(
      within(row as HTMLTableRowElement).getByRole('button', {
        name: /open menu/i,
      })
    );
    await user.click(
      screen.getByRole('menuitem', {
        name: 'Sign Hospital',
      })
    );

    await waitFor(() => {
      expect(signHospitalSpy).toHaveBeenCalledWith(
        draftUnsigned.id,
        expect.any(File)
      );
    });

    await user.click(
      within(row as HTMLTableRowElement).getByRole('button', {
        name: /open menu/i,
      })
    );

    const activateItem = screen.getByRole('menuitem', {
      name: 'Activate',
    });
    expect(activateItem).not.toHaveAttribute('data-disabled');
    await user.click(activateItem);

    await waitFor(() => {
      expect(transitionSpy).toHaveBeenCalledWith(
        draftUnsigned.id,
        'ACTIVE'
      );
      expect(
        screen.getByText(
          'Doctor booking eligibility: 1 eligible / 0 not eligible'
        )
      ).toBeInTheDocument();
    });

    getContractsSpy.mockRestore();
    signDoctorSpy.mockRestore();
    signHospitalSpy.mockRestore();
    transitionSpy.mockRestore();
  });
});
