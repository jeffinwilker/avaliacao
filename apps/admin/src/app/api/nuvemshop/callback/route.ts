import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Callback do OAuth da Nuvemshop.
// Doc: https://tiendanube.github.io/api-documentation/authentication
//
// A Nuvemshop redireciona para cá com ?code=... e nós trocamos por access_token.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/integration?error=missing_code", req.url)
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
      new URL("/integration?error=token_exchange", req.url)
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
      new URL(`/integration?error=${encodeURIComponent(error.message)}`, req.url)
    );
  }

  await admin.from("store_settings").upsert(
    { store_id: store.id },
    { onConflict: "store_id" }
  );

  return NextResponse.redirect(new URL("/integration?connected=1", req.url));
}
