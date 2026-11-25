"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WhatsAppChatSummary,
  WhatsAppMessageView,
} from "@/lib/evolution-chat";

type ClientMessage = WhatsAppMessageView & {
  localState?: "sending" | "sent" | "failed";
  localFile?: File | null;
  localText?: string;
};

interface WhatsAppInstanceOption {
  id: string;
  label: string;
  phoneNumber: string | null;
  sectorId: string | null;
  sectorName: string;
  state: "open" | "close" | "connecting" | "unknown";
  active: boolean;
  available: boolean;
  error: string | null;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const QUICK_EMOJIS = ["😊", "😍", "👍", "🙏", "🎉", "❤️", "😂", "👏"];

export function WhatsAppConversations() {
  const [chats, setChats] = useState<WhatsAppChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [instances, setInstances] = useState<WhatsAppInstanceOption[]>([]);
  const [routingAvailable, setRoutingAvailable] = useState(false);
  const [conversationUnavailable, setConversationUnavailable] = useState(false);
  const [currentInstance, setCurrentInstance] = useState<{
    id: string;
    label: string;
    sectorName: string;
    state: string;
    active: boolean;
  } | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [connectionQr, setConnectionQr] = useState<{
    title: string;
    qrCode: string | null;
    pairingCode: string | null;
    state: string;
  } | null>(null);
  const chatsRunning = useRef(false);
  const messagesRequestId = useRef(0);
  const messagesViewport = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const localImageUrls = useRef(new Set<string>());

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedId) ?? null,
    [chats, selectedId]
  );
  const transferTargets = useMemo(
    () =>
      instances.filter(
        (instance) =>
          instance.available && instance.id !== selectedChat?.instanceId
      ),
    [instances, selectedChat?.instanceId]
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
        instances?: WhatsAppInstanceOption[];
        routingAvailable?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || "Não foi possível carregar as conversas"
        );
      }
      const nextChats = Array.isArray(result.chats) ? result.chats : [];
      setChats(nextChats);
      setInstances(Array.isArray(result.instances) ? result.instances : []);
      setRoutingAvailable(result.routingAvailable === true);
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

  const loadMessages = useCallback(async (chat: WhatsAppChatSummary, silent = false) => {
    const requestId = ++messagesRequestId.current;
    if (!silent) setLoadingMessages(true);
    try {
      const query = routingAvailable
        ? `conversationId=${encodeURIComponent(chat.id)}`
        : `jid=${encodeURIComponent(chat.remoteJid || chat.id)}`;
      const response = await fetch(
        `/api/whatsapp/messages?${query}`,
        { cache: "no-store" }
      );
      const result = (await response.json().catch(() => ({}))) as {
        messages?: WhatsAppMessageView[];
        unavailable?: boolean;
        currentInstance?: {
          id: string;
          label: string;
          sectorName: string;
          state: string;
          active: boolean;
        };
        historyWarnings?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || "Não foi possível carregar as mensagens"
        );
      }
      if (requestId !== messagesRequestId.current) return;
      const remoteMessages = Array.isArray(result.messages) ? result.messages : [];
      setMessages((current) => mergeMessages(remoteMessages, current));
      setConversationUnavailable(result.unavailable === true);
      setCurrentInstance(result.currentInstance ?? null);
      setRecoveryError(null);
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
  }, [routingAvailable]);

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
      setConversationUnavailable(false);
      setCurrentInstance(null);
      setRecoveryOpen(false);
      return;
    }
    setMessages([]);
    setDraft("");
    setComposerError(null);
    setEmojiOpen(false);
    setSelectedImage((current) => {
      if (current) releaseLocalImage(current.previewUrl, localImageUrls.current);
      return null;
    });
    if (!selectedChat) return;
    void loadMessages(selectedChat);
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadMessages(selectedChat, true);
      }
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [loadMessages, selectedId, selectedChat?.instanceId, selectedChat?.remoteJid]);

  useEffect(() => {
    if (loadingMessages || !selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = messagesViewport.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadingMessages, messages.length, selectedId]);

  useEffect(() => {
    const urls = localImageUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  function chooseImage(file: File | null) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setComposerError("Escolha uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setComposerError("A imagem pode ter no máximo 10 MB.");
      return;
    }
    setSelectedImage((current) => {
      if (current) releaseLocalImage(current.previewUrl, localImageUrls.current);
      const previewUrl = URL.createObjectURL(file);
      localImageUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setComposerError(null);
  }

  function removeSelectedImage() {
    setSelectedImage((current) => {
      if (current) releaseLocalImage(current.previewUrl, localImageUrls.current);
      return null;
    });
  }

  function insertEmoji(emoji: string) {
    const input = composerInput.current;
    if (!input) {
      setDraft((current) => `${current}${emoji}`);
      return;
    }
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? start;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const input = composerInput.current;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const selected = draft.slice(start, end);
    const next = `${draft.slice(0, start)}${prefix}${selected}${suffix}${draft.slice(end)}`;
    setDraft(next);
    window.requestAnimationFrame(() => {
      input.focus();
      const cursor = selected
        ? end + prefix.length + suffix.length
        : start + prefix.length;
      input.setSelectionRange(cursor, cursor);
    });
  }

  async function submitOutgoing(input: {
    text: string;
    file?: File | null;
    previewUrl?: string | null;
    existingId?: string;
    clearComposer?: boolean;
  }) {
    if (!selectedId || !selectedChat || sending || conversationUnavailable) return;
    const text = input.text.trim();
    const file = input.file ?? null;
    if (!text && !file) return;

    const temporaryId = input.existingId || `local:${crypto.randomUUID()}`;
    const optimistic: ClientMessage = {
      id: temporaryId,
      fromMe: true,
      text: text || "Imagem",
      type: file ? "imageMessage" : "conversation",
      mediaKind: file ? "image" : null,
      mediaUrl: input.previewUrl || null,
      sentAt: new Date().toISOString(),
      status: "PENDING",
      localState: "sending",
      localFile: file,
      localText: text,
    };

    setSending(true);
    setComposerError(null);
    setMessages((current) =>
      input.existingId
        ? current.map((message) =>
            message.id === input.existingId ? { ...message, localState: "sending" } : message
          )
        : [...current, optimistic]
    );

    const formData = new FormData();
    if (routingAvailable) {
      formData.set("conversationId", selectedId);
    } else {
      formData.set("jid", selectedChat.remoteJid || selectedId);
    }
    formData.set("text", text);
    if (file) formData.set("image", file, file.name);

    try {
      const response = await fetch("/api/whatsapp/messages", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: WhatsAppMessageView;
        code?: string;
        error?: string;
      };
      if (!response.ok || !result.message) {
        if (result.code === "PHONE_UNAVAILABLE") {
          setConversationUnavailable(true);
          setRecoveryOpen(true);
        }
        throw new Error(result.error || "Não foi possível enviar a mensagem");
      }

      const confirmed: ClientMessage = {
        ...result.message,
        mediaUrl: file ? input.previewUrl || null : result.message.mediaUrl,
        localState: "sent",
        localFile: file,
        localText: text,
      };
      setMessages((current) =>
        current.map((message) =>
          message.id === temporaryId ? confirmed : message
        )
      );
      setChats((current) =>
        current.map((chat) =>
          chat.id === selectedId
            ? {
                ...chat,
                lastMessage: text || "Imagem",
                lastMessageFromMe: true,
                lastMessageAt: confirmed.sentAt,
              }
            : chat
        )
      );

      if (input.clearComposer) {
        setDraft("");
        setSelectedImage(null);
        setEmojiOpen(false);
      }
      window.setTimeout(() => {
        void loadMessages(selectedChat, true);
        void loadChats(true);
      }, 1_200);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Não foi possível enviar a mensagem";
      setComposerError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === temporaryId ? { ...item, localState: "failed", status: "ERROR" } : item
        )
      );
      if (input.clearComposer) {
        setDraft("");
        setSelectedImage(null);
        setEmojiOpen(false);
      }
    } finally {
      setSending(false);
    }
  }

  function sendCurrentMessage() {
    void submitOutgoing({
      text: draft,
      file: selectedImage?.file,
      previewUrl: selectedImage?.previewUrl,
      clearComposer: true,
    });
  }

  function retryMessage(message: ClientMessage) {
    void submitOutgoing({
      text: message.localText ?? message.text,
      file: message.localFile,
      previewUrl: message.mediaUrl,
      existingId: message.id,
    });
  }

  async function connectCurrentPhone() {
    const instanceId = selectedChat?.instanceId || currentInstance?.id;
    if (!instanceId) return;
    setRecovering(true);
    setRecoveryError(null);
    const response = await fetch("/api/whatsapp/instances/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceId }),
    });
    const result = await response.json().catch(() => ({}));
    setRecovering(false);
    if (!response.ok) {
      setRecoveryError(result.error || "Não foi possível conectar o telefone");
      return;
    }
    setConnectionQr({
      title: result.instance?.label || selectedChat?.instanceLabel || "WhatsApp",
      qrCode: result.qrCode ?? null,
      pairingCode: result.pairingCode ?? null,
      state: result.state ?? "unknown",
    });
    if (result.state === "open") {
      setConversationUnavailable(false);
      setRecoveryOpen(false);
      if (selectedChat) void loadMessages(selectedChat);
      void loadChats(true);
    }
  }

  async function transferConversation() {
    if (!selectedChat || !transferTargetId) return;
    setRecovering(true);
    setRecoveryError(null);
    const response = await fetch("/api/whatsapp/conversations/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: selectedChat.id,
        targetInstanceId: transferTargetId,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setRecovering(false);
    if (!response.ok) {
      setRecoveryError(result.error || "Não foi possível transferir a conversa");
      return;
    }
    setConversationUnavailable(false);
    setRecoveryOpen(false);
    setTransferTargetId("");
    setChats((current) =>
      current.map((chat) =>
        chat.id === selectedChat.id
          ? {
              ...chat,
              instanceId: result.instance?.id,
              instanceLabel: result.instance?.label,
              sectorId: result.instance?.sectorId,
              sectorName: result.instance?.sectorName,
              connectionState: "open",
              available: true,
              lastMessage: result.notice || chat.lastMessage,
              lastMessageFromMe: true,
              lastMessageAt: new Date().toISOString(),
            }
          : chat
      )
    );
    setMessages((current) => [
      ...current,
      {
        id: `event:${result.event?.id || crypto.randomUUID()}`,
        fromMe: false,
        text: result.event?.description || "Conversa transferida para outro telefone.",
        type: "system",
        mediaKind: null,
        mediaUrl: null,
        sentAt: result.event?.createdAt || new Date().toISOString(),
        status: null,
        kind: "system",
      },
    ]);
    window.setTimeout(() => {
      void loadChats(true);
      const updated = {
        ...selectedChat,
        instanceId: result.instance?.id,
        instanceLabel: result.instance?.label,
        sectorId: result.instance?.sectorId,
        sectorName: result.instance?.sectorName,
        connectionState: "open" as const,
        available: true,
      };
      void loadMessages(updated, true);
    }, 800);
  }

  return (
    <div className="space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Conversas do WhatsApp</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Consulte o histórico e responda usando a instância conectada.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600">
            Envio ativo
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
                      <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                        {chat.name}
                        {routingAvailable && (
                          <span className={`ml-2 inline-block h-2 w-2 rounded-full ${chat.available ? "bg-emerald-500" : "bg-red-500"}`} />
                        )}
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
                    {routingAvailable && (
                      <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                        {chat.sectorName || "Sem setor"} · {chat.instanceLabel || "WhatsApp"}
                      </span>
                    )}
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
                    {routingAvailable && (
                      <span>
                        {" "}· {selectedChat.sectorName || "Sem setor"} · {selectedChat.instanceLabel || "WhatsApp"}
                      </span>
                    )}
                  </div>
                </div>
                {routingAvailable && conversationUnavailable && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryOpen(true);
                      setTransferTargetId((current) => current || transferTargets[0]?.id || "");
                    }}
                    className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                  >
                    Telefone indisponível
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadMessages(selectedChat)}
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
                  {routingAvailable && conversationUnavailable && (
                    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                      <div className="font-semibold text-amber-950">
                        O telefone desta conversa está desconectado
                      </div>
                      <p className="mt-1 text-sm leading-5 text-amber-800">
                        Reconecte o número atual ou transfira o atendimento para um telefone ativo de um setor permitido para você.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void connectCurrentPhone()}
                          disabled={recovering}
                          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Conectar telefone
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryOpen(true);
                            setTransferTargetId((current) => current || transferTargets[0]?.id || "");
                          }}
                          disabled={recovering || transferTargets.length === 0}
                          className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Transferir para telefone ativo
                        </button>
                      </div>
                      {transferTargets.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          Nenhum outro telefone ativo está disponível nos seus setores.
                        </p>
                      )}
                    </div>
                  )}
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
                            onRetry={retryMessage}
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

              <footer className="relative border-t border-zinc-200 bg-white px-3 py-3 sm:px-4">
                {emojiOpen && (
                  <div className="absolute bottom-full left-4 z-10 mb-2 flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-zinc-100"
                        aria-label={`Inserir ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {selectedImage && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
                    <img
                      src={selectedImage.previewUrl}
                      alt="Imagem selecionada para envio"
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-zinc-800">
                        {selectedImage.file.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {formatFileSize(selectedImage.file.size)} · imagem pronta para enviar
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeSelectedImage}
                      disabled={sending}
                      className="grid h-8 w-8 place-items-center rounded-full text-lg text-zinc-500 hover:bg-zinc-200 disabled:opacity-50"
                      aria-label="Remover imagem"
                    >
                      ×
                    </button>
                  </div>
                )}

                {composerError && (
                  <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {composerError}
                  </div>
                )}

                <div className="mb-2 flex items-center gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((current) => !current)}
                    className={`rounded-md px-2 py-1 text-sm transition ${emojiOpen ? "bg-zinc-200" : "text-zinc-500 hover:bg-zinc-100"}`}
                    aria-label="Escolher emoji"
                  >
                    😊
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection("*")}
                    className="rounded-md px-2 py-1 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                    title="Negrito"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection("_")}
                    className="rounded-md px-2 py-1 text-xs italic text-zinc-600 hover:bg-zinc-100"
                    title="Itálico"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection("~")}
                    className="rounded-md px-2 py-1 text-xs line-through text-zinc-600 hover:bg-zinc-100"
                    title="Riscado"
                  >
                    S
                  </button>
                  <span className="ml-auto text-[10px] text-zinc-400">
                    Enter envia · Shift + Enter quebra a linha
                  </span>
                </div>

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      chooseImage(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={sending || conversationUnavailable}
                    className="grid h-11 w-11 flex-none place-items-center rounded-full text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
                    aria-label="Anexar imagem"
                    title="Anexar imagem"
                  >
                    <AttachmentIcon />
                  </button>
                  <textarea
                    ref={composerInput}
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value.slice(0, 4_000));
                      if (composerError) setComposerError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendCurrentMessage();
                      }
                    }}
                    rows={1}
                    maxLength={4_000}
                    disabled={sending || conversationUnavailable}
                    placeholder={
                      conversationUnavailable
                        ? "Conecte ou transfira o telefone para responder"
                        : selectedImage
                          ? "Adicione uma legenda..."
                          : "Digite uma mensagem"
                    }
                    className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-5 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={sendCurrentMessage}
                    disabled={sending || conversationUnavailable || (!draft.trim() && !selectedImage)}
                    className="grid h-11 w-11 flex-none place-items-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
                    title="Enviar mensagem"
                  >
                    {sending ? <SendingSpinner /> : <SendIcon />}
                  </button>
                </div>
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
                  O histórico aparecerá aqui e você poderá responder pelo painel.
                </p>
              </div>
            </div>
          )}
        </main>
      </section>
      {recoveryOpen && selectedChat && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Transferir conversa"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !recovering) {
              setRecoveryOpen(false);
              setRecoveryError(null);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-zinc-950">
                Recuperar atendimento
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {selectedChat.name} · {selectedChat.instanceLabel || "WhatsApp"}
              </p>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-zinc-200 p-4">
                <div className="font-semibold text-zinc-900">Conectar o telefone atual</div>
                <p className="mt-1 text-sm text-zinc-500">
                  Gere o QR Code para restaurar o mesmo número e continuar normalmente.
                </p>
                <button
                  type="button"
                  onClick={() => void connectCurrentPhone()}
                  disabled={recovering}
                  className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                >
                  Conectar telefone
                </button>
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <div className="font-semibold text-zinc-900">Transferir para telefone ativo</div>
                <p className="mt-1 text-sm leading-5 text-zinc-500">
                  O cliente receberá automaticamente uma mensagem pelo novo número. A troca ficará registrada no histórico.
                </p>
                <select
                  value={transferTargetId}
                  onChange={(event) => setTransferTargetId(event.target.value)}
                  className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Escolha o telefone e o setor</option>
                  {transferTargets.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.sectorName} · {instance.label}
                      {instance.phoneNumber ? ` · ${instance.phoneNumber}` : ""}
                    </option>
                  ))}
                </select>
                {transferTargets.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Não existe telefone ativo em outro setor permitido para o seu usuário.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void transferConversation()}
                  disabled={recovering || !transferTargetId}
                  className="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {recovering ? "Transferindo..." : "Transferir e avisar cliente"}
                </button>
              </div>

              {recoveryError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {recoveryError}
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-zinc-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setRecoveryOpen(false);
                  setRecoveryError(null);
                }}
                disabled={recovering}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {connectionQr && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="font-semibold text-zinc-950">Conectar {connectionQr.title}</h2>
            {connectionQr.state === "open" ? (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                Telefone conectado com sucesso.
              </div>
            ) : connectionQr.qrCode ? (
              <img src={connectionQr.qrCode} alt="QR Code do WhatsApp" className="mx-auto mt-5 h-64 w-64" />
            ) : (
              <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                A conexão foi solicitada. Tente novamente em alguns segundos para atualizar o QR Code.
              </div>
            )}
            {connectionQr.pairingCode && (
              <div className="mt-3 font-mono text-lg font-bold text-zinc-900">
                {connectionQr.pairingCode}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setConnectionQr(null);
                void loadChats();
                if (selectedChat) void loadMessages(selectedChat);
              }}
              className="mt-5 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Fechar e atualizar
            </button>
          </div>
        </div>
      )}
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
  onRetry,
}: {
  message: ClientMessage;
  onOpenImage: (src: string) => void;
  onRetry: (message: ClientMessage) => void;
}) {
  if (message.kind === "system" || message.type === "system") {
    return (
      <div className="my-2 flex justify-center px-4">
        <div className="max-w-2xl rounded-xl border border-violet-200 bg-violet-50/95 px-4 py-2.5 text-center shadow-sm">
          <div className="text-xs font-semibold leading-5 text-violet-950">
            {message.text}
          </div>
          <div className="mt-1 text-[10px] font-medium text-violet-500">
            {formatMessageTime(message.sentAt)} · transferência registrada
          </div>
        </div>
      </div>
    );
  }
  const hasImage = Boolean(message.mediaUrl);
  const showText = !hasImage || !["Imagem", "Figurinha", "Mensagem"].includes(message.text);
  return (
    <div className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-xl p-1.5 shadow-sm sm:max-w-[72%] ${
          message.localState === "failed"
            ? "rounded-tr-sm border border-red-200 bg-red-50"
            : message.fromMe
              ? "rounded-tr-sm bg-[#d9fdd3]"
              : "rounded-tl-sm bg-white"
        }`}
      >
        {message.sourceInstanceLabel && (
          <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {message.sourceInstanceLabel}
          </div>
        )}
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
        <div className="mt-1 flex items-center justify-end gap-1.5 px-1 text-[10px] text-zinc-400">
          <span>{formatMessageTime(message.sentAt)}</span>
          {message.localState === "sending" ? (
            <span>Enviando...</span>
          ) : message.localState === "failed" ? (
            <>
              <span className="text-red-600">Não enviada</span>
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="font-semibold text-red-700 underline underline-offset-2"
              >
                Tentar novamente
              </button>
            </>
          ) : message.fromMe ? (
            <span>{statusMark(message.status)}</span>
          ) : null}
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

function mergeMessages(
  remoteMessages: WhatsAppMessageView[],
  currentMessages: ClientMessage[]
): ClientMessage[] {
  const remoteIds = new Set(remoteMessages.map((message) => message.id));
  const now = Date.now();
  const localMessages = currentMessages.filter((message) => {
    if (!message.localState || remoteIds.has(message.id)) return false;
    if (message.localState === "failed") return true;
    const age = now - new Date(message.sentAt).getTime();
    return Number.isFinite(age) && age < 2 * 60_000;
  });
  return [...remoteMessages, ...localMessages].sort(
    (left, right) =>
      new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime()
  );
}

function releaseLocalImage(url: string, urls: Set<string>) {
  URL.revokeObjectURL(url);
  urls.delete(url);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
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

function AttachmentIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.6-8.6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function SendingSpinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}
