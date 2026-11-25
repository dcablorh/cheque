/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cheque/core', '@cheque/shared'],
  experimental: {
    // The OG image routes read these font files from disk at request time
    // (satori cannot use the next/font CSS variables), so ship them with the
    // function.
    outputFileTracingIncludes: {
      '/c/[token]/opengraph-image': ['./src/app/fonts/**'],
      '/c/[token]/twitter-image': ['./src/app/fonts/**'],
    },
  },
};

export default nextConfig;
