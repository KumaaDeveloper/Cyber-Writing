# Status verifikasi

Paket dibuat pada 14 November 2026. Berkas ini membedakan pemeriksaan yang dilakukan di lingkungan pembangunan dari langkah yang memerlukan akun layanan pemilik.

## Sudah dijalankan

- TypeScript diperiksa melalui `npm run typecheck`.
- Build produksi Next.js diperiksa melalui `npm run build`.
- Pengujian otomatis pada `tests/model.test.ts` dan `tests/database.test.ts`.
- Migrasi SQL dijalankan dalam PostgreSQL lokal berbasis PGlite pada tes; bukan koneksi ke Neon.
- Pratinjau beranda dan halaman login admin dilihat di browser desktop.
- Audit dependency produksi menggunakan `npm audit --omit=dev`: 0 vulnerability terlapor pada saat pemeriksaan.
- Hasil terakhir: 41 tes otomatis lulus; build dan typecheck berhasil.

## Kasus pengujian otomatis

1. NIM mempertahankan angka nol awal dan departemen wajib hanya bagi pengurus.
2. Sesi mengikuti waktu mulai, tutup tepat saat deadline, dan menghormati penutupan manual.
3. Status submitted/reviewed terkunci; draft/revision dapat diedit.
4. ID elemen harus unik dan jumlah halaman tidak melewati batas schema.
5. URL javascript/data dan node HTML yang tidak diizinkan ditolak.
6. Struktur rich text yang terlalu dalam ditolak.
7. Submit memerlukan tulisan, bukan hanya judul/gambar.
8. Sesi menolak tanggal terbalik dan menerima jumlah tema yang ditentukan admin (diuji hingga 250 tema).
9. Owner berbeda ditolak meskipun mengetahui UUID tulisan.
10. Simpan mempertahankan halaman, referensi, versi, dan snapshot sebelumnya.
11. Save dengan versi usang ditolak tanpa mengubah halaman server.
12. Batas halaman sesi diperiksa dalam transaksi.
13. Sesi ditutup menolak writer tetapi mengizinkan koreksi admin.
14. Submit menyimpan versi terakhir secara atomik lalu mengunci writer.
15. Retry submit sesudah commit bersifat idempoten.
16. Status revisi membuka kembali tulisan ketika sesi masih aktif.
17. Deadline yang terlewati menolak mutasi meskipun status tersimpan masih open.
18. Foreign key mencegah penghapusan sesi yang memiliki kontribusi.

## Belum diuji dengan layanan nyata

- Koneksi Neon dan TLS/pooling di Vercel.
- Login admin dengan akun bootstrap pada deployment produksi.
- Alur browser lengkap dari identitas sampai submit dan peninjauan admin.
- Unggah, transformasi, dan penghapusan Cloudinary nyata.
- Panggilan Gemini, biaya/kuota, grounding, dan timeout produksi.
- Autosave/resume dengan simulasi putus koneksi dan tutup browser pada perangkat pengguna.
- Pemeriksaan visual seluruh fitur di perangkat mobile, tablet, dan semua resolusi target.

## Checklist setelah environment diisi

- [ ] Jalankan migrasi dan bootstrap; login berhasil dan password salah ditolak.
- [ ] Buat sesi aktif dengan 3 tema dan batas 2 halaman.
- [ ] Isi identitas sebagai Pengurus/Technical; ganti ke Anggota dan pastikan departemen kosong.
- [ ] Pilih tema; tulis dua halaman berisi teks, tabel, gambar, galeri, diagram, checklist, dan referensi.
- [ ] Pastikan penambahan/duplikasi halaman ketiga ditolak.
- [ ] Refresh dan buka kembali browser; verifikasi isi semua halaman serta sumber.
- [ ] Matikan jaringan saat mengetik, sambungkan kembali, dan pastikan perubahan tersimpan.
- [ ] Buka draft di dua tab; ubah konten di keduanya. Pastikan konflik versi ditampilkan dan server tidak ditimpa diam-diam.
- [ ] Coba UUID draft dari browser lain; akses harus ditolak.
- [ ] Kirim tulisan; writer terkunci, admin melihat isi lengkap.
- [ ] Admin beri catatan dan ubah ke Revisi; writer dapat mengedit selama sesi aktif.
- [ ] Tutup sesi ketika editor terbuka; API writer menolak simpan/upload/submit.
- [ ] Admin tetap dapat mengoreksi, membintangi, dan menjalankan pemeriksaan AI setelah sesi ditutup.
- [ ] Periksa tulisan yang sengaja memuat klaim salah dan tanpa referensi; pastikan tidak ada sumber hasil karangan yang ditambahkan UI.
- [ ] Ubah tulisan setelah AI review; status ulasan usang muncul.
- [ ] Verifikasi logout, pergantian password, dan kedaluwarsa session.
- [ ] Periksa 360, 390, 768, 1366, 1440, dan 1920 px: toolbar, modal, tabel horizontal, keyboard, dan navigasi halaman.
- [ ] Hapus tulisan uji dan verifikasi antrean pembersihan Cloudinary kosong setelah maintenance.

