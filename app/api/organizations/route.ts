import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  logOrganizationAccessFailure,
  listUserOrganizations,
  OrganizationAccessError,
} from '@/lib/server/organization-access';

export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new OrganizationAccessError(
        'missing_environment_variable',
        'Supabase URL is not configured.',
        { variable: 'NEXT_PUBLIC_SUPABASE_URL' },
      );
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new OrganizationAccessError(
        'missing_environment_variable',
        'Supabase Auth is not configured.',
        { variable: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      );
    }
    const authClient = createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      if (authError) {
        logOrganizationAccessFailure(
          new OrganizationAccessError(
            'supabase_query_failed',
            'Supabase user authentication lookup failed.',
            {
              query: 'auth.getUser',
              supabaseCode: authError.code ?? 'unknown',
              supabaseMessage: authError.message,
            },
          ),
        );
      }
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
  } catch (error) {
    logOrganizationAccessFailure(error);
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
