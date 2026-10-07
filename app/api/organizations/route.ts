import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listUserOrganizations } from '@/lib/server/organization-access';

export async function GET() {
  try {
    const authClient = createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Sign in to continue.', details: null },
        { status: 401 },
      );
    }

    const organizations = await listUserOrganizations(user.id);
    return NextResponse.json({
      user: { email: user.email ?? null },
      organizations,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Service Unavailable',
        message: 'Organization access could not be loaded.',
        details: null,
      },
      { status: 503 },
    );
  }
}
