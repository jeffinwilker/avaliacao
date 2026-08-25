"use client";

import { useId, useRef } from "react";

export function MessageEditor({
  value,
  onChange,
  variables,
  label,
  minHeight = 190,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  label: string;
  minHeight?: number;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function replaceSelection(text: string, cursorOffset?: number) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`.slice(0, 4000);
    onChange(next);
    const cursor = Math.min(4000, start + (cursorOffset ?? text.length));
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function wrapSelection(open: string, close = open) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const content = selected || "texto";
    const wrapped = `${open}${content}${close}`;
    const next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`.slice(0, 4000);
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (selected) {
        textareaRef.current?.setSelectionRange(start, start + wrapped.length);
      } else {
        textareaRef.current?.setSelectionRange(start + open.length, start + open.length + content.length);
      }
    });
  }

  function prefixLines(prefix: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const selectedLines = value.slice(lineStart, lineEnd);
    const prefixed = selectedLines
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const next = `${value.slice(0, lineStart)}${prefixed}${value.slice(lineEnd)}`.slice(0, 4000);
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(lineStart, lineStart + prefixed.length);
    });
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
      <div className="mt-2 overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-100">
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-2">
          <FormatButton label="B" title="Negrito" onClick={() => wrapSelection("*")} className="font-bold" />
          <FormatButton label="I" title="Itálico" onClick={() => wrapSelection("_")} className="italic" />
          <FormatButton label="S" title="Riscado" onClick={() => wrapSelection("~")} className="line-through" />
          <FormatButton label="&lt;/&gt;" title="Monoespaçado" onClick={() => wrapSelection("```")} className="font-mono" />
          <span className="mx-1 h-5 w-px bg-gray-300" />
          <FormatButton label="• Lista" title="Lista com marcadores" onClick={() => prefixLines("• ")} />
          <FormatButton label="1. Lista" title="Lista numerada" onClick={() => prefixLines("1. ")} />
          <FormatButton label="😊" title="Inserir emoji" onClick={() => replaceSelection("😊")} />
          <span className="ml-auto hidden text-[10px] text-gray-400 sm:inline">Formatação do WhatsApp</span>
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={4000}
          style={{ minHeight }}
          className="block w-full resize-y border-0 bg-white px-4 py-3 text-sm leading-6 outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {variables.map((variable) => (
            <button
              type="button"
              key={variable}
              onClick={() => replaceSelection(variable)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs hover:bg-gray-100"
            >
              {variable}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{value.length}/4000</span>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">
        O WhatsApp não oferece sublinhado nativo; use negrito, itálico, riscado ou monoespaçado.
      </p>
    </div>
  );
}

function FormatButton({ label, title, onClick, className = "" }: { label: string; title: string; onClick: () => void; className?: string }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`rounded-md border border-transparent px-2 py-1 text-xs text-zinc-700 hover:border-zinc-200 hover:bg-white ${className}`}>{label}</button>;
}
