export const REVIEW_STATUS = ["pending", "approved", "rejected"] as const;
export const PLATFORMS = ["nuvemshop", "tray", "custom"] as const;
export const CHANNELS = ["email", "whatsapp"] as const;
export const MEDIA_TYPES = ["image", "video"] as const;

export const MAX_RATING = 5;
export const MIN_RATING = 1;

export const STORAGE_BUCKET = "review-media";
export const KIT_STORAGE_BUCKET = "kit-media";

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

export const DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE = `Oi {{nome}}! 👋

Vimos que você deixou *{{produtos}}* no carrinho da {{loja}}.

Seu carrinho ainda está disponível. Para continuar a compra, acesse:
{{link}}

Se precisar de ajuda, é só responder esta mensagem. 💛`;

export const DEFAULT_ABANDONED_CART_SEQUENCE = [
  {
    id: "step-1",
    delayMinutes: 480,
    messageTemplate: DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
    enabled: true,
  },
];

export const DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE = `Oi {{nome}}! 💛

Recebemos seu pedido *#{{pedido}}* na {{loja}} com: {{produtos}}.

Estamos preparando tudo com carinho. Se precisar falar com a gente, é só responder esta mensagem.`;
