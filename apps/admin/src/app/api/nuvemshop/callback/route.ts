import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerAutomationWebhooks } from "@/lib/nuvemshop-webhooks";

// Callback do OAuth da Nuvemshop.
// Doc: https://tiendanube.github.io/api-documentation/authentication
//
// A Nuvemshop redireciona para cá com ?code=... e nós trocamos por access_token.

// Usa a env pública em vez de req.url pra evitar redirect pro host interno
// (localhost:3002) quando está atrás de um reverse proxy.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", APP_URL));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/integration?error=missing_code", APP_URL)
    );
  }

  const clientId = process.env.NUVEMSHOP_CLIENT_ID;
  const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/integration?error=missing_credentials", req.url)
    );
  }

  // 1) trocar code por access_token
  const tokenRes = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL("/integration?error=token_exchange", APP_URL)
    );
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    user_id: number;
    scope: string;
  };

  const externalStoreId = String(tokenJson.user_id);

  // 2) buscar dados da loja
  const storeRes = await fetch(
    `https://api.tiendanube.com/v1/${externalStoreId}/store`,
    {
      headers: {
        "Authentication": `bearer ${tokenJson.access_token}`,
        "User-Agent": "Avaliacoes (contato@exemplo.com)",
      },
    }
  );
  const storeJson = (await storeRes.json()) as {
    name: { pt?: string; es?: string; en?: string };
    url?: string;
  };

  const name =
    storeJson?.name?.pt ?? storeJson?.name?.es ?? storeJson?.name?.en ?? "Minha loja";

  // 3) salvar
  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from("stores")
    .upsert(
      {
        external_store_id: externalStoreId,
        access_token: tokenJson.access_token,
        name,
        domain: storeJson.url ?? null,
        platform: "nuvemshop",
      },
      { onConflict: "platform,external_store_id" }
    )
    .select("id")
    .single();

  if (error) {
    return NextResponse.redirect(
      new URL(`/integration?error=${encodeURIComponent(error.message)}`, APP_URL)
    );
  }

  await admin.from("store_settings").upsert(
    { store_id: store.id },
    { onConflict: "store_id" }
  );

  if (APP_URL.startsWith("https://")) {
    const webhookUrl = `${APP_URL.replace(/\/$/, "")}/api/nuvemshop/webhook`;
    await registerAutomationWebhooks({
      storeId: externalStoreId,
      token: tokenJson.access_token,
      webhookUrl,
    });
  }

  return NextResponse.redirect(new URL("/integration?connected=1", APP_URL));
}
