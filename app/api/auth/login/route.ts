import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Enter a valid email and password.', details: null },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('email' in body) ||
    !('password' in body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    !body.email.trim() ||
    !body.password
  ) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Enter a valid email and password.', details: null },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email.trim(),
      password: body.password,
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Email or password is incorrect.', details: null },
        { status: 401 },
      );
    }
    return NextResponse.json({ user: { email: data.user.email ?? null } });
  } catch {
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Sign-in is temporarily unavailable.', details: null },
      { status: 503 },
    );
  }
}
