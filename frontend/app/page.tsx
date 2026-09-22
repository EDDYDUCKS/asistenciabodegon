import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { QrCode, LayoutDashboard, ShoppingBag, Smartphone } from 'lucide-react';

export default function LandingPortalPage() {
  return (
    <main className="min-h-screen bg-[#fcf9f5] text-stone-850 flex flex-col justify-between p-6 sm:p-12 select-none font-sans">
      {/* Container Principal */}
      <div className="max-w-5xl mx-auto w-full my-auto space-y-10 text-center">
        {/* Header Branding */}
        <div className="space-y-3">
          <div className="w-24 h-24 rounded-full overflow-hidden mx-auto shadow-xl shadow-[#1c6856]/25 border-2 border-[#1c6856]/20 bg-[#1c6856]">
            <Image
              src="/logo.png"
              alt="Restaurante El Bodegón"
              width={96}
              height={96}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#1c6856]">
            El Bodegón
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 font-bold max-w-xl mx-auto uppercase tracking-wider">
            Plataforma Operativa — Asistencia, Personal & Control de Gastos
          </p>
        </div>

        {/* Tarjetas de Selección de Módulo (3 Módulos Independientes) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Opción 1: Kiosco (Bodegón Pass) */}
          <Link
            href="/kiosco"
            className="group bg-white hover:bg-stone-50/50 border border-stone-200 hover:border-[#1c6856] rounded-3xl p-7 text-left transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between space-y-5"
          >
            <div className="w-13 h-13 rounded-2xl bg-[#1c6856]/10 border border-[#1c6856]/10 flex items-center justify-center text-[#1c6856] group-hover:scale-105 transition-transform">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Punto de Marcaje
              </span>
              <h2 className="text-lg font-black text-stone-900 group-hover:text-[#1c6856] transition-colors">
                Kiosco Entrada/Salida
              </h2>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                Pantalla para que los colaboradores registren sus eventos de jornada (Entrada, Descanso, Salida) mediante QR o ingreso manual.
              </p>
            </div>
          </Link>

          {/* Opción 2: Bodegón Pass Admin */}
          <Link
            href="/admin"
            className="group bg-white hover:bg-stone-50/50 border border-stone-200 hover:border-[#1c6856] rounded-3xl p-7 text-left transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between space-y-5"
          >
            <div className="w-13 h-13 rounded-2xl bg-[#1c6856]/10 border border-[#1c6856]/10 flex items-center justify-center text-[#1c6856] group-hover:scale-105 transition-transform">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Asistencia & Nómina
              </span>
              <h2 className="text-lg font-black text-stone-900 group-hover:text-[#1c6856] transition-colors">
                Bodegón Pass Admin
              </h2>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                Gestión de colaboradores, aprobación de horas extra, carnets físicos, deducciones automáticas y exportación de nómina a Excel.
              </p>
            </div>
          </Link>

          {/* Opción 3: Bodegón Control (Compras, Gastos & Caja) */}
          <Link
            href="/control"
            className="group bg-white hover:bg-amber-50/30 border border-stone-200 hover:border-amber-500 rounded-3xl p-7 text-left transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between space-y-5"
          >
            <div className="w-13 h-13 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
                Compras & Caja Chica
              </span>
              <h2 className="text-lg font-black text-stone-900 group-hover:text-amber-600 transition-colors">
                Bodegón Control
              </h2>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                Registro de compras de insumos, carnes y verduras, control de caja chica en vivo y panel móvil para que el jefe autorice transferencias.
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
