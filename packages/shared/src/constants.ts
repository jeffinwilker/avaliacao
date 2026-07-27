export const REVIEW_STATUS = ["pending", "approved", "rejected"] as const;
export const PLATFORMS = ["nuvemshop", "tray", "custom"] as const;
export const CHANNELS = ["email", "whatsapp"] as const;
export const MEDIA_TYPES = ["image", "video"] as const;

export const MAX_RATING = 5;
export const MIN_RATING = 1;

export const STORAGE_BUCKET = "review-media";

export const DEFAULT_EMAIL_TEMPLATE = `Olá {{nome}},

Esperamos que você esteja gostando do seu {{produto}}!

Sua opinião é muito importante pra gente — e ajuda outros clientes a escolherem melhor.

Conta pra gente o que achou clicando no link abaixo:

{{link}}

Obrigado!
Equipe {{loja}}`;

export const DEFAULT_WHATSAPP_TEMPLATE = `Oi {{nome}}! 👋

Aqui é da {{loja}}. Vimos que você comprou *{{produto}}* — esperamos que esteja amando!

Conta pra gente o que achou? Leva só 1 minutinho:
{{link}}

Obrigado! 💛`;
