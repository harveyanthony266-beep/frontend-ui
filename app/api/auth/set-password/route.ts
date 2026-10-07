import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Enter a valid password.' },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('password' in body) ||
    typeof body.password !== 'string' ||
    body.password.length < 8
  ) {
    return NextResponse.json(
      { message: 'Your password must be at least 8 characters.' },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { message: 'This invitation is invalid or has expired. Ask your administrator to send a new one.' },
        { status: 401 },
      );
    }

    const { error } = await supabase.auth.updateUser({
      password: body.password,
    });
    if (error) {
      return NextResponse.json(
        { message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { message: 'Password setup is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
