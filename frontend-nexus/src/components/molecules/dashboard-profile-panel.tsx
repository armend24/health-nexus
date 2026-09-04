import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { isApiError } from '@/lib/api-client';
import {
  patientsService,
  type PatientProfileRead,
  type PatientProfileUpdate,
} from '@/services/patients.service';
import {
  usersService,
  type UserRead,
} from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type NexusFormValues = {
  first_name: string;
  last_name: string;
  contact: string;
  address: string;
  email: string;
};

type PatientFormValues = {
  birthdate: string;
  gender: string;
  blood_type: string;
};

const NONE_VALUE = '__none__';
const GENDER_OPTIONS = [
  'male',
  'female',
  'other',
  'prefer_not_to_say',
];
const BLOOD_TYPE_OPTIONS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toDateInput(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value.slice(0, 10);
}

function toNexusForm(user: UserRead): NexusFormValues {
  return {
    first_name: toText(user.first_name),
    last_name: toText(user.last_name),
    contact: toText(user.contact),
    address: toText(user.address),
    email: toText(user.email),
  };
}

function toPatientForm(
  profile: PatientProfileRead
): PatientFormValues {
  return {
    birthdate: toDateInput(profile.birthdate),
    gender: toText(profile.gender),
    blood_type: toText(profile.blood_type),
  };
}

