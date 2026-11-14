"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  ArrowUpRight,
  Layers,
  FileText,
  Users,
  Star,
  Sparkles,
  Settings,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Menu,
  X,
  Clock,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  LockKeyhole,
  Check,
  Activity,
} from "lucide-react";
import {
  type SessionData,
  type Theme,
  sessionOpen,
  statusLabel,
} from "@/lib/model";
import {
  Brand,
  Button,
  Modal,
  Spinner,
  Empty,
  ErrorBox,
  api,
  APIError,
  errorText,
  date,
} from "./ui";
import Workspace from "./workspace";
export default function Admin() {
  const path = usePathname(),
    router = useRouter();
  const [auth, setAuth] = useState<any>(undefined),
    [error, setError] = useState(""),
    [drawer, setDrawer] = useState(false);
  useEffect(() => {
    api("auth")
      .then((d) => setAuth(d.admin))
      .catch((e) => {
        setAuth(null);
        if (!(e instanceof APIError && e.status === 401))
          setError(errorText(e));
      });
  }, []);
  if (auth === undefined) return <Spinner />;
  if (!auth)
    return (
      <AdminLogin
        error={error}
        onLogin={(a) => {
          setAuth(a);
          router.push("/admin/dashboard");
        }}
      />
    );
  const section = path.split("/")[2] || "dashboard";
  const docId = path.split("/")[3];
  if (section === "submissions" && docId) return <Workspace id={docId} admin />;
  const nav = [
    ["dashboard", LayoutDashboard, "Dashboard"],
    ["sessions", Layers, "Kelola sesi"],
    ["submissions", FileText, "Seluruh tulisan"],
    ["starred", Star, "Tulisan berbintang"],
    ["ai-reviews", Sparkles, "Pemeriksaan AI"],
    ["settings", Settings, "Pengaturan"],
  ] as const;
  return (
    <div className="admin-shell">
      {drawer && (
        <button
          className="drawer-shade"
          aria-label="Tutup menu"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={"admin-sidebar " + (drawer ? "open" : "")}>
        <Brand />
        <div className="admin-nav-label">RUANG PENGURUS</div>
        <nav>
          {nav.map(([key, I, label]) => (
            <Link
              key={key}
              className={section === key ? "active" : ""}
              href={"/admin/" + key}
              onClick={() => setDrawer(false)}
            >
              <I size={18} />
              {label}
              {section === key && <span className="red-dot" />}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-avatar">A</div>
          <div>
            <strong>{auth.username}</strong>
            <small>Administrator</small>
          </div>
          <button
            className="icon-button"
            aria-label="Keluar"
            onClick={async () => {
              try {
                await api("auth/logout", "POST");
                setAuth(null);
                router.push("/admin");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="Buka menu"
              onClick={() => setDrawer(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {nav.find((n) => n[0] === section)?.[2] || "Dashboard"}
            </strong>
          </div>
          <span className="badge">
            <span className="green-dot" /> Admin workspace
          </span>
        </header>
        <div className="admin-content">
          <ErrorBox message={error} />
          {section === "dashboard" ? (
            <Dashboard />
          ) : section === "sessions" ? (
            <Sessions />
          ) : section === "settings" ? (
            <AdminSettings />
          ) : (
            <SubmissionList
              key={section}
              starred={section === "starred"}
              ai={section === "ai-reviews"}
            />
          )}
        </div>
      </main>
    </div>
  );
}
function AdminLogin({
  onLogin,
  error: initialError,
}: {
  onLogin: (a: any) => void;
  error: string;
}) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  const { register, handleSubmit } = useForm<{
    username: string;
    password: string;
  }>();
  return (
    <div className="admin-login">
      <section className="login-art">
        <Brand />
        <div>
          <span className="eyebrow">BEHIND EVERY GREAT STORY</span>
          <h1>
            Pengetahuan
            <br />
            yang terarah.
            <br />
            <span>Dampak yang nyata.</span>
          </h1>
          <p>
            Tinjau tulisan, kembangkan ide, dan hadirkan edukasi cyber yang
            dapat dipercaya.
          </p>
          <div className="login-illustration">
            <FileText size={110} strokeWidth={1} />
            <span>
              <ShieldCheck size={46} />
            </span>
          </div>
        </div>
        <small>
          KSM CYBER SECURITY
          <br />
          FAKULTAS ILMU KOMPUTER · UPN VETERAN JAKARTA
        </small>
      </section>
      <section className="login-form">
        <form
          onSubmit={handleSubmit(async (v) => {
            setBusy(true);
            setError("");
            try {
              await api("auth/login", "POST", v);
              const a = await api("auth");
              onLogin(a.admin);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          })}
        >
          <span className="login-lock">
            <LockKeyhole size={24} />
          </span>
          <span className="eyebrow">ADMIN ACCESS</span>
          <h2>Selamat datang kembali.</h2>
          <p>Masuk untuk mengelola ruang Cyber Writing.</p>
          <ErrorBox message={error} />
          <label>
            Username
            <input
              autoComplete="username"
              placeholder="admin"
              required
              {...register("username")}
            />
          </label>
          <label>
            Kata sandi
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              required
              {...register("password")}
            />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? "Memverifikasi..." : "Masuk ke dashboard"}{" "}
            <ArrowRight size={17} />
          </Button>
          <small className="login-security">
            <ShieldCheck size={14} /> Akses terbatas untuk pengurus yang
            berwenang.
          </small>
        </form>
      </section>
    </div>
  );
}
function Dashboard() {
  const [stats, setStats] = useState<any>(null),
    [recent, setRecent] = useState<any[]>([]),
    [sessions, setSessions] = useState<SessionData[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api("admin/dashboard"),
      api("admin/submissions"),
      api("admin/sessions"),
    ])
      .then(([s, r, se]) => {
        setStats(s);
        setRecent(r.items.slice(0, 5));
        setSessions(se);
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  const active = sessions.find((s) => sessionOpen(s));
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>
            Ruang untuk ide yang berarti<span>.</span>
          </h1>
          <p>
            Pantau kontribusi, tinjau materi, dan tumbuhkan pengetahuan bersama.
          </p>
        </div>
        <Link className="btn primary" href="/admin/sessions">
          <Plus size={16} /> Buat sesi
        </Link>
      </div>
      <ErrorBox message={error} />
      <div className="stats-grid">
        {[
          ["submissions", "Total tulisan", FileText],
          ["writers", "Total penulis", Users],
          ["submitted", "Menunggu tinjauan", Clock],
          ["starred", "Tulisan terpilih", Star],
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof FileText;
          return (
            <div className="stat-card" key={String(key)}>
              <div>
                <span>{label as string}</span>
                <I size={18} />
              </div>
              <strong>{stats ? stats[String(key)] : "—"}</strong>
              <small>
                {key === "starred"
                  ? "Siap dikembangkan menjadi konten"
                  : "Seluruh sesi penulisan"}
              </small>
            </div>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-table">
          <div className="card-heading">
            <h3>Tulisan terbaru</h3>
            <Link href="/admin/submissions">
              Lihat semua <ArrowUpRight size={15} />
            </Link>
          </div>
          {!stats && !error ? (
            <Spinner />
          ) : !recent.length ? (
            <Empty title="Ide berikutnya dimulai di sini">
              Tulisan akan tampil setelah penulis berkontribusi.
            </Empty>
          ) : (
            recent.map((r) => (
              <Link
                className="recent-item"
                key={r.id}
                href={"/admin/submissions/" + r.id}
              >
                <span className="recent-icon">
                  <FileText size={19} />
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <small>
                    {r.name} · {r.theme_title}
                  </small>
                </div>
                <span className="badge">{statusLabel[r.status]}</span>
                <ChevronRight size={15} />
              </Link>
            ))
          )}
        </section>
        <section className="active-session-card">
          <div>
            <span className="eyebrow">
              <span className="red-dot" /> SESI AKTIF
            </span>
            <Layers size={22} />
          </div>
          <h2>{active?.title || "Saatnya membuka ruang."}</h2>
          <p>
            {active?.description ||
              "Buat sesi pertama, pilih tema, dan undang mahasiswa untuk berkontribusi."}
          </p>
          {active && (
            <>
              <span className="session-detail">
                <Clock size={14} />
                {date(active.end_at)}
              </span>
              <span className="session-detail">
                <FileText size={14} />
                Maksimal {active.max_pages} halaman · {active.themes.length}{" "}
                tema
              </span>
            </>
          )}
          <Link href="/admin/sessions" className="btn secondary">
            {active ? "Kelola sesi" : "Buat sesi penulisan"}{" "}
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <div className="metric-strip">
        <span>
          <strong>{stats?.sessions ?? "—"}</strong> Total sesi
        </span>
        <span>
          <strong>{stats?.active ?? "—"}</strong> Sesi aktif
        </span>
        <span>
          <strong>{stats?.drafts ?? "—"}</strong> Draft tersimpan
        </span>
        <span>
          <strong>{stats?.reviewed ?? "—"}</strong> Diperiksa AI
        </span>
      </div>
    </>
  );
}
const blankTheme = (): Theme => ({
  title: "",
  description: "",
  instructions: "",
  available: true,
});
const localDate = (value: string) =>
  new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16);
function Sessions() {
  const [sessions, setSessions] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<any>(null);
  const load = () =>
    api("admin/sessions")
      .then(setSessions)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);
  function create() {
    setError("");
    setEditing({
      title: "",
      description: "",
      start_at: localDate(new Date().toISOString()),
      end_at: localDate(new Date(Date.now() + 5 * 86400000).toISOString()),
      max_pages: 8,
      status: "scheduled",
      themes: [blankTheme(), blankTheme(), blankTheme()],
    });
  }
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">WRITING SESSIONS</span>
          <h1>Kelola sesi</h1>
          <p>
            Atur waktu, tentukan tema, dan beri ruang untuk perspektif baru.
          </p>
        </div>
        <Button onClick={create}>
          <Plus size={16} /> Buat sesi
        </Button>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : !sessions.length ? (
        <Empty title="Belum ada sesi penulisan">
          Buat sesi pertama untuk mulai menerima kontribusi.
        </Empty>
      ) : (
        <div className="session-grid">
          {sessions.map((s) => {
            const state = sessionOpen(s)
              ? "open"
              : s.status === "closed" || new Date(s.end_at) < new Date()
                ? "closed"
                : "scheduled";
            return (
              <article className="session-card" key={s.id}>
                <div className="card-heading">
                  <span className={"badge " + state}>{statusLabel[state]}</span>
                  <div>
                    <button
                      className="icon-button"
                      aria-label={"Edit " + s.title}
                      onClick={() => {
                        setError("");
                        setEditing({
                          ...s,
                          start_at: localDate(s.start_at),
                          end_at: localDate(s.end_at),
                        });
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Hapus " + s.title}
                      onClick={() => setRemove(s)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h2>{s.title}</h2>
                <p>{s.description}</p>
                <span className="session-detail">
                  <Clock size={14} />
                  {date(s.start_at)} — {date(s.end_at)}
                </span>
                <div className="session-themes">
                  {s.themes.map((t: Theme) => (
                    <span key={t.id}>{t.title}</span>
                  ))}
                </div>
                <div className="session-card-bottom">
                  <span>
                    {s.count} tulisan · Maks. {s.max_pages} halaman
                  </span>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api("admin/sessions/" + s.id, "PUT", {
                          ...s,
                          status: state === "open" ? "closed" : "open",
                          start_at:
                            state === "open"
                              ? s.start_at
                              : new Date().toISOString(),
                          end_at:
                            state === "open"
                              ? s.end_at
                              : new Date(
                                  Math.max(
                                    new Date(s.end_at).getTime(),
                                    Date.now() + 5 * 86400000,
                                  ),
                                ).toISOString(),
                        });
                        await load();
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    {state === "open" ? "Tutup sesi" : "Buka sesi"}{" "}
                    <ArrowRight size={13} />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Modal
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        title={editing?.id ? "Edit sesi penulisan" : "Buat sesi penulisan"}
        description="Waktu menggunakan WIB. Sesi otomatis mengikuti jadwal yang ditentukan."
      >
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const body = {
                  ...editing,
                  start_at: new Date(
                    editing.start_at + ":00+07:00",
                  ).toISOString(),
                  end_at: new Date(editing.end_at + ":00+07:00").toISOString(),
                };
                await api(
                  "admin/sessions" + (editing.id ? "/" + editing.id : ""),
                  editing.id ? "PUT" : "POST",
                  body,
                );
                setEditing(null);
                await load();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nama sesi
              <input
                required
                value={editing.title}
                maxLength={150}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label>
              Deskripsi
              <textarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Mulai (WIB)
                <input
                  type="datetime-local"
                  required
                  value={editing.start_at}
                  onChange={(e) =>
                    setEditing({ ...editing, start_at: e.target.value })
                  }
                />
              </label>
              <label>
                Berakhir (WIB)
                <input
                  type="datetime-local"
                  required
                  value={editing.end_at}
                  onChange={(e) =>
                    setEditing({ ...editing, end_at: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Maksimal halaman
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={editing.max_pages}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      max_pages: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                >
                  <option value="scheduled">Terjadwal</option>
                  <option value="open">Terbuka sesuai jadwal</option>
                  <option value="closed">Ditutup manual</option>
                </select>
              </label>
            </div>
            <h3>Tema penulisan ({editing.themes.length}/3)</h3>
            {editing.themes.map((t: Theme, i: number) => (
              <fieldset className="theme-form" key={i}>
                <legend>Tema {i + 1}</legend>
                <label>
                  Judul
                  <input
                    required
                    value={t.title}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        themes: editing.themes.map((x: Theme, j: number) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Deskripsi
                  <textarea
                    value={t.description}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        themes: editing.themes.map((x: Theme, j: number) =>
                          j === i ? { ...x, description: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Petunjuk penulisan
                  <textarea
                    value={t.instructions}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        themes: editing.themes.map((x: Theme, j: number) =>
                          j === i ? { ...x, instructions: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <div className="form-bottom">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={t.available}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          themes: editing.themes.map((x: Theme, j: number) =>
                            j === i ? { ...x, available: e.target.checked } : x,
                          ),
                        })
                      }
                    />{" "}
                    Tersedia untuk penulis
                  </label>
                  {i === editing.themes.length - 1 && i > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          themes: editing.themes.slice(0, -1),
                        })
                      }
                    >
                      Hapus tema
                    </Button>
                  )}
                </div>
              </fieldset>
            ))}
            {editing.themes.length < 3 && (
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  setEditing({
                    ...editing,
                    themes: [...editing.themes, blankTheme()],
                  })
                }
              >
                <Plus size={14} /> Tambah tema
              </Button>
            )}
            <ErrorBox message={error} />
            <div className="form-bottom">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Batal
              </Button>
              <Button disabled={busy}>
                {busy ? "Menyimpan..." : "Simpan sesi"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!remove}
        onOpenChange={() => setRemove(null)}
        title="Hapus sesi?"
        description="Hanya sesi tanpa tulisan yang dapat dihapus. Sesi dengan tulisan harus ditutup untuk menjaga data."
      >
        <ErrorBox message={error} />
        <div className="form-bottom">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api("admin/sessions/" + remove.id, "DELETE");
                setRemove(null);
                await load();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Hapus sesi
          </Button>
        </div>
      </Modal>
    </>
  );
}
function SubmissionList({ starred, ai }: { starred: boolean; ai: boolean }) {
  const [items, setItems] = useState<any[]>([]),
    [sessions, setSessions] = useState<SessionData[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [session, setSession] = useState(""),
    [status, setStatus] = useState(""),
    [theme, setTheme] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [remove, setRemove] = useState<any>(null),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    api("admin/sessions")
      .then(setSessions)
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({
        q,
        session,
        status,
        theme,
        page: String(page),
        star: starred ? "1" : "0",
        ai: ai ? "1" : "0",
      });
      api("admin/submissions?" + query)
        .then((d) => {
          if (active) {
            setItems(d.items);
            setTotal(d.total);
          }
        })
        .catch((e) => setError(errorText(e)))
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, session, status, theme, page, starred, ai, refresh]);
  const themes = [
    ...new Set(
      sessions
        .filter((s) => !session || s.id === session)
        .flatMap((s) => s.themes.map((t) => t.title)),
    ),
  ];
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">
            {starred
              ? "CURATED COLLECTION"
              : ai
                ? "FACT CHECKING"
                : "WRITER CONTRIBUTIONS"}
          </span>
          <h1>
            {starred
              ? "Tulisan berbintang"
              : ai
                ? "Pemeriksaan AI"
                : "Seluruh tulisan"}
          </h1>
          <p>
            {starred
              ? "Ide terpilih untuk dikembangkan menjadi konten edukasi."
              : ai
                ? "Ulasan teknis dan sumber pendukung untuk peninjauan pengurus."
                : "Setiap tulisan adalah langkah menuju ruang digital yang lebih aman."}
          </p>
        </div>
        <span className="count-pill">{total} tulisan</span>
      </div>
      <ErrorBox message={error} />
      <div className="filters">
        <label className="search-input">
          <Search size={17} />
          <input
            placeholder="Cari nama atau NIM..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Filter sesi"
          value={session}
          onChange={(e) => {
            setSession(e.target.value);
            setTheme("");
            setPage(1);
          }}
        >
          <option value="">Semua sesi</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter tema"
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua tema</option>
          {themes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua status</option>
          {["draft", "submitted", "revision", "reviewed"].map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <Spinner />
      ) : !items.length ? (
        <Empty title="Belum ada tulisan">
          Tulisan yang sesuai filter akan tampil di sini.
        </Empty>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  "Penulis / Tulisan",
                  "Keanggotaan",
                  "Tema / Sesi",
                  "Halaman",
                  "Status",
                  "AI Review",
                  "Diperbarui",
                  "Aksi",
                ].map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="table-title"
                      href={"/admin/submissions/" + r.id}
                    >
                      {r.title}
                    </Link>
                    <span>{r.name}</span>
                    <small>{r.nim}</small>
                  </td>
                  <td>
                    {r.membership_status}
                    <small>{r.department || "—"}</small>
                  </td>
                  <td>
                    {r.theme_title}
                    <small>{r.session_title}</small>
                  </td>
                  <td>{r.pages}</td>
                  <td>
                    <span className={"badge " + r.status}>
                      {statusLabel[r.status]}
                    </span>
                  </td>
                  <td>
                    <span className="badge">
                      {r.ai_status || "Belum dicek"}
                    </span>
                    {r.ai_status && r.ai_version !== r.content_version && (
                      <small className="field-error">Ulasan usang</small>
                    )}
                  </td>
                  <td>
                    <small>{date(r.updated_at)}</small>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="icon-button"
                        aria-label={
                          r.is_starred ? "Hapus bintang" : "Bintangi tulisan"
                        }
                        onClick={async () => {
                          try {
                            await api("admin/submissions/" + r.id, "PATCH", {
                              is_starred: !r.is_starred,
                            });
                            setRefresh((v) => v + 1);
                          } catch (e) {
                            setError(errorText(e));
                          }
                        }}
                      >
                        <Star
                          size={17}
                          fill={r.is_starred ? "currentColor" : "none"}
                          className={r.is_starred ? "gold" : ""}
                        />
                      </button>
                      <Link
                        className="icon-button"
                        aria-label="Buka tulisan"
                        href={"/admin/submissions/" + r.id}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                      <button
                        className="icon-button"
                        aria-label="Hapus tulisan"
                        onClick={() => setRemove(r)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <span>
          {total} tulisan · Halaman {page} dari{" "}
          {Math.max(1, Math.ceil(total / 15))}
        </span>
        <div>
          <Button
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
          </Button>
          <Button
            variant="secondary"
            disabled={page * 15 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      </div>
      <Modal
        open={!!remove}
        onOpenChange={() => setRemove(null)}
        title="Hapus tulisan secara permanen?"
        description={
          "Tulisan “" +
          (remove?.title || "") +
          "”, halaman, catatan, dan ulasannya akan dihapus."
        }
      >
        <ErrorBox message={error} />
        <div className="form-bottom">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api("admin/submissions/" + remove.id, "DELETE");
                setRemove(null);
                setRefresh((v) => v + 1);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Hapus tulisan
          </Button>
        </div>
      </Modal>
    </>
  );
}
function AdminSettings() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [min, setMin] = useState(5),
    [max, setMax] = useState(20);
  const form = useForm<{ currentPassword: string; newPassword: string }>();
  useEffect(() => {
    api("admin/settings")
      .then((d) => {
        setData(d);
        const pattern = d.settings.find(
          (s: any) => s.key === "nim_pattern",
        )?.value;
        const m = pattern?.match(/\{(\d+),(\d+)\}/);
        if (m) {
          setMin(Number(m[1]));
          setMax(Number(m[2]));
        }
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">WORKSPACE SETTINGS</span>
          <h1>Pengaturan</h1>
          <p>Kelola keamanan akun dan aturan penulisan.</p>
        </div>
      </div>
      <ErrorBox message={error} />
      {message && <div className="success-banner">{message}</div>}
      <div className="settings-grid">
        <section className="settings-card">
          <h3>
            <LockKeyhole size={19} /> Keamanan akun
          </h3>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await api("admin/settings", "PUT", v);
                setMessage(
                  "Kata sandi diperbarui. Sesi admin lain telah dikeluarkan.",
                );
                form.reset();
              } catch (e) {
                setError(errorText(e));
              }
            })}
          >
            <label>
              Kata sandi saat ini
              <input
                type="password"
                autoComplete="current-password"
                required
                {...form.register("currentPassword")}
              />
            </label>
            <label>
              Kata sandi baru
              <input
                type="password"
                minLength={12}
                autoComplete="new-password"
                required
                {...form.register("newPassword")}
              />
              <small>Minimal 12 karakter.</small>
            </label>
            <Button disabled={form.formState.isSubmitting}>
              Perbarui kata sandi
            </Button>
          </form>
        </section>
        <section className="settings-card">
          <h3>
            <Settings size={19} /> Aturan NIM
          </h3>
          <p>NIM disimpan sebagai teks, termasuk angka nol di awal.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("admin/settings", "PATCH", { min, max });
                setMessage("Aturan NIM diperbarui.");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <div className="form-grid">
              <label>
                Minimal digit
                <input
                  type="number"
                  min="5"
                  max="20"
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                />
              </label>
              <label>
                Maksimal digit
                <input
                  type="number"
                  min={min}
                  max="20"
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                />
              </label>
            </div>
            <Button>Simpan aturan</Button>
          </form>
        </section>
        <section className="settings-card">
          <h3>
            <Activity size={19} /> Konfigurasi integrasi
          </h3>
          <p>
            Status menunjukkan environment variable tersedia; bukan hasil uji
            koneksi.
          </p>
          {Object.entries(data?.integrations || {}).map(([k, v]) => (
            <div className="integration-row" key={k}>
              <strong>
                {
                  {
                    database: "Neon PostgreSQL",
                    gemini: "Google Gemini",
                    images: "Cloudinary",
                  }[k]
                }
              </strong>
              <span className={"badge " + (v ? "open" : "closed")}>
                {v ? "Dikonfigurasi" : "Belum diisi"}
              </span>
            </div>
          ))}
        </section>
        <section className="settings-card">
          <h3>
            <ShieldCheck size={19} /> Aktivitas admin
          </h3>
          <div className="audit-list">
            {data?.audit.map((a: any, i: number) => (
              <div key={i}>
                <span>{a.action}</span>
                <small>{date(a.created_at)}</small>
              </div>
            ))}
            {!data?.audit.length && <p>Belum ada aktivitas.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
