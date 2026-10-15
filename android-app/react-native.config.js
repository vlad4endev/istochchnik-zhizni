/**
 * op-sqlite is declared but unused (WatermelonDB uses its own SQLite adapter).
 * Exclude from autolinking to keep Android builds lean and avoid extra NDK work.
 */
module.exports = {
  dependencies: {
    '@op-engineering/op-sqlite': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
