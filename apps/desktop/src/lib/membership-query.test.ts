import { describe, expect, it } from "vitest";
import { fetchOwnMembership, type MembershipClient } from "./membership-query";

interface Row {
  user_id: string;
  workspace_id: string;
  role: string;
}

/**
 * RLS, workspace_members'ta ekibin tüm satırlarını görünür kılar (is_member). Sahte istemci bunu taklit eder:
 * `eq` ile süzülmezse ilk satırı (yönetici) döner — hatanın gerçek koşulu.
 */
function fakeClient(rows: Row[]): { client: MembershipClient; filters: Array<[string, string]> } {
  const filters: Array<[string, string]> = [];
  const client: MembershipClient = {
    from: () => ({
      select: () => {
        const applied: Array<[string, string]> = [];
        const builder = {
          eq(column: string, value: string) {
            applied.push([column, value]);
            filters.push([column, value]);
            return builder;
          },
          limit: () => builder,
          maybeSingle: async () => {
            const visible = rows.filter((row) => applied.every(([c, v]) => (row as unknown as Record<string, string>)[c] === v));
            const first = visible[0];
            return { data: first ? { workspace_id: first.workspace_id, role: first.role } : null, error: null };
          },
        };
        return builder;
      },
    }),
  };
  return { client, filters };
}

const team: Row[] = [
  { user_id: "admin-1", workspace_id: "ws-1", role: "ADMIN" },
  { user_id: "member-2", workspace_id: "ws-1", role: "MEMBER" },
];

describe("fetchOwnMembership", () => {
  it("temsilciye kendi rolünü döner (yönetici satırını değil)", async () => {
    const { client } = fakeClient(team);
    expect(await fetchOwnMembership(client, "member-2")).toEqual({ workspaceId: "ws-1", role: "MEMBER" });
  });

  it("yöneticiye ADMIN döner", async () => {
    const { client } = fakeClient(team);
    expect(await fetchOwnMembership(client, "admin-1")).toEqual({ workspaceId: "ws-1", role: "ADMIN" });
  });

  it("sorguyu kullanıcı kimliğine göre süzer", async () => {
    const { client, filters } = fakeClient(team);
    await fetchOwnMembership(client, "member-2");
    expect(filters).toContainEqual(["user_id", "member-2"]);
  });

  it("üyeliği olmayan kullanıcı için null döner", async () => {
    const { client } = fakeClient(team);
    expect(await fetchOwnMembership(client, "stranger-3")).toBeNull();
  });
});
