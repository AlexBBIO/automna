import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Automna - Your Private AI Agent, Working in 60 Seconds",
  description: "Your own, private, fully autonomous AI agent. Not just chat — execute tasks, manage files, automate workflows, and deploy apps. Starting at $30/month.",
  keywords: "AI agent, autonomous AI, AI assistant, automation, Discord bot, Telegram bot, personal AI",
  openGraph: {
    title: "Automna - Your Private AI Agent",
    description: "Your own, private, fully autonomous AI agent. Working in 60 seconds.",
    type: "website",
    url: "https://automna.ai",
    images: [
      {
        url: "https://automna.ai/og-image.png",
        width: 1200,
        height: 630,
        alt: "Automna - Your Private AI Agent, Working in 60 Seconds",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Automna - Your Private AI Agent",
    description: "Your own, private, fully autonomous AI agent. Working in 60 seconds.",
    images: ["https://automna.ai/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-QGH92V1XEJ"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-QGH92V1XEJ');
          `}
        </Script>
        <body className={inter.className}>
          {children}
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
