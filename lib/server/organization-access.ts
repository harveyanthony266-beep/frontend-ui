import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type AuthorizedOrganization = {
  id: string;
  name: string;
};

export type OrganizationBackendAccess = AuthorizedOrganization & {
  apiKey: string;
};

function readBackendOrganizationKeys(): Record<string, string> {
  const configured = process.env.BACKEND_ORG_API_KEYS;
  if (!configured) {
    throw new Error('Backend organization keys are not configured.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    throw new Error('Backend organization keys configuration is invalid.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backend organization keys configuration is invalid.');
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
      throw new Error('Backend organization keys configuration is invalid.');
    }
    keys[organizationId] = apiKey;
  }
  return keys;
}

export async function listUserOrganizations(
  userId: string,
): Promise<AuthorizedOrganization[]> {
  const supabase = createSupabaseAdminClient();
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId);

  if (membershipError) {
    throw new Error('Could not load organization memberships.');
  }

  const organizations: AuthorizedOrganization[] = [];
  for (const membership of memberships ?? []) {
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('id,name')
      .eq('id', membership.organization_id)
      .maybeSingle();
    if (error) {
      throw new Error('Could not load organization details.');
    }
    if (organization) {
      organizations.push({
        id: organization.id,
        name: organization.name,
      });
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
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (membershipError) {
    throw new Error('Could not verify organization membership.');
  }
  if (!membership) {
    return null;
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id,name')
    .eq('id', membership.organization_id)
    .maybeSingle();

  if (organizationError) {
    throw new Error('Could not load organization details.');
  }
  if (!organization) {
    return null;
  }

  const apiKey = readBackendOrganizationKeys()[organization.id];
  if (!apiKey) {
    throw new Error('Backend API key is not configured for this organization.');
  }

  return { id: organization.id, name: organization.name, apiKey };
}
