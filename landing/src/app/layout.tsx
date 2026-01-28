import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
  },
  twitter: {
    card: "summary_large_image",
    title: "Automna - Your Private AI Agent",
    description: "Your own, private, fully autonomous AI agent. Working in 60 seconds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
