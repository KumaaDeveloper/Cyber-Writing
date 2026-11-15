# CYWRITE

CYWRITE adalah aplikasi penulisan materi keamanan siber untuk KSM Cyber Security FIK UPN “Veteran” Jakarta. Dibangun dengan Next.js App Router dan TypeScript, menggunakan logo asli yang dilampirkan. Palet merah–hitam mengacu pada referensi Cyber LMS.

## Revisi dashboard dan password admin

Dashboard menggunakan judul dan label langsung tanpa slogan. Menu “Seluruh Tulisan” dihapus. Daftar tulisan diakses dari **Sesi penulisan → Lihat tulisan**; tulisan terbaru, bintang, dan pemeriksaan AI tetap dapat dibuka.

Untuk menetapkan password yang diinginkan pada akun admin yang sudah ada, isi environment **Production** di Vercel:

- `ADMIN_USERNAME`: username akun yang akan direset (untuk proyek ini `admin`).
- `ADMIN_BOOTSTRAP_PASSWORD`: password baru pilihan pemilik, minimal 12 karakter dan maksimal 72 byte UTF-8.
- `ADMIN_PASSWORD_RESET_ID`: kode reset, misalnya `admin-reset-1`.

Push kode versi ini lalu Redeploy dengan Build Command `npm run build`. Saat build, password akun diproses sebagai hash bcrypt dan seluruh sesi admin tersebut dikeluarkan. Login memakai password yang baru. Setelah berhasil, hapus `ADMIN_PASSWORD_RESET_ID` dan `ADMIN_BOOTSTRAP_PASSWORD` dari environment.

Kode reset yang sama hanya dipakai sekali: build selanjutnya tidak mengubah password yang mungkin sudah diganti dari Pengaturan. Reset berikutnya memerlukan kode baru, misalnya `admin-reset-2`. Tanpa kode reset, akun lama tetap dipertahankan. Password asli tidak ditulis ke repository, log, atau paket ZIP ini.

## Revisi tema, editor, dan informasi sesi

- Pilihan tema dipusatkan pada satu kolom, tanpa nomor dekoratif. Teks dan indikator pilihan disejajarkan secara vertikal; deskripsi kosong tidak menyisakan ruang tambahan.
- Informasi sesi aktif di beranda tampil dalam box dengan judul, tenggat, dan tombol Mulai Menulis. Saat tidak ada sesi, tetap hanya muncul pesan Belum Ada Sesi Penulisan.
- Tombol **Tools** utama hanya menambah konten. Tiap text box memiliki tombol **Format teks** sendiri dengan toolbar ringkas dan ikon palet untuk warna. Klik ulang, tombol tutup, Escape, atau klik di luar panel akan menutup menu. Menutup panel tidak membuat ulang editor atau menghapus riwayat undo.
- Admin mulai dari satu tema dan dapat menambah sebanyak yang dibutuhkan. Tidak ada batas hitungan tiga tema pada form atau server; minimal satu tema tetap diperlukan. Batas ukuran request total tetap berlaku.
- Migrasi `002_unlimited_themes.sql` menghapus batas indeks 0–2 serta memungkinkan perubahan urutan tema dalam transaksi. Migrasi mempertahankan ID dan relasi tema pada tulisan lama. Tema yang sudah dipakai tulisan tetap tidak dapat dihapus; admin dapat menonaktifkannya.
- Deploy melalui `npm run build` menjalankan migrasi baru secara otomatis pada Production yang memiliki DATABASE_URL. Alternatif manual: `npm run db:migrate`.

## Revisi CYWRITE

Nama tampilan website, judul tab, dan label dokumen menjadi **CYWRITE**. Logo organisasi tetap dipakai. Nama repository serta ZIP distribusi dipertahankan agar alur update yang sudah digunakan tidak berubah.

Tombol Pratinjau penulis, tautan Sumber referensi/Catatan pengurus pada sidebar, serta penghitung “halaman · sumber” pada bar atas dihapus. Data sumber/catatan yang sudah tersimpan tidak dihapus dari database. Ringkasan kirim tulisan tetap tersedia.

Toolbar teks menerima instance editor milik text box yang bersangkutan. Editor tetap terpasang saat menu buka/tutup sehingga isi, seleksi dan undo tidak hilang. Tes DOM memeriksa toggle menu tambah konten, penutupan melalui pilihan/Escape/klik luar, format dan undo, serta isolasi format antara dua text box.

## Revisi pengiriman dan Gemini

