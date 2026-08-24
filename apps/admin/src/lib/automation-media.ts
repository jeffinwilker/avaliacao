import {
  AUTOMATION_STORAGE_BUCKET,
  type AutomationMediaAsset,
} from "@avaliacoes/shared";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function listAutomationMedia(
  admin: AdminClient,
  storeId: string
): Promise<AutomationMediaAsset[]> {
  const { data, error } = await admin.storage
    .from(AUTOMATION_STORAGE_BUCKET)
    .list(storeId, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error || !data) return [];
  return data.flatMap((file) => {
    if (!file.name || !file.id) return [];
    const path = `${storeId}/${file.name}`;
    const { data: publicUrl } = admin.storage
      .from(AUTOMATION_STORAGE_BUCKET)
      .getPublicUrl(path);
    return [{
      name: displayFileName(file.name),
      url: publicUrl.publicUrl,
      path,
      mimeType: inferImageMimeType(file.name),
    }];
  });
}

export function displayFileName(value: string): string {
  return value.replace(/^[0-9a-f-]{36}--/i, "");
}

export function inferImageMimeType(value: string): string {
  const clean = value.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
