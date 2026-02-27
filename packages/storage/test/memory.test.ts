import { describe, test, expect } from "vitest";
import { MemoryBackend } from "../src/memory.js";
import { CASConflictError } from "@osqueue/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(obj: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(obj));
}

function decode(data: Uint8Array): unknown {
  return JSON.parse(decoder.decode(data));
}

describe("MemoryBackend", () => {
  test("read returns null for non-existent key", async () => {
    const backend = new MemoryBackend();
    expect(await backend.read("missing")).toBeNull();
  });

  test("createIfNotExists creates object", async () => {
    const backend = new MemoryBackend();
    const version = await backend.createIfNotExists(
      "test.json",
      encode({ hello: "world" }),
    );
    expect(version.token).toBe("1");

    const result = await backend.read("test.json");
    expect(result).not.toBeNull();
    expect(decode(result!.data)).toEqual({ hello: "world" });
    expect(result!.version.token).toBe("1");
  });

  test("createIfNotExists throws on existing key", async () => {
    const backend = new MemoryBackend();
    await backend.createIfNotExists("test.json", encode({ a: 1 }));
    await expect(
      backend.createIfNotExists("test.json", encode({ a: 2 })),
    ).rejects.toBeInstanceOf(CASConflictError);
  });

  test("write succeeds with correct version", async () => {
    const backend = new MemoryBackend();
    const v1 = await backend.createIfNotExists(
      "test.json",
      encode({ count: 0 }),
    );

    const v2 = await backend.write(
      "test.json",
      encode({ count: 1 }),
      v1,
    );
    expect(v2.token).toBe("2");

    const result = await backend.read("test.json");
    expect(decode(result!.data)).toEqual({ count: 1 });
    expect(result!.version.token).toBe("2");
  });

  test("write throws CASConflictError with wrong version", async () => {
    const backend = new MemoryBackend();
    const v1 = await backend.createIfNotExists(
      "test.json",
      encode({ count: 0 }),
    );

    // Write once to advance to v2
    await backend.write("test.json", encode({ count: 1 }), v1);

    // Try to write with stale v1
    await expect(
      backend.write("test.json", encode({ count: 2 }), v1),
    ).rejects.toBeInstanceOf(CASConflictError);
  });

  test("write throws on non-existent key", async () => {
    const backend = new MemoryBackend();
    await expect(
      backend.write("missing.json", encode({ a: 1 }), { token: "1" }),
    ).rejects.toBeInstanceOf(CASConflictError);
  });

  test("concurrent CAS writes: exactly one wins", async () => {
    const backend = new MemoryBackend();
    const v1 = await backend.createIfNotExists(
      "test.json",
      encode({ count: 0 }),
    );

    const results = await Promise.allSettled([
      backend.write("test.json", encode({ count: 1 }), v1),
      backend.write("test.json", encode({ count: 2 }), v1),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  test("latency injection adds delay", async () => {
    const backend = new MemoryBackend({ latencyMs: 50 });
    const start = Date.now();
    await backend.read("missing");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timing variance
  });

  test("failure injection throws configured error", async () => {
    const backend = new MemoryBackend({
      failWith: new Error("injected failure"),
    });
    await expect(backend.read("test.json")).rejects.toThrow("injected failure");
  });

  test("setOptions changes behavior at runtime", async () => {
    const backend = new MemoryBackend();
    await backend.createIfNotExists("test.json", encode({ a: 1 }));

    // Now inject failure
    backend.setOptions({ failWith: new Error("boom") });
    await expect(backend.read("test.json")).rejects.toThrow("boom");

    // Remove failure
    backend.setOptions({ failWith: null });
    const result = await backend.read("test.json");
    expect(result).not.toBeNull();
  });

  test("read returns a copy of data (not a reference)", async () => {
    const backend = new MemoryBackend();
    await backend.createIfNotExists("test.json", encode({ a: 1 }));

    const r1 = await backend.read("test.json");
    const r2 = await backend.read("test.json");
    // Mutating one should not affect the other
    r1!.data[0] = 0;
    expect(r2!.data[0]).not.toBe(0);
  });
});
