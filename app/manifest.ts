import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StadiumX — every ball, reconstructed",
    short_name: "StadiumX",
    description:
      "Free, fast, beautiful live cricket scores — with every ball synthesized into a live stadium reconstruction.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0E12",
    theme_color: "#0A0E12",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
