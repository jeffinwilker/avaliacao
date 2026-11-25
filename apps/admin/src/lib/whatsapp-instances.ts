import {
  evolutionRequest,
  parseEvolutionConnection,
  type EvolutionConnectionData,
} from "@/lib/evolution";
import type { WhatsAppAccessibleInstance } from "@/lib/whatsapp-routing";

export interface WhatsAppInstanceStatus extends WhatsAppAccessibleInstance {
  state: EvolutionConnectionData["state"];
  qrCode: string | null;
  pairingCode: string | null;
  error: string | null;
}

export async function instanceStatus(
  instance: WhatsAppAccessibleInstance,
  options: { includeQr?: boolean } = {}
): Promise<WhatsAppInstanceStatus> {
  if (!instance.active) {
    return {
      ...instance,
      state: "close",
      qrCode: null,
      pairingCode: null,
      error: "Telefone desativado nas configurações",
    };
  }

  try {
    const payload = await evolutionRequest(
      `instance/connectionState/${encodeURIComponent(instance.instanceName)}`
    );
    const connection = parseEvolutionConnection(payload);
    return { ...instance, ...connection, error: null };
  } catch (error) {
    if (options.includeQr) {
      try {
        const payload = await evolutionRequest(
          `instance/connect/${encodeURIComponent(instance.instanceName)}`
        );
        const connection = parseEvolutionConnection(payload);
        return { ...instance, ...connection, error: null };
      } catch {
        // Mantém o erro original, que normalmente explica melhor a indisponibilidade.
      }
    }
    return {
      ...instance,
      state: "unknown",
      qrCode: null,
      pairingCode: null,
      error: (error as Error).message,
    };
  }
}
