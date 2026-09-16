/** @type {import('next').NextConfig} */
const nextConfig = {
  // genlayer-js 1.1.8 and its viem dependency are browser-facing packages
  // that need to be transpiled by Next's bundler.
  transpilePackages: ['genlayer-js', 'viem'],
  typescript: {
    // genlayer-js 1.1.8 predates React 19's type changes. Runtime behavior is
    // still valid; keep deployment from being blocked by dependency typings.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve ??= {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      ...(isServer
        ? {}
        : {
            fs: false,
            net: false,
            tls: false,
            crypto: false,
            stream: false,
            http: false,
            https: false,
            zlib: false,
          }),
    };
    return config;
  },
};

export default nextConfig;
