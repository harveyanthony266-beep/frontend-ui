export const SERVER_ORG_API_KEY = 'server-org-key-do-not-leak';
export const AUTHORIZED_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

export async function listUserOrganizations() {
  return [{ id: AUTHORIZED_ORGANIZATION_ID, name: 'Acme' }];
}

export async function authorizeOrganization(userId, organizationId) {
  if (userId !== 'user-1' || organizationId !== AUTHORIZED_ORGANIZATION_ID) return null;
  return {
    id: organizationId,
    name: 'Acme',
    apiKey: SERVER_ORG_API_KEY,
  };
}
