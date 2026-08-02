"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
}

/**
 * Editor rich-text leve (contentEditable + execCommand) com toolbar estilo
 * Nuvemshop e alternância pra código-fonte HTML. Sem dependências externas.
 */
export function RichTextEditor({
  value,
  onChange,
  minHeight = 180,
  placeholder,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [source, setSource] = useState(false);

  // Sincroniza o HTML externo (ex: botão "juntar descrições") sem quebrar o
  // cursor enquanto o usuário digita: só atualiza quando o editor não está focado.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== (value || "")) el.innerHTML = value || "";
  }, [value]);

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function saveSel() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSel() {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  // exec pra botões simples (não perdem seleção — usam onMouseDown preventDefault)
  function exec(cmd: string, arg?: string) {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    emit();
  }

  // exec pra controles que roubam o foco (select/cor): restaura a seleção antes
  function execRestored(cmd: string, arg?: string) {
    ref.current?.focus();
    restoreSel();
    document.execCommand(cmd, false, arg);
    emit();
  }

  function link() {
    const url = prompt("URL do link (ex: https://...):");
    if (url) exec("createLink", url);
  }
  function image() {
    const url = prompt("URL da imagem:");
    if (url) exec("insertImage", url);
  }
  function table() {
    const cell = 'style="border:1px solid #d1d5db;padding:6px 8px"';
    const html =
      `<table style="border-collapse:collapse;width:100%"><tbody>` +
      `<tr><td ${cell}>&nbsp;</td><td ${cell}>&nbsp;</td></tr>` +
      `<tr><td ${cell}>&nbsp;</td><td ${cell}>&nbsp;</td></tr>` +
      `</tbody></table><p><br/></p>`;
    exec("insertHTML", html);
  }

  return (
    <div className="av-rte">
      <div className="av-rte-toolbar">
        <select
          className="av-rte-select"
          defaultValue="p"
          onMouseDown={saveSel}
          onChange={(e) => execRestored("formatBlock", e.target.value)}
          title="Formato"
        >
          <option value="p">Parágrafo</option>
          <option value="h2">Título</option>
          <option value="h3">Subtítulo</option>
        </select>

        <Btn onClick={() => exec("bold")} title="Negrito">
          <b>B</b>
        </Btn>
        <Btn onClick={() => exec("italic")} title="Itálico">
          <i>I</i>
        </Btn>
        <Btn onClick={() => exec("underline")} title="Sublinhado">
          <u>U</u>
        </Btn>

        <label className="av-rte-color" title="Cor do texto" onMouseDown={saveSel}>
          A
          <input
            type="color"
            onChange={(e) => execRestored("foreColor", e.target.value)}
          />
        </label>

        <span className="av-rte-sep" />
        <Btn onClick={() => exec("undo")} title="Desfazer">
          ↶
        </Btn>
        <Btn onClick={() => exec("redo")} title="Refazer">
          ↷
        </Btn>
        <Btn onClick={() => exec("removeFormat")} title="Limpar formatação">
          T×
        </Btn>

        <span className="av-rte-sep" />
        <Btn onClick={() => exec("insertUnorderedList")} title="Lista">
          •
        </Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Lista numerada">
          1.
        </Btn>

        <span className="av-rte-sep" />
        <Btn onClick={() => exec("justifyLeft")} title="Alinhar à esquerda">
          ≡
        </Btn>
        <Btn onClick={() => exec("justifyCenter")} title="Centralizar">
          ☰
        </Btn>
        <Btn onClick={() => exec("justifyRight")} title="Alinhar à direita">
          ≡
        </Btn>

        <span className="av-rte-sep" />
        <Btn onClick={link} title="Inserir link">
          🔗
        </Btn>
        <Btn onClick={image} title="Inserir imagem">
          🖼
        </Btn>
        <Btn onClick={table} title="Inserir tabela">
          ▦
        </Btn>

        <span className="av-rte-sep" />
        <Btn
          onClick={() => setSource((s) => !s)}
          title="Código-fonte HTML"
          active={source}
        >
          &lt;/&gt;
        </Btn>
      </div>

      {source ? (
        <textarea
          className="av-rte-source"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight }}
          spellCheck={false}
        />
      ) : (
        <div
          ref={ref}
          className="av-rte-content"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onKeyUp={saveSel}
          onMouseUp={saveSel}
          onBlur={() => {
            saveSel();
            emit();
          }}
          style={{ minHeight }}
          data-placeholder={placeholder ?? "Escreva a descrição..."}
        />
      )}

      <style jsx global>{`
        .av-rte {
          border: 1px solid #d1d5db;
          border-radius: 8px;
          overflow: hidden;
          background: white;
        }
        .av-rte-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 2px;
          padding: 6px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        .av-rte-btn {
          min-width: 30px;
          height: 30px;
          padding: 0 6px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          font-size: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #374151;
        }
        .av-rte-btn:hover {
          background: #e5e7eb;
        }
        .av-rte-btn.active {
          background: #111827;
          color: white;
        }
        .av-rte-select {
          height: 30px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          padding: 0 6px;
          background: white;
        }
        .av-rte-color {
          height: 30px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
          padding: 0 6px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 700;
        }
        .av-rte-color:hover {
          background: #e5e7eb;
        }
        .av-rte-color input {
          width: 20px;
          height: 20px;
          border: 0;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }
        .av-rte-sep {
          width: 1px;
          height: 20px;
          background: #e5e7eb;
          margin: 0 4px;
        }
        .av-rte-content {
          padding: 12px 14px;
          font-size: 14px;
          line-height: 1.6;
          color: #111827;
          outline: none;
          overflow-y: auto;
          max-height: 420px;
        }
        .av-rte-content:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
        }
        .av-rte-content ul {
          list-style: disc;
          padding-left: 24px;
          margin: 8px 0;
        }
        .av-rte-content ol {
          list-style: decimal;
          padding-left: 24px;
          margin: 8px 0;
        }
        .av-rte-content h2 {
          font-size: 20px;
          font-weight: 700;
          margin: 12px 0 6px;
        }
        .av-rte-content h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 10px 0 4px;
        }
        .av-rte-content p {
          margin: 6px 0;
        }
        .av-rte-content a {
          color: #2563eb;
          text-decoration: underline;
        }
        .av-rte-content img {
          max-width: 100%;
          height: auto;
        }
        .av-rte-source {
          width: 100%;
          border: 0;
          padding: 12px 14px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
        }
      `}</style>
    </div>
  );
}

function Btn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`av-rte-btn ${active ? "active" : ""}`}
      // onMouseDown preventDefault preserva a seleção do texto ao clicar
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
