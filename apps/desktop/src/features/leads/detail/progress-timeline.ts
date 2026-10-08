import type { ContactAttemptRow } from "./contact-attempts";

export interface TransitionSource {
  id: string;
  from_stage: string | null;
  to_stage: string;
  reason: string | null;
  actor_type: string;
  created_at: string;
}

export interface NoteSource {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
}

export interface MessageSource {
  id: string;
  direction: "IN" | "OUT";
  status: string;
  sent_at: string | null;
  created_at: string;
  channel: string;
}

export interface ProgressSources {
  attempts: ContactAttemptRow[];
  transitions: TransitionSource[];
  notes: NoteSource[];
  messages: MessageSource[];
}

export type ProgressEvent =
  | { kind: "contact"; id: string; at: string; attempt: ContactAttemptRow }
  | { kind: "stage"; id: string; at: string; transition: TransitionSource }
  | { kind: "note"; id: string; at: string; note: NoteSource }
  | { kind: "message"; id: string; at: string; message: MessageSource }
  | { kind: "reply"; id: string; at: string; message: MessageSource };

// Aynı anda olan olaylarda sıra: önce aşama (sonuç), sonra temas (sebep); "yeniden eskiye" listede temas altta kalır.
const KIND_ORDER: Record<ProgressEvent["kind"], number> = { reply: 5, message: 4, note: 3, stage: 2, contact: 1 };

/**
 * İşletmenin ilerlemesini tek listede toplar: elle temaslar, aşama geçişleri, notlar ve gönderilen/alınan mesajlar.
 * Yeniden eskiye sıralıdır. Vazgeçilen temaslar, taslaklar ve başarısız mesajlar gösterilmez.
 */
export function buildProgressTimeline(sources: ProgressSources): ProgressEvent[] {
  const events: ProgressEvent[] = [
    ...sources.attempts
      .filter((attempt) => attempt.outcome !== "CANCELLED")
      .map((attempt): ProgressEvent => ({ kind: "contact", id: attempt.id, at: attempt.created_at, attempt })),
    ...sources.transitions.map((transition): ProgressEvent => ({ kind: "stage", id: transition.id, at: transition.created_at, transition })),
    ...sources.notes.map((note): ProgressEvent => ({ kind: "note", id: note.id, at: note.created_at, note })),
    ...sources.messages.flatMap((message): ProgressEvent[] => {
      if (message.direction === "IN" && message.status === "RECEIVED") return [{ kind: "reply", id: message.id, at: message.created_at, message }];
      if (message.direction === "OUT" && message.status === "SENT") {
        return [{ kind: "message", id: message.id, at: message.sent_at ?? message.created_at, message }];
      }
      return [];
    }),
  ];
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || KIND_ORDER[b.kind] - KIND_ORDER[a.kind]);
}

export interface ContactSummary {
  last: ContactAttemptRow | null;
  attempts: number;
  nextActionAt: string | null;
}

/** Üst özet: son temas, kaç kez temas edildi ve sonraki takip tarihi. Vazgeçilenler sayılmaz. */
export function summarizeContact(attempts: ContactAttemptRow[], nextActionAt: string | null): ContactSummary {
  const real = attempts.filter((attempt) => attempt.outcome !== "CANCELLED");
  const last = [...real].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
  return { last, attempts: real.length, nextActionAt };
}
