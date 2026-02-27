export abstract class TaggedError<TTag extends string> extends Error {
  readonly _tag: TTag;

  protected constructor(tag: TTag, message: string, options?: ErrorOptions) {
    super(message, options);
    this._tag = tag;
    this.name = tag;
  }
}

export type AnyTaggedError = TaggedError<string>;

export function isTaggedError(error: unknown): error is AnyTaggedError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof (error as { _tag?: unknown })._tag === "string"
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function wrapUnknownError<T extends AnyTaggedError>(
  error: unknown,
  factory: (message: string, cause?: unknown) => T,
): AnyTaggedError {
  if (isTaggedError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return factory(error.message, error);
  }
  return factory(String(error));
}

export class CASConflictError extends TaggedError<"CASConflictError"> {
  constructor(message = "CAS conflict: version mismatch", options?: ErrorOptions) {
    super("CASConflictError", message, options);
  }
}

export class ConfigError extends TaggedError<"ConfigError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("ConfigError", message, options);
  }
}

export class DiscoveryError extends TaggedError<"DiscoveryError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("DiscoveryError", message, options);
  }
}

export class TransportConfigError extends TaggedError<"TransportConfigError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("TransportConfigError", message, options);
  }
}

export interface TransportRequestErrorOptions extends ErrorOptions {
  method?: string;
  path?: string;
  status?: number;
  remoteTag?: string;
}

export class TransportRequestError extends TaggedError<"TransportRequestError"> {
  readonly method?: string;
  readonly path?: string;
  readonly status?: number;
  readonly remoteTag?: string;

  constructor(message: string, options?: TransportRequestErrorOptions) {
    super("TransportRequestError", message, options);
    this.method = options?.method;
    this.path = options?.path;
    this.status = options?.status;
    this.remoteTag = options?.remoteTag;
  }
}

export class TransportConnectionError extends TaggedError<"TransportConnectionError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("TransportConnectionError", message, options);
  }
}

export class StorageBackendError extends TaggedError<"StorageBackendError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("StorageBackendError", message, options);
  }
}

export interface BrokerLeadershipErrorOptions extends ErrorOptions {
  leader?: string;
}

export class BrokerLeadershipError extends TaggedError<"BrokerLeadershipError"> {
  readonly leader?: string;

  constructor(message: string, options?: BrokerLeadershipErrorOptions) {
    super("BrokerLeadershipError", message, options);
    this.leader = options?.leader;
  }
}

export interface BrokerProtocolErrorOptions extends ErrorOptions {
  method?: string;
}

export class BrokerProtocolError extends TaggedError<"BrokerProtocolError"> {
  readonly method?: string;

  constructor(message: string, options?: BrokerProtocolErrorOptions) {
    super("BrokerProtocolError", message, options);
    this.method = options?.method;
  }
}

export class EngineStateError extends TaggedError<"EngineStateError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("EngineStateError", message, options);
  }
}

export class WorkerExecutionError extends TaggedError<"WorkerExecutionError"> {
  constructor(message: string, options?: ErrorOptions) {
    super("WorkerExecutionError", message, options);
  }
}

export type OsqueueError =
  | CASConflictError
  | ConfigError
  | DiscoveryError
  | TransportConfigError
  | TransportRequestError
  | TransportConnectionError
  | StorageBackendError
  | BrokerLeadershipError
  | BrokerProtocolError
  | EngineStateError
  | WorkerExecutionError;

export type OsqueueErrorTag = OsqueueError["_tag"];

const OSQUEUE_ERROR_TAGS = new Set<OsqueueErrorTag>([
  "CASConflictError",
  "ConfigError",
  "DiscoveryError",
  "TransportConfigError",
  "TransportRequestError",
  "TransportConnectionError",
  "StorageBackendError",
  "BrokerLeadershipError",
  "BrokerProtocolError",
  "EngineStateError",
  "WorkerExecutionError",
]);

export function isOsqueueError(error: unknown): error is OsqueueError {
  return isTaggedError(error) && OSQUEUE_ERROR_TAGS.has(error._tag as OsqueueErrorTag);
}
