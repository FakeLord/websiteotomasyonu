-- SPEC.md → L: e-posta konuşmasının thread referansı, ilk giden e-postanın
-- Message-ID'sidir (masaüstü `send_email` üretir, `mark_message_sent`
-- p_external_message_id ile yazar). IMAP poller gelen cevapları
-- In-Reply-To/References ile buna eşler. Trigger olarak yazıldı: hangi RPC
-- mesajı SENT yaparsa yapsın referans tek yerde doldurulur.

create function public.set_email_thread_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'OUT' and new.status = 'SENT' and new.external_message_id is not null then
    update public.conversations
    set email_thread_ref = new.external_message_id
    where id = new.conversation_id and channel = 'EMAIL' and email_thread_ref is null;
  end if;
  return new;
end;
$$;

create trigger messages_set_email_thread_ref
  after update of status, external_message_id on public.messages
  for each row execute function public.set_email_thread_ref();
