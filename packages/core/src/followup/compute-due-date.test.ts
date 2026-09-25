import { describe, expect, it } from "vitest";
import { computeFollowUpDueDate, type SendWindow } from "./compute-due-date";

const weekdayWindow: SendWindow = { days: [1, 2, 3, 4, 5], from: "09:00" };

describe("computeFollowUpDueDate", () => {
  it("adds afterDays and lands on a weekday within the window", () => {
    // Monday 2026-09-21 10:00 Istanbul + 3 days -> Thursday 2026-09-24.
    const base = new Date("2026-09-21T07:00:00.000Z");
    const due = computeFollowUpDueDate(base, 3, weekdayWindow, false);
    expect(due.toISOString()).toBe("2026-09-24T06:00:00.000Z");
  });

  it("skips forward from Saturday/Sunday to the next Monday", () => {
    // Wednesday 2026-09-23 + 3 days = Saturday 2026-09-26 -> pushed to Monday 2026-09-28.
    const base = new Date("2026-09-23T07:00:00.000Z");
    const due = computeFollowUpDueDate(base, 3, weekdayWindow, false);
    expect(due.getUTCDay()).toBe(1); // Monday in UTC terms too, since 09:00 Istanbul is 06:00 UTC same day
    expect(due.toISOString()).toBe("2026-09-28T06:00:00.000Z");
  });

  it("skips a fixed public holiday (Republic Day, Oct 29) when skipHolidays is true", () => {
    // Tuesday 2026-10-27 + 2 days = Thursday 2026-10-29 (holiday) -> Friday 2026-10-30.
    const base = new Date("2026-10-27T07:00:00.000Z");
    const due = computeFollowUpDueDate(base, 2, weekdayWindow, true);
    expect(due.toISOString()).toBe("2026-10-30T06:00:00.000Z");
  });

  it("does not skip a holiday when skipHolidays is false", () => {
    const base = new Date("2026-10-27T07:00:00.000Z");
    const due = computeFollowUpDueDate(base, 2, weekdayWindow, false);
    expect(due.toISOString()).toBe("2026-10-29T06:00:00.000Z");
  });

  it("sets the time of day to sendWindow.from in Istanbul time", () => {
    const base = new Date("2026-09-21T20:00:00.000Z"); // late at night Istanbul
    const due = computeFollowUpDueDate(base, 1, { days: [1, 2, 3, 4, 5], from: "14:30" }, false);
    // 2026-09-21 20:00 UTC is 2026-09-21 23:00 Istanbul -> +1 day = Sep 22 (Tue) 14:30 Istanbul = 11:30 UTC
    expect(due.toISOString()).toBe("2026-09-22T11:30:00.000Z");
  });

  it("skips both a religious holiday and the following weekend correctly", () => {
    // 2026-03-19..21 are religious holidays in the fixture list (Thu-Sat).
    const base = new Date("2026-03-16T07:00:00.000Z"); // Monday
    const due = computeFollowUpDueDate(base, 3, weekdayWindow, true);
    // +3 days = Thursday 2026-03-19 (holiday) -> Fri 20 (holiday) -> Sat 21 (holiday+weekend) -> Sun 22 (weekend) -> Mon 23.
    expect(due.toISOString()).toBe("2026-03-23T06:00:00.000Z");
  });
});
