import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Local AI Second Brain",
    template: "%s · Local AI Second Brain",
  },
  description:
    "A private knowledge workspace powered by local Ollama models, Markdown, SQLite, and Qdrant.",
  applicationName: "Local AI Second Brain",
  keywords: [
    "local AI",
    "second brain",
    "RAG",
    "Ollama",
    "Qdrant",
    "Markdown",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