export function DashboardProfilePanel() {
  const navigate = useNavigate();
  const activeTenantId = useAuthStore((state) => state.tenantId);
  const [nexusForm, setNexusForm] = useState<NexusFormValues>({
    first_name: '',
    last_name: '',
    contact: '',
    address: '',
    email: '',
  });
  const [nexusInitial, setNexusInitial] =
    useState<NexusFormValues | null>(null);

  const [selectedTenantId, setSelectedTenantId] =
    useState<string>('');
  const [patientForm, setPatientForm] = useState<PatientFormValues>({
    birthdate: '',
    gender: '',
    blood_type: '',
  });
  const [patientInitial, setPatientInitial] =
    useState<PatientFormValues | null>(null);

  const meQuery = useQuery({
    queryKey: ['users-me-profile-panel'],
    queryFn: usersService.getMe,
    retry: false,
  });

  const tenantMembershipsQuery = useQuery({
    queryKey: ['patient-my-tenants'],
    queryFn: patientsService.listMyTenants,
    retry: false,
  });

  useEffect(() => {
    if (!meQuery.data) return;
    const mapped = toNexusForm(meQuery.data);
    setNexusForm(mapped);
    setNexusInitial(mapped);
  }, [meQuery.data]);

  useEffect(() => {
    if (
      !tenantMembershipsQuery.data ||
      tenantMembershipsQuery.data.length === 0
    )
      return;
    if (!selectedTenantId) {
      const matchingTenant = tenantMembershipsQuery.data.find(
        (tenant) => String(tenant.tenant_id) === activeTenantId
      );
      setSelectedTenantId(
        String(
          matchingTenant?.tenant_id ??
            tenantMembershipsQuery.data[0]!.tenant_id
        )
      );
    }
  }, [
    activeTenantId,
    selectedTenantId,
    tenantMembershipsQuery.data,
  ]);

  const patientProfileQuery = useQuery({
    queryKey: ['patient-profile', selectedTenantId],
    queryFn: () =>
      patientsService.getMyTenantProfile(Number(selectedTenantId)),
    enabled: Boolean(selectedTenantId),
    retry: false,
  });

  useEffect(() => {
    if (!patientProfileQuery.data) return;
    const mapped = toPatientForm(patientProfileQuery.data);
    setPatientForm(mapped);
    setPatientInitial(mapped);
  }, [patientProfileQuery.data]);

  const saveNexusMutation = useMutation({
    mutationFn: usersService.updateMe,
    onSuccess: (data) => {
      const mapped = toNexusForm(data);
      setNexusForm(mapped);
      setNexusInitial(mapped);
      toast.success('Profile updated');
    },
    onError: (err) => {
      toast.error('Failed to update profile', {
        description: isApiError(err)
          ? err.displayMessage
          : 'Please try again.',
      });
    },
  });

  const savePatientMutation = useMutation({
    mutationFn: (payload: PatientProfileUpdate) =>
      patientsService.updateMyTenantProfile(
        Number(selectedTenantId),
        payload
      ),
    onSuccess: (data) => {
      const mapped = toPatientForm(data);
      setPatientForm(mapped);
      setPatientInitial(mapped);
      toast.success('Profile updated');
    },
    onError: (err) => {
      toast.error('Failed to update profile', {
        description: isApiError(err)
          ? err.displayMessage
          : 'Please try again.',
      });
    },
  });

  const nexusDirty = useMemo(() => {
    if (!nexusInitial) return false;
    return (
      nexusForm.first_name !== nexusInitial.first_name ||
      nexusForm.last_name !== nexusInitial.last_name ||
      nexusForm.contact !== nexusInitial.contact ||
      nexusForm.address !== nexusInitial.address
    );
  }, [nexusForm, nexusInitial]);

  const patientDirty = useMemo(() => {
    if (!patientInitial) return false;
    return (
      patientForm.birthdate !== patientInitial.birthdate ||
      patientForm.gender !== patientInitial.gender ||
      patientForm.blood_type !== patientInitial.blood_type
    );
  }, [patientForm, patientInitial]);

  const onSaveNexus = () => {
    if (!nexusInitial) return;
    const payload: Parameters<typeof usersService.updateMe>[0] = {};
    if (nexusForm.first_name !== nexusInitial.first_name)
      payload.first_name = nexusForm.first_name;
    if (nexusForm.last_name !== nexusInitial.last_name)
      payload.last_name = nexusForm.last_name;
    if (nexusForm.contact !== nexusInitial.contact)
      payload.contact = nexusForm.contact;
    if (nexusForm.address !== nexusInitial.address)
      payload.address = nexusForm.address;

    if (Object.keys(payload).length === 0) return;
    saveNexusMutation.mutate(payload);
  };

  const onSavePatient = () => {
    if (!patientInitial || !selectedTenantId) return;
    const payload: PatientProfileUpdate = {};
    if (patientForm.birthdate !== patientInitial.birthdate) {
      payload.birthdate = patientForm.birthdate || null;
    }
    if (patientForm.gender !== patientInitial.gender) {
      payload.gender = patientForm.gender || null;
    }
    if (patientForm.blood_type !== patientInitial.blood_type) {
      payload.blood_type = patientForm.blood_type || null;
    }

    if (Object.keys(payload).length === 0) return;
    savePatientMutation.mutate(payload);
  };

  const patientNotRegistered =
    isApiError(patientProfileQuery.error) &&
    (patientProfileQuery.error.status === 403 ||
      patientProfileQuery.error.status === 404);

  const selectedTenant = tenantMembershipsQuery.data?.find(
    (tenant) => String(tenant.tenant_id) === selectedTenantId
  );

  const genderSelectValue = patientForm.gender || NONE_VALUE;
  const bloodTypeSelectValue = patientForm.blood_type || NONE_VALUE;
  const genderChoices =
    patientForm.gender && !GENDER_OPTIONS.includes(patientForm.gender)
      ? [...GENDER_OPTIONS, patientForm.gender]
      : GENDER_OPTIONS;
  const bloodTypeChoices =
    patientForm.blood_type &&
    !BLOOD_TYPE_OPTIONS.includes(patientForm.blood_type)
      ? [...BLOOD_TYPE_OPTIONS, patientForm.blood_type]
      : BLOOD_TYPE_OPTIONS;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="nexus-profile" className="space-y-4">
        <TabsList variant="line" className="grid w-full grid-cols-2">
          <TabsTrigger value="nexus-profile">
            Nexus Profile
          </TabsTrigger>
          <TabsTrigger value="patient-profile">
            Patient Profile
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nexus-profile" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Nexus Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-first-name">
                    First name
                  </Label>
                  <Input
                    id="profile-first-name"
                    value={nexusForm.first_name}
                    onChange={(event) =>
                      setNexusForm((prev) => ({
                        ...prev,
                        first_name: event.target.value,
                      }))
                    }
                    disabled={meQuery.isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last-name">Last name</Label>
                  <Input
                    id="profile-last-name"
                    value={nexusForm.last_name}
                    onChange={(event) =>
                      setNexusForm((prev) => ({
                        ...prev,
                        last_name: event.target.value,
                      }))
                    }
                    disabled={meQuery.isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  value={nexusForm.email}
                  readOnly
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-contact">Contact</Label>
                <Input
                  id="profile-contact"
                  value={nexusForm.contact}
                  onChange={(event) =>
                    setNexusForm((prev) => ({
                      ...prev,
                      contact: event.target.value,
                    }))
                  }
                  disabled={meQuery.isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-address">Address</Label>
                <Input
                  id="profile-address"
                  value={nexusForm.address}
                  onChange={(event) =>
                    setNexusForm((prev) => ({
                      ...prev,
                      address: event.target.value,
                    }))
                  }
                  disabled={meQuery.isLoading}
                />
              </div>

              {meQuery.isError ? (
                <p className="text-sm text-destructive">
                  {isApiError(meQuery.error)
                    ? meQuery.error.displayMessage
                    : 'Failed to load profile.'}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button
                  onClick={onSaveNexus}
                  loading={saveNexusMutation.isPending}
                  disabled={
                    !nexusDirty ||
                    meQuery.isLoading ||
                    saveNexusMutation.isPending
                  }
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patient-profile" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Patient Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patient-tenant-select">Tenant</Label>
                <Select
                  value={selectedTenantId}
                  onValueChange={setSelectedTenantId}
                >
                  <SelectTrigger id="patient-tenant-select">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenantMembershipsQuery.data ?? []).map(
                      (tenant) => (
                        <SelectItem
                          key={tenant.tenant_id}
                          value={String(tenant.tenant_id)}
                        >
                          {tenant.name}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {tenantMembershipsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading tenants...
                </p>
              ) : null}

              {tenantMembershipsQuery.isError ? (
                <p className="text-sm text-destructive">
                  {isApiError(tenantMembershipsQuery.error)
                    ? tenantMembershipsQuery.error.displayMessage
                    : 'Failed to load tenant memberships.'}
                </p>
              ) : null}

              {!tenantMembershipsQuery.isLoading &&
              !tenantMembershipsQuery.isError &&
              (tenantMembershipsQuery.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You do not have tenant memberships available for
                  patient profile updates.
                </p>
              ) : null}

              {selectedTenantId && patientProfileQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading patient profile...
                </p>
              ) : null}

              {selectedTenantId && patientNotRegistered ? (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm">
                    You are not registered as a patient in this
                    tenant.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate({
                        to: '/landing/$tenantSlug',
                        params: {
                          tenantSlug: String(
                            selectedTenant?.tenant_id ??
                              selectedTenantId
                          ),
                        },
                      })
                    }
                  >
                    Go to tenant page to register
                  </Button>
                </div>
              ) : null}

              {selectedTenantId &&
              patientProfileQuery.isError &&
              !patientNotRegistered ? (
                <p className="text-sm text-destructive">
                  {isApiError(patientProfileQuery.error)
                    ? patientProfileQuery.error.displayMessage
                    : 'Failed to load patient profile.'}
                </p>
              ) : null}

              {selectedTenantId &&
              !patientProfileQuery.isLoading &&
              !patientProfileQuery.isError &&
              patientProfileQuery.data ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="patient-birthdate">
                      Birthdate
                    </Label>
                    <Input
                      id="patient-birthdate"
                      type="date"
                      value={patientForm.birthdate}
                      onChange={(event) =>
                        setPatientForm((prev) => ({
                          ...prev,
                          birthdate: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patient-gender">Gender</Label>
                    <Select
                      value={genderSelectValue}
                      onValueChange={(value) =>
                        setPatientForm((prev) => ({
                          ...prev,
                          gender: value === NONE_VALUE ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="patient-gender">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>
                          Not specified
                        </SelectItem>
                        {genderChoices.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patient-blood-type">
                      Blood type
                    </Label>
                    <Select
                      value={bloodTypeSelectValue}
                      onValueChange={(value) =>
                        setPatientForm((prev) => ({
                          ...prev,
                          blood_type:
                            value === NONE_VALUE ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="patient-blood-type">
                        <SelectValue placeholder="Select blood type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>
                          Not specified
                        </SelectItem>
                        {bloodTypeChoices.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={onSavePatient}
                      loading={savePatientMutation.isPending}
                      disabled={
                        !patientDirty || savePatientMutation.isPending
                      }
                    >
                      Save
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
