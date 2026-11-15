"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  PenLine,
} from "lucide-react";
import { get, set, del } from "idb-keyval";
import { identitySchema, type Identity, type SessionData } from "@/lib/model";
import {
  Brand,
  Button,
  Modal,
  Spinner,
  ErrorBox,
  Footer,
  api,
  errorText,
  date,
} from "./ui";
const Workspace = dynamic(() => import("./workspace"), {
  ssr: false,
  loading: () => <Spinner />,
});
const Admin = dynamic(() => import("./admin"), {
  ssr: false,
  loading: () => <Spinner />,
});
export default function Application() {
  const path = usePathname(),
    router = useRouter();
  if (path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/write/") || path.startsWith("/preview/"))
    return <Workspace id={path.split("/")[2]} />;
  if (path === "/success")
    return (
      <div className="public-page">
        <header>
          <Brand />
        </header>
        <main className="success">
          <span className="success-icon">
            <CheckCircle2 size={40} />
          </span>
          <span className="eyebrow">KONTRIBUSI DITERIMA</span>
          <h1>
            Tulisan berhasil
            <br />
            dikirim!
          </h1>
          <p>
            Terima kasih telah berkontribusi dalam CYWRITE. Tulisanmu akan
            melalui proses peninjauan oleh admin.
          </p>
          <Button onClick={() => router.push("/")}>
            Kembali ke beranda <ArrowRight size={16} />
          </Button>
        </main>
        <Footer />
      </div>
    );
  return (
    <WriterStart step={path === "/identity" ? 1 : path === "/themes" ? 2 : 0} />
  );
}
function WriterStart({ step }: { step: number }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [resume, setResume] = useState<any>(null),
    [confirm, setConfirm] = useState(false),
    [themeConfirm, setThemeConfirm] = useState(false),
    [nimPattern, setNimPattern] = useState("^[0-9]{5,20}$");
  const form = useForm<Identity>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      name: "",
      nim: "",
      email: "",
      membership_status: "anggota",
      department: null,
    },
  });
  const membership = form.watch("membership_status");
  useEffect(() => {
    let active = true;
    api("public")
      .then((d) => {
        if (active) {
          setSession(d.session);
          if (d.nim_pattern) setNimPattern(d.nim_pattern);
        }
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
    get<Identity>("cw-identity").then((v) => {
      if (v && active) form.reset(v);
    });
    api("drafts")
      .then((d) => {
        if (active && d.drafts.length) setResume(d.drafts[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (membership !== "pengurus") form.setValue("department", null);
  }, [membership, form]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const identity = await get<Identity>("cw-identity");
      if (!identity) {
        router.push("/identity");
        return;
      }
      const r = await api("drafts", "POST", {
        identity,
        session_id: session!.id,
        theme_id: selected,
      });
      await set("cw-last-id", r.id);
      router.push("/write/" + r.id + "?page=1");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setThemeConfirm(false);
    }
  }
  return (
    <div className="public-page">
      <header>
        <Brand />
      </header>
      {!step ? (
        <main className="simple-home">
          {loading ? (
            <p className="session-empty" role="status">
              Memuat...
            </p>
          ) : session ? (
            <section className="simple-session">
              <h1>{session.title}</h1>
              {session.description && <p>{session.description}</p>}
              <small>Ditutup {date(session.end_at)}</small>
              <Button onClick={() => router.push("/identity")}>
                Mulai Menulis <ArrowRight size={16} />
              </Button>
            </section>
          ) : (
            <h1 className="session-empty">Belum Ada Sesi Penulisan</h1>
          )}
        </main>
      ) : (
        <main className="simple-form-layout">
          <nav className="simple-progress" aria-label="Tahapan penulisan">
            {["Identitas", "Tema", "Menulis"].map((label, i) => (
              <span
                key={label}
                aria-current={step === i + 1 ? "step" : undefined}
              >
                {label}
              </span>
            ))}
          </nav>
          <section className="form-panel">
            {loading ? (
              <Spinner />
            ) : !session ? (
              <>
                <h2>Belum Ada Sesi Penulisan</h2>
                <Button variant="secondary" onClick={() => router.push("/")}>
                  Kembali
                </Button>
              </>
            ) : step === 1 ? (
              <form
                onSubmit={form.handleSubmit(async (v) => {
                  if (!new RegExp(nimPattern).test(v.nim)) {
                    form.setError("nim", {
                      message: "NIM tidak sesuai aturan yang ditentukan admin.",
                    });
                    return;
                  }
                  await set("cw-identity", v);
                  router.push("/themes");
                })}
              >
                <div className="section-heading">
                  <h2>Identitas penulis</h2>
                </div>
                <label>
                  Nama lengkap <b>*</b>
                  <input
                    placeholder="Nama lengkapmu"
                    autoComplete="name"
                    {...form.register("name")}
                  />
                  <small className="field-error">
                    {form.formState.errors.name?.message}
                  </small>
                </label>
                <div className="form-grid">
                  <label>
                    NIM <b>*</b>
                    <input
                      inputMode="numeric"
                      placeholder="Nomor induk mahasiswa"
                      {...form.register("nim")}
                    />
                    <small className="field-error">
                      {form.formState.errors.nim?.message}
                    </small>
                  </label>
                  <label>
                    Email <b>*</b>
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="nama@email.com"
                      {...form.register("email")}
                    />
                    <small className="field-error">
                      {form.formState.errors.email?.message}
                    </small>
                  </label>
                </div>
                <fieldset>
                  <legend>
                    Status keanggotaan <b>*</b>
                  </legend>
                  <div className="membership-options">
                    {[
                      ["anggota", "Anggota Cyber"],
                      ["pengurus", "Pengurus Cyber"],
                      ["non-anggota", "Non Anggota"],
                    ].map(([v, l]) => (
                      <label
                        className={
                          membership === v ? "option selected" : "option"
                        }
                        key={v}
                      >
                        <input
                          type="radio"
                          value={v}
                          {...form.register("membership_status")}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {membership === "pengurus" && (
                  <label className="fade-in">
                    Departemen <b>*</b>
                    <select {...form.register("department")} defaultValue="">
                      <option value="" disabled>
                        Pilih departemen
                      </option>
                      {["BPH", "Technical", "Social"].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    <small className="field-error">
                      {form.formState.errors.department?.message}
                    </small>
                  </label>
                )}
                <div className="form-bottom">
                  <Link href="/">Kembali</Link>
                  <Button type="submit">
                    Lanjutkan <ArrowRight size={16} />
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="section-heading">
                  <h2>Tema penulisan</h2>
                  <p>
                    {session.title} · Maksimal {session.max_pages} halaman
                  </p>
                </div>
                <div className="themes">
                  {session.themes.map((t) => (
                    <button
                      key={t.id}
                      className={
                        "theme-card " + (selected === t.id ? "selected" : "")
                      }
                      disabled={!t.available}
                      onClick={() => setSelected(t.id!)}
                    >
                      <div>
                        <h3>{t.title}</h3>
                        {t.description && <p>{t.description}</p>}
                        {t.instructions && <small>{t.instructions}</small>}
                        {!t.available && (
                          <span className="badge">Tidak tersedia</span>
                        )}
                      </div>
                      <span className="radio-mark">
                        {selected === t.id && <Check size={13} />}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="form-bottom">
                  <Link href="/identity">Kembali</Link>
                  <Button
                    disabled={!selected || busy}
                    onClick={() => setThemeConfirm(true)}
                  >
                    Masuk workspace <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
          </section>
        </main>
      )}
      {error && (
        <div className="page-alert">
          <ErrorBox message={error} />
        </div>
      )}
      <Modal
        open={!!resume && step === 0 && !!session}
        onOpenChange={(v) => {
          if (!v) setResume(null);
        }}
        title="Lanjutkan tulisan?"
        description="Tulisan dari browser ini masih tersimpan."
      >
        <div className="resume-card">
          <FileText />
          <div>
            <strong>{resume?.title}</strong>
            <p>{resume?.session_title}</p>
          </div>
        </div>
        <div className="form-bottom">
          <Button
            variant="ghost"
            disabled={!["draft", "revision"].includes(resume?.status)}
            onClick={() => setConfirm(true)}
          >
            Mulai ulang
          </Button>
          <Button
            onClick={async () => {
              await set("cw-last-id", resume.id);
              const page = (await get("cw-page-" + resume.id)) || 1;
              router.push(`/write/${resume.id}?page=${page}`);
            }}
          >
            Buka tulisan <ArrowRight size={16} />
          </Button>
        </div>
      </Modal>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Hapus draft dan mulai ulang?"
        description="Draft beserta seluruh halamannya akan dihapus. Tindakan ini tidak dapat dibatalkan."
      >
        <ErrorBox message={error} />
        <div className="form-bottom">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("drafts/" + resume.id, "DELETE");
                await del("cw-draft-" + resume.id);
                setResume(null);
                setConfirm(false);
                router.push("/identity");
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Hapus draft
          </Button>
        </div>
      </Modal>
      <Modal
        open={themeConfirm}
        onOpenChange={setThemeConfirm}
        title="Mulai dengan tema ini?"
        description={session?.themes.find((t) => t.id === selected)?.title}
      >
        <p>
          Tema akan melekat pada tulisan ini. Kontenmu akan tersimpan otomatis
          saat menulis.
        </p>
        <ErrorBox message={error} />
        <div className="form-bottom">
          <Button variant="secondary" onClick={() => setThemeConfirm(false)}>
            Kembali
          </Button>
          <Button disabled={busy} onClick={create}>
            {busy ? "Menyiapkan..." : "Mulai menulis"} <PenLine size={15} />
          </Button>
        </div>
      </Modal>
    </div>
  );
}
