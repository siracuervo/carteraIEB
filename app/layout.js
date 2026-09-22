import { Geist, Geist_Mono } from "next/font/google";
import NavTabs from "./components/NavTabs";
import DolarCCLEnVivo from "./components/DolarCCLEnVivo";
import BotonActualizarTodo from "./components/BotonActualizarTodo";
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

export const viewport = {
  width: "device-width",
  initialScale: 1,
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
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 lg:px-8">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-sm font-bold" style={{ color: "var(--marca)" }}>
                  Cartera IEB
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:hidden">
                  <DolarCCLEnVivo />
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2 sm:hidden">
                <div className="min-w-0 flex-1">
                  <NavTabs />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <BotonActualizarTodo />
                  <BotonPrivacidad />
                </div>
              </div>
              <div className="hidden sm:block">
                <NavTabs />
              </div>
              <div className="ml-auto hidden items-center gap-2 sm:flex sm:gap-3">
                <BotonPrivacidad />
                <BotonActualizarTodo />
                <DolarCCLEnVivo />
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </ProveedorPrivacidad>
      </body>
    </html>
  );
}
