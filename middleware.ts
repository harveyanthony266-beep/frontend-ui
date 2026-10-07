import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const isAuthCallback =
    request.nextUrl.pathname === '/auth/callback';
  const hasInviteCallback =
    request.nextUrl.searchParams.has('code') ||
    (request.nextUrl.searchParams.has('token_hash') &&
      request.nextUrl.searchParams.get('type') === 'invite');
  if (hasInviteCallback && !isAuthCallback) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = '/auth/callback';
    return NextResponse.rewrite(callbackUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'Authentication is not configured.',
          details: null,
        },
        { status: 503 },
      );
    }
    if (request.nextUrl.pathname !== '/login') {
      return new NextResponse('Authentication is not configured.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const isLoginRoute = request.nextUrl.pathname === '/login';

  if (!user && !isApiRoute && !isLoginRoute && !isAuthCallback) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (user && isLoginRoute) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
