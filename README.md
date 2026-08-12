# README — Monitoring Proyek (Web + Google Sheets Database)

Panduan ini menjelaskan cara menyambungkan file **`Database_Monitoring_Engineering.xlsx`**
ke Google Sheets sebagai database, lalu menyambungkannya ke web `index.html` +
`__catchall__.js` (Cloudflare Pages Functions) supaya tidak error.

---

## 1. Struktur Sistem

```
Google Sheets (database)  <-->  functions/[[catchall]].js (API proxy)  <-->  index.html (tampilan web)
```

- **index.html** — semua tampilan (Summary, LLE, Tender/Forcon Drawing, Shop Drawing,
  Material Approval, Method of Work, RFI, Site Instruction).
- **functions/[[catchall]].js** — backend Cloudflare Pages Functions. `GET /api/sheet`
  membaca data dari Google Sheets (via endpoint publik `gviz`), `POST /api/sheet`
  menulis data baru (tombol "+ Tambah Data") lewat Google Sheets API + Service Account.
- **Database_Monitoring_Engineering.xlsx** — template database, upload ke Google Sheets.
  **Nama tab dan urutan kolom di file ini SAMA PERSIS** dengan yang dibaca oleh kode web
  (`MENUS`, `DEFAULT_HEADERS`, `SHOP_DRAWING_COLUMNS`, `MATERIAL_APPROVAL_COLUMNS`,
  `METHOD_OF_WORK_COLUMNS`, `RFI_COLUMNS`, `SITE_INSTRUCTION_COLUMNS` di `index.html`).
  **Jangan ubah nama tab, urutan kolom, atau tambah/hapus kolom di tengah**, kecuali kamu
  juga mengubah kode web-nya.

---

## 2. Cara Deploy Database (Google Sheets)

