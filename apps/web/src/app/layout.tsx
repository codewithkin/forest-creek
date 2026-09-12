import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forest Creek Lodge — Where Nature Meets Luxury | Vumba, Zimbabwe",
  description:
    "An eco-conscious retreat in the Vumba highlands of Zimbabwe — every stay planted lightly among the trees.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${cormorant.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
