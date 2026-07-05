/**
 * Cricsheet replays are first-class (CLAUDE.md §3.1): any bundled historical
 * match must resolve regardless of which live provider is active, so
 * `/match/1490706/live?replay=1490706` works out of the box even in mock mode.
 *
 * `withCricsheetFallback` runs an operation against the active provider and,
 * only on MatchNotFound, retries it against a singleton Cricsheet adapter.
 * If the fallback can't help (no data dir, still not found), the ORIGINAL
 * error propagates so error states stay truthful.
 */
import { CricsheetAdapter } from "./cricsheet.adapter";
import { isMatchNotFoundError, isProviderNotConfiguredError } from "./errors";
import { getProvider, getProviderName } from "./index";
import type { CricketDataProvider } from "./provider.interface";

const globalStore = globalThis as unknown as { __stadiumxCricsheetFallback?: CricsheetAdapter };

function cricsheetSingleton(): CricsheetAdapter {
  globalStore.__stadiumxCricsheetFallback ??= new CricsheetAdapter();
  return globalStore.__stadiumxCricsheetFallback;
}

export async function withCricsheetFallback<T>(run: (provider: CricketDataProvider) => Promise<T>): Promise<T> {
  try {
    return await run(getProvider());
  } catch (err) {
    if (!isMatchNotFoundError(err) || getProviderName() === "cricsheet") throw err;
    try {
      return await run(cricsheetSingleton());
    } catch (fbErr) {
      if (isMatchNotFoundError(fbErr) || isProviderNotConfiguredError(fbErr)) throw err;
      throw fbErr;
    }
  }
}
