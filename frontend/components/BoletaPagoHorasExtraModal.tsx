'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PagoHorasExtra } from '@/lib/types';
import { Printer, X, Banknote, FileText, CheckCircle2, User, Calendar, Shield } from 'lucide-react';

interface BoletaPagoHorasExtraModalProps {
  pago: PagoHorasExtra | null;
  onClose: () => void;
}

export default function BoletaPagoHorasExtraModal({
  pago,
  onClose,
}: BoletaPagoHorasExtraModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pago) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [pago]);

  if (!pago || !mounted) return null;

  const handlePrint = () => {
    window.print();
  };

  const emp = pago.empleado_detalle;
  const nombreColaborador = emp ? `${emp.nombre} ${emp.apellido || ''}`.trim() : 'Colaborador';
  const cargoColaborador = emp?.cargo_display || 'Colaborador';
  const idCarnet = emp?.cedula_carnet
    ? emp.cedula_carnet
    : (emp?.qr_code_token ? emp.qr_code_token.slice(0, 14) : `EMP-${pago.empleado}`);

  const fechaPagoStr = new Date(pago.fecha_pago + 'T00:00:00').toLocaleDateString('es-NI', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const fechaEmision = new Date(pago.created_at || new Date()).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const totalHoras = parseFloat(String(pago.total_horas_pagadas || 0));
  const montoNum = parseFloat(String(pago.monto_total || 0));
  const tarifaNum = parseFloat(String(pago.tarifa_hora_aplicada || 0));

  const metodoPagoDisplay =
    pago.metodo_pago === 'EFECTIVO'
      ? 'Efectivo en Caja'
      : pago.metodo_pago === 'TRANSFERENCIA'
      ? 'Transferencia Bancaria'
      : 'Nómina Quincenal';

  const detalles = Array.isArray(pago.detalles_fechas) ? pago.detalles_fechas : [];

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex justify-center items-start p-3 sm:p-6 overflow-y-auto print-pago-extra-backdrop">
      {/* Estilos estrictos de impresión: 1 SOLA PÁGINA CARTA */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 5mm 8mm 5mm 8mm;
          }

          body > *:not(.print-pago-extra-backdrop) {
            display: none !important;
          }
          main, header, nav, aside, footer, #__next, [role="main"] {
            display: none !important;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          .print-hide, button, a {
            display: none !important;
          }

          .print-pago-extra-backdrop {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }

          .print-pago-extra-container {
            border: 1.5pt solid #000000 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            border-radius: 4px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
            box-sizing: border-box !important;
          }

          .print-pago-content {
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            height: auto !important;
            padding: 4mm 6mm !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            gap: 2mm !important;
          }

          .print-pago-content > * {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            overflow: visible !important;
          }

          .print-header-block {
            padding-bottom: 1.5mm !important;
          }

          .print-info-grid {
            padding: 2mm 3mm !important;
          }

          .print-detalles-card {
            padding: 2mm 3mm !important;
          }

          .print-resumen-box {
            padding: 2mm 3mm !important;
          }

          .print-legal-text {
            font-size: 8.5px !important;
            line-height: 1.3 !important;
            padding: 1.5mm 2.5mm !important;
          }

          .print-firmas-grid {
            padding-top: 3.5mm !important;
            padding-bottom: 0.5mm !important;
          }

          .print-firmas-grid .w-48 {
            width: 38mm !important;
          }

          .print-pago-extra-container * {
            color: #000000 !important;
            text-shadow: none !important;
            box-shadow: none !important;
          }

          .print-pago-extra-container [class*="bg-"] {
            background-color: #ffffff !important;
          }

          .print-pago-extra-container img {
            filter: grayscale(100%) contrast(130%) !important;
          }

          .print-pago-extra-container [class*="rounded-full"] {
            border: 1pt solid #000000 !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            font-weight: 800 !important;
          }

          .print-pago-extra-container [class*="border-l-"] {
            border-left: 2.5pt solid #000000 !important;
            background-color: #ffffff !important;
          }
        }
        `,
        }}
      />

      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden print-pago-extra-container my-auto">
        {/* Barra de Acciones (Oculta al imprimir) */}
        <div className="print-hide flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
              Recibo Oficial de Pago de Horas Extra — Restaurante El Bodegón
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1c6856] hover:bg-[#154f41] text-white text-xs font-bold transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Recibo</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido Imprimible */}
        <div className="p-6 sm:p-7 space-y-4 text-stone-900 font-sans print-pago-content">
          {/* Encabezado */}
          <div className="border-b-2 border-[#1c6856] pb-3.5 print-header-block">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-[#1c6856]/30 bg-[#1c6856]">
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-[#1c6856] uppercase leading-tight font-display">
                      Restaurante El Bodegón
                    </h1>
                    <p className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                      Administración & Nómina
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-stone-500 mt-1 font-medium">
                  Comprobante Oficial de Desembolso y Liquidación de Horas Extraordinarias
                </p>
              </div>

              {/* Folio y Fecha */}
              <div className="text-right shrink-0">
                <div className="inline-block border-2 border-[#1c6856]/40 bg-[#1c6856]/5 rounded-xl px-3.5 py-1.5 text-right shadow-2xs">
                  <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block">
                    Recibo Oficial N°
                  </span>
                  <span className="text-base font-mono font-black text-[#1c6856]">
                    {pago.numero_recibo}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-stone-500 mt-1">
                  Emisión: {fechaEmision}
                </p>
              </div>
            </div>

            {/* Sub-título con Estado */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-stone-150">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1c6856]" />
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-stone-800">
                  Liquidación de Horas Extraordinarias
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border bg-emerald-50 text-emerald-900 border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>PAGADO & LIQUIDADO AL 100%</span>
              </span>
            </div>
          </div>

          {/* Información del Colaborador */}
          <div className="bg-stone-50/90 border border-stone-200 rounded-2xl p-3.5 shadow-xs print-info-grid">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#1c6856] block mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Información del Personal y Pago
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Colaborador:</span>
                <strong className="text-stone-900 font-bold text-sm block">{nombreColaborador}</strong>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Puesto / Cargo:</span>
                <span className="text-stone-800 font-semibold">{cargoColaborador}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Identificación:</span>
                <span className="font-mono text-stone-700 font-semibold">{idCarnet}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Modalidad de Pago:</span>
                <span className="text-[#1c6856] font-bold">{metodoPagoDisplay}</span>
              </div>
            </div>
          </div>

          {/* Tarjeta de Resumen Económico */}
          <div className="grid grid-cols-3 gap-3 print-resumen-box">
            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500 block">Total Horas Extra</span>
              <strong className="text-stone-900 font-mono font-black text-base block mt-0.5">
                +{totalHoras.toFixed(1)} hrs
              </strong>
              <span className="text-[9px] text-stone-400 block mt-0.5">Efectivas liquidadas</span>
            </div>

            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500 block">Tarifa por Hora</span>
              <strong className="text-stone-900 font-mono font-black text-base block mt-0.5">
                C$ {tarifaNum.toFixed(2)}
              </strong>
              <span className="text-[9px] text-stone-400 block mt-0.5">Recargo 100% legal</span>
            </div>

            <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-300 text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Monto Total Desembolsado</span>
              <strong className="text-emerald-900 font-mono font-black text-lg block mt-0.5">
                C$ {montoNum.toFixed(2)}
              </strong>
              <span className="text-[9px] text-emerald-700 font-semibold block mt-0.5">Córdobas Netos</span>
            </div>
          </div>

          {/* Desglose de Jornadas Extraordinarias Pagadas */}
          <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs print-detalles-card">
            <div className="bg-[#1c6856]/10 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#1c6856] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Detalle de Fechas y Horas Extra Amparadas en este Recibo ({detalles.length} jornada{detalles.length !== 1 ? 's' : ''})
              </span>
              <span className="text-xs font-mono font-bold text-stone-700 capitalize">
                Liquidado: {fechaPagoStr}
              </span>
            </div>

            <div className="p-3 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-[10px] uppercase font-bold text-stone-500">
                    <th className="pb-1.5">Fecha Laborada</th>
                    <th className="pb-1.5 text-right">H. Solicitadas</th>
                    <th className="pb-1.5 text-right">H. Autorizadas / Pagadas</th>
                    <th className="pb-1.5 text-right">Subtotal Aprox.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {detalles.length > 0 ? (
                    detalles.map((d, i) => {
                      const fStr = d.fecha
                        ? new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-NI', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : `Fecha #${i + 1}`;
                      const hPag = parseFloat(String(d.horas_autorizadas || 0));
                      const subtotalC = hPag * tarifaNum;
                      return (
                        <tr key={i} className="py-1">
                          <td className="py-1.5 font-medium text-stone-800 capitalize flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span>
                            <span>{fStr}</span>
                          </td>
                          <td className="py-1.5 text-right font-mono text-stone-600">
                            +{parseFloat(String(d.horas_solicitadas || 0)).toFixed(1)} hrs
                          </td>
                          <td className="py-1.5 text-right font-mono font-bold text-emerald-800">
                            +{hPag.toFixed(1)} hrs
                          </td>
                          <td className="py-1.5 text-right font-mono font-bold text-stone-900">
                            C$ {subtotalC.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-stone-500">
                        Liquidación consolidada de {totalHoras.toFixed(1)} hrs extraordinarias acumuladas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {pago.observaciones && (
                <div className="mt-2.5 pt-2 border-t border-stone-150 text-[11px] text-stone-600 italic">
                  <strong>Observaciones:</strong> &ldquo;{pago.observaciones}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Declaración Legal de Recibo Conforme */}
          <p className="text-[10px] text-stone-600 leading-relaxed text-justify border-l-2 border-[#1c6856] pl-3 py-1 bg-stone-50/50 rounded-r-lg print-legal-text">
            Por medio del presente comprobante oficial, el/la colaborador(a) abajo firmante hace constar que ha recibido a su entera satisfacción de <strong>Restaurante El Bodegón</strong> la cantidad neta en Córdobas aquí especificada, en concepto de pago y liquidación íntegra de las horas extraordinarias detalladas, habiendo sido calculadas y canceladas conforme a lo preceptuado en el Artículo 62 del Código del Trabajo de la República de Nicaragua con el recargo legal correspondiente del cien por ciento (100%), no teniendo reclamo pendiente alguno por este concepto en las fechas relacionadas.
          </p>

          {/* Firmas Formales */}
          <div className="pt-5 pb-1 grid grid-cols-2 gap-8 text-center text-xs print-firmas-grid">
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider text-xs">{nombreColaborador}</p>
              <p className="text-[10px] text-stone-500">Firma del Colaborador(a) • Recibido Conforme</p>
              <p className="text-[9px] text-stone-400 font-mono">Cédula / Carnet: {idCarnet}</p>
            </div>
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider text-xs">Administración General</p>
              <p className="text-[10px] text-stone-500">Restaurante El Bodegón</p>
              <p className="text-[9px] text-stone-400">Firma Autorizada y Sello de Caja</p>
            </div>
          </div>
        </div>

        {/* Footer del Modal (Oculto al imprimir) */}
        <div className="print-hide bg-stone-100 px-6 py-4 border-t border-stone-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-200/80 font-bold text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-[#1c6856] hover:bg-[#154f42] text-white font-bold text-xs transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Recibo Oficial / Guardar PDF</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