Kredensial dan proses deployment nyata harus diselesaikan pemilik sebelum aplikasi dipakai peserta.

## Revisi login dan identitas visual

- Login admin memakai satu form sederhana: judul Masuk admin, username, kata sandi, dan tombol Masuk. Panel promosi dan slogan dihapus.
- Logo baru dari lampiran dipakai utuh pada header; favicon PNG dan ICO memakai gambar yang sama.
- Migrasi build dan bootstrap awal diuji dengan PostgreSQL lokal berbasis PGlite. Tes memeriksa migrasi berulang, password hash benar/salah, akun lama tidak direset, serta password kosong/tidak valid.
- Error database dibedakan secara aman, termasuk driver error yang dibungkus Drizzle. Connection string dan pesan SQL mentah tidak dikirim ke browser/log.
- Login pada deployment Neon/Vercel pemilik tetap memerlukan kredensial dan verifikasi di layanan nyata.

Pemeriksaan visual login revisi terakhir di browser belum berhasil: sesi browser menolak akses tab lama. Validasi build/TypeScript dan 41 tes otomatis berhasil; login Neon/Vercel nyata belum diverifikasi.

## Penyederhanaan dashboard

Menu Seluruh Tulisan dihapus; daftar tulisan ditempatkan pada tiap sesi. Teks promosi dan subtitle statistik dihapus. Password reset saat build bersifat opt-in dengan ADMIN_PASSWORD_RESET_ID. Tes tambahan memeriksa penggantian hash, pencabutan sesi, audit, idempotensi kode reset yang sama, dan rollback saat username/password reset tidak valid. Password produksi tidak diubah dalam lingkungan pembangunan ini.

## Revisi jumlah tema dan tools

Tes migrasi tambahan memeriksa perpindahan schema lama dengan relasi tulisan tetap utuh, penyimpanan sembilan tema, pengurutan ulang menggunakan upsert yang sama seperti API, penghapusan tema di tengah, dan penolakan indeks negatif. Form dan payload server tidak lagi membatasi tiga tema.

Pemeriksaan visual perubahan terakhir pada browser belum dilakukan di sesi ini. Verifikasi interaksi Tools, seleksi teks, tabel, dan layout mobile pada deployment pemilik sebelum digunakan luas.

## Revisi CYWRITE dan regresi Tools

Unit test DOM (jsdom, bukan browser nyata) berhasil menguji penambahan dua blok teks, mengetik konten, membuka Tools setelah penambahan, toggle Tools tiga kali, format tebal, serta undo. Toolbar kini menerima editor aktif secara langsung, tanpa portal DOM. Pratinjau penulis dan elemen sidebar/ringkasan atas yang diminta telah dihapus; nama tampilan menjadi CYWRITE. Pemeriksaan visual pada browser produksi tetap belum dilakukan pada sesi ini.

## Jeda kirim, reader dan Gemini

Sembilan tes tambahan memeriksa batas 24 jam, jeda 0, pembuatan draft idempoten, pembatasan browser/NIM, draft baru setelah jeda dengan artikel lama tetap read-only, perubahan pengaturan admin, dan riwayat lock setelah penghapusan. Tes transport Gemini memeriksa privasi identitas, grounding/JSON, batas retry, error kredensial/kuota/model/timeout, output tidak valid, dan hasil tanpa sumber. Pengiriman dan AI layanan nyata tetap perlu diuji setelah deployment dengan kredensial pemilik.

