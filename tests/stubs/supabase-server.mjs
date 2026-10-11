export function getSupabaseConfig() {
  return { url: 'http://127.0.0.1', anonKey: 'test-anon-key' };
}

export function createSupabaseServerClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null };
      },
    },
  };
}

export function createSupabaseAdminClient() {
  throw new Error('Admin client is not used by the upload proxy test.');
}
