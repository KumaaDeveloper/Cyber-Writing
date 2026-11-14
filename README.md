# KSM Cyber Writing

Aplikasi penulisan materi keamanan siber untuk KSM Cyber Security FIK UPN “Veteran” Jakarta. Dibangun dengan Next.js App Router dan TypeScript, menggunakan logo asli yang dilampirkan. Palet merah–hitam mengacu pada referensi Cyber LMS.

## Mulai dari sini

1. Ekstrak ZIP ini.
2. Buka terminal **di dalam folder `cyber-writing`**, tempat `package.json` berada.
3. Pasang Node.js 22 atau lebih baru, kemudian jalankan:

```bash
npm ci
```

4. Salin `.env.example` menjadi `.env.local`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

5. Isi `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, dan kredensial admin awal. Isi juga Cloudinary dan Gemini untuk memakai unggahan serta pemeriksaan AI.
6. Buat tabel dan admin:

```bash
npm run db:migrate
npm run admin:bootstrap
```

7. Hapus nilai `ADMIN_BOOTSTRAP_PASSWORD` setelah bootstrap berhasil. Password tersimpan sebagai hash bcrypt di database.
8. Jalankan aplikasi:

```bash
npm run dev
```

Buka `http://localhost:3000`. Masuk admin melalui `http://localhost:3000/admin`, lalu buat sesi penulisan. Tidak ada data sesi atau tulisan dummy yang dimasukkan ke database produksi.

## Environment variables

| Nama | Fungsi |
| --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL Neon dengan TLS; gunakan pooled endpoint untuk Vercel. |
| `APP_URL` | Origin aplikasi yang persis, misalnya `http://localhost:3000` atau `https://nama-proyek.vercel.app`. Digunakan untuk pemeriksaan Origin. |
| `AUTH_SECRET` | Rahasia acak minimal 32 karakter untuk pseudonimisasi rate limit. |
| `ADMIN_USERNAME` | Username bootstrap; default `admin`. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Password bootstrap minimal 12 karakter dan maksimal 72 byte UTF-8. Hanya diperlukan saat membuat admin pertama. |
| `GEMINI_API_KEY` | API key Gemini; server saja. |
| `GEMINI_MODEL` | Default `gemini-2.5-flash`; pilih model yang mendukung Search grounding dan structured output. |
| `CLOUDINARY_CLOUD_NAME` | Nama cloud Cloudinary. |
| `CLOUDINARY_API_KEY` | API key Cloudinary server. |
| `CLOUDINARY_API_SECRET` | API secret Cloudinary server. |

Buat `AUTH_SECRET` sendiri dengan:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Tidak ada secret asli di paket ini. Jangan menambahkan awalan `NEXT_PUBLIC_` pada kredensial. `.env.local` diabaikan Git.

## Deploy ke Vercel + Neon

Versi ini menyiapkan tabel dan admin awal saat `npm run build` pada deployment Production. Preview deployment tidak menjalankan perubahan database otomatis. Tanpa DATABASE_URL, build UI tetap dapat dijalankan, tetapi login dan penulisan belum dapat digunakan.

1. Buat database Neon dan salin connection string TLS ke Vercel sebagai `DATABASE_URL`.
2. Di Vercel, pilih repository ini, Framework Next.js, Root Directory `./`, Install `npm ci`, Build `npm run build`, Output otomatis, Node 24.x.
3. Isi environment Production: `DATABASE_URL`, `APP_URL` (origin website persis, termasuk https), `AUTH_SECRET` (minimal 32 karakter), `ADMIN_USERNAME=admin`, dan `ADMIN_BOOTSTRAP_PASSWORD` (password awal minimal 12 karakter, maksimal 72 byte UTF-8).
4. Isi kredensial Cloudinary untuk upload serta `GEMINI_API_KEY` dan `GEMINI_MODEL` untuk pemeriksaan AI.
5. Deploy atau Redeploy. Build menjalankan migrasi SQL secara transaksional, kemudian membuat admin **hanya jika tabel admins belum berisi akun**. Akun yang sudah ada tidak diubah atau direset oleh environment variable.
6. Periksa Build Logs: `[setup] Database schema ready.` dan `[setup] Admin created.` atau `[setup] Existing admin retained; password unchanged.` menandakan setup berhasil. Koneksi database yang gagal membuat build berhenti dengan pesan konfigurasi, bukan melanjutkan deployment yang rusak.
7. Login melalui `/admin` memakai username/password bootstrap. Setelah berhasil, hapus `ADMIN_BOOTSTRAP_PASSWORD` dari Vercel; password hash tetap tersimpan di database.
8. Buat sesi penulisan dari admin. Gunakan WIB untuk jadwal sesi.

Migrasi dan bootstrap manual tetap tersedia melalui `npm run db:migrate` dan `npm run admin:bootstrap` dengan `.env.local`, misalnya untuk setup database Preview terpisah. Tidak ada password default atau secret asli di kode.

