import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json(
        { error: 'Service Unavailable', message: 'Sign-out could not be completed.', details: null },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Sign-out is temporarily unavailable.', details: null },
      { status: 503 },
    );
  }
}
