"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WhatsAppChatSummary,
  WhatsAppMessageView,
} from "@/lib/evolution-chat";

export function WhatsAppConversations() {
  const [chats, setChats] = useState<WhatsAppChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessageView[]>([]);
  const [search, setSearch] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const chatsRunning = useRef(false);
  const messagesRequestId = useRef(0);
  const messagesViewport = useRef<HTMLDivElement>(null);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedId) ?? null,
    [chats, selectedId]
  );
  const filteredChats = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return chats;
    return chats.filter((chat) =>
      [chat.name, chat.phone, chat.lastMessage]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("pt-BR").includes(query)
        )
    );
  }, [chats, search]);

  const loadChats = useCallback(async (silent = false) => {
    if (chatsRunning.current) return;
    chatsRunning.current = true;
    if (!silent) setLoadingChats(true);
    try {
      const response = await fetch("/api/whatsapp/chats", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as {
        chats?: WhatsAppChatSummary[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || "Não foi possível carregar as conversas"
        );
      }
      const nextChats = Array.isArray(result.chats) ? result.chats : [];
      setChats(nextChats);
      setSelectedId((current) =>
        current && nextChats.some((chat) => chat.id === current)
          ? current
          : nextChats[0]?.id ?? null
      );
      setChatError(null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (!silent) {
        setChatError(
          error instanceof Error ? error.message : "Não foi possível carregar as conversas"
        );
      }
    } finally {
      chatsRunning.current = false;
      if (!silent) setLoadingChats(false);
    }
  }, []);

  const loadMessages = useCallback(async (jid: string, silent = false) => {
    const requestId = ++messagesRequestId.current;
    if (!silent) setLoadingMessages(true);
    try {
      const response = await fetch(
        `/api/whatsapp/messages?jid=${encodeURIComponent(jid)}`,
        { cache: "no-store" }
      );
      const result = (await response.json().catch(() => ({}))) as {
        messages?: WhatsAppMessageView[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || "Não foi possível carregar as mensagens"
        );
      }
      if (requestId !== messagesRequestId.current) return;
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setMessageError(null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (!silent && requestId === messagesRequestId.current) {
        setMessageError(
          error instanceof Error ? error.message : "Não foi possível carregar as mensagens"
        );
      }
    } finally {
      if (!silent && requestId === messagesRequestId.current) {
        setLoadingMessages(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadChats();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadChats(true);
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadChats]);

  useEffect(() => {
    if (!selectedId) {
      messagesRequestId.current += 1;
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setMessages([]);
    void loadMessages(selectedId);
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadMessages(selectedId, true);
      }
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (loadingMessages || !selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = messagesViewport.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadingMessages, selectedId]);

  return (
    <div className="space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Conversas do WhatsApp</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Consulte as mensagens da instância conectada sem enviar respostas pelo painel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600">
            Somente leitura
          </span>
          <button
            type="button"
            onClick={() => void loadChats()}
            disabled={loadingChats}
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loadingChats ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {chatError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {chatError}
        </div>
      )}

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className={`${selectedChat ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-zinc-200`}
        >
          <div className="border-b border-zinc-200 p-4">
            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-500 focus-within:border-zinc-400 focus-within:bg-white">
              <SearchIcon />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, telefone ou mensagem"
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingChats && !chats.length ? (
              <ConversationSkeleton />
            ) : filteredChats.length ? (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => setSelectedId(chat.id)}
                  className={`flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left transition hover:bg-zinc-50 ${
                    selectedId === chat.id ? "bg-zinc-100" : "bg-white"
                  }`}
                >
                  <ContactAvatar name={chat.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {chat.name}
                      </span>
                      <span className="flex-none text-[11px] text-zinc-400">
                        {formatListTime(chat.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      {chat.lastMessageFromMe && <span className="text-zinc-400">Você:</span>}
                      <span className="truncate">{chat.lastMessage || "Sem prévia"}</span>
                      {chat.unreadCount > 0 && (
                        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold text-white">
                          {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <EmptyConversations hasSearch={Boolean(search.trim())} />
            )}
          </div>

          <div className="border-t border-zinc-200 px-4 py-2.5 text-center text-[11px] text-zinc-400">
            {lastUpdatedAt
              ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Atualização automática ativa"}
          </div>
        </aside>

        <main className={`${selectedChat ? "flex" : "hidden lg:flex"} min-w-0 flex-col bg-[#efeae2]`}>
          {selectedChat ? (
            <>
              <header className="flex h-[72px] items-center gap-3 border-b border-zinc-200 bg-white px-4">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 lg:hidden"
                  aria-label="Voltar para as conversas"
                >
                  <BackIcon />
                </button>
                <ContactAvatar name={selectedChat.name} small />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {selectedChat.name}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {selectedChat.phone || "Contato protegido pelo WhatsApp"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadMessages(selectedChat.id)}
                  disabled={loadingMessages}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Atualizar
                </button>
              </header>

              <div
                ref={messagesViewport}
                className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8"
              >
                <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(#9a948b_0.7px,transparent_0.7px)] [background-size:16px_16px]" />
                <div className="relative mx-auto flex max-w-4xl flex-col gap-2">
                  {messageError && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                      {messageError}
                    </div>
                  )}
                  {loadingMessages && !messages.length ? (
                    <MessageSkeleton />
                  ) : messages.length ? (
                    messages.map((message, index) => {
                      const previous = messages[index - 1];
                      const showDay = !previous || dayKey(previous.sentAt) !== dayKey(message.sentAt);
                      return (
                        <Fragment key={message.id}>
                          {showDay && <DayDivider date={message.sentAt} />}
                          <MessageBubble
                            message={message}
                            onOpenImage={setPreviewImage}
                          />
                        </Fragment>
                      );
                    })
                  ) : (
                    <div className="mx-auto mt-24 max-w-md rounded-xl border border-white/80 bg-white/90 p-5 text-center shadow-sm">
                      <div className="text-sm font-semibold text-zinc-800">
                        Nenhuma mensagem salva nesta conversa
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        A Evolution mostrará aqui as mensagens que estiverem disponíveis no histórico da instância.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <footer className="border-t border-zinc-200 bg-white px-4 py-3 text-center text-xs text-zinc-500">
                Visualização somente leitura · para responder, use o WhatsApp conectado.
              </footer>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-zinc-700 shadow-sm">
                  <ChatIcon />
                </div>
                <h2 className="mt-4 text-base font-semibold text-zinc-800">
                  Selecione uma conversa
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  O histórico aparecerá aqui sem permitir envios pelo painel.
                </p>
              </div>
            </div>
          )}
        </main>
      </section>
      {previewImage && (
        <ImagePreview
          src={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onOpenImage,
}: {
  message: WhatsAppMessageView;
  onOpenImage: (src: string) => void;
}) {
  const hasImage = Boolean(message.mediaUrl);
  const showText = !hasImage || !["Imagem", "Figurinha", "Mensagem"].includes(message.text);
  return (
    <div className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-xl p-1.5 shadow-sm sm:max-w-[72%] ${
          message.fromMe ? "rounded-tr-sm bg-[#d9fdd3]" : "rounded-tl-sm bg-white"
        }`}
      >
        {message.mediaUrl && (
          <MessageImage
            src={message.mediaUrl}
            alt={message.mediaKind === "sticker" ? "Figurinha recebida" : "Imagem da conversa"}
            onOpen={() => onOpenImage(message.mediaUrl!)}
          />
        )}
        {showText && (
          <div className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[13px] leading-5 text-zinc-800">
            {message.text}
          </div>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 px-1 text-[10px] text-zinc-400">
          <span>{formatMessageTime(message.sentAt)}</span>
          {message.fromMe && <span>{statusMark(message.status)}</span>}
        </div>
      </div>
    </div>
  );
}

function MessageImage({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="grid min-h-28 min-w-48 place-items-center rounded-lg bg-zinc-100 px-5 py-4 text-center text-xs text-zinc-500">
        Esta imagem não está mais disponível na Evolution.
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block max-w-full overflow-hidden rounded-lg bg-zinc-100"
      aria-label="Abrir imagem em tamanho maior"
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-80 w-auto max-w-full object-contain transition hover:brightness-95"
      />
    </button>
  );
}

function ImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Imagem da conversa"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
        aria-label="Fechar imagem"
      >
        ×
      </button>
      <img
        src={src}
        alt="Imagem ampliada da conversa"
        className="max-h-[90vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function ContactAvatar({ name, small = false }: { name: string; small?: boolean }) {
  const initial = name.trim()[0]?.toUpperCase() || "C";
  return (
    <span
      className={`grid flex-none place-items-center rounded-full bg-zinc-200 font-semibold text-zinc-600 ${
        small ? "h-10 w-10 text-sm" : "h-11 w-11 text-sm"
      }`}
    >
      {initial}
    </span>
  );
}

function EmptyConversations({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="text-sm font-semibold text-zinc-700">
        {hasSearch ? "Nenhuma conversa encontrada" : "Nenhuma conversa disponível"}
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        {hasSearch
          ? "Tente buscar por outro nome ou telefone."
          : "A Evolution precisa estar salvando o histórico para que as mensagens apareçam aqui."}
      </p>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-zinc-100">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="flex gap-3 px-4 py-4">
          <div className="h-11 w-11 rounded-full bg-zinc-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-zinc-200" />
            <div className="h-2.5 w-5/6 rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-16 w-3/5 rounded-xl bg-white/80" />
      <div className="ml-auto h-20 w-2/3 rounded-xl bg-[#d9fdd3]/80" />
      <div className="h-12 w-2/5 rounded-xl bg-white/80" />
    </div>
  );
}

function DayDivider({ date }: { date: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-lg bg-white/90 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 shadow-sm">
        {formatDay(date)}
      </span>
    </div>
  );
}

function formatListTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (dayKey(value) === dayKey(today.toISOString())) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(yesterday.toISOString())) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (dayKey(value) === dayKey(today.toISOString())) return "Hoje";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(yesterday.toISOString())) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function dayKey(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function statusMark(status: string | null): string {
  const normalized = status?.toUpperCase() ?? "";
  if (normalized === "READ" || normalized === "PLAYED") return "✓✓";
  if (normalized === "DELIVERY_ACK") return "✓✓";
  if (normalized === "ERROR") return "!";
  return "✓";
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.6-4.3A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  );
}