- Setelah kirim, beranda menampilkan sesi dan jadwal menulis lagi, tanpa popup otomatis. Akses Lihat tulisan membuka reader; Mulai ulang tidak ditampilkan untuk tulisan terkirim. Reader menampilkan isi server, tanpa tombol Kirim atau tools pengeditan. Tulisan terkirim tidak otomatis dibuka untuk edit setelah jeda berakhir.
- Jeda pengiriman default **24 jam berjalan sejak submit berhasil**. Admin mengubahnya di **Pengaturan → Jeda pengiriman**, dalam jam; nilai 0 menonaktifkan jeda. Pengaturan berlaku global, termasuk terhadap pengiriman sebelumnya.
- Pembatasan diperiksa di backend untuk browser asal dan NIM yang diisi. Mengganti nama/email atau sesi tidak melewati jeda. NIM bukan identitas terverifikasi karena penulis tidak login; aplikasi tidak dapat memastikan identitas orang yang sengaja memakai NIM berbeda dari browser baru.
- Jeda menghalangi draft baru, penyimpanan, upload, dan pengiriman. Tulisan lama tetap dapat dibaca. Setelah jeda berakhir, penulis dapat membuat tulisan baru pada sesi yang sama selama sesi masih dibuka. Membuka editor yang sudah terkunci dapat memerlukan refresh setelah pengaturan admin berubah.
- Riwayat jeda disimpan terpisah dari tulisan sehingga menghapus tulisan tidak langsung membuka jeda. Draft aktif tidak digandakan oleh klik berulang. Admin tetap dapat meninjau dan mengoreksi saat penulis terkunci.
- Migrasi `003_writer_cooldown.sql` membuat pengaturan dan riwayat jeda, mengisi riwayat dari pengiriman lama, dan menghapus constraint lama yang membatasi satu tulisan per sesi selamanya. Build Production menjalankannya otomatis jika DATABASE_URL tersedia.
- Kartu sesi memakai tipografi seragam dan tanggal Mulai/Berakhir yang terpisah. Kolom Aksi pada daftar tulisan hanya berisi bintang dan hapus; klik judul tulisan untuk membukanya.
- Gemini sekarang membedakan API key tidak valid, izin, billing, model tidak ditemukan, kuota, timeout, gangguan layanan, output kosong, dan JSON/nomor halaman tidak valid. Detail kredensial atau isi tulisan tidak dicetak ke log.
- Request menggunakan REST resmi Google dengan status HTTP eksplisit, tanpa retry tersembunyi SDK. Aplikasi mencoba ulang sekali hanya untuk error layanan 5xx, dengan jeda pendek dan batas total 95 detik. Error kredensial dan kuota tidak diulang otomatis. Mode tanpa Search memakai satu permintaan JSON langsung. Mode Search memisahkan riset dan pemformatan JSON. Google Search hanya diaktifkan jika GEMINI_SEARCH_GROUNDING=true.
- Respons AI divalidasi sebelum disimpan. Tidak ada sumber grounding berarti hasil ditandai Kurang Valid/belum terverifikasi, bukan Valid. Hasil versi konten yang sama tetap memakai cache.

Panggilan Gemini asli membutuhkan API key dan project Google yang memiliki akses/kuota. Tes lokal memakai transport simulasi; koneksi Google AI Studio dan Neon milik pemilik belum diuji di lingkungan pembangunan ini.

## Revisi koneksi Gemini dan beranda

