// ADR 0026: `customer-files` kovasındaki tüm dosyaları bir klasöre indirir (haftalık yedek iş akışı bunu şifreler).
//
// Kullanım:  node scripts/ops/backup-storage.mjs <hedef-klasör>
// Ortam:     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (yalnızca GitHub Actions sırlarında; istemciye girmez)
//            BACKUP_BUCKET (isteğe bağlı, varsayılan customer-files)
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, normalize, resolve, sep } from "node:path";

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.BACKUP_BUCKET ?? "customer-files";
const outDir = process.argv[2];

if (!url || !key || !outDir) {
  console.error("Kullanım: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı olmalı; node backup-storage.mjs <hedef-klasör>");
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

/** Bir "klasör"ün doğrudan çocuklarını sayfa sayfa listeler. */
async function list(prefix) {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`Liste alınamadı (${res.status}) ${prefix}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

/** Klasörleri (id'si null olanlar) özyinelemeli dolaşıp dosya yollarını toplar. */
async function walk(prefix = "") {
  const files = [];
  for (const item of await list(prefix)) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null || item.id === undefined) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const root = resolve(outDir);
const files = await walk("");
let bytes = 0;
for (const path of files) {
  const target = resolve(root, normalize(path));
  // Yol çıkışı (../) engellenir; kova adları güvenilir olsa da dosya yazmadan önce denetlenir.
  if (target !== root && !target.startsWith(root + sep)) throw new Error(`Güvensiz yol: ${path}`);
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers });
  if (!res.ok) throw new Error(`İndirilemedi (${res.status}): ${path}`);
  const data = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  bytes += data.length;
}
console.log(`${files.length} dosya, ${bytes} bayt indirildi (${bucket}).`);
