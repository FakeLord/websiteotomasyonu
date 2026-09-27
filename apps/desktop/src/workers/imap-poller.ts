import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { imapSinceDate, parseInboundEmail, resolveBounceTarget, resolveInboundTarget, type InboundMatchContext } from "@lbf/core";
import { supabase } from "../lib/supabase-client";
import { getEmailAccount, type EmailAccountConfig } from "../lib/email-account";
import { ingestInboundMessage } from "../features/outreach/inbound";
import { rpc } from "../features/outreach/outreach";

/**
 * IMAP poller (SPEC.md → L, ADR 0008): uygulama açıkken kullanıcının gelen
 * kutusundan yeni e-postaları okur; bilinen bir lead'e ait cevapları
 * Konuşmalar'a kaydeder, bounce'larda adresi BOUNCED işaretler. Lead'e ait
 * olmayan posta hiçbir yere yazılmaz.
 */

export const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_LOOKBACK_DAYS = 3;
const MATCH_WINDOW_DAYS = 120;

interface ImapFetchResult {
  uid_validity: number | null;
  last_uid: number | null;
  messages: Array<{ uid: number; raw_base64: string }>;
}

interface PollState {
  uidValidity: number | null;
  lastUid: number | null;
}

export interface PollSummary {
  fetched: number;
  imported: number;
  bounces: number;
  ignored: number;
}

interface ImapStatus {
  running: boolean;
  lastRunAt: string | null;
  lastSummary: PollSummary | null;
  lastError: string | null;
}

export const useImapStatus = create<ImapStatus>(() => ({ running: false, lastRunAt: null, lastSummary: null, lastError: null }));

export const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const stateKey = (account: EmailAccountConfig) => `lbf.imap.${account.smtpUsername.toLowerCase()}`;

// Son UID cihaz başına bir kolaylıktır; kaybolursa son 3 gün yeniden taranır
// ve DB aynı Message-ID'yi ikinci kez yazmaz.
function readState(account: EmailAccountConfig): PollState {
  try {
    const raw = localStorage.getItem(stateKey(account));
    return raw ? (JSON.parse(raw) as PollState) : { uidValidity: null, lastUid: null };
  } catch {
    return { uidValidity: null, lastUid: null };
  }
}

function writeState(account: EmailAccountConfig, state: PollState) {
  try {
    localStorage.setItem(stateKey(account), JSON.stringify(state));
  } catch {
    /* yok say */
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadMatchContext(workspaceId: string): Promise<InboundMatchContext> {
  const since = new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [outbound, channels] = await Promise.all([
    supabase
      .from("messages")
      .select("external_message_id, conversation_id, conversations!inner(business_id, channel)")
      .eq("workspace_id", workspaceId)
      .eq("direction", "OUT")
      .eq("status", "SENT")
      .eq("conversations.channel", "EMAIL")
      .not("external_message_id", "is", null)
      .gte("created_at", since)
      .limit(5000),
    supabase.from("contact_channels").select("business_id, value").eq("workspace_id", workspaceId).eq("channel", "EMAIL").limit(10000),
  ]);
  if (outbound.error) throw outbound.error;
  if (channels.error) throw channels.error;

  const rows = (outbound.data ?? []) as unknown as Array<{
    external_message_id: string;
    conversation_id: string;
    conversations: { business_id: string } | null;
  }>;
  return {
    outbound: rows
      .filter((r) => r.conversations)
      .map((r) => ({ conversationId: r.conversation_id, businessId: r.conversations!.business_id, externalMessageId: r.external_message_id })),
    emailChannels: (channels.data ?? []).map((c) => ({ businessId: c.business_id as string, address: c.value as string })),
  };
}

async function runPoll(workspaceId: string, account: EmailAccountConfig): Promise<PollSummary> {
  const state = readState(account);
  const result = await invoke<ImapFetchResult>("imap_fetch", {
    imap: {
      host: account.imapHost,
      port: account.imapPort ?? 993,
      username: account.smtpUsername,
      password: account.smtpPassword,
    },
    options: {
      since_uid: state.lastUid,
      since_date: state.lastUid === null ? imapSinceDate(new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000)) : null,
      limit: 50,
    },
  });

  // UIDVALIDITY değiştiyse (kutu yeniden oluşturuldu) UID'ler geçersizdir: tarihten yeniden tara.
  if (state.uidValidity !== null && result.uid_validity !== null && state.uidValidity !== result.uid_validity) {
    writeState(account, { uidValidity: result.uid_validity, lastUid: null });
    return runPoll(workspaceId, account);
  }

  const summary: PollSummary = { fetched: result.messages.length, imported: 0, bounces: 0, ignored: 0 };
  // Yalnızca başarıyla işlenen mesajlara kadar ilerlenir: bir mesaj hata
  // verirse (ağ, AI dışı DB hatası) bir sonraki turda ondan devam edilir.
  let processedUid = state.lastUid;
  let failure: unknown = null;
  if (result.messages.length > 0) {
    const context = await loadMatchContext(workspaceId);
    const ownAddresses = new Set([account.fromEmail, account.smtpUsername].map((a) => a.trim().toLowerCase()));

    for (const item of result.messages) {
      try {
        await processMessage(workspaceId, item.raw_base64, context, ownAddresses, summary);
        processedUid = item.uid;
      } catch (err) {
        failure = err;
        break;
      }
    }
  } else {
    processedUid = result.last_uid ?? state.lastUid;
  }

  writeState(account, { uidValidity: result.uid_validity, lastUid: processedUid });
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  return summary;
}

async function processMessage(
  workspaceId: string,
  rawBase64: string,
  context: InboundMatchContext,
  ownAddresses: Set<string>,
  summary: PollSummary,
): Promise<void> {
  const email = await parseInboundEmail(base64ToBytes(rawBase64));

  if (email.bounce) {
    const target = resolveBounceTarget(email.bounce, context);
    if (target) {
      await rpc("mark_channel_status", {
        p_business_id: target.businessId,
        p_channel: "EMAIL",
        p_value: target.address,
        p_status: "BOUNCED",
        p_reason: "E-posta teslim edilemedi (bounce)",
      });
      summary.bounces += 1;
    } else {
      summary.ignored += 1;
    }
    return;
  }

  if (email.fromAddress && ownAddresses.has(email.fromAddress)) {
    summary.ignored += 1;
    return;
  }

  const target = resolveInboundTarget(email, context);
  if (!target || !email.text) {
    summary.ignored += 1;
    return;
  }

  const recorded = await ingestInboundMessage(workspaceId, {
    businessId: target.businessId,
    channel: "EMAIL",
    body: email.text,
    subject: email.subject,
    externalMessageId: email.messageId,
    autoReply: email.autoReply,
  });
  if (!recorded.duplicate) summary.imported += 1;
}

let inFlight: Promise<PollSummary | null> | null = null;

/** Gelen kutusunu bir kez kontrol eder. Hesap/IMAP ayarı yoksa veya Tauri dışında null döner. */
export function pollInboxOnce(workspaceId: string): Promise<PollSummary | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!isTauriRuntime()) return null;
    const account = await getEmailAccount();
    if (!account?.imapHost || !account.smtpUsername || !account.smtpPassword) return null;

    useImapStatus.setState({ running: true });
    try {
      const summary = await runPoll(workspaceId, account);
      useImapStatus.setState({ running: false, lastRunAt: new Date().toISOString(), lastSummary: summary, lastError: null });
      return summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useImapStatus.setState({ running: false, lastRunAt: new Date().toISOString(), lastError: message });
      throw err instanceof Error ? err : new Error(message);
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
