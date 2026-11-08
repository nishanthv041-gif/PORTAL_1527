import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SRT Universal School Portal",
    short_name: "SRT Portal",
    description:
      "Official Academic & Management Portal of SRT Universal School. Access school records, attendance, report cards, announcements, and administrative services.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "window-controls-overlay", "minimal-ui"],
    background_color: "#0f172a",
    theme_color: "#3b82f6",
    orientation: "any",
    lang: "en",
    dir: "ltr",
    categories: ["education", "management", "productivity"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Access School Dashboard",
        url: "/dashboard",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Login",
        short_name: "Login",
        description: "Portal Account Login",
        url: "/login",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
  };
}

