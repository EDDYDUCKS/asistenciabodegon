import React from 'react';
import Link from 'next/link';
import { QrCode, LayoutDashboard, Utensils } from 'lucide-react';

export default function LandingPortalPage() {
  return (
    <main className="min-h-screen bg-[#fcf9f5] text-stone-850 flex flex-col justify-between p-6 sm:p-12 select-none font-sans">
      {/* Container Principal */}
      <div className="max-w-4xl mx-auto w-full my-auto space-y-12 text-center">
        {/* Header Branding */}
        <div className="space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-[#1c6856] flex items-center justify-center text-white mx-auto shadow-xl shadow-[#1c6856]/20">
            <Utensils className="w-10 h-10" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#1c6856]">
            El Bodegón
          </h1>
          <p className="text-sm sm:text-base text-stone-500 font-bold max-w-xl mx-auto uppercase tracking-wide">
            Sistema de Control de Asistencia & Nómina
          </p>
        </div>

        {/* Tarjetas de Selección de Módulo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Opción 1: Kiosco */}
          <Link
            href="/kiosco"
            className="group bg-white hover:bg-stone-50/50 border border-stone-200 hover:border-[#1c6856] rounded-3xl p-8 text-left transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between space-y-6"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#1c6856]/10 border border-[#1c6856]/10 flex items-center justify-center text-[#1c6856] group-hover:scale-105 transition-transform">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Punto de Marcaje
              </span>
              <h2 className="text-xl font-black text-stone-900 group-hover:text-[#1c6856] transition-colors">
                Kiosco de Entrada/Salida
              </h2>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                Pantalla para que los empleados registren sus eventos de jornada (Entrada, Descanso, Salida) mediante su carnet QR o ingreso manual.
              </p>
            </div>
          </Link>

          {/* Opción 2: Admin */}
          <Link
            href="/admin"
            className="group bg-white hover:bg-stone-50/50 border border-stone-200 hover:border-[#1c6856] rounded-3xl p-8 text-left transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between space-y-6"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#1c6856]/10 border border-[#1c6856]/10 flex items-center justify-center text-[#1c6856] group-hover:scale-105 transition-transform">
              <LayoutDashboard className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Panel de Control
              </span>
              <h2 className="text-xl font-black text-stone-900 group-hover:text-[#1c6856] transition-colors">
                Panel Administrativo
              </h2>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                Administración de personal, creación/edición de empleados, impresión de carnets físicos y generación de reportes de nómina para Excel.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer Portal */}
      <footer className="text-center text-xs text-stone-400 font-bold uppercase tracking-wide">
        Restaurante El Bodegón © 2026 — SGP Asistencia
      </footer>
    </main>
  );
}
