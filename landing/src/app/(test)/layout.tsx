import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Automna Chat Test",
};

// Route group layout - just passes children through
// Root layout provides html/body and ClerkProvider
export default function TestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
