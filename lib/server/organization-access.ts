import 'server-only';

import { createHash } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type AuthorizedOrganization = {
  id: string;
  name: string;
};

export type OrganizationBackendAccess = AuthorizedOrganization & {
  apiKey: string;
};

type OrganizationAccessReason =
  | 'no_membership'
  | 'org_not_found'
  | 'no_key_for_org'
  | 'key_map_invalid'
  | 'supabase_query_failed'
  | 'missing_environment_variable'
  | 'backend_url_invalid'
  | 'organization_access_unexpected';

export class OrganizationAccessError extends Error {
  constructor(
    readonly reasonCode: OrganizationAccessReason,
    message: string,
    readonly details: {
      variable?: string;
      query?: string;
      supabaseCode?: string;
      supabaseMessage?: string;
    } = {},
  ) {
    super(message);
    this.name = 'OrganizationAccessError';
  }
}

function knownSecrets(): string[] {
  const secrets = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ].filter((value): value is string => Boolean(value));
  const configured = process.env.BACKEND_ORG_API_KEYS;
  if (configured) {
    try {
      const parsed: unknown = JSON.parse(configured);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const value of Object.values(parsed)) {
          if (typeof value === 'string' && value) {
            secrets.push(value);
          }
        }
      }
    } catch {
      return secrets;
    }
  }
  return secrets
    .flatMap((secret) => [
      secret,
      createHash('sha256').update(secret).digest('hex'),
    ])
    .sort((left, right) => right.length - left.length);
}

function redact(value: string): string {
  return knownSecrets().reduce(
    (safe, secret) => safe.split(secret).join('[REDACTED]'),
    value,
  );
}

export function logOrganizationAccessFailure(error: unknown): void {
  const accessError =
    error instanceof OrganizationAccessError
      ? error
      : new OrganizationAccessError(
          'organization_access_unexpected',
          'Organization access lookup failed.',
        );
  const { variable, query, supabaseCode, supabaseMessage } = accessError.details;
  console.error(
    JSON.stringify({
      event: 'organization_access_failed',
      reason_code: accessError.reasonCode,
      ...(variable ? { variable } : {}),
      ...(query ? { query } : {}),
      ...(supabaseCode ? { supabase_error_code: redact(supabaseCode) } : {}),
      ...(supabaseMessage
        ? { supabase_error_message: redact(supabaseMessage) }
        : {}),
    }),
  );
}

function requireAdminSupabaseConfig(): void {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new OrganizationAccessError(
      'missing_environment_variable',
      'Supabase URL is not configured.',
      { variable: 'NEXT_PUBLIC_SUPABASE_URL' },
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new OrganizationAccessError(
      'missing_environment_variable',
      'Supabase administration is not configured.',
      { variable: 'SUPABASE_SERVICE_ROLE_KEY' },
    );
  }
}

function queryFailure(query: string, error: { code: string; message: string }) {
  return new OrganizationAccessError(
    'supabase_query_failed',
    'Organization access lookup failed.',
    {
      query,
      supabaseCode: error.code,
      supabaseMessage: error.message,
    },
  );
}

function readBackendOrganizationKeys(): Record<string, string> {
  const configured = process.env.BACKEND_ORG_API_KEYS;
  if (!configured) {
    throw new OrganizationAccessError(
      'missing_environment_variable',
      'Backend organization keys are not configured.',
      { variable: 'BACKEND_ORG_API_KEYS' },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    throw new OrganizationAccessError(
      'key_map_invalid',
      'Backend organization keys configuration is invalid.',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OrganizationAccessError(
      'key_map_invalid',
      'Backend organization keys configuration is invalid.',
    );
  }

  const keys: Record<string, string> = {};
  for (const [organizationId, apiKey] of Object.entries(parsed)) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        organizationId,
      ) ||
      typeof apiKey !== 'string' ||
      !apiKey.trim()
    ) {
      throw new OrganizationAccessError(
        'key_map_invalid',
        'Backend organization keys configuration is invalid.',
      );
    }
    keys[organizationId] = apiKey;
  }
  return keys;
}

export async function listUserOrganizations(
  userId: string,
): Promise<AuthorizedOrganization[]> {
  requireAdminSupabaseConfig();
  const supabase = createSupabaseAdminClient();
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId);

  if (membershipError) {
    throw queryFailure('organization_memberships.select_for_user', membershipError);
  }
  if (!memberships?.length) {
    logOrganizationAccessFailure(
      new OrganizationAccessError(
        'no_membership',
        'The authenticated user has no organization memberships.',
        { query: 'organization_memberships.select_for_user' },
      ),
    );
  }

  const organizations: AuthorizedOrganization[] = [];
  for (const membership of memberships ?? []) {
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('id,name')
      .eq('id', membership.organization_id)
      .maybeSingle();
    if (error) {
      throw queryFailure('organizations.select_by_membership', error);
    }
    if (organization) {
      organizations.push({
        id: organization.id,
        name: organization.name,
      });
    } else {
      logOrganizationAccessFailure(
        new OrganizationAccessError(
          'org_not_found',
          'The organization referenced by a membership does not exist.',
          { query: 'organizations.select_by_membership' },
        ),
      );
    }
  }

  return organizations;
}

export async function authorizeOrganization(
  userId: string,
  organizationId: string,
): Promise<OrganizationBackendAccess | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    logOrganizationAccessFailure(
      new OrganizationAccessError(
        'org_not_found',
        'The selected organization ID is invalid.',
      ),
    );
    return null;
  }

  requireAdminSupabaseConfig();
  const supabase = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (membershipError) {
    throw queryFailure('organization_memberships.select_for_user_and_org', membershipError);
  }
  if (!membership) {
    logOrganizationAccessFailure(
      new OrganizationAccessError(
        'no_membership',
        'The authenticated user has no membership for the selected organization.',
        { query: 'organization_memberships.select_for_user_and_org' },
      ),
    );
    return null;
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id,name')
    .eq('id', membership.organization_id)
    .maybeSingle();

  if (organizationError) {
    throw queryFailure('organizations.select_by_id', organizationError);
  }
  if (!organization) {
    logOrganizationAccessFailure(
      new OrganizationAccessError(
        'org_not_found',
        'The selected organization does not exist.',
        { query: 'organizations.select_by_id' },
      ),
    );
    return null;
  }

  const apiKey = readBackendOrganizationKeys()[organization.id];
  if (!apiKey) {
    throw new OrganizationAccessError(
      'no_key_for_org',
      'Backend API key is not configured for this organization.',
    );
  }

  return { id: organization.id, name: organization.name, apiKey };
}
