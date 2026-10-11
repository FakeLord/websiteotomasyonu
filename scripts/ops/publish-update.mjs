// ADR 0026: imzalı kurulum dosyasını ve `latest.json` güncelleme bildirimini herkese açık `app-updates` kovasına koyar.
//
// Kullanım:
//   node scripts/ops/publish-update.mjs --version 0.1.1 --installer <setup.exe> --sig <setup.exe.sig> [--notes "..."]
// Ortam: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (yalnızca GitHub Actions sırlarında)
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = "app-updates";

if (!url || !key || !args.version || !args.installer || !args.sig) {
  console.error("Gerekli: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, --version, --installer, --sig");
  process.exit(2);
}
if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(args.version)) {
  console.error(`Geçersiz sürüm: ${args.version}`);
  process.exit(2);
}

async function upload(name, body, contentType) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "true", "cache-control": "max-age=60" },
    body,
  });
  if (!res.ok) throw new Error(`Yüklenemedi (${res.status}): ${name} ${(await res.text()).slice(0, 200)}`);
}

const installerName = `lbf_${args.version}_x64-setup.exe`;
const signature = (await readFile(args.sig, "utf8")).trim();
const installer = await readFile(args.installer);

// Önce kurulum dosyası, sonra bildirim: bildirim yayınlandığında indirilecek dosya hazır olur.
await upload(installerName, installer, "application/octet-stream");

const manifest = {
  version: args.version,
  notes: args.notes ?? "",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `${url}/storage/v1/object/public/${bucket}/${installerName}`,
    },
  },
};
await upload("latest.json", JSON.stringify(manifest, null, 2), "application/json");

console.log(`Yayınlandı: v${args.version} (${basename(args.installer)}, ${installer.length} bayt)`);
console.log(`Bildirim: ${url}/storage/v1/object/public/${bucket}/latest.json`);
