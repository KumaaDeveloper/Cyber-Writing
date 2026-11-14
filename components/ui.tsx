"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowUpRight, ShieldCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return <button className={cn("btn", variant, className)} {...props} />;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Tutup">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? "muted" : "sr-only"}>
            {description || title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand">
      <span className="brand-symbol">
        <img src="/cyber-mark-v2.png" alt="Logo KSM Cyber Security" />
      </span>
      {!compact && (
        <span>
          CYBER<span className="brand-light"> WRITING</span>
          <small>KSM CYBER SECURITY · UPNVJ</small>
        </span>
      )}
    </Link>
  );
}
export function Spinner() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" /> Memuat...
    </div>
  );
}
export function ErrorBox({ message }: { message?: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Footer() {
  return (
    <footer>
      <span>© {new Date().getFullYear()} KSM Cyber Security</span>
      <span>
        Write with purpose. Share with impact. <ArrowUpRight size={13} />
      </span>
    </footer>
  );
}
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const result = await fetch("/api/" + url, {
    method,
    signal: AbortSignal.timeout(url.includes("/review") ? 110000 : 30000),
    credentials: "same-origin",
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await result
    .json()
    .catch(() => ({ error: "Respons server tidak valid." }));
  if (!result.ok)
    throw new APIError(result.status, data.error || "Permintaan gagal.");
  return data;
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Terjadi kesalahan.";
export function date(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value)) + " WIB"
  );
}
export function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
