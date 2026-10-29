// Register mock for server-only package so server-only modules can be tested directly with tsx
try {
  const resolved = require.resolve("server-only");
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: {},
  };
} catch {
  // ignore if not installed
}
