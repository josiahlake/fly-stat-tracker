// src/app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Fly Stat Tracker",
  description: "Track your player's stats for a game or for a season.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
