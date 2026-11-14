# Status verifikasi

Paket dibuat pada 14 November 2026. Berkas ini membedakan pemeriksaan yang dilakukan di lingkungan pembangunan dari langkah yang memerlukan akun layanan pemilik.

## Sudah dijalankan

- TypeScript diperiksa melalui `npm run typecheck`.
- Build produksi Next.js diperiksa melalui `npm run build`.
- Pengujian otomatis pada `tests/model.test.ts` dan `tests/database.test.ts`.
- Migrasi SQL dijalankan dalam PostgreSQL lokal berbasis PGlite pada tes; bukan koneksi ke Neon.
- Pratinjau beranda dan halaman login admin dilihat di browser desktop.
- Audit dependency produksi menggunakan `npm audit --omit=dev`: 0 vulnerability terlapor pada saat pemeriksaan.
- Hasil terakhir: 25 tes otomatis lulus; build dan typecheck berhasil.

## Kasus pengujian otomatis

1. NIM mempertahankan angka nol awal dan departemen wajib hanya bagi pengurus.
2. Sesi mengikuti waktu mulai, tutup tepat saat deadline, dan menghormati penutupan manual.
3. Status submitted/reviewed terkunci; draft/revision dapat diedit.
4. ID elemen harus unik dan jumlah halaman tidak melewati batas schema.
5. URL javascript/data dan node HTML yang tidak diizinkan ditolak.
6. Struktur rich text yang terlalu dalam ditolak.
7. Submit memerlukan tulisan, bukan hanya judul/gambar.
8. Sesi menolak tanggal terbalik dan tema lebih dari tiga.
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

Pemeriksaan visual login revisi terakhir di browser belum berhasil: sesi browser menolak akses tab lama. Validasi build/TypeScript dan 25 tes otomatis berhasil; login Neon/Vercel nyata belum diverifikasi.

## Penyederhanaan dashboard

Menu Seluruh Tulisan dihapus; daftar tulisan ditempatkan pada tiap sesi. Teks promosi dan subtitle statistik dihapus. Password reset saat build bersifat opt-in dengan ADMIN_PASSWORD_RESET_ID. Tes tambahan memeriksa penggantian hash, pencabutan sesi, audit, idempotensi kode reset yang sama, dan rollback saat username/password reset tidak valid. Password produksi tidak diubah dalam lingkungan pembangunan ini.
