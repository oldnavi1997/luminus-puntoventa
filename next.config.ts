import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // pdfkit lee sus métricas de fuente (.afm) del disco con fs.readFileSync, así
  // que tiene que quedar como require externo en vez de empaquetarse.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "bcryptjs", "pdfkit"],
};

export default nextConfig;
