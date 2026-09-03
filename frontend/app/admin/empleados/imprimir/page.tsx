'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Empleado } from '@/lib/types';
import { fetchEmpleados } from '@/lib/api-client';
import { QRCodeSVG } from 'qrcode.react';
import { Utensils, Printer, ArrowLeft, Scissors, CheckCircle2 } from 'lucide-react';

const CARNETS_POR_HOJA = 6; // 3 filas x 2 columnas = 6 carnets por hoja (garantiza cero recortes en Carta/A4)

export default function ImprimirCarnetsPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmpleados()
      .then((data) => {
        setEmpleados(data.filter((e) => e.activo));
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const totalHojas = Math.max(1, Math.ceil(empleados.length / CARNETS_POR_HOJA));
  const hojas: Empleado[][] = [];
  for (let i = 0; i < empleados.length; i += CARNETS_POR_HOJA) {
    hojas.push(empleados.slice(i, i + CARNETS_POR_HOJA));
  }

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-600 font-sans">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#1c6856] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold">Generando hojas de carnets oficiales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans select-none print:bg-white print:p-0">
      {/* Estilos CSS estrictos para la impresora */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 10mm 15mm 10mm 15mm;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          /* Ocultar elementos web y navegación */
          .print-hide, header, nav, footer, button, a {
            display: none !important;
          }

          /* Hoja física estándar con salto estricto */
          .carnet-sheet-page {
            page-break-after: always !important;
            break-after: page !important;
            width: 100% !important;
            min-height: 250mm !important;
            max-height: 255mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
          }

          .carnet-sheet-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          /* Cuadrícula exacta de 2 columnas x 3 filas */
          .carnet-sheet-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 85.6mm) !important;
            grid-template-rows: repeat(3, 54mm) !important;
            gap: 6mm 10mm !important;
            justify-content: center !important;
            align-content: start !important;
          }

          /* Tarjeta CR80 Oficial */
          .carnet-card-cr80 {
            display: flex !important;
            width: 85.6mm !important;
            height: 54mm !important;
            border: 1.5pt solid #1c6856 !important;
            border-radius: 4.5mm !important;
            box-sizing: border-box !important;
            padding: 3.5mm !important;
            background: #faf8f5 !important;
            color: #1a1a1a !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: hidden !important;
          }

          /* Marco con guía de corte */
          .carnet-cut-wrapper {
            border: 1px dashed #94a3b8 !important;
            padding: 1.5mm !important;
            border-radius: 6mm !important;
            background: white !important;
          }
        }
      `}} />

      {/* Barra Superior de Control (Oculta al Imprimir) */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-stone-200 px-6 py-4 shadow-sm flex flex-wrap items-center justify-between gap-4 print-hide">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/empleados"
            className="flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Empleados
          </Link>
          <div>
            <h1 className="text-base font-black text-stone-900 flex items-center gap-2">
              <Printer className="w-4 h-4 text-[#1c6856]" />
              Hojas de Impresión de Carnets (CR80)
            </h1>
            <p className="text-xs text-stone-500 font-medium">
              {empleados.length} carnets divididos en <strong>{totalHojas} hojas</strong> (6 carnets por hoja, formato estándar Carta/A4 con guías de corte).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-md shadow-[#1c6856]/20 active:scale-95"
          >
            <Printer className="w-4 h-4" />
            Imprimir {totalHojas} Hojas Ahora
          </button>
        </div>
      </div>

      {/* Alerta de Recomendaciones (Oculta al Imprimir) */}
      <div className="max-w-4xl mx-auto mt-4 px-4 print-hide">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 leading-relaxed">
            <span className="font-bold">Garantía de Cero Recortes:</span> Cada hoja contiene exactamente 6 credenciales (3 filas × 2 columnas). En la ventana de tu impresora, asegúrate de marcar la casilla <strong>"Gráficos de fondo"</strong> (Background graphics) para que los colores oficiales de BodegónPass se impriman en alta calidad.
          </div>
        </div>
      </div>

      {/* Contenedor Principal de Hojas */}
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-10 print:max-w-none print:m-0 print:p-0 print:space-y-0">
        {hojas.map((pagina, pagIdx) => (
          <div
            key={pagIdx}
            className="carnet-sheet-page bg-white rounded-3xl p-8 shadow-xl border border-stone-200 mx-auto print:rounded-none print:shadow-none print:border-none print:p-0"
            style={{ width: '215.9mm', minHeight: '270mm' }}
          >
            {/* Encabezado Técnico de la Hoja */}
            <div className="flex items-center justify-between border-b border-dashed border-stone-300 pb-2 mb-6 text-stone-500 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-[#1c6856]">
                <Utensils className="w-3.5 h-3.5" />
                Restaurante El Bodegón — BodegónPass Credenciales Oficiales
              </span>
              <span className="flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5 text-stone-400" />
                Hoja {pagIdx + 1} de {totalHojas} ({pagina.length} {pagina.length === 1 ? 'carnet' : 'carnets'})
              </span>
            </div>

            {/* Cuadrícula de 6 carnets (3 filas x 2 columnas) */}
            <div className="carnet-sheet-grid grid grid-cols-2 gap-y-6 gap-x-8 justify-items-center">
              {pagina.map((emp) => (
                <div
                  key={emp.id}
                  className="carnet-cut-wrapper p-[1.5mm] border border-dashed border-stone-300 rounded-[6mm] bg-white inline-block shadow-xs"
                >
                  <div className="carnet-card-cr80 flex border-2 border-[#1c6856] rounded-[5mm] p-[3.5mm] bg-[#faf8f5] text-[#1a1a1a] w-[85.6mm] h-[54mm] box-border relative text-left font-sans select-none items-center justify-between">
                    {/* QR Izquierdo */}
                    <div className="w-[37mm] h-[37mm] bg-white p-[1.5mm] rounded-[3mm] border border-stone-200 flex flex-col items-center justify-center shrink-0 shadow-inner">
                      <QRCodeSVG
                        value={emp.qr_code_token}
                        size={114}
                        level="M"
                        includeMargin={false}
                      />
                      <span className="text-[6.5px] font-extrabold text-[#1c6856] tracking-wider uppercase mt-1 leading-none">
                        Escanear en Kiosco
                      </span>
                    </div>

                    {/* Datos Derechos */}
                    <div className="flex flex-col justify-between h-full w-[41mm] pl-[3mm] py-[0.5mm]">
                      <div>
                        {/* Logo y Marca */}
                        <div className="flex items-center gap-1.5 border-b border-[#1c6856]/20 pb-1 mb-1.5">
                          <div className="w-4 h-4 rounded-md bg-[#1c6856] flex items-center justify-center text-white shrink-0">
                            <Utensils className="w-2.5 h-2.5 text-white" />
                          </div>
                          <div className="leading-tight">
                            <span className="font-black text-[11px] tracking-tight text-[#1c6856] block leading-none">
                              BodegónPass
                            </span>
                            <span className="text-[6.5px] font-bold text-stone-400 uppercase tracking-widest block leading-none mt-0.5">
                              Restaurante El Bodegón
                            </span>
                          </div>
                        </div>

                        {/* Nombre del Colaborador */}
                        <div className="mt-1">
                          <h3 className="font-black text-[12.5px] text-stone-900 leading-tight uppercase truncate">
                            {emp.nombre}
                          </h3>
                          <h4 className="font-black text-[12.5px] text-stone-900 leading-tight uppercase truncate">
                            {emp.apellido}
                          </h4>
                        </div>

                        {/* Distintivo de Cargo */}
                        <div className="mt-1.5 inline-block bg-[#1c6856]/10 border border-[#1c6856]/25 rounded-md px-2 py-0.5">
                          <span className="text-[8px] font-black text-[#1c6856] uppercase tracking-wide block leading-none">
                            {emp.cargo_display}
                          </span>
                        </div>
                      </div>

                      {/* Footer ID y Validación */}
                      <div className="border-t border-stone-200 pt-1 flex justify-between items-center text-[7px] font-mono text-stone-400">
                        <span>ID: {emp.qr_code_token.slice(0, 14)}</span>
                        <span className="font-sans font-bold text-[#1c6856] text-[6.5px] uppercase">Oficial</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
