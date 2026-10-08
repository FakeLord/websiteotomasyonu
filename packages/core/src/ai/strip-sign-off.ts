const CLOSINGS = [
  "saygılarımla",
  "saygılar",
  "sevgilerle",
  "iyi günler",
  "iyi çalışmalar",
  "başarılar",
  "teşekkürler",
  "teşekkür ederim",
  "kolay gelsin",
];

function isClosingLine(line: string): boolean {
  const normalized = line
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[\s,.!;:-]+$/u, "");
  return CLOSINGS.includes(normalized);
}

/**
 * Modelin uydurduğu imzayı (isim, unvan, şirket, site) siler: kapanış satırından ("Saygılarımla,")
 * sonraki satırlar atılır, kapanışın kendisi kalır. Mesajı gönderen ekibin gerçek imzası ayrıca
 * eklenir; modelin yazdığı unvan referans kontrolünü tetikler ve yanlış kişi/rol bilgisi taşıyabilir.
 */
export function stripSignOff(body: string): string {
  const lines = body.split(/\r?\n/);
  let closingIndex = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isClosingLine(lines[i] ?? "")) {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) return body;
  return lines.slice(0, closingIndex + 1).join("\n");
}