- Default model diperbarui ke `gemini-3.5-flash-lite`, sesuai model teks yang mendukung Google Search dan structured output pada dokumentasi Google. Environment GEMINI_MODEL yang sudah tersimpan tetap dipakai; ubah nilainya di Vercel lalu Redeploy untuk beralih model.
- Transport pemeriksaan memakai REST resmi `generativelanguage.googleapis.com/v1beta/models/...:generateContent`. Key dikirim lewat header x-goog-api-key, bukan URL. Isi pemikiran internal (part thought) tidak dipakai sebagai jawaban pemeriksaan.
- Pembacaan error kini mencakup exception bersarang, kode HTTP di JSON message, nama status Google (NOT_FOUND, RESOURCE_EXHAUSTED), serta penyebab DNS/TLS/koneksi. Tidak ada error/credential mentah yang dikembalikan ke browser.
- **Pengaturan → Uji koneksi Gemini** melakukan GET metadata model menggunakan API key yang sama. Pengujian ini tidak mengirim tulisan dan tidak menjalankan generasi berbayar; hasil menunjukkan model tersedia atau error akses. Ini memeriksa koneksi/model, bukan menjamin hasil fact-check atau kemampuan grounding pada setiap permintaan.
- Kembali ke beranda setelah mengirim tidak otomatis membuka modal. Beranda tetap menampilkan sesi, tenggat, waktu menulis lagi dan tombol mulai yang nonaktif selama jeda. Tulisan terkirim tetap bisa dibuka lewat Lihat tulisan terakhir. Popup otomatis hanya untuk draft/revisi yang dapat dilanjutkan.
- Blok teks editable memiliki garis tipis dan highlight fokus. Font, lebar dokumen, ukuran heading, padding blok dan sidebar desktop diperbaiki. Reader tetap menampilkan isi tanpa garis input.

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
| `GEMINI_MODEL` | Default `gemini-3.5-flash-lite`; environment yang sudah diisi tetap dipakai. |
| `GEMINI_SEARCH_GROUNDING` | Default `false`: analisis tanpa Search untuk free tier. Isi `true` hanya bila project memiliki akses Search grounding. |
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

Jika login masih gagal, periksa pesan spesifik di layar: database belum diisi, tabel belum siap, koneksi Neon ditolak/tidak terjangkau, akun admin belum dibuat, atau APP_URL tidak sesuai. Pastikan environment Production disimpan lalu Redeploy. Bila akun admin sudah ada, mengganti ADMIN_BOOTSTRAP_PASSWORD **tidak** mengganti password akun tersebut tanpa `ADMIN_PASSWORD_RESET_ID`; gunakan prosedur reset di awal dokumen atau fitur ganti password setelah login.

Cloudinary memakai upload backend bertanda tangan. Tidak perlu unsigned upload preset. Maksimal file 4 MiB; isi gambar divalidasi dan dikonversi ke WebP. API AI memakai runtime Node dengan maxDuration 120 detik.

## Fitur yang diimplementasikan

### Penulis

- Beranda minimal: tanpa sesi hanya menampilkan “Belum Ada Sesi Penulisan”. Saat sesi aktif, tampil nama sesi, deskripsi jika ada, tenggat, dan tombol Mulai Menulis.
- Form identitas dan tema memakai satu kolom dengan penanda tahap ringkas; tanpa hero, ilustrasi, atau slogan.
- Identitas, tema, editor, dan konfirmasi pengiriman.
- Nama, NIM sebagai teks, email, keanggotaan, serta departemen kondisional BPH/Technical/Social.
- Aturan panjang NIM numerik dapat diubah admin, 5–20 digit.
- Satu tema per tulisan; jumlah tema per sesi ditentukan admin tanpa batas tiga tema.
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

- Layout khusus mobile pada lebar 360–600 px: drawer halaman/admin, satu tombol Tools dengan panel responsif, dialog dalam viewport, navigasi halaman tetap terlihat.
- Panel pengaturan dan referensi menggunakan dialog yang dapat diakses keyboard dan dikelola fokusnya melalui Radix.
- Daftar admin lengkap dipertahankan dalam tabel yang dapat digeser horizontal; kolom tidak dibuang untuk mobile.
- Font Inter lokal, modul editor/diagram di-load secara dinamis, dan reduced-motion support.

## Batas dan keputusan implementasi

- Aplikasi produksi memakai Neon/PostgreSQL. PGlite hanya dependency pengujian untuk menjalankan PostgreSQL secara lokal dalam tes, tidak menjadi fallback database produksi.
- Satu draft aktif per browser per sesi. Tulisan baru pada sesi yang sama dapat dibuat setelah jeda pengiriman berakhir. Identitas tanpa login bukan identitas terverifikasi. Tidak ada pengambilan draft hanya lewat NIM/email.
- Menghapus cookie atau data situs dapat menghilangkan akses penulis ke draft. Admin tetap dapat membukanya. Aplikasi tidak menyediakan pemulihan lintas perangkat atau email OTP.
- Backup offline berlaku pada aplikasi yang sudah terbuka/termuat; aplikasi ini bukan PWA dengan jaminan cold-start offline.
- Batas dokumen: 30 halaman maksimum sistem, 100 blok per halaman, 100 referensi, payload editor sekitar 1 MB. Admin dapat menentukan batas halaman lebih rendah. Upload maksimal 60 file per tulisan.
- AI menilai teks, struktur diagram, caption, dan referensi yang dikirim. Pemeriksaan visual terhadap isi piksel gambar masih memerlukan pengurus; tidak ada OCR otomatis.
- AI bukan penentu kebenaran final. Pengurus tetap menilai sumber dan konteks. Bukti yang tidak cukup tidak dianggap otomatis salah.
- Diagram memakai kode Mermaid; editor visual node/panah drag-and-drop tidak disertakan.
- Pengurutan memakai tombol naik/turun, bukan drag-and-drop.
- Carousel Instagram 4:5, export PNG/PDF, dan layout publikasi adalah fitur opsional pada brief dan **tidak disertakan**. Tulisan dibaca per halaman, dengan gambar, diagram, tabel, dan sumber.
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
- Model Gemini 3.5 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- Batas Vercel Functions: https://vercel.com/docs/functions/limitations

