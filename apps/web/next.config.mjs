/** @type {import('next').NextConfig} */
const nextConfig = {
  // The storefront and funding APIs live in `apps/store` (Hono, port 3000). Server
  // components fetch it directly server-side; anything the browser must call is proxied
  // through `/api/store/*` so there is one origin and no CORS surface to configure.
  async rewrites() {
    const store = process.env.STORE_URL ?? "http://localhost:3000";
    return [{ source: "/api/store/:path*", destination: `${store}/:path*` }];
  },
  reactStrictMode: true,
  // The floating dev badge overlaps the bottom-left of every page and lands in every
  // review screenshot. The surfaces are judged on how they look, so it goes.
  devIndicators: false,
};

export default nextConfig;
