// Fallback kalau environment variable SPREADSHEET_ID belum diisi di Cloudflare.
// Kalau kamu sudah mengisi env var SPREADSHEET_ID di Cloudflare Pages > Settings >
// Environment Variables, nilai di sini akan DIABAIKAN (env var yang menang).
const SPREADSHEET_ID_FALLBACK = "GANTI_DENGAN_SPREADSHEET_ID";

/* ============================================================
   Untuk fitur "Tambah Data" (tulis ke spreadsheet) diperlukan
   Service Account Google. Caranya:
   1. Buat Service Account di Google Cloud Console, aktifkan
      Google Sheets API, buat key JSON.
   2. Share spreadsheet ke email service account itu sebagai Editor.
   3. Di Cloudflare Pages > Settings > Environment Variables, isi:
      - SPREADSHEET_ID                = ID spreadsheet (dari URL /d/.../edit)
      - GOOGLE_SERVICE_ACCOUNT_EMAIL   = client_email dari JSON
      - GOOGLE_PRIVATE_KEY             = private_key dari JSON (apa adanya, termasuk \n)
        (nama GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY juga didukung sebagai alternatif)
   Tanpa service account, pembacaan data (GET) tetap jalan, hanya
   "Tambah Data" yang tidak akan tersimpan.
   ============================================================ */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/sheet") {
    if (request.method === "POST") return handleAppend(request, env);
    return handleSheet(url, env);
  }

  return context.env.ASSETS ? context.env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
}

function getSpreadsheetId(env) {
  return (env && env.SPREADSHEET_ID) || SPREADSHEET_ID_FALLBACK;
}

function getPrivateKey(env) {
  return (env && (env.GOOGLE_PRIVATE_KEY || env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)) || "";
}

async function handleSheet(url, env) {
  const sheetName = url.searchParams.get("sheet") || "";
  const SPREADSHEET_ID = getSpreadsheetId(env);

  if (!SPREADSHEET_ID || SPREADSHEET_ID === "GANTI_DENGAN_SPREADSHEET_ID") {
    return json({ error: "SPREADSHEET_ID belum diisi. Isi environment variable SPREADSHEET_ID di Cloudflare Pages (Settings > Environment variables), lalu redeploy." }, 500);
  }
  if (!sheetName) {
    return json({ error: "Parameter sheet (nama tab) belum diisi." }, 400);
  }

  // gviz mendukung identifikasi tab lewat nama tab langsung (&sheet=...),
  // jadi tidak perlu lagi mencari/mengisi angka gid per tab secara manual.
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

  let res;
  try {
    res = await fetch(gvizUrl);
  } catch (e) {
    return json({ error: "Tidak bisa menghubungi Google Sheets: " + e.message }, 502);
  }

  if (!res.ok) {
    return json({ error: `Google Sheets menolak permintaan (HTTP ${res.status}). Pastikan sheet dibagikan sebagai "Anyone with link: Viewer".` }, 502);
  }

  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) {
    return json({ error: "Format respons Google Sheets tidak dikenali. Cek apakah nama tab dan akses sheet sudah benar." }, 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (e) {
    return json({ error: "Gagal mem-parsing respons Google Sheets." }, 502);
  }

  if (parsed.status === "error") {
    const msg = (parsed.errors || []).map(e => e.detailed_message || e.message).join("; ") || "Gagal mengambil data sheet.";
    return json({ error: msg }, 502);
  }

  const cols = parsed.table.cols.map((c, i) => c.label || c.id || `Kolom ${i + 1}`);
  const rows = parsed.table.rows.map(r =>
    r.c.map(cell => {
      if (!cell) return "";
      if (cell.f !== undefined && cell.f !== null) return cell.f;
      return cell.v ?? "";
    })
  );

  return json({ header: cols, rows });
}

async function handleAppend(request, env) {
  const SPREADSHEET_ID = getSpreadsheetId(env);

  if (!SPREADSHEET_ID || SPREADSHEET_ID === "GANTI_DENGAN_SPREADSHEET_ID") {
    return json({ error: "SPREADSHEET_ID belum diisi. Isi environment variable SPREADSHEET_ID di Cloudflare Pages (Settings > Environment variables), lalu redeploy." }, 500);
  }
  const privateKey = getPrivateKey(env);
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !privateKey) {
    return json({ error: "Backend belum dikonfigurasi untuk menulis data (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY belum diisi di environment variables)." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Body request tidak valid." }, 400);
  }

  const { sheetName, values } = body;
  if (!sheetName || !Array.isArray(values)) {
    return json({ error: "sheetName dan values wajib diisi." }, 400);
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(env, privateKey);
  } catch (e) {
    return json({ error: "Gagal autentikasi ke Google: " + e.message }, 500);
  }

  const range = `${sheetName}!A:Z`;
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(appendUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return json({ error: `Google Sheets menolak penyimpanan (HTTP ${res.status}). Pastikan sheet "${sheetName}" ada dan sudah di-share ke service account sebagai Editor. Detail: ${errText.slice(0, 300)}` }, 502);
  }

  return json({ ok: true });
}

/* ---- Service account JWT -> OAuth2 access token (Web Crypto, RS256) ---- */
async function getAccessToken(env, privateKey) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyPem = privateKey.replace(/\\n/g, "\n");

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj) => base64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "gagal mendapatkan access token");
  }
  return tokenData.access_token;
}

async function importPrivateKey(pem) {
  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
