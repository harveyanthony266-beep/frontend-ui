import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const callbackUrl = new URL('/login?invite=invalid', request.url);
  const response = NextResponse.redirect(callbackUrl);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) return response;

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return response;
  } else if (tokenHash && type === 'invite') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'invite',
    });
    if (error) return response;
  } else {
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return response;

  response.headers.set(
    'location',
    new URL('/set-password', request.url).toString(),
  );
  return response;
}
