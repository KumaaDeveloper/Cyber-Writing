"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

export function ToolMenu({ label = "Tools", variant = "insert", children }: {
  label?: string;
  variant?: "insert" | "format";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div className={`tool-menu tool-menu-${variant}`} ref={root}>
    <button ref={trigger} type="button" className="btn secondary tool-menu-trigger"
      aria-label={label} aria-expanded={open} aria-controls={id}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setOpen((value) => !value)}>
      <SlidersHorizontal size={15} />{label}<ChevronDown size={13} />
    </button>
    {open && <section id={id} className="tool-menu-panel" aria-label={label}>
      <div className="tool-group-heading"><strong>{variant === "insert" ? "Tambah konten" : "Format teks"}</strong>
        <button type="button" className="icon-button" aria-label={`Tutup ${label.toLowerCase()}`}
          onMouseDown={(e) => e.preventDefault()} onClick={close}><X size={15} /></button>
      </div>
      {children(close)}
    </section>}
  </div>;
}
