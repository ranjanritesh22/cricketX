// Vitest stand-in for the `server-only` guard package. The real module throws
// when bundled into client code; tests run in Node, so the guard is a no-op.
export {};
