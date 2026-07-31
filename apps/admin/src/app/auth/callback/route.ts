import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Usa NEXT_PUBLIC_APP_URL em vez do origin do request pra evitar redirect
// pro host interno (localhost:PORT) quando está atrás de proxy reverso.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${APP_URL}${next}`);
  }

  return NextResponse.redirect(`${APP_URL}/login?error=auth`);
}
