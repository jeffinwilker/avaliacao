import { useRef } from "react";

interface MediaUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  max: number;
}

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export function MediaUpload({ files, onChange, max }: MediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const validas = picked.filter((f) => f.size <= MAX_BYTES);
    const rejeitadas = picked.length - validas.length;
    if (rejeitadas > 0) {
      alert(`${rejeitadas} arquivo(s) ignorado(s): tamanho máximo 20 MB.`);
    }
    const combined = [...files, ...validas].slice(0, max);
    onChange(combined);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="av-media-upload">
      {files.map((f, i) => {
        const url = URL.createObjectURL(f);
        const isVideo = f.type.startsWith("video");
        return (
          <div key={`${f.name}-${i}`} className="av-media-thumb">
            {isVideo ? (
              <video src={url} muted />
            ) : (
              <img src={url} alt={f.name} />
            )}
            <button type="button" onClick={() => remove(i)} aria-label="Remover">
              ×
            </button>
          </div>
        );
      })}

      {files.length < max && (
        <label className="av-media-add">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={handleAdd}
          />
          <span style={{ fontSize: 20 }}>+</span>
          <span>foto/vídeo</span>
        </label>
      )}
    </div>
  );
}