1. Buka [Google Drive](https://drive.google.com) → **Upload file** → pilih
   `Database_Monitoring_Engineering.xlsx`.
2. Klik kanan file hasil upload → **Buka dengan → Google Spreadsheet** (ini otomatis
   mengonversi ke format Google Sheets, atau File → Save as Google Sheets dari dalam Excel Online).
3. Cek 8 tab di bagian bawah — urutannya harus:
   `LLE, Tender Drawing, Forcon Drawing, Shop Drawing, Material Approval, Method of Work, RFI, Site Instruction`.
   **Jangan rename tab ini** (nama tab dipakai sebagai `sheetName` saat fitur "Tambah Data" menyimpan baris baru).
4. **Hapus baris contoh** (baris berwarna kuning) di tiap tab sebelum mulai isi data asli —
   baris itu hanya ilustrasi format, bukan data sungguhan.
5. **Share spreadsheet**: klik **Share** (kanan atas) → **General access** → ubah ke
   **"Anyone with the link" → Viewer**. Ini WAJIB, karena web membaca data lewat endpoint
   publik `gviz` — tanpa ini, web akan menampilkan error "Google Sheets menolak permintaan
   (HTTP 401/403)".
6. Catat **Spreadsheet ID** — bagian di URL antara `/d/` dan `/edit`, contoh:
   ```
   https://docs.google.com/spreadsheets/d/1AbCDefGhIjkLmNoPQRstuVWxyz1234567890/edit
                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ inilah Spreadsheet ID
   ```

---

## 3. Tidak Perlu Set GID — Tab Dibaca Lewat Nama

Versi ini membaca data lewat nama tab (`&sheet=NamaTab`), **bukan** lewat angka `gid`.
Jadi kamu **tidak perlu** buka tiap tab satu-satu untuk mencatat angka `gid` di URL —
langkah yang dulu jadi sumber error paling umum (kalau lupa/salah isi, semua menu
ke-baca dari tab pertama).

Yang perlu kamu pastikan hanya satu hal: **nama tab di spreadsheet harus sama persis**
(termasuk besar/kecil huruf) dengan `sheetName` yang sudah didefinisikan di konstanta
`MENUS` pada `index.html`:

```js
const MENUS = {
  "lle":               { title: "Monitoring LLE", sheetName: "LLE", docStyle: true },
  "tender-drawing":     { title: "Monitoring Tender Drawing", sheetName: "Tender Drawing", revisionStyle: true },
  "forcon-drawing":     { title: "Monitoring Forcon Drawing", sheetName: "Forcon Drawing", revisionStyle: true },
  "shop-drawing":       { title: "Monitoring Shop Drawing", sheetName: "Shop Drawing", shopDrawingStyle: true },
  "material-approval":  { title: "Monitoring Material Approval Submittal", sheetName: "Material Approval", materialApprovalStyle: true },
  "method-of-work":     { title: "Monitoring Method of Work", sheetName: "Method of Work", methodOfWorkStyle: true },
  "rfi":                { title: "Monitoring RFI", sheetName: "RFI", rfiStyle: true },
  "site-instruction":   { title: "Monitoring Site Instruction", sheetName: "Site Instruction", siStyle: true },
};
```

Kalau kamu memakai nama tab persis seperti bagian 2 langkah 3 di atas (tanpa rename),
`sheetName` di atas sudah cocok dan **tidak perlu diubah sama sekali** — langsung lanjut
ke bagian 4.

Kalau kamu memang ingin rename tab, ubah `sheetName` menu yang bersangkutan di `MENUS`
supaya sama persis dengan nama tab barunya (dipakai untuk baca data **dan** untuk fitur
"Tambah Data").

---

## 4. WAJIB: Isi `SPREADSHEET_ID` di Backend

Buka `functions/[[catchall]].js`, baris paling atas:

```js
const SPREADSHEET_ID = "GANTI_DENGAN_SPREADSHEET_ID";
```

Ganti dengan Spreadsheet ID dari langkah 2.6 di atas. Tanpa ini, semua menu akan
menampilkan pesan error "SPREADSHEET_ID belum diisi".

---

## 5. Deploy ke Cloudflare Pages

1. Push folder project (berisi `index.html` dan `functions/[[catchall]].js`) ke repo GitHub.
2. Di [Cloudflare Pages](https://dash.cloudflare.com) → **Create a project** → **Connect to Git**
   → pilih repo tersebut.
3. Build settings: **Framework preset = None**, **Build command = (kosongkan)**,
   **Build output directory = `/`** (root, karena `index.html` ada di root).
4. Klik **Save and Deploy**. Setelah selesai, buka URL `*.pages.dev` yang diberikan —
   web sudah bisa membaca data dari spreadsheet (asalkan langkah 2, 3, 4 sudah benar).

### (Opsional) Aktifkan fitur "+ Tambah Data" agar bisa menulis ke spreadsheet

Tanpa langkah ini, web tetap bisa **membaca** data (GET), tapi tombol "+ Tambah Data"
akan gagal menyimpan.

1. Buka [Google Cloud Console](https://console.cloud.google.com) → buat/gunakan sebuah
   Project → **APIs & Services → Library** → aktifkan **Google Sheets API**.
2. **APIs & Services → Credentials → Create Credentials → Service Account** → buat service
   account → buka tab **Keys** → **Add Key → Create new key → JSON** → file JSON terunduh.
3. Buka file JSON tersebut, salin nilai `client_email` dan `private_key`.
4. Kembali ke Google Sheets database kamu → **Share** → tambahkan email dari `client_email`
   sebagai **Editor**.
5. Di Cloudflare Pages → project kamu → **Settings → Environment variables** → tambahkan:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = isi dari `client_email`
   - `GOOGLE_PRIVATE_KEY` = isi dari `private_key` (apa adanya, termasuk karakter `\n`)
6. **Redeploy** project (Environment variables baru hanya berlaku setelah deploy ulang).

---

## 6. Aturan Pengisian Data per Sheet (Wajib Diikuti)

Kolom di web dibaca **berdasarkan urutan index**, bukan nama header — jadi urutan kolom
di sheet harus persis seperti berikut. Kamu boleh mengganti *teks* judul kolom (baris 1),
tapi **urutannya tidak boleh berubah**.

| Tab | Jumlah Kolom | Catatan Khusus |
|---|---|---|
| `LLE` | 14 | Kolom `STATUS` (kolom ke-8) bebas diisi teks apa saja — otomatis dikenali sebagai hijau/kuning/merah berdasarkan kata kunci (approved/done/selesai = hijau, review/proses/pending = kuning, reject/overdue/delay = merah). |
| `Tender Drawing` / `Forcon Drawing` | 3 kolom tetap + kolom revisi | Kolom ke-4 dst adalah kolom revisi — **judul kolomnya harus format `"NAMA GRUP \| tanggal"`**, contoh `Diterima Ke - \| 1`. Kolom dengan grup label sama otomatis digabung jadi 1 header besar di web. |
| `Shop Drawing` | 23 kolom tetap | Baris kategori disiplin (MECHANICAL/ELECTRICAL/dst) ditulis dengan **hanya kolom ke-2 (Judul Gambar) terisi**, kolom lain kosong. Kolom ke-20 (`Status Update - Status`) diisi `A`/`B`/`C`/`D`. |
| `Material Approval` | 21 kolom tetap | Baris kategori trade (FIRE FIGHTING/ELECTRICAL/dst) ditulis dengan **hanya kolom ke-3 (Nama Produk) terisi**. Kolom STR/ARS/MEP (ke-4,5,6) diisi tanda (mis. `V`). Kolom ke-18 (`Status Update - Status`) diisi `A`/`B`/`C`/`D`. |
| `Method of Work` | 29 kolom tetap | Baris highlight (mis. UNLOADING GENSET & TRAFO) ditulis dengan **hanya kolom ke-2 (Pekerjaan) dan ke-6 (START Pelaksanaan) terisi**. Kolom Status A/B/C/D (ke-25 s/d ke-28) adalah **4 kolom terpisah**, isi salah satu saja per baris. |
| `RFI` | 10 kolom tetap | Kolom STR/ARS/MEP (ke-4,5,6) diisi tanda untuk menandai disiplin RFI. Kolom `Replied`/`Close` diisi tanggal saat dijawab/ditutup (kosongkan jika masih outstanding, akan terhitung otomatis sebagai "Outstanding" di Tabel A dan halaman Summary). |
| `Site Instruction` | 9 kolom tetap | Kolom **`Kode 1.A`** (ke-4) dan **`Kode 1.B`** (ke-5) diisi tanda (mis. `V`) — isi salah satu saja per baris: `1.A` = SI Kerja Tambah/Kurang (Ada VO), `1.B` = SI hanya Instruksi Teknis/Non Teknis (Tidak Ada VO). Kolom `STR`/`ARS`/`MEP` (ke-6,7,8) diisi tanda untuk menandai disiplin SI. Tabel A (Jumlah SI per Kode 1A/1B dan disiplin, Total 1A/1B/VO, dan Kumulatif) dihitung otomatis dari sheet ini berdasarkan kolom `Tgl Terbit` dan cutoff "s/d Minggu Lalu" yang bisa diatur langsung di halaman web. |

**Legenda Status A/B/C/D** (dipakai di Shop Drawing, Material Approval, Method of Work,
dan halaman Summary):

| Kode | Arti |
|---|---|
| A | Disetujui / Approved |
| B | Approved w/ Comment (Approved as Note) |
| C | Dikembalikan untuk revisi / Reject |
| D / kosong | Belum kembali dari owner / Waiting Owner Approval / Resubmit-on Review |

---

## 7. Halaman Summary (Otomatis, Tidak Perlu Diisi Manual)

Halaman **Summary** tidak punya sheet sendiri — semua angka dan chart-nya **dihitung
otomatis** dari 4 sheet: `Shop Drawing`, `Material Approval`, `Method of Work`, `RFI`.
Jadi kalau kamu update data di sheet-sheet tersebut, cukup buka halaman Summary lalu klik
tombol **refresh** (ikon di kanan atas) — semua tabel dan chart (bar chart submission %,
donut chart distribusi status) akan otomatis ter-update sesuai data terbaru.

---

## 8. Troubleshooting Cepat

| Gejala | Penyebab | Solusi |
|---|---|---|
| Semua menu tampil sama / data tertukar / "Parameter sheet (nama tab) belum diisi" | `sheetName` di `MENUS` tidak sama persis dengan nama tab di spreadsheet | Lihat bagian 3 — samakan `sheetName` dengan nama tab (case-sensitive) |
| "SPREADSHEET_ID belum diisi" | Belum diganti di `[[catchall]].js` | Lihat bagian 4 |
| "Google Sheets menolak permintaan (HTTP 401/403)" | Spreadsheet belum di-share publik | Lihat bagian 2 langkah 5 |
| "Belum ada data..." padahal sudah diisi | Baris data ditulis mulai dari baris 1 (menimpa header) | Data harus mulai dari baris 2, baris 1 wajib header |
| Kategori/disiplin tidak muncul di Summary atau Shop Drawing/Material Approval | Baris kategori tidak mengikuti aturan "hanya 1 kolom terisi" | Lihat bagian 6, kosongkan kolom lain di baris kategori |
| Tombol "+ Tambah Data" gagal menyimpan | Service Account belum di-setup / belum di-share sebagai Editor | Lihat bagian 5 (Opsional) |
| Data baru tidak langsung muncul | Cache di web belum refresh | Klik tombol refresh (ikon panah muter) di kanan atas |
