import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isValidBody } from "./validate.ts";

const validRequest = {
  operation: "draft_first_message",
  promptVersion: 1,
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  jsonSchema: {},
  maxTokens: 100,
  temperature: 0.5,
};

Deno.test("isValidBody accepts a well-formed request", () => {
  assert(isValidBody({ workspaceId: "ws-1", inputHash: "abc", request: validRequest }));
});

Deno.test("isValidBody rejects a missing workspaceId", () => {
  assertFalse(isValidBody({ inputHash: "abc", request: validRequest }));
});

Deno.test("isValidBody rejects a missing inputHash", () => {
  assertFalse(isValidBody({ workspaceId: "ws-1", request: validRequest }));
});

Deno.test("isValidBody rejects a request missing promptVersion", () => {
  const { promptVersion: _drop, ...rest } = validRequest;
  assertFalse(isValidBody({ workspaceId: "ws-1", inputHash: "abc", request: rest }));
});

Deno.test("isValidBody rejects messages that are not an array", () => {
  assertFalse(
    isValidBody({ workspaceId: "ws-1", inputHash: "abc", request: { ...validRequest, messages: "nope" } }),
  );
});
