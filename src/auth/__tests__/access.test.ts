import { describe, it, expect } from "vitest";
import { checkAccess } from "../access.js";

describe("checkAccess", () => {
  it("allows DM with open policy", () => {
    const result = checkAccess({ senderId: "123", chatId: "123", isGroup: false, dmPolicy: "open", groupPolicy: "disabled", allowFrom: [], groups: {} });
    expect(result.allowed).toBe(true);
  });

  it("blocks DM with disabled policy", () => {
    const result = checkAccess({ senderId: "123", chatId: "123", isGroup: false, dmPolicy: "disabled", groupPolicy: "disabled", allowFrom: [], groups: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("dm_disabled");
  });

  it("allows DM with allowlist when sender in list", () => {
    const result = checkAccess({ senderId: "123", chatId: "123", isGroup: false, dmPolicy: "allowlist", groupPolicy: "disabled", allowFrom: ["123"], groups: {} });
    expect(result.allowed).toBe(true);
  });

  it("blocks DM with allowlist when sender not in list", () => {
    const result = checkAccess({ senderId: "999", chatId: "123", isGroup: false, dmPolicy: "allowlist", groupPolicy: "disabled", allowFrom: ["123"], groups: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_in_allowlist");
  });

  it("returns needs_pairing for unknown sender with pairing policy", () => {
    const result = checkAccess({ senderId: "999", chatId: "999", isGroup: false, dmPolicy: "pairing", groupPolicy: "disabled", allowFrom: ["123"], groups: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("needs_pairing");
  });

  it("allows known sender with pairing policy", () => {
    const result = checkAccess({ senderId: "123", chatId: "123", isGroup: false, dmPolicy: "pairing", groupPolicy: "disabled", allowFrom: ["123"], groups: {} });
    expect(result.allowed).toBe(true);
  });

  it("blocks group with disabled policy", () => {
    const result = checkAccess({ senderId: "123", chatId: "-100999", isGroup: true, dmPolicy: "pairing", groupPolicy: "disabled", allowFrom: [], groups: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("group_disabled");
  });

  it("allows group with open policy", () => {
    const result = checkAccess({ senderId: "123", chatId: "-100999", isGroup: true, dmPolicy: "pairing", groupPolicy: "open", allowFrom: [], groups: {} });
    expect(result.allowed).toBe(true);
  });

  it("allows group sender in group allowlist", () => {
    const result = checkAccess({ senderId: "123", chatId: "-100999", isGroup: true, dmPolicy: "pairing", groupPolicy: "allowlist", allowFrom: [], groups: { "-100999": { enabled: true, allowFrom: ["123"] } } });
    expect(result.allowed).toBe(true);
  });

  it("blocks group sender not in group allowlist", () => {
    const result = checkAccess({ senderId: "999", chatId: "-100999", isGroup: true, dmPolicy: "pairing", groupPolicy: "allowlist", allowFrom: [], groups: { "-100999": { enabled: true, allowFrom: ["123"] } } });
    expect(result.allowed).toBe(false);
  });

  it("allows all senders in configured group with no allowFrom", () => {
    const result = checkAccess({ senderId: "anyone", chatId: "-100999", isGroup: true, dmPolicy: "pairing", groupPolicy: "allowlist", allowFrom: [], groups: { "-100999": { enabled: true } } });
    expect(result.allowed).toBe(true);
  });
});
