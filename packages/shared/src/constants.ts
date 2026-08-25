export const REVIEW_STATUS = ["pending", "approved", "rejected"] as const;
export const PLATFORMS = ["nuvemshop", "tray", "custom"] as const;
export const CHANNELS = ["email", "whatsapp"] as const;
export const MEDIA_TYPES = ["image", "video"] as const;

export const MAX_RATING = 5;
export const MIN_RATING = 1;

export const STORAGE_BUCKET = "review-media";
export const KIT_STORAGE_BUCKET = "kit-media";
export const AUTOMATION_STORAGE_BUCKET = "automation-media";
export const PRODUCT_REELS_STORAGE_BUCKET = "product-reels";

export const DEFAULT_EMAIL_TEMPLATE = `Olá {{nome}},

Esperamos que você esteja gostando do seu {{produto}}!

Sua opinião é muito importante pra gente — e ajuda outros clientes a escolherem melhor.

Conta pra gente o que achou clicando no link abaixo:

{{link_avaliacao}}

Obrigado!
Equipe {{loja}}`;

export const DEFAULT_WHATSAPP_TEMPLATE = `Oi {{nome}}! 👋

Aqui é da {{loja}}. Vimos que você comprou *{{produto}}* — esperamos que esteja amando!

Conta pra gente o que achou? Leva só 1 minutinho:
{{link_avaliacao}}

Obrigado! 💛`;

export const DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE = `Oi {{nome}}! 👋

Vimos que você deixou *{{produtos}}* no carrinho da {{loja}}.

Seu carrinho ainda está disponível. Para continuar a compra, acesse:
{{link_carrinho}}

Se precisar de ajuda, é só responder esta mensagem. 💛`;

export const DEFAULT_ABANDONED_CART_SEQUENCE = [
  {
    id: "step-1",
    delayMinutes: 480,
    messageTemplate: DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
    enabled: true,
    attachmentType: "none" as const,
    attachmentUrl: null,
    couponEnabled: false,
    couponType: "percentage" as const,
    couponValue: 10,
    couponValidHours: 48,
    couponMinPrice: null,
  },
];

export const DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE = `Oi {{nome}}! 💛

Recebemos seu pedido *#{{pedido}}* na {{loja}} com: {{produtos}}.

Estamos preparando tudo com carinho. Se precisar falar com a gente, é só responder esta mensagem.`;

export const DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE = `Oi {{nome}}!

Queremos te mandar um cupom especial no seu aniversário.

Cadastre sua data por aqui:
{{link_aniversario}}

É rapidinho.`;

export const DEFAULT_POST_SALE_SEQUENCE = [
  {
    id: "order_created" as const,
    delayMinutes: 0,
    messageTemplate: DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "order_paid" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! ✅\n\nO pagamento do pedido *#{{pedido}}* foi confirmado. Já vamos começar a preparar seus produtos.`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "order_packed" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! 📦\n\nSeu pedido *#{{pedido}}* já foi separado e está pronto para seguir viagem.`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "order_fulfilled" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! 🚚\n\nSeu pedido *#{{pedido}}* foi enviado.\n\nCódigo de rastreio: *{{codigo_rastreio}}*\nAcompanhe a entrega: {{link_rastreio}}`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "tracking_in_transit" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! 🚚\n\nSeu pedido *#{{pedido}}* está em trânsito.\n\nAcompanhe aqui: {{link_rastreio}}`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "tracking_out_for_delivery" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! 🏠\n\nSeu pedido *#{{pedido}}* saiu para entrega. Fique de olho: ele deve chegar em breve!`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "tracking_ready_for_pickup" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! 📍\n\nSeu pedido *#{{pedido}}* está disponível para retirada. Consulte os detalhes aqui: {{link_rastreio}}`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "tracking_delivered" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}! 💛\n\nSeu pedido *#{{pedido}}* foi entregue. Esperamos que você ame seus produtos!`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "tracking_delayed" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}!\n\nRecebemos uma atualização de que a entrega do pedido *#{{pedido}}* sofreu um atraso. Você pode acompanhar por aqui: {{link_rastreio}}`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
  {
    id: "tracking_delivery_attempt_failed" as const,
    delayMinutes: 0,
    messageTemplate: `Oi {{nome}}!\n\nHouve uma tentativa de entrega do pedido *#{{pedido}}*. Confira o rastreio para ver a próxima atualização: {{link_rastreio}}`,
    enabled: false,
    attachmentType: "none" as const,
    attachmentUrl: null,
  },
];
