'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type WorkspaceOrganization = {
  id: string;
  name: string;
};

type WorkspaceContextValue = {
  organizations: WorkspaceOrganization[];
  organizationId: string;
  organization: WorkspaceOrganization | null;
  email: string;
  status: 'loading' | 'unselected' | 'verifying' | 'ready' | 'error';
  error: string;
  selectOrganization: (id: string) => void;
  refreshOrganizations: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function readError(response: Response): Promise<string> {
  try {
    const result = await response.json();
    return typeof result.message === 'string'
      ? result.message
      : 'The request could not be completed.';
  } catch {
    return 'The request could not be completed.';
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<WorkspaceOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] =
    useState<WorkspaceContextValue['status']>('loading');
  const [error, setError] = useState('');

  const refreshOrganizations = useCallback(async () => {
    setStatus('loading');
    setError('');
    const response = await fetch('/api/organizations', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      setOrganizations([]);
      setOrganizationId('');
      setStatus('error');
      setError(await readError(response));
      return;
    }

    const result: {
      user: { email: string | null };
      organizations: WorkspaceOrganization[];
    } = await response.json();
    const allowedOrganizations = Array.isArray(result.organizations)
      ? result.organizations
      : [];
    setOrganizations(allowedOrganizations);
    setEmail(result.user?.email ?? '');
    const savedId =
      typeof window === 'undefined'
        ? ''
        : window.sessionStorage.getItem('active-organization-id') ?? '';
    const selected = allowedOrganizations.find((item) => item.id === savedId)
      ?? allowedOrganizations[0];
    if (selected) {
      setOrganizationId(selected.id);
      window.sessionStorage.setItem('active-organization-id', selected.id);
      setStatus('verifying');
    } else {
      setOrganizationId('');
      setStatus('unselected');
      window.sessionStorage.removeItem('active-organization-id');
    }
  }, []);

  const selectOrganization = useCallback(
    (id: string) => {
      const authorized = organizations.some((organization) => organization.id === id);
      if (!authorized) {
        setError('You do not have access to that organization.');
        setStatus('error');
        return;
      }
      setOrganizationId(id);
      window.sessionStorage.setItem('active-organization-id', id);
      setError('');
      setStatus('verifying');
    },
    [organizations],
  );

  useEffect(() => {
    void refreshOrganizations();
  }, [refreshOrganizations]);

  useEffect(() => {
    if (!organizationId || status !== 'verifying') return;
    let active = true;
    const verify = async () => {
      const response = await fetch('/api/backend/me', {
        headers: { 'x-organization-id': organizationId },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!active) return;
      if (!response.ok) {
        setError(await readError(response));
        setStatus('error');
        return;
      }
      const result: { organization_name?: string } = await response.json();
      const current = organizations.find((item) => item.id === organizationId);
      if (!current || result.organization_name !== current.name) {
        setError('The backend organization does not match this membership.');
        setStatus('error');
        return;
      }
      setStatus('ready');
    };
    void verify().catch(() => {
      if (active) {
        setError('Could not verify access to the selected organization.');
        setStatus('error');
      }
    });
    return () => {
      active = false;
    };
  }, [organizationId, organizations, status]);

  const organization = organizations.find((item) => item.id === organizationId) ?? null;
  const value = useMemo(
    () => ({
      organizations,
      organizationId,
      organization,
      email,
      status,
      error,
      selectOrganization,
      refreshOrganizations,
    }),
    [
      organizations,
      organizationId,
      organization,
      email,
      status,
      error,
      selectOrganization,
      refreshOrganizations,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  }
  return value;
}
