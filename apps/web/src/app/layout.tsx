import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Primer",
  description:
    "Open-source adaptive learning platform. Personalized, mastery-based education for every kid.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-background font-sans antialiased">
          <Header />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
