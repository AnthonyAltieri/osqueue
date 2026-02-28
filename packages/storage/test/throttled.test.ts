import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryBackend } from "../src/memory.js";
import { ThrottledStorageBackend } from "../src/throttled.js";

const encoder = new TextEncoder();

function encode(obj: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(obj));
}

describe("ThrottledStorageBackend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("daily write budget", () => {
    test("writes pass through instantly under budget", async () => {
      const memory = new MemoryBackend();
      const throttled = new ThrottledStorageBackend({
        backend: memory,
        maxWritesPerDay: 100,
        maxWritesPerMinute: 10,
      });

      const v = await throttled.createIfNotExists("key", encode({ a: 1 }));
      await throttled.write("key", encode({ a: 2 }), v);

      const stats = throttled.getStats();
      expect(stats.totalWrites).toBe(2);
      expect(stats.throttledWrites).toBe(0);
      expect(stats.totalWriteDelayMs).toBe(0);
      expect(stats.dailyWriteCount).toBe(2);
      expect(stats.dailyBudgetExceeded).toBe(false);
    });

    test("falls back to per-minute throttle after budget exceeded", async () => {
      const memory = new MemoryBackend();
      const throttled = new ThrottledStorageBackend({
        backend: memory,
        maxWritesPerDay: 3,
        maxWritesPerMinute: 10,
      });

      // Use up budget (3 writes)
      const v1 = await throttled.createIfNotExists("k1", encode(1));
      await throttled.write("k1", encode(2), v1);
      await throttled.createIfNotExists("k2", encode(3));

      let stats = throttled.getStats();
      expect(stats.dailyWriteCount).toBe(3);
      expect(stats.dailyBudgetExceeded).toBe(false);
      expect(stats.throttledWrites).toBe(0);

      // 4th write should go through token bucket (budget exceeded)
      const v2 = await throttled.createIfNotExists("k3", encode(4));
      stats = throttled.getStats();
      expect(stats.dailyWriteCount).toBe(4);
      expect(stats.dailyBudgetExceeded).toBe(true);
    });

    test("resets counter on new UTC day", async () => {
      const memory = new MemoryBackend();
      const throttled = new ThrottledStorageBackend({
        backend: memory,
        maxWritesPerDay: 2,
        maxWritesPerMinute: 10,
      });

      // Use up budget
      await throttled.createIfNotExists("k1", encode(1));
      await throttled.createIfNotExists("k2", encode(2));

      let stats = throttled.getStats();
      expect(stats.dailyWriteCount).toBe(2);

      // Advance to next UTC day
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      // Should reset and pass through instantly
      await throttled.createIfNotExists("k3", encode(3));
      stats = throttled.getStats();
      expect(stats.dailyWriteCount).toBe(1);
      expect(stats.dailyBudgetExceeded).toBe(false);
    });

    test("no daily budget configured — always uses per-minute throttle", async () => {
      const memory = new MemoryBackend();
      const throttled = new ThrottledStorageBackend({
        backend: memory,
        maxWritesPerMinute: 10,
      });

      // First write should go through token bucket
      await throttled.createIfNotExists("k1", encode(1));

      const stats = throttled.getStats();
      expect(stats.dailyWriteCount).toBe(1);
      // No daily budget means dailyBudgetExceeded stays false
      expect(stats.dailyBudgetExceeded).toBe(false);
    });

    test("reads are not affected by daily write budget", async () => {
      const memory = new MemoryBackend();
      const throttled = new ThrottledStorageBackend({
        backend: memory,
        maxWritesPerDay: 1,
      });

      await throttled.createIfNotExists("k1", encode(1));

      // Many reads should not be throttled
      for (let i = 0; i < 10; i++) {
        await throttled.read("k1");
      }

      const stats = throttled.getStats();
      expect(stats.totalReads).toBe(10);
      expect(stats.throttledReads).toBe(0);
      expect(stats.dailyWriteCount).toBe(1);
    });
  });
});
