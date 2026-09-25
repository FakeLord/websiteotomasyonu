import { parse } from "node-html-parser";

/**
 * `node-html-parser`'ın `textContent`'i `<script>`/`<style>` içeriğini de
 * dahil ediyor; bu da park sayfası tespiti ve e-posta/telefon regex'lerinin
 * JS kodunu (örn. sahte "info@example.com" string'leri) yanlışlıkla
 * yakalamasına yol açar. Bu yardımcı, görünür metni almadan önce bu
 * elemanları kaldırır.
 */
export function getVisibleText(html: string): string {
  const root = parse(html);
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return root.textContent;
}
