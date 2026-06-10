/**
 * frontend/craco.config.js
 * =========================
 * CRACO (Create React App Configuration Override) configuration.
 *
 * Why this file exists:
 *   wagmi v2/v3 + viem ship ESM packages with `exports` fields in package.json.
 *   CRA's webpack 5 config doesn't resolve these subpath exports correctly,
 *   causing "Module not found" errors for internal wagmi modules.
 *
 * This config fixes:
 *   1. Enables package.json `exports` field resolution (required by wagmi/viem)
 *   2. Stubs Node built-ins that viem references but browsers don't have
 *   3. Suppresses spurious SourceMap warnings from node_modules
 */

module.exports = {
  webpack: {
    configure: (webpackConfig) => {

      // -----------------------------------------------------------------------
      // Fix 1: Enable `exports` field resolution in package.json
      // wagmi v3 and viem use subpath exports (e.g. 'wagmi/chains', '@wagmi/core/tempo')
      // webpack 5 in CRA doesn't enable the 'exports' condition by default.
      // -----------------------------------------------------------------------
      // 'import'  — prefer ESM builds (gives named exports like QueryClient)
      // 'browser' — prefer browser-safe builds over Node ones
      // 'require' — CJS fallback
      // 'default' — final fallback
      webpackConfig.resolve.conditionNames = ['import', 'browser', 'require', 'default'];

      // -----------------------------------------------------------------------
      // Fix 2: Extend mainFields so ESM builds are preferred
      // -----------------------------------------------------------------------
      webpackConfig.resolve.mainFields = ['browser', 'module', 'main'];

      // -----------------------------------------------------------------------
      // Fix 3: Node built-in polyfills / stubs
      // viem references Node globals — stub them for the browser bundle.
      // -----------------------------------------------------------------------
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        crypto: false,   // viem uses Web Crypto API, not Node's crypto
        stream: false,
        http:   false,
        https:  false,
        os:     false,
        path:   false,
        fs:     false,
        net:    false,
        tls:    false,
        zlib:   false,
        buffer: require.resolve('buffer/'),
      };

      // -----------------------------------------------------------------------
      // Fix 4: Provide Buffer global (required by some wallet connectors)
      // -----------------------------------------------------------------------
      const webpack = require('webpack');
      webpackConfig.plugins = [
        ...(webpackConfig.plugins || []),
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
      ];

      // -----------------------------------------------------------------------
      // Fix 5: Suppress SourceMap warnings from node_modules
      // wagmi/viem ship sourcemaps that CRA's webpack treats as warnings.
      // -----------------------------------------------------------------------
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings || []),
        /Failed to parse source map/,
      ];

      return webpackConfig;
    },
  },
};
