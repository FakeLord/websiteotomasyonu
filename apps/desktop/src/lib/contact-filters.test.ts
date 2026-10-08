import { describe, expect, it } from "vitest";
import { contactRecencyFilter, endOfLocalDay, startOfLocalDay, STALE_CONTACT_DAYS } from "./contact-filters";

// 8 Ekim 2026, öğleden sonra (yerel saat).
const now = new Date(2026, 9, 8, 15, 30, 0);

describe("startOfLocalDay / endOfLocalDay", () => {
  it("günün başını ve sonunu yerel saatle verir", () => {
    const start = startOfLocalDay(now);
    const end = endOfLocalDay(now);

    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([8, 0, 0]);
    expect([end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([8, 23, 59, 59]);
  });

  it("girdiyi değiştirmez", () => {
    startOfLocalDay(now);
    endOfLocalDay(now);

    expect(now.getHours()).toBe(15);
  });
});

describe("contactRecencyFilter", () => {
  it("'hiç yazılmamış' son temas zamanı boş olanları ister", () => {
    expect(contactRecencyFilter("never", now)).toEqual({ column: "last_contacted_at", op: "is", value: null });
  });

  it("'bugün' bugünün başından itibarı ister", () => {
    expect(contactRecencyFilter("today", now)).toEqual({ column: "last_contacted_at", op: "gte", value: startOfLocalDay(now).toISOString() });
  });

  it(`'sessiz' ${STALE_CONTACT_DAYS} günden eski son temasları ister (hiç temas edilmeyenleri değil)`, () => {
    const filter = contactRecencyFilter("stale", now);
    const limit = new Date(2026, 9, 8 - STALE_CONTACT_DAYS, 15, 30, 0);

    expect(filter).toEqual({ column: "last_contacted_at", op: "lt", value: limit.toISOString() });
  });

  it("bilinmeyen değerde süzgeç yoktur", () => {
    expect(contactRecencyFilter("", now)).toBeNull();
    expect(contactRecencyFilter("garip", now)).toBeNull();
  });
});
