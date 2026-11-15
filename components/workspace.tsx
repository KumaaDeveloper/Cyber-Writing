"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { get, set, del } from "idb-keyval";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Copy,
  Trash2,
  Type,
  Image as ImageIcon,
  Images,
  Table2,
  GitBranch,
  Minus,
  Info,
  TriangleAlert,
  Link as LinkIcon,
  Eye,
  Send,
  Check,
  Cloud,
  CloudOff,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Star,
  Sparkles,
  History,
  Download,
  CheckSquare,
} from "lucide-react";
import {
  type DocumentData,
  type Page,
  type Block,
  newPage,
  safeUrl,
  hasContent,
  statusLabel,
} from "@/lib/model";
import {
  Brand,
  Button,
  Modal,
  Spinner,
  ErrorBox,
  api,
  APIError,
  errorText,
  date,
  downloadJson,
} from "./ui";
import { ToolMenu } from "./tool-menu";
import { reviewInputUnchanged } from "@/lib/review-runner";
const RichEditor = dynamic(() => import("./rich-editor"), { ssr: false });

const Diagram = dynamic(() => import("./diagram"), { ssr: false });
const blankRich = { type: "doc", content: [{ type: "paragraph" }] };
type FullDoc = DocumentData & {
  name: string;
  nim: string;
  email: string;
  membership_status: string;
  department: string;
  theme_title: string;
  session_title: string;
  max_pages: number;
  status: string;
  writable: boolean;
  read_only_reason?: string | null;
  writer_next_allowed_at?: string | null;
  end_at: string;
  instructions: string;
  is_starred: boolean;
  notes: any[];
  reviews?: any[];
};
type LocalBackup = { doc: FullDoc; dirty: boolean; savedAt: number };
function documentBody(d: FullDoc): DocumentData {
  return {
    title: d.title,
    version: d.version,
    pages: d.pages,
    references: d.references,
  };
}
export default function Workspace({
  id,
  admin = false,
}: {
  id: string;
  admin?: boolean;
}) {
  const router = useRouter(),
    query = useSearchParams();
  const endpoint = (admin ? "admin/submissions/" : "drafts/") + id;
  const [doc, setDoc] = useState<FullDoc | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("Memuat..."),
    [loading, setLoading] = useState(true),
    [drawer, setDrawer] = useState(false),
    [insert, setInsert] = useState(""),
    [submitOpen, setSubmitOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState<{
      type: "page" | "block";
      id: string;
    } | null>(null),
    [conflict, setConflict] = useState(false),
    [edit, setEdit] = useState(!admin),
    [panel, setPanel] = useState(""),
    [reviews, setReviews] = useState<any[]>([]),
    [reviewProgress, setReviewProgress] = useState(""),
    [history, setHistory] = useState<any[]>([]),
    [note, setNote] = useState(""),
    [imageUrl, setImageUrl] = useState(""),
    [reference, setReference] = useState({
      title: "",
      url: "",
      publisher: "",
      accessed_at: "",
    });
  const current = useRef<FullDoc | null>(null),
    dirty = useRef(false),
    saving = useRef(false),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    blocked = useRef(false),
    readOnlyRef = useRef(false);
  const pageIndex = doc
    ? Math.min(
        doc.pages.length - 1,
        Math.max(0, (Number(query.get("page")) || 1) - 1),
      )
    : 0;
  const page = doc?.pages[pageIndex];
  const readOnly = (!admin && !doc?.writable) || (admin && !edit);
  readOnlyRef.current = readOnly;
  const localKey = "cw-" + (admin ? "admin-" : "") + "draft-" + id;
  async function backup(d: FullDoc, isDirty: boolean) {
    try {
      await set(localKey, { doc: d, dirty: isDirty, savedAt: Date.now() });
    } catch {
      setError(
        "Penyimpanan lokal tidak tersedia. Jangan tutup tab sebelum berhasil tersimpan ke server.",
      );
    }
  }
  function update(d: FullDoc) {
    const previous = current.current;
    if (previous) setReviews((items) => items.map((review) =>
      reviewInputUnchanged(previous, d, review.page_id) ? review : { ...review, review_current: false },
    ));
    current.current = d;
    setDoc(d);
    dirty.current = true;
    generation.current++;
    setSaved(navigator.onLine ? "Menyimpan..." : "Offline · salinan lokal");
    void backup(d, true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1100);
  }
  async function save(): Promise<boolean> {
    if (!dirty.current) return true;
    if (saving.current) return false;
    if (blocked.current || readOnlyRef.current || !navigator.onLine)
      return false;
    const d = current.current;
    if (!d) return false;
    saving.current = true;
    const gen = generation.current;
    setSaved("Menyimpan...");
    try {
      const r = await api(endpoint, "PUT", documentBody(d));
      const next = { ...current.current!, version: r.version };
      current.current = next;
      setDoc(next);
      if (gen === generation.current) {
        dirty.current = false;
        setSaved("Tersimpan");
        await backup(next, false);
      } else {
        await backup(next, true);
        timer.current = setTimeout(() => void save(), 250);
      }
      return !dirty.current;
    } catch (e) {
      setSaved(
        navigator.onLine ? "Gagal menyimpan" : "Offline · salinan lokal",
      );
      setError(errorText(e));
      if (e instanceof APIError && e.status === 409) {
        blocked.current = true;
        setConflict(true);
      }
      if (e instanceof APIError && (e.status === 403 || e.status === 423)) {
        blocked.current = true;
        let latest: FullDoc | null = null;
        try {
          latest = await api<FullDoc>(endpoint);
        } catch {}
        if (latest && ["submitted", "reviewed"].includes(latest.status)) {
          if (current.current && dirty.current)
            await set(localKey + "-unsynced", {
              doc: current.current,
              dirty: true,
              savedAt: Date.now(),
            }).catch(() => {});
          current.current = latest;
          setDoc(latest);
          dirty.current = false;
          setSaved("Terkirim");
        } else {
          const next = current.current
            ? {
                ...current.current,
                writable: false,
                read_only_reason:
                  e.status === 423
                    ? "cooldown"
                    : latest?.read_only_reason || "session_closed",
                writer_next_allowed_at: latest?.writer_next_allowed_at,
              }
            : null;
          if (next) {
            current.current = next;
            setDoc(next);
          }
        }
      }
      return false;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const server = await api<FullDoc>(endpoint);
        const cached = await get<LocalBackup>(localKey);
        if (!active) return;
        setReviews(server.reviews || []);
        let result = server;
        if (!admin && ["submitted", "reviewed"].includes(server.status)) {
          if (cached?.dirty)
            await set(localKey + "-unsynced", cached).catch(() => {});
          blocked.current = true;
          dirty.current = false;
          setSaved("Terkirim");
        } else if (cached?.dirty) {
          if (cached.doc.version === server.version && !admin) {
            result = {
              ...server,
              ...cached.doc,
              status: server.status,
              writable: server.writable,
              read_only_reason: server.read_only_reason,
              writer_next_allowed_at: server.writer_next_allowed_at,
            };
            blocked.current = !server.writable;
            dirty.current = true;
            setSaved("Salinan lokal dipulihkan");
          } else if (cached.doc.version === server.version && admin) {
            result = { ...server, ...cached.doc };
            dirty.current = true;
            setSaved("Salinan lokal dipulihkan");
          } else {
            blocked.current = true;
            setConflict(true);
            result = { ...server, ...cached.doc, writable: server.writable };
            dirty.current = true;
            setSaved("Perlu penyelesaian konflik");
          }
        } else setSaved("Tersimpan");
        current.current = result;
        setDoc(result);
        if (dirty.current && !blocked.current)
          timer.current = setTimeout(() => void save(), 1500);
      } catch (e) {
        const cached = await get<LocalBackup>(localKey).catch(() => null);
        if (cached && active) {
          current.current = cached.doc;
          setDoc(cached.doc);
          dirty.current = cached.dirty;
          setSaved("Offline · salinan lokal");
        }
        setError(errorText(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, admin]);
  useEffect(() => {
    const online = () => {
      setError("");
      void save();
    };
    const offline = () => setSaved("Offline · salinan lokal");
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        if (current.current) void backup(current.current, dirty.current);
        void save();
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", visibility);
    const interval = setInterval(() => {
      if (
        !admin &&
        current.current &&
        new Date(current.current.end_at).getTime() <= Date.now()
      ) {
        current.current = { ...current.current, writable: false };
        setDoc(current.current);
      }
      void save();
    }, 15000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(interval);
    };
  }, [id]);
  if (loading) return <Spinner />;
  if (!doc || !page)
    return (
      <main className="center-page">
        <ErrorBox message={error} />
        <Link href={admin ? "/admin/sessions" : "/"}>Kembali</Link>
      </main>
    );
  function changePage(next: number) {
    void save();
    void set("cw-page-" + id, next + 1);
    router.replace(
      `${admin ? "/admin/submissions/" : "/write/"}${id}?page=${next + 1}`,
      { scroll: false },
    );
    setDrawer(false);
    document.querySelector(".document-scroll")?.scrollTo(0, 0);
  }
  function changePageData(p: Page) {
    update({
      ...current.current!,
      pages: current.current!.pages.map((x) => (x.id === p.id ? p : x)),
    });
  }
  function blockChange(id: string, block: Block) {
    changePageData({
      ...page!,
      blocks: page!.blocks.map((b) => (b.id === id ? block : b)),
    });
  }
  function addBlock(type: string) {
    if (type === "image" || type === "reference" || type === "gallery") {
      setInsert(type);
      return;
    }
    let block: Block;
    const bid = crypto.randomUUID();
    if (type === "diagram")
      block = {
        id: bid,
        type: "diagram",
        source:
          "flowchart TD\n  A[Kenali ancaman] --> B[Periksa sumber]\n  B --> C[Lindungi data]",
      };
    else if (type === "divider") block = { id: bid, type: "divider" };
    else
      block = {
        id: bid,
        type:
          type === "warning"
            ? "warning"
            : type === "callout"
              ? "callout"
              : "text",
        content:
          type === "table"
            ? {
                type: "doc",
                content: [
                  {
                    type: "table",
                    content: [
                      {
                        type: "tableRow",
                        content: [
                          {
                            type: "tableHeader",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Kolom 1" }],
                              },
                            ],
                          },
                          {
                            type: "tableHeader",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Kolom 2" }],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        type: "tableRow",
                        content: [
                          {
                            type: "tableCell",
                            content: [{ type: "paragraph" }],
                          },
                          {
                            type: "tableCell",
                            content: [{ type: "paragraph" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              }
            : structuredClone(blankRich),
      };
    changePageData({ ...page!, blocks: [...page!.blocks, block] });
    setInsert("");
  }
  function reorderBlock(index: number, delta: number) {
    const blocks = [...page!.blocks];
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    changePageData({ ...page!, blocks });
  }
  function addPage(copy = false) {
    if (doc!.pages.length >= doc!.max_pages) return;
    const p = copy
      ? {
          ...structuredClone(page!),
          id: crypto.randomUUID(),
          title: page!.title + " (salinan)",
          blocks: page!.blocks.map((b) => ({
            ...structuredClone(b),
            id: crypto.randomUUID(),
          })),
        }
      : newPage();
    update({ ...doc!, pages: [...doc!.pages, p] });
    changePage(doc!.pages.length);
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (
        file.size > 4 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error("Gunakan JPG, PNG, atau WebP maksimal 4 MB.");
      const body = new FormData();
      body.append("file", file);
      const r = await api(
        `upload?id=${id}${admin ? "&admin=1" : ""}`,
        "POST",
        body,
      );
      addImage(r.url, file.name);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function addGallery() {
    const urls = imageUrl.split(/\s+/).filter(Boolean);
    if (!urls.length || urls.length > 12 || urls.some((u) => !safeUrl(u))) {
      setError("Masukkan 1–12 URL HTTPS, satu per baris.");
      return;
    }
    changePageData({
      ...page!,
      blocks: [
        ...page!.blocks,
        {
          id: crypto.randomUUID(),
          type: "gallery",
          images: urls.map((url) => ({
            id: crypto.randomUUID(),
            url,
            alt: "",
            caption: "",
          })),
        },
      ],
    });
    setInsert("");
    setImageUrl("");
  }
  async function uploadGallery(files: File[]) {
    if (files.length > 12) {
      setError("Maksimal 12 gambar per galeri.");
      return;
    }
    setBusy(true);
    setError("");
    const images: { id: string; url: string; alt: string; caption: string }[] =
      [];
    try {
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024)
          throw new Error("Ukuran gambar maksimal 4 MB.");
        const body = new FormData();
        body.append("file", file);
        const r = await api(
          `upload?id=${id}${admin ? "&admin=1" : ""}`,
          "POST",
          body,
        );
        images.push({
          id: crypto.randomUUID(),
          url: r.url,
          alt: file.name,
          caption: "",
        });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (images.length)
        changePageData({
          ...page!,
          blocks: [
            ...page!.blocks,
            { id: crypto.randomUUID(), type: "gallery", images },
          ],
        });
      setBusy(false);
      setInsert("");
    }
  }
  function addImage(url: string, alt = "") {
    if (!safeUrl(url)) {
      setError("Gunakan URL HTTPS.");
      return;
    }
    changePageData({
      ...page!,
      blocks: [
        ...page!.blocks,
        {
          id: crypto.randomUUID(),
          type: "image",
          url,
          alt,
          caption: "",
          width: 100,
          align: "center",
        },
      ],
    });
    setImageUrl("");
    setInsert("");
  }
  async function review(force = false, onlyPageId?: string) {
    setBusy(true);
    setError("");
    setPanel("review");
    try {
      if (dirty.current && !(await save()))
        throw new Error("Simpan perubahan terlebih dahulu.");
      const pages = (current.current?.pages || []).filter(
        (page) => hasContent([page]) && (!onlyPageId || page.id === onlyPageId),
      );
      if (!pages.length) throw new Error("Tidak ada materi pada halaman yang dipilih.");
      const failures: string[] = [];
      for (const [index, page] of pages.entries()) {
        const number = (current.current?.pages || []).findIndex((p) => p.id === page.id) + 1;
        setReviewProgress(`Memeriksa halaman ${number} (${index + 1}/${pages.length})...`);
        try {
          if (dirty.current && !(await save())) throw new Error("Simpan perubahan terlebih dahulu.");
          const snapshot = current.current!;
          const r = await api(endpoint + "/review", "POST", { force, page_id: page.id });
          const result = { ...r, review_current: r.review_current && reviewInputUnchanged(snapshot, current.current!, page.id) };
          setReviews((previous) => [result, ...previous.filter((item) => item.id !== r.id)]);
        } catch (e) {
          failures.push(`Halaman ${number}: ${errorText(e)}`);
          // Errors such as an expired API key or exhausted quota cannot be fixed by trying other pages.
          if (e instanceof APIError && [401, 429, 503, 504].includes(e.status)) break;
        }
      }
      if (failures.length) setError(failures.join(" · "));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReviewProgress("");
      setBusy(false);
    }
  }
  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="workspace-brand">
          <button
            className="icon-button mobile-only"
            aria-label="Daftar halaman"
            onClick={() => setDrawer(true)}
          >
            <Menu />
          </button>
          <Brand />
        </div>
        <span className="workspace-label">
          {admin ? "ADMIN EDITOR" : "WORKSPACE"}
        </span>
        <div className="workspace-actions">
          <span className="save-state" role="status">
            {saved.includes("Offline") ? (
              <CloudOff size={14} />
            ) : (
              <Cloud size={14} />
            )}
            <span>{saved}</span>
          </span>
          {admin ? (
            <Button
              variant="secondary"
              onClick={async () => {
                if (edit && dirty.current && !(await save())) {
                  setError(
                    "Selesaikan penyimpanan sebelum beralih ke mode baca.",
                  );
                  return;
                }
                setEdit((v) => !v);
              }}
            >
              {edit ? "Mode baca" : "Edit tulisan"}
            </Button>
          ) : null}
          {!admin && doc.writable && (
            <Button
              disabled={!doc.writable || busy || conflict}
              onClick={() => setSubmitOpen(true)}
            >
              <Send size={15} />
              <span>Kirim tulisan</span>
            </Button>
          )}
        </div>
      </header>
      {drawer && (
        <button
          className="drawer-shade"
          aria-label="Tutup navigasi"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={"page-sidebar " + (drawer ? "open" : "")}>
        <div className="sidebar-document">
          <Link
            className="back-link"
            href={admin ? "/admin/sessions" : "/"}
            onClick={(e) => {
              if (dirty.current) {
                e.preventDefault();
                void save().then((ok) => {
                  if (ok) router.push(admin ? "/admin/sessions" : "/");
                });
              }
            }}
          >
            <ArrowLeft size={14} /> {admin ? "Daftar sesi" : "Beranda"}
          </Link>
          <span className="eyebrow">{doc.session_title}</span>
          <h3>{doc.title}</h3>
          <span className="badge">{statusLabel[doc.status]}</span>
        </div>
        <div className="sidebar-section-label">
          HALAMAN{" "}
          <span>
            {doc.pages.length} / {doc.max_pages}
          </span>
        </div>
        <nav className="page-list">
          {doc.pages.map((p, i) => (
            <button
              className={i === pageIndex ? "active" : ""}
              key={p.id}
              onClick={() => changePage(i)}
            >
              <span className="page-thumb">
                <FileText size={18} />
                <small>{i + 1}</small>
              </span>
              <span>
                {p.title || "Tanpa judul"}
                <small>{p.blocks.length} blok konten</small>
              </span>
              <ChevronRight size={13} />
            </button>
          ))}
        </nav>
        {!readOnly && (
          <Button
            variant="ghost"
            className="add-page"
            disabled={doc.pages.length >= doc.max_pages}
            onClick={() => addPage()}
          >
            <Plus size={16} />{" "}
            {doc.pages.length >= doc.max_pages
              ? "Batas halaman tercapai"
              : "Tambah halaman"}
          </Button>
        )}
        <div className="sidebar-bottom">
          <span className="eyebrow">TEMA TERPILIH</span>
          <strong>{doc.theme_title}</strong>
          {doc.instructions && <p>{doc.instructions}</p>}
        </div>
      </aside>
      <main className="document-area">
        <div className="document-topbar">
          <div>
            <span className="red-dot" /> DOKUMEN <ChevronRight size={12} />{" "}
            Halaman {pageIndex + 1}
          </div>
        </div>
        <div className="document-scroll">
          <div className="document-wrap">
            <ErrorBox message={error} />
            {conflict && (
              <div className="warning-banner">
                Versi server berbeda. Salinan lokal aman.{" "}
                <button onClick={() => setPanel("conflict")}>
                  Selesaikan konflik
                </button>
              </div>
            )}
            {!admin && !doc.writable && (
              <div className="warning-banner">
                {doc.status === "submitted" || doc.status === "reviewed"
                  ? "Tulisan sudah dikirim. Kamu dapat membacanya, tetapi tidak dapat mengedit."
                  : doc.read_only_reason === "cooldown"
                    ? `Penulisan dikunci sementara.${doc.writer_next_allowed_at ? " Kamu bisa menulis lagi pada " + date(doc.writer_next_allowed_at) + "." : ""}`
                    : "Sesi telah berakhir. Tulisan hanya dapat dibaca."}
              </div>
            )}
            {admin && (
              <div className="admin-document-bar">
                <div>
                  <strong>{doc.name}</strong>
                  <small>
                    {doc.nim} · {doc.membership_status}
                    {doc.department ? " · " + doc.department : ""}
                  </small>
                </div>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api(endpoint, "PATCH", {
                        is_starred: !doc.is_starred,
                      });
                      const d = {
                        ...current.current!,
                        is_starred: !doc.is_starred,
                      };
                      setDoc(d);
                      current.current = d;
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  <Star
                    size={17}
                    fill={doc.is_starred ? "currentColor" : "none"}
                  />
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => review()}
                >
                  <Sparkles size={15} />
                  {busy ? "Memeriksa..." : "Cek AI"}
                </Button>
                <button
                  className="icon-button"
                  aria-label="Riwayat revisi"
                  onClick={async () => {
                    try {
                      setHistory(await api(endpoint + "/history"));
                      setPanel("history");
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  <History size={18} />
                </button>
                <select
                  aria-label="Status tulisan"
                  value={doc.status}
                  onChange={async (e) => {
                    try {
                      await api(endpoint, "PATCH", { status: e.target.value });
                      const d = { ...current.current!, status: e.target.value };
                      setDoc(d);
                      current.current = d;
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  {["draft", "submitted", "revision", "reviewed"].map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="document-title-row">
              <div>
                <label className="eyebrow" htmlFor="doc-title">
                  JUDUL TULISAN
                </label>
                <input
                  id="doc-title"
                  className="document-title"
                  value={doc.title}
                  readOnly={readOnly}
                  onChange={(e) => update({ ...doc, title: e.target.value })}
                  placeholder="Beri judul tulisanmu"
                  maxLength={200}
                />
              </div>
              {!readOnly && (
                <ToolMenu>{(close) => (
                <div className="insert-tool-grid">
                  {[
                    ["text", Type, "Teks"],
                    ["image", ImageIcon, "Gambar"],
                    ["gallery", Images, "Galeri"],
                    ["table", Table2, "Tabel"],
                    ["diagram", GitBranch, "Diagram"],
                    ["callout", Info, "Info"],
                    ["warning", TriangleAlert, "Peringatan"],
                    ["divider", Minus, "Pemisah"],
                    ["reference", LinkIcon, "Sumber"],
                  ].map(([type, Icon, label]) => {
                    const I = Icon as typeof Type;
                    return (
                      <button
                        key={String(type)}
                        onClick={() => { close(); addBlock(String(type)); }}
                      >
                        <I size={16} />
                        {label as string}
                      </button>
                    );
                  })}
                </div>
                )}</ToolMenu>
              )}
            </div>

            <article className="paper">
              <div className="paper-eyebrow">
                <span>HALAMAN {String(pageIndex + 1).padStart(2, "0")}</span>
                {!readOnly && (
                  <div className="page-tools">
                    <button
                      title="Pindahkan halaman ke depan"
                      disabled={pageIndex === 0}
                      onClick={() => {
                        const pages = [...doc.pages];
                        [pages[pageIndex - 1], pages[pageIndex]] = [
                          pages[pageIndex],
                          pages[pageIndex - 1],
                        ];
                        update({ ...doc, pages });
                        changePage(pageIndex - 1);
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      title="Pindahkan halaman ke belakang"
                      disabled={pageIndex === doc.pages.length - 1}
                      onClick={() => {
                        const pages = [...doc.pages];
                        [pages[pageIndex + 1], pages[pageIndex]] = [
                          pages[pageIndex],
                          pages[pageIndex + 1],
                        ];
                        update({ ...doc, pages });
                        changePage(pageIndex + 1);
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      title="Duplikasi halaman"
                      disabled={doc.pages.length >= doc.max_pages}
                      onClick={() => addPage(true)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      title="Hapus halaman"
                      disabled={doc.pages.length === 1}
                      onClick={() =>
                        setConfirmDelete({ type: "page", id: page.id })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <input
                className="page-title"
                aria-label="Judul halaman"
                placeholder="Judul halaman"
                value={page.title}
                readOnly={readOnly}
                maxLength={200}
                onChange={(e) =>
                  changePageData({ ...page, title: e.target.value })
                }
              />
              <div className="title-rule" />
              {page.blocks.map((b, i) => (
                <section key={b.id} className={"content-block block-" + b.type}>
                  {!readOnly && (
                    <div className="block-controls">
                      <span>{b.type === "text" ? "Teks" : b.type}</span>
                      <button
                        aria-label="Naikkan blok"
                        disabled={i === 0}
                        onClick={() => reorderBlock(i, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        aria-label="Turunkan blok"
                        disabled={i === page.blocks.length - 1}
                        onClick={() => reorderBlock(i, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        aria-label="Duplikasi blok"
                        onClick={() => {
                          const blocks = [...page.blocks];
                          blocks.splice(i + 1, 0, {
                            ...structuredClone(b),
                            id: crypto.randomUUID(),
                          });
                          changePageData({ ...page, blocks });
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        aria-label="Hapus blok"
                        onClick={() =>
                          setConfirmDelete({ type: "block", id: b.id })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                  {"content" in b && (
                    <RichEditor
                      content={b.content}
                      readOnly={readOnly}
                      onChange={(v) => blockChange(b.id, { ...b, content: v })}
                    />
                  )}
                  {b.type === "divider" && <hr />}
                  {b.type === "diagram" && (
                    <>
                      {!readOnly && (
                        <label>
                          Kode diagram (Mermaid)
                          <textarea
                            rows={4}
                            spellCheck={false}
                            value={b.source}
                            onChange={(e) =>
                              blockChange(b.id, {
                                ...b,
                                source: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      <Diagram source={b.source} />
                    </>
                  )}
                  {b.type === "gallery" && (
                    <div className="image-gallery">
                      {b.images.map((img) => (
                        <div key={img.id}>
                          <figure>
                            <img
                              src={img.url}
                              alt={img.alt}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                            {img.caption && (
                              <figcaption>{img.caption}</figcaption>
                            )}
                          </figure>
                          {!readOnly && (
                            <>
                              <input
                                aria-label="Caption galeri"
                                placeholder="Caption"
                                value={img.caption}
                                onChange={(e) =>
                                  blockChange(b.id, {
                                    ...b,
                                    images: b.images.map((x) =>
                                      x.id === img.id
                                        ? { ...x, caption: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              <input
                                aria-label="Alt text galeri"
                                placeholder="Alt text"
                                value={img.alt}
                                onChange={(e) =>
                                  blockChange(b.id, {
                                    ...b,
                                    images: b.images.map((x) =>
                                      x.id === img.id
                                        ? { ...x, alt: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              {b.images.length > 1 && (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    blockChange(b.id, {
                                      ...b,
                                      images: b.images.filter(
                                        (x) => x.id !== img.id,
                                      ),
                                    })
                                  }
                                >
                                  Hapus gambar
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {b.type === "image" && (
                    <>
                      <figure
                        style={{
                          width: b.width + "%",
                          marginLeft: b.align === "left" ? 0 : "auto",
                          marginRight: b.align === "right" ? 0 : "auto",
                        }}
                      >
                        <img
                          src={b.url}
                          alt={b.alt}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        {b.caption && <figcaption>{b.caption}</figcaption>}
                      </figure>
                      {!readOnly && (
                        <div className="image-properties">
                          <input
                            placeholder="Caption gambar"
                            aria-label="Caption gambar"
                            value={b.caption}
                            onChange={(e) =>
                              blockChange(b.id, {
                                ...b,
                                caption: e.target.value,
                              })
                            }
                          />
                          <input
                            placeholder="Alt text"
                            aria-label="Alt text"
                            value={b.alt}
                            onChange={(e) =>
                              blockChange(b.id, { ...b, alt: e.target.value })
                            }
                          />
                          <input
                            aria-label="URL gambar"
                            value={b.url}
                            onChange={(e) =>
                              blockChange(b.id, { ...b, url: e.target.value })
                            }
                          />
                          <div className="form-grid">
                            <label>
                              Lebar {b.width}%
                              <input
                                type="range"
                                min="25"
                                max="100"
                                value={b.width}
                                onChange={(e) =>
                                  blockChange(b.id, {
                                    ...b,
                                    width: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Posisi
                              <select
                                value={b.align}
                                onChange={(e) =>
                                  blockChange(b.id, {
                                    ...b,
                                    align: e.target.value as
                                      "left" | "center" | "right",
                                  })
                                }
                              >
                                <option value="left">Kiri</option>
                                <option value="center">Tengah</option>
                                <option value="right">Kanan</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              ))}
              {!page.blocks.length && (
                <p className="muted">
                  {readOnly
                    ? "Halaman ini belum memiliki konten."
                    : "Klik Tools untuk menambahkan konten."}
                </p>
              )}
              <div className="paper-footer">
                <span>CYWRITE</span>
                <span>{String(pageIndex + 1).padStart(2, "0")}</span>
              </div>
            </article>
          </div>
        </div>
        <nav className="page-navigation">
          <Button
            variant="ghost"
            disabled={pageIndex === 0}
            onClick={() => changePage(pageIndex - 1)}
          >
            <ChevronLeft size={16} />
            <span>Sebelumnya</span>
          </Button>
          <button className="page-counter" onClick={() => setDrawer(true)}>
            Halaman {pageIndex + 1} dari {doc.pages.length}
          </button>
          <Button
            variant="ghost"
            disabled={pageIndex === doc.pages.length - 1}
            onClick={() => changePage(pageIndex + 1)}
          >
            <span>Berikutnya</span>
            <ChevronRight size={16} />
          </Button>
        </nav>
      </main>
      <Modal
        open={insert === "image" || insert === "gallery"}
        onOpenChange={() => setInsert("")}
        title={insert === "gallery" ? "Tambahkan galeri" : "Tambahkan gambar"}
        description="JPG, PNG, WebP · Maksimal 4 MB per gambar."
      >
        <ErrorBox message={error} />
        <label className="upload-zone">
          <ImageIcon />
          <span>{busy ? "Mengunggah..." : "Pilih gambar dari perangkat"}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple={insert === "gallery"}
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                if (insert === "gallery")
                  void uploadGallery(Array.from(e.target.files));
                else void upload(e.target.files[0]);
              }
            }}
          />
        </label>
        <p className="muted">Atau gunakan tautan HTTPS</p>
        {insert === "gallery" ? (
          <textarea
            placeholder="Satu URL HTTPS per baris (maks. 12)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        ) : (
          <input
            placeholder="https://..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        )}
        <Button
          disabled={!imageUrl || busy}
          onClick={() =>
            insert === "gallery" ? addGallery() : addImage(imageUrl)
          }
        >
          Tambahkan {insert === "gallery" ? "galeri" : "gambar"}
        </Button>
      </Modal>
      <Modal
        open={insert === "reference"}
        onOpenChange={() => setInsert("")}
        title="Tambahkan sumber referensi"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!safeUrl(reference.url)) {
              setError("Gunakan URL HTTPS.");
              return;
            }
            update({
              ...doc,
              references: [
                ...doc.references,
                { ...reference, id: crypto.randomUUID() },
              ],
            });
            setReference({
              title: "",
              url: "",
              publisher: "",
              accessed_at: "",
            });
            setInsert("");
          }}
        >
          {[
            ["title", "Judul sumber"],
            ["url", "URL HTTPS"],
            ["publisher", "Penerbit / website"],
            ["accessed_at", "Tanggal akses"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type={
                  key === "accessed_at"
                    ? "date"
                    : key === "url"
                      ? "url"
                      : "text"
                }
                required={key === "title" || key === "url"}
                value={reference[key as keyof typeof reference]}
                onChange={(e) =>
                  setReference({ ...reference, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <ErrorBox message={error} />
          <Button>Simpan sumber</Button>
        </form>
      </Modal>
      <Modal
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title={
          confirmDelete?.type === "page"
            ? "Hapus halaman ini?"
            : "Hapus blok ini?"
        }
        description="Pastikan konten ini tidak diperlukan lagi."
      >
        <div className="form-bottom">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDelete?.type === "page") {
                update({
                  ...doc,
                  pages: doc.pages.filter((p) => p.id !== confirmDelete.id),
                });
                changePage(Math.max(0, pageIndex - 1));
              } else
                changePageData({
                  ...page,
                  blocks: page.blocks.filter((b) => b.id !== confirmDelete?.id),
                });
              setConfirmDelete(null);
            }}
          >
            Hapus
          </Button>
        </div>
      </Modal>
      <Modal
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Siap membagikan tulisanmu?"
        description="Setelah dikirim, tulisan terkunci hingga pengurus membukanya untuk revisi."
      >
        <dl className="summary-list">
          <dt>Penulis</dt>
          <dd>
            {doc.name} · {doc.nim}
          </dd>
          <dt>Email</dt>
          <dd>{doc.email}</dd>
          <dt>Keanggotaan</dt>
          <dd>
            {doc.membership_status} {doc.department}
          </dd>
          <dt>Tema</dt>
          <dd>{doc.theme_title}</dd>
          <dt>Referensi</dt>
          <dd>{doc.references.length} sumber</dd>
        </dl>
        <ol className="summary-pages">
          {doc.pages.map((p, i) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  changePage(i);
                  setSubmitOpen(false);
                }}
              >
                {p.title || "Tanpa judul"} <Eye size={14} />
              </button>
            </li>
          ))}
        </ol>
        <ErrorBox message={error} />
        <Button
          disabled={busy || !hasContent(doc.pages) || !doc.writable}
          onClick={async () => {
            setBusy(true);
            try {
              if (saving.current)
                throw new Error(
                  "Penyimpanan sedang berlangsung. Coba lagi setelah tersimpan.",
                );
              if (dirty.current && !(await save()))
                throw new Error("Simpan perubahan ke server sebelum mengirim.");
              const r = await api(
                endpoint + "/submit",
                "POST",
                documentBody(current.current!),
              );
              dirty.current = false;
              await del(localKey);
              router.push("/success");
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Mengirim..." : "Kirim tulisan"} <Send size={16} />
        </Button>
      </Modal>
      <Modal
        open={!!panel}
        onOpenChange={() => setPanel("")}
        title={
          {
            references: "Sumber referensi",
            notes: "Catatan pengurus",
            review: "Hasil Cek AI per Halaman",
            history: "Riwayat perubahan",
            conflict: "Pulihkan perubahan",
          }[panel] || "Detail"
        }
      >
        {panel === "references" && (
          <>
            {!doc.references.length && (
              <p className="muted">Belum ada sumber referensi.</p>
            )}
            {doc.references.map((r) => (
              <div className="reference-item" key={r.id}>
                <div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title} ↗
                  </a>
                  <small>
                    {r.publisher} {r.accessed_at}
                  </small>
                </div>
                {!readOnly && (
                  <button
                    className="icon-button"
                    aria-label="Hapus sumber"
                    onClick={() =>
                      update({
                        ...doc,
                        references: doc.references.filter((x) => x.id !== r.id),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button
                onClick={() => {
                  setPanel("");
                  setInsert("reference");
                }}
              >
                <Plus size={16} /> Tambah sumber
              </Button>
            )}
          </>
        )}
        {panel === "notes" && (
          <>
            {doc.notes.map((n) => (
              <div className="note" key={n.id}>
                <small>
                  {date(n.created_at)}
                  {n.page_id
                    ? " · Halaman " +
                      (doc.pages.findIndex((p) => p.id === n.page_id) + 1)
                    : ""}
                </small>
                <p>{n.note}</p>
              </div>
            ))}
            {!doc.notes.length && <p className="muted">Belum ada catatan.</p>}
            {admin && (
              <>
                <textarea
                  placeholder="Catatan untuk halaman ini..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  disabled={!note.trim()}
                  onClick={async () => {
                    try {
                      await api(endpoint + "/notes", "POST", {
                        note,
                        page_id: page.id,
                      });
                      const d = await api<FullDoc>(endpoint);
                      setDoc((v) => (v ? { ...v, notes: d.notes } : v));
                      current.current = { ...current.current!, notes: d.notes };
                      setNote("");
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  Simpan catatan
                </Button>
              </>
            )}
          </>
        )}
        {panel === "review" && (
          <>
            {reviewProgress && <p className="review-progress" role="status">{reviewProgress}</p>}
            <p className="muted">Setiap halaman diperiksa dan disimpan secara terpisah.</p>
            {doc.pages.map((p, pageNumber) => {
              const pageReviews = reviews.filter((r) => r.page_id === p.id);
              const r = pageReviews.find((item) => item.review_current) || pageReviews[0];
              const filled = hasContent([p]);
              return (
                <div className="review-result" key={p.id}>
                  <div className="review-page-heading">
                    <strong>Halaman {pageNumber + 1} · {p.title || "Tanpa judul"}</strong>
                    {r && <span className="badge">{r.status}</span>}
                  </div>
                  {!filled ? (
                    <p className="muted">Belum ada materi pada halaman ini.</p>
                  ) : !r ? (
                    <p className="muted">Belum diperiksa.</p>
                  ) : (
                    <>
                      <small>Disimpan {date(r.checked_at)}</small>
                      {!r.review_current && (
                        <div className="warning-banner">Materi halaman ini berubah sejak pemeriksaan terakhir.</div>
                      )}
                      {(r.findings_json || []).length === 0 && (
                        <p className="muted">Tidak ada masalah faktual yang ditandai AI pada halaman ini.</p>
                      )}
                      {(r.findings_json || []).map((f: any, j: number) => (
                        <div className="finding" key={j}>
                          <strong>{f.status}</strong>
                          <blockquote>{f.claim}</blockquote>
                          <p>{f.reason}</p>
                        </div>
                      ))}
                      {(r.sources_json || []).map((s: any, j: number) => (
                        <a className="source-link" key={j} href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title} ↗
                        </a>
                      ))}
                      {pageReviews.length > 1 && (
                        <details className="review-history">
                          <summary>{pageReviews.length - 1} pemeriksaan sebelumnya</summary>
                          {pageReviews.filter((entry) => entry.id !== r.id).map((entry) => (
                            <div key={entry.id} className="review-history-entry">
                              <strong>{date(entry.checked_at)} · {entry.status}</strong>
                            </div>
                          ))}
                        </details>
                      )}
                    </>
                  )}
                  {filled && (
                    <Button variant="secondary" disabled={busy} onClick={() => review(true, p.id)}>
                      <Sparkles size={14} /> Periksa ulang halaman {pageNumber + 1}
                    </Button>
                  )}
                </div>
              );
            })}
            <Button disabled={busy || !doc.pages.some((p) => hasContent([p]))} onClick={() => review(true)}>
              <Sparkles size={16} />
              {busy ? "Memeriksa..." : "Periksa ulang semua halaman"}
            </Button>
            <p className="muted">Hasil AI membantu peninjauan. Keputusan akhir tetap pada pengurus.</p>
            <ErrorBox message={error} />
          </>
        )}
        {panel === "history" && (
          <>
            {!history.length && <p>Belum ada perubahan tersimpan.</p>}
            {history.map((h) => (
              <div className="note" key={h.id}>
                Versi {h.content_version} · {h.actor}
                <small>{date(h.created_at)}</small>
              </div>
            ))}
          </>
        )}
        {panel === "conflict" && (
          <>
            <p>
              Salinan lokal dan versi server berbeda. Unduh salinan lokal
              sebelum memuat versi server; pemuatan akan mengganti editor saat
              ini.
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                downloadJson(
                  current.current,
                  "cyber-writing-salinan-lokal.json",
                )
              }
            >
              <Download size={16} /> Unduh salinan lokal
            </Button>
            <Button
              onClick={async () => {
                try {
                  const d = await api<FullDoc>(endpoint);
                  await backup(d, false);
                  dirty.current = false;
                  blocked.current = false;
                  current.current = d;
                  setDoc(d);
                  setConflict(false);
                  setReviews(d.reviews || []);
                  setPanel("");
                  setError("");
                  setSaved("Tersimpan");
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Muat versi server
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
