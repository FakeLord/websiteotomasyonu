/**
 * SSRF engeli (SPEC.md → H, P): website analizi yalnızca genel internet
 * adreslerine istek atar. Loopback, özel ağ, link-local, multicast, CGNAT ve
 * belirsiz adresler engellenir. Rust `commands/website.rs::is_blocked_ip` ile
 * aynı kuralları uygular; ayrıştırılamayan girdi güvenli tarafta (engelli) sayılır.
 */

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function isBlockedIpv4(o: number[]): boolean {
  const [a = 0, b = 0] = o;
  return (
    a === 127 || // loopback
    a === 10 || // özel
    (a === 172 && b >= 16 && b <= 31) || // özel
    (a === 192 && b === 168) || // özel
    (a === 169 && b === 254) || // link-local (bulut metadata dahil)
    (a >= 224 && a <= 239) || // multicast
    a === 0 || // belirsiz / "bu ağ"
    (a === 255 && o[1] === 255 && o[2] === 255 && o[3] === 255) || // broadcast
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
}

/** IPv6 adresini 8 adet 16-bit gruba açar; geçersizse null. */
function parseIpv6(input: string): number[] | null {
  const value = input.split("%")[0] ?? "";
  if (!value.includes(":")) return null;

  let tail: number[] = [];
  let text = value;
  const lastColon = value.lastIndexOf(":");
  const embedded = value.slice(lastColon + 1);
  if (embedded.includes(".")) {
    const v4 = parseIpv4(embedded);
    if (!v4) return null;
    tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!];
    text = value.slice(0, lastColon + 1) + "0:0";
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string): number[] | null => {
    if (s === "") return [];
    const groups = s.split(":").map((g) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };

  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (!head || !rest) return null;

  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<number>(missing).fill(0), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  if (tail.length === 2) groups = [...groups.slice(0, 6), ...tail];
  return groups;
}

export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isBlockedIpv4(v4);

  const g = parseIpv6(ip);
  if (!g) return true;

  // IPv4-eşlemeli (::ffff:a.b.c.d) ve IPv4-uyumlu adresler IPv4 kurallarıyla değerlendirilir.
  const isMapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  if (isMapped) return isBlockedIpv4([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]);

  const allZeroButLast = g.slice(0, 7).every((x) => x === 0);
  if (allZeroButLast && (g[7] === 0 || g[7] === 1)) return true; // :: ve ::1

  const first = g[0]!;
  return (
    (first & 0xff00) === 0xff00 || // multicast ff00::/8
    (first & 0xfe00) === 0xfc00 || // benzersiz yerel fc00::/7
    (first & 0xffc0) === 0xfe80 // link-local fe80::/10
  );
}
