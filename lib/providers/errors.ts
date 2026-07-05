/** Typed provider failures so UI error states can be designed, not generic. */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Provider selected but missing credentials/config — a setup problem, not a runtime blip. */
export class ProviderNotConfiguredError extends ProviderError {
  constructor(provider: string, hint: string) {
    super(`Provider "${provider}" is not configured. ${hint}`, provider);
    this.name = "ProviderNotConfiguredError";
  }
}

/** The upstream API answered with garbage or an error envelope (they WILL, mid-match). */
export class ProviderResponseError extends ProviderError {
  constructor(
    provider: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message, provider);
    this.name = "ProviderResponseError";
  }
}

export class MatchNotFoundError extends ProviderError {
  constructor(provider: string, matchId: string) {
    super(`Match "${matchId}" not found`, provider);
    this.name = "MatchNotFoundError";
  }
}

export class PlayerNotFoundError extends ProviderError {
  constructor(provider: string, playerId: string) {
    super(`Player "${playerId}" not found`, provider);
    this.name = "PlayerNotFoundError";
  }
}

/*
 * Name-based guards, NOT bare `instanceof`: the dev bundler can instantiate
 * this module once per compilation layer (layout vs route handler), and an
 * error constructed by one copy of a class is not `instanceof` the other.
 * That broke the Cricsheet fallback + the designed 404 in `next dev` while
 * production behaved. `err.name` survives module duplication.
 */

function hasName(err: unknown, name: string): boolean {
  return err instanceof Error && err.name === name;
}

export function isMatchNotFoundError(err: unknown): err is MatchNotFoundError {
  return err instanceof MatchNotFoundError || hasName(err, "MatchNotFoundError");
}

export function isProviderNotConfiguredError(err: unknown): err is ProviderNotConfiguredError {
  return err instanceof ProviderNotConfiguredError || hasName(err, "ProviderNotConfiguredError");
}

export function isPlayerNotFoundError(err: unknown): err is PlayerNotFoundError {
  return err instanceof PlayerNotFoundError || hasName(err, "PlayerNotFoundError");
}

export function isProviderError(err: unknown): err is ProviderError {
  return (
    err instanceof ProviderError ||
    (err instanceof Error && typeof (err as Partial<ProviderError>).provider === "string")
  );
}
