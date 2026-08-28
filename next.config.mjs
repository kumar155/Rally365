/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Capacitor packages the statically exported app from `out/`.
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
