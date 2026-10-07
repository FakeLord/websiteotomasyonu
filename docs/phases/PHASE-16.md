# PHASE 16 (G4) — Çok dilli analiz ve yapay zekâ

**Dal:** `feature/p16-multilingual-ai` · **Zorluk:** Yüksek · **Bağımlılık:** G2
**Referans:** `docs/SPEC.md` → H, J, D18 · BACKLOG #30

## Amaç
Site analizi ve AI, işletmenin dilinde çalışır; ekip her şeyi Türkçe çevirisiyle onaylar; guardrail'ler dilden bağımsızdır.

## Kapsam
- **Site analizi:** dil tespiti (`<html lang>`, içerik sezgisi) → `businesses.language`; ülkeye göre telefon/adres çıkarma;
  park/boş sayfa kalıpları çok dilli.
- **Prompt'lar** (`packages/core/ai/prompts/*`): hedef dil ve ülke üslubu parametresi; Bilgi Bankası Türkçe kalır, AI olguları
  hedef dile aktarır; fiyatlar para birimiyle. Değişen her operasyonun `promptVersion`'ı artar.
- **Çeviri:** `translate` operasyonu (ai-gateway, önbellekli, şemalı JSON). Taslak ve gelen mesajın Türkçesi yan yana;
  kullanıcı Türkçe düzeltme yazarsa hedef dile geri çevrilir ve yeniden doğrulanır.
- **Guardrail'ler:** `validateDraft` dil bağımsız (para birimi simgeleri, yüzde, sayı + süre, referans adları); yasak kelimeler
  dil tablosundan; STOP anahtar kelimeleri ve otomatik yanıt kalıpları dil tablosu + AI; `classify_reply` çok dilli.
- **Değerlendirme seti:** `scripts/eval/` — TR ve EN 30'ar örnek (ilk mesaj + cevap sınıflandırma), elle çalıştırılan ölçüm.

## Testler
- Birim: dil tespiti fixture'ları, çok dilli STOP/otomatik yanıt, `validateDraft` (EN/DE/ES fiyat ve indirim örnekleri),
  prompt derleyicileri (hedef dil sistemi mesajda, KB içeriği bağlamda).
- Deno: `ai-gateway` yeni operasyon şeması. Gerçek model yalnızca `scripts/eval` ve `scripts/smoke`.

## Acceptance criteria
- [ ] İngilizce siteli bir işletmeye İngilizce taslak ve Türkçe çevirisi üretilir.
- [ ] KB dışı fiyat/indirim içeren İngilizce taslak kullanıcıya gösterilmeden reddedilir.
- [ ] "Please remove me from your list" cevabı DNC ile sonuçlanır.
- [ ] Değerlendirme setinde TR ve EN için kullanılabilir taslak oranı ölçülmüş ve raporlanmıştır (hedef ≥ %90).

## VERIFY_CURRENT_DOCS
- Kullanılan modellerin dil kapsamı ve yapılandırılmış çıktı desteği (OpenAI, NVIDIA). Bulgular `docs/adr/0014-multilingual-ai.md`.
