/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@avaliacoes/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.nuvemshop.com.br" },
    ],
  },
};

export default nextConfig;
