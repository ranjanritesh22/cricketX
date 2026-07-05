/**
 * Provider registry — the ONLY place the app resolves a data source.
 * Server-side only: clients must never talk to providers directly.
 */
import "server-only";

import { CricketDataAdapter } from "./cricketdata.adapter";
import { CricsheetAdapter } from "./cricsheet.adapter";
import { EntitySportAdapter } from "./entitysport.adapter";
import { MockAdapter } from "./mock.adapter";
import type { CricketDataProvider, ProviderName } from "./provider.interface";

function resolveName(): ProviderName {
  const name = (process.env.DATA_PROVIDER ?? "mock").toLowerCase();
  if (name === "cricsheet" || name === "cricketdata" || name === "entitysport" || name === "mock") return name;
  console.warn(`[providers] Unknown DATA_PROVIDER "${name}" — falling back to mock`);
  return "mock";
}

function create(name: ProviderName): CricketDataProvider {
  switch (name) {
    case "cricsheet":
      return new CricsheetAdapter();
    case "cricketdata":
      return new CricketDataAdapter();
    case "entitysport":
      return new EntitySportAdapter();
    case "mock":
      return new MockAdapter();
  }
}

// Survive dev HMR / route-handler re-evaluation so in-process caches persist.
const globalStore = globalThis as unknown as { __stadiumxProvider?: { name: ProviderName; provider: CricketDataProvider } };

export function getProvider(): CricketDataProvider {
  const name = resolveName();
  if (globalStore.__stadiumxProvider?.name !== name) {
    globalStore.__stadiumxProvider = { name, provider: create(name) };
  }
  return globalStore.__stadiumxProvider.provider;
}

export function getProviderName(): ProviderName {
  return resolveName();
}
