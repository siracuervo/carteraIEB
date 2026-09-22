import { Geist, Geist_Mono } from "next/font/google";
import NavTabs from "./components/NavTabs";
import DolarCCLEnVivo from "./components/DolarCCLEnVivo";
import BotonActualizarTodo from "./components/BotonActualizarTodo";
import BotonPrivacidad from "./components/BotonPrivacidad";
import RegistroSW from "./components/RegistroSW";
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
  title: "Siracartera",
  description: "Análisis de portafolio personal a partir de exports de IEB",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4a3aa7",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegistroSW />
        <ProveedorPrivacidad>
          <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 lg:px-8">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:hidden">
                <span className="shrink-0 justify-self-start text-sm font-bold" style={{ color: "var(--marca)" }}>
                  Siracartera
                </span>
                <div className="flex min-w-0 justify-center">
                  <DolarCCLEnVivo parte="actualizacion" />
                </div>
                <div className="flex min-w-0 justify-end">
                  <DolarCCLEnVivo parte="ccl" />
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
                <DolarCCLEnVivo parte="ccl" />
                <BotonActualizarTodo />
                <DolarCCLEnVivo parte="actualizacion" />
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </ProveedorPrivacidad>
      </body>
    </html>
  );
}
