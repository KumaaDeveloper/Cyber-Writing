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

1. Buat database PostgreSQL di Neon dan isi connection string ke `.env.local`.
2. Jalankan migrasi dan bootstrap dari mesin lokal menggunakan database tujuan. Migrasi memakai transaction, advisory lock, dan tabel `schema_migrations`, sehingga eksekusi ulang aman.
3. Buat cloud Cloudinary. Ambil cloud name, API key, dan API secret dari akun sendiri. Upload dilakukan melalui backend; tidak memakai unsigned upload preset.
4. Buat Gemini API key dengan akses/billing yang diperlukan untuk Google Search grounding. Pemeriksaan AI bisa menggunakan kuota berbayar sesuai akun.
5. Unggah isi folder proyek ke repository GitHub pribadi. Jangan mengunggah `.env.local`, `.next`, atau `node_modules`.
6. Import repository ke Vercel. Framework preset: **Next.js**. Build command: `npm run build`. Install command: `npm ci`. Root directory harus menunjuk folder yang berisi `package.json`.
7. Isi environment variables produksi di Vercel. `APP_URL` harus sesuai origin deployment yang digunakan. Bootstrap password tidak perlu dimasukkan di Vercel setelah admin dibuat.
8. Deploy. Jika memakai custom domain, ubah `APP_URL` ke domain tersebut lalu redeploy. Gunakan database terpisah jika membuat deployment pengujian.
9. Buka `/admin`, masuk, lalu buat sesi berisi 1–3 tema. Sesuaikan waktu mulai/akhir **WIB**. Pilih status terjadwal/terbuka sesuai jadwal. Akun admin dapat mengubah password di Pengaturan.
10. Jalankan checklist pengujian layanan nyata di `VERIFICATION.md` sebelum membagikan URL kepada peserta.

Build tidak memerlukan kredensial database dan tidak mengisi data contoh. Tanpa konfigurasi, beranda menunjukkan sesi belum tersedia. Login, penulisan, upload, dan AI baru dapat dipakai setelah layanan masing-masing dihubungkan.

API AI memakai runtime Node dan `maxDuration=120`. Pastikan paket Vercel mendukung durasi tersebut. Upload dibatasi **4 MiB per file**, di bawah batas payload standar Vercel Functions yang didokumentasikan sebesar 4,5 MB, termasuk overhead multipart. API memvalidasi ukuran, tipe, dan isi gambar; lalu mengubahnya ke WebP dengan sisi maksimal 2.400 px.

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
public/cyber-logo.png       Logo resmi dari lampiran
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
