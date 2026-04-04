import { describe, it, expect, beforeEach } from "vitest";
import { PairingManager } from "../pairing.js";

describe("PairingManager", () => {
  let pm: PairingManager;

  beforeEach(() => {
    pm = new PairingManager();
  });

  it("creates a pairing challenge", () => {
    const req = pm.challenge("123", "Alice", "telegram", "chat1");
    expect(req.code).toHaveLength(8);
    expect(req.senderId).toBe("123");
    expect(req.senderName).toBe("Alice");
  });

  it("returns same code for same sender (idempotent)", () => {
    const r1 = pm.challenge("123", "Alice", "telegram", "chat1");
    const r2 = pm.challenge("123", "Alice", "telegram", "chat1");
    expect(r1.code).toBe(r2.code);
  });

  it("approves a valid code and returns senderId", () => {
    const req = pm.challenge("123", "Alice", "telegram", "chat1");
    const result = pm.approve(req.code);
    expect(result).not.toBeNull();
    expect(result!.senderId).toBe("123");
  });

  it("returns null for unknown code", () => {
    expect(pm.approve("BADCODE1")).toBeNull();
  });

  it("removes request after approval", () => {
    const req = pm.challenge("123", "Alice", "telegram", "chat1");
    pm.approve(req.code);
    expect(pm.approve(req.code)).toBeNull();
  });

  it("lists pending requests", () => {
    pm.challenge("123", "Alice", "telegram", "chat1");
    pm.challenge("456", "Bob", "telegram", "chat2");
    expect(pm.listPending()).toHaveLength(2);
  });

  it("expires old requests", () => {
    const req = pm.challenge("123", "Alice", "telegram", "chat1");
    const pending = pm.listPending();
    (pending[0] as any).createdAt = Date.now() - 3601_000;
    (pending[0] as any).expiresAt = Date.now() - 1000;
    pm.cleanup();
    expect(pm.approve(req.code)).toBeNull();
  });
});
