import { describe, expect, test } from "vitest";
import {
  CASConflictError,
  ConfigError,
  StorageBackendError,
  TaggedError,
  isOsqueueError,
  isTaggedError,
  wrapUnknownError,
} from "../src/index.js";

describe("tagged errors", () => {
  test("error classes expose _tag and extend Error", () => {
    const err = new ConfigError("invalid configuration");
    expect(err).toBeInstanceOf(Error);
    expect(err._tag).toBe("ConfigError");
    expect(isTaggedError(err)).toBe(true);
  });

  test("CASConflictError keeps explicit tag", () => {
    const err = new CASConflictError("mismatch");
    expect(err._tag).toBe("CASConflictError");
  });

  test("wrapUnknownError preserves tagged errors", () => {
    const tagged = new ConfigError("already tagged");
    const wrapped = wrapUnknownError(
      tagged,
      (message, cause) => new StorageBackendError(message, { cause }),
    );
    expect(wrapped).toBe(tagged);
    expect(wrapped._tag).toBe("ConfigError");
  });

  test("wrapUnknownError wraps native errors", () => {
    const native = new Error("native failure");
    const wrapped = wrapUnknownError(
      native,
      (message, cause) => new StorageBackendError(message, { cause }),
    );
    expect(wrapped._tag).toBe("StorageBackendError");
    expect(wrapped.message).toBe("native failure");
  });

  test("isOsqueueError returns true for known osqueue errors", () => {
    const error: unknown = new ConfigError("bad config");
    expect(isOsqueueError(error)).toBe(true);
    if (isOsqueueError(error)) {
      expect(error._tag).toBe("ConfigError");
    }
  });

  test("isOsqueueError rejects non-osqueue tagged errors", () => {
    class OtherError extends TaggedError<"OtherError"> {
      constructor() {
        super("OtherError", "other");
      }
    }

    const other = new OtherError();
    expect(isTaggedError(other)).toBe(true);
    expect(isOsqueueError(other)).toBe(false);
  });
});
