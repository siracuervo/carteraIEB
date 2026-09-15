import { Geist, Geist_Mono } from "next/font/google";
import NavTabs from "./components/NavTabs";
import BotonPrivacidad from "./components/BotonPrivacidad";
import { ProveedorPrivacidad } from "./components/PrivacidadContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Cartera IEB",
  description: "Análisis de cartera personal a partir de exports de IEB",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ProveedorPrivacidad>
          <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
              <span className="text-sm font-bold" style={{ color: "var(--marca)" }}>
                Cartera IEB
              </span>
              <NavTabs />
              <BotonPrivacidad />
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </ProveedorPrivacidad>
      </body>
    </html>
  );
}