Jika login masih gagal, periksa pesan spesifik di layar: database belum diisi, tabel belum siap, koneksi Neon ditolak/tidak terjangkau, akun admin belum dibuat, atau APP_URL tidak sesuai. Pastikan environment Production disimpan lalu Redeploy. Bila akun admin sudah ada, mengganti ADMIN_BOOTSTRAP_PASSWORD **tidak** mengganti password akun tersebut; gunakan password yang dibuat saat bootstrap pertama atau fitur ganti password setelah login.

Cloudinary memakai upload backend bertanda tangan. Tidak perlu unsigned upload preset. Maksimal file 4 MiB; isi gambar divalidasi dan dikonversi ke WebP. API AI memakai runtime Node dengan maxDuration 120 detik.

## Fitur yang diimplementasikan

### Penulis

- Beranda minimal: tanpa sesi hanya menampilkan “Belum Ada Sesi Penulisan”. Saat sesi aktif, tampil nama sesi, deskripsi jika ada, tenggat, dan tombol Mulai Menulis.
- Form identitas dan tema memakai satu kolom dengan penanda tahap ringkas; tanpa hero, ilustrasi, atau slogan.
- Identitas, tema, editor, pratinjau, dan konfirmasi pengiriman.
- Nama, NIM sebagai teks, email, keanggotaan, serta departemen kondisional BPH/Technical/Social.
- Aturan panjang NIM numerik dapat diubah admin, 5–20 digit.
- Satu tema per tulisan; 1–3 tema dinamis per sesi.
- Dokumen terdiri atas halaman terpisah dengan `?page=1`, tambah/duplikasi/hapus, ubah judul, urutkan, dan batas halaman server.
- Blok teks TipTap: H1–H3, paragraf, bold, italic, underline, strike, daftar, kutipan, kode, hyperlink HTTPS, alignment, warna, highlight, checklist, undo/redo.
- Tabel beserta kontrol baris, kolom, header, dan penghapusan.
- Gambar upload/URL, caption, alt text, ukuran, alignment, dan penggantian URL.
- Galeri sederhana hingga 12 gambar, caption dan alt text tiap gambar.
- Diagram Mermaid yang dapat diedit dan dirender dalam iframe terisolasi; directive dan interaksi eksternal tidak diaktifkan.
- Callout, warning, divider, serta daftar sumber referensi.
- Blok dapat dinaikkan, diturunkan, diduplikasi, dan dihapus. Pengurutan memakai tombol yang juga tersedia di layar sentuh.
- Navigasi halaman tanpa memuat ulang penuh.
- Autosave debounce 1,1 detik, retry 15 detik, backup IndexedDB, dan sinkronisasi ketika koneksi kembali.
- Popup lanjutkan draft, pemulihan halaman terakhir, dan konfirmasi mulai ulang.
- Konflik versi tidak menimpa server secara diam-diam: pengguna dapat mengunduh salinan lokal sebelum memuat versi server.
- Draft dan tulisan terkirim terlindungi cookie token browser asal. Mengubah UUID URL tidak memberi akses ke tulisan lain.
- Sesi berakhir memblokir endpoint mutasi; tulisan terkirim terkunci sampai admin mengembalikannya untuk revisi.
- Submit idempoten: retry setelah commit tidak membuat pengiriman ganda.

### Admin

- Login server, logout, session expiration 8 jam, bcrypt, cookie HttpOnly/SameSite/Secure di produksi.
- Dashboard delapan metrik, termasuk jumlah sesi, penulis, tulisan, draft, bintang, dan pemeriksaan AI.
- Pembuatan, penyuntingan, pembukaan, penutupan, perpanjangan, dan penghapusan sesi kosong.
- Jadwal sesi tidak boleh bertumpang tindih. `scheduled` menjadi aktif saat waktunya tiba; penutupan dihitung dari waktu server pada setiap permintaan, sehingga tidak bergantung pada cron.
- Tema yang sudah dipakai tidak bisa dihapus; dapat dinonaktifkan.
- Semua tulisan lintas sesi, pencarian nama/NIM, filter sesi/tema/status, pagination 15 tulisan.
- Reader/editor per halaman, catatan koreksi, bintang, status tinjauan/revisi, dan penghapusan dengan konfirmasi.
- Riwayat perubahan menyimpan maksimal 50 snapshot terakhir per tulisan; UI menampilkan daftar versinya. Tidak ada pemulihan otomatis snapshot ke versi aktif.
- Audit aktivitas admin dan pengaturan kata sandi/aturan NIM.
- Pemeriksaan Gemini dua tahap: riset dengan Google Search, kemudian struktur JSON. Tidak mengirim identitas penulis ke Gemini.
- Status Valid/Kurang Valid/Tidak Valid, temuan per halaman, saran, sumber dari grounding metadata, dan versi konten.
- Hasil cache dipakai ulang; perubahan konten menandai ulasan lama sebagai usang. Pemeriksaan ulang tersedia secara manual.
- Tanpa hasil grounding, status diturunkan menjadi Kurang Valid dan ditandai belum terverifikasi dari internet.

### Mobile dan aksesibilitas