## Transport Gemini terbaru

Lima tes tambahan memeriksa format REST Google Search/JSON, API key hanya di header, pengabaian part thought, pemetaan error bersarang/JSON/DNS/TLS, probe metadata tanpa artikel, retry setelah HTTP 503, serta status HTTP yang tetap terbaca saat error body bukan JSON. Beranda tidak membuka popup otomatis pada status submitted/reviewed; data lock dan kemampuan membaca tulisan tetap dipertahankan. Koneksi Gemini memakai project API milik pemilik belum dapat diuji di lingkungan ini.

## Revisi model gratis, input dan toolbar lokal

Default Gemini menjadi gemini-3.5-flash-lite dan Search grounding dimatikan secara default. Tes transport/AI memeriksa model, tidak ada tools Google Search pada mode default, sumber model tidak dianggap terverifikasi, dan mode Search opsional tetap memproses sumber grounding. Tes DOM menggunakan komponen menu produksi: toggle, tombol tutup, klik di luar, Escape, penambahan teks, format tebal/miring, undo, dan dua text box yang terpisah. Tes NIM memeriksa penyaringan simbol/huruf, nol di depan dan penolakan nilai non-angka oleh server. Tombol beranda dikelompokkan dengan gap 8px.

Hasil akhir: 44 tes otomatis dan pemeriksaan TypeScript/build produksi dijalankan untuk revisi ini. Pengujian Gemini memakai respons simulasi; API key pemilik dan tampilan pada browser produksi belum diverifikasi.

## Respons Gemini dan shortcut keyboard

Lima tes tambahan mencakup variasi format JSON lengkap, pemulihan satu kali dari output tidak sesuai schema, finish reason MAX_TOKENS, penolakan berulang untuk output kosong/terpotong/halaman di luar batas, dan pemblokiran konten tanpa retry. Tes transport memeriksa maxOutputTokens benar-benar dikirim. Tes DOM editor mengirim event Ctrl+Z dan Ctrl+Y, memeriksa browser default dicegah dan isi/format kembali sesuai riwayat, tanpa bantuan teks pada UI. Label Workspace dipindah dari grup logo ke tengah header; pemisah vertikal dihapus.

Validasi revisi ini mencakup 49 tes otomatis, TypeScript dan build produksi. Gemini diuji memakai respons simulasi; API milik pemilik serta tampilan browser produksi belum diverifikasi.

## Validasi Cek AI per halaman, revisi 15 November 2026

64 tes otomatis berhasil, TypeScript berhasil, dan build produksi Next.js 16.4.6 berhasil. Tes database menggunakan PGlite mencakup dua halaman yang diperiksa terpisah, simpan/baca hasil, cache, edit satu halaman, pengurutan ulang, pemeriksaan ulang, penghapusan halaman, kegagalan provider pada halaman kedua, dan penolakan hasil bila konten berubah selama generasi. Migrasi 005 diuji berulang dari indeks unik instalasi lama. Tes AI memastikan tanpa Search tidak otomatis menjadi Kurang Valid, temuan negatif menentukan status, dan vonis negatif tanpa temuan tidak disimpan sebagai VALID.

Panggilan Gemini disimulasikan. Akurasi faktual dengan API pemilik, database Neon produksi, UI browser produksi, dan eksekusi skrip CMD pada Windows belum diuji dalam lingkungan ini. Build lokal melewati setup database karena DATABASE_URL tidak tersedia.

## Validasi revisi mobile

66 tes otomatis berhasil, termasuk klik tepi tabel, munculnya tombol hapus tanpa membuka menu Format teks, penghapusan hanya tabel kedua, retensi teks/tabel lain, dan Undo. Tes unggahan memeriksa batas tepat 2.097.152 byte, penolakan satu byte di atas batas, file kosong, dan tipe file yang tidak didukung. Pemeriksaan TypeScript dan build produksi berhasil.

Pengujian browser dengan viewport 320/390/768/1280 px telah disiapkan tetapi tidak dapat dijalankan: Chromium lokal tidak dapat membuka socket yang diperlukan, dan browser terpisah tidak dapat menjangkau server localhost. Karena itu, tata letak visual dan keyboard di perangkat mobile fisik belum diverifikasi. Tidak ada klaim uji visual browser yang berhasil dalam revisi ini.