## Revisi free tier dan kontrol editor

Default model adalah `gemini-3.5-flash-lite`. Di Vercel ubah `GEMINI_MODEL` ke nilai tersebut; biarkan `GEMINI_SEARCH_GROUNDING` kosong atau `false`, lalu Redeploy. Google mencantumkan generasi teks model ini pada free tier, tetapi Search grounding tidak tersedia pada tier itu. Karena itu aplikasi tidak lagi mengaktifkan Search secara default. Pemeriksaan tanpa Search menggunakan pengetahuan model dan materi yang dikirim; hasil diberi penanda belum terverifikasi dari internet, tanpa sumber hasil karangan model. Kuota dan akses project tetap mengikuti Google. Referensi: https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite

NIM disaring menjadi digit ASCII saat mengetik maupun paste; nol di depan tetap dipertahankan dan validasi server tetap berlaku. Tombol pada box sesi kini satu grup dengan jarak 8px. Menu Tools utama berupa dropdown tetap dekat tombol; format teks ditangani secara lokal di tiap text box.

## Perbaikan hasil Gemini dan header workspace

Mode tanpa Search sekarang memeriksa isi tulisan dalam satu request structured JSON. Bentuk output dibatasi menjadi 20 temuan ringkas; jika respons terpotong/kosong atau gagal validasi, aplikasi mengulang sekali menggunakan materi asli dan batas 8 temuan. Batas token output dikirim ke REST Google. Respons terblokir mendapat pesan tersendiri, tidak diulang sebagai kesalahan JSON. Tidak ada perbaikan dengan menebak penutup JSON, mengarang hasil, atau menerima nomor halaman yang tidak ada. Perbedaan kapitalisasi status, page berupa string angka dan saran kosong dinormalisasi sebelum validasi. Data hasil gagal tetap tidak disimpan.

Ctrl+Z dan Ctrl+Y memakai riwayat editor yang sama dengan tombol Undo/Redo, tanpa teks petunjuk shortcut pada UI. Label Workspace dipusatkan di header dan pemisah vertikal di sebelah logo dihapus.

## Pembaruan Cek AI per halaman

- Label tombol menjadi **Cek AI** tanpa tombol ikon mata di sampingnya. Klik **Cek AI** membuka hasil dan memeriksa **setiap halaman berisi materi satu per satu**; hasil tiap halaman langsung disimpan di database dan tetap tersedia setelah halaman dimuat ulang.
- Hasil dipisah menjadi Halaman 1, Halaman 2, dst. Pengurus dapat memeriksa ulang satu halaman atau semua halaman. Pemeriksaan yang sudah ada dengan konten sama digunakan ulang secara otomatis; perubahan halaman lain tidak membatalkan hasil halaman yang tidak berubah.
- Pemeriksaan tidak lagi memaksa **KURANG VALID** hanya karena Google Search tidak aktif/tidak ada sitasi. Status mengikuti masalah faktual yang spesifik. Paragraf ringkasan review (termasuk teks generik soal pemeriksaan tanpa web) serta label **Saran:** dihapus dari tampilan hasil; alasan tiap temuan faktual tetap tersedia.
- Migrasi baru `db/004_page_reviews.sql` menambahkan keterkaitan halaman dan sidik konten pada hasil AI. Data review lama tidak dihapus, tetapi hasil lama yang hanya mencakup seluruh dokumen tidak ditampilkan sebagai review halaman baru.
- Setelah mengunggah pembaruan, jalankan `npm run build` pada Production dengan `DATABASE_URL` yang benar agar migrasi diterapkan (atau `npm run db:migrate`). Tanpa migrasi tersebut, endpoint Cek AI per halaman belum dapat bekerja. Gemini tetap membutuhkan `GEMINI_API_KEY` yang aktif.