- Layout khusus mobile pada lebar 360–600 px: drawer halaman/admin, toolbar horizontal, dialog dalam viewport, navigasi halaman tetap terlihat.
- Panel pengaturan dan referensi menggunakan dialog yang dapat diakses keyboard dan dikelola fokusnya melalui Radix.
- Daftar admin lengkap dipertahankan dalam tabel yang dapat digeser horizontal; kolom tidak dibuang untuk mobile.
- Font Inter lokal, modul editor/diagram di-load secara dinamis, dan reduced-motion support.

## Batas dan keputusan implementasi

- Aplikasi produksi memakai Neon/PostgreSQL. PGlite hanya dependency pengujian untuk menjalankan PostgreSQL secara lokal dalam tes, tidak menjadi fallback database produksi.
- Satu draft/tulisan per browser per sesi. Identitas tanpa login bukan identitas terverifikasi. Tidak ada pengambilan draft hanya lewat NIM/email.
- Menghapus cookie atau data situs dapat menghilangkan akses penulis ke draft. Admin tetap dapat membukanya. Aplikasi tidak menyediakan pemulihan lintas perangkat atau email OTP.
- Backup offline berlaku pada aplikasi yang sudah terbuka/termuat; aplikasi ini bukan PWA dengan jaminan cold-start offline.
- Batas dokumen: 30 halaman maksimum sistem, 100 blok per halaman, 100 referensi, payload editor sekitar 1 MB. Admin dapat menentukan batas halaman lebih rendah. Upload maksimal 60 file per tulisan.
- AI menilai teks, struktur diagram, caption, dan referensi yang dikirim. Pemeriksaan visual terhadap isi piksel gambar masih memerlukan pengurus; tidak ada OCR otomatis.
- AI bukan penentu kebenaran final. Pengurus tetap menilai sumber dan konteks. Bukti yang tidak cukup tidak dianggap otomatis salah.
- Diagram memakai kode Mermaid; editor visual node/panah drag-and-drop tidak disertakan.
- Pengurutan memakai tombol naik/turun, bukan drag-and-drop.
- Carousel Instagram 4:5, export PNG/PDF, dan layout publikasi adalah fitur opsional pada brief dan **tidak disertakan**. Pratinjau dokumen lengkap tersedia per halaman, dengan gambar, diagram, tabel, dan sumber.
- Proyek ini disiapkan untuk deployment Vercel oleh pemilik akun. Belum ada deployment Vercel atau koneksi kredensial eksternal yang dilakukan dalam pembuatan paket ini.

## Struktur proyek

```text
app/
  [[...slug]]/page.tsx       Routing UI penulis/admin
  api/[...path]/route.ts    Endpoint server dan otorisasi
  layout.tsx               Metadata dan font
  globals.css              Design system dan responsive layouts
components/
  application.tsx          Landing, identitas, tema, success
  workspace.tsx            Editor halaman, autosave, preview
  rich-editor.tsx           TipTap dan toolbar
  diagram.tsx               Renderer Mermaid terisolasi
  admin.tsx                 Login, dashboard, sesi, daftar, pengaturan
  ui.tsx                    Komponen Radix/UI dan API client
lib/
  model.ts                  Skema Zod dan aturan domain
  db.ts                     Drizzle dan PostgreSQL pool
  security.ts               Auth, cookie, rate limit, Origin
  documents.ts              Transaksi konten, ownership, revision
  ai.ts                     Riset Gemini dan structured result
  assets.ts                 Antrean penghapusan object storage
scripts/
  migrate.ts                Migrasi transaksional
  bootstrap.ts              Pembuatan admin pertama
  maintenance.ts            Pembersihan sesi/rate limit/aset terhapus
  dev.mjs                   Launcher dev kompatibel preview
db/001_initial.sql         Skema, relasi, constraint, indeks
tests/                     Unit dan transaksi database
public/cyber-mark-v2.png       Logo resmi dari lampiran
```

## Pengujian dan pemeliharaan

```bash
npm run typecheck
npm test
npm run build
```

Sesekali jalankan pemeliharaan dari lingkungan yang memiliki `.env.local` benar:

```bash
npm run maintenance
```

Penghapusan tulisan memasukkan aset Cloudinary ke antrean dalam transaksi yang sama dengan penghapusan data. Aplikasi mencoba membersihkannya sesudah commit. Jika Cloudinary gagal, antrean tetap ada dan dapat diproses ulang melalui maintenance. Penghapusan gambar dari satu blok tidak langsung menghapus objek karena riwayat revisi mungkin masih memakainya.

Backup database dan retensi data peserta diatur pemilik aplikasi melalui Neon. Jangan menampilkan daftar tulisan penulis sebagai halaman publik.

## Referensi implementasi

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js cookies: https://nextjs.org/docs/app/api-reference/functions/cookies
- Google Search grounding: https://ai.google.dev/gemini-api/docs/google-search
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Model Gemini 2.5 Flash: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- Batas Vercel Functions: https://vercel.com/docs/functions/limitations
