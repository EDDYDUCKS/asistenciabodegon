'use client';

import React from 'react';
import { CompensacionHoras } from '@/lib/types';
import { Utensils, Printer, X, Scale, User, CheckCircle, Clock } from 'lucide-react';

interface BoletaCompensacionModalProps {
  compensacion: CompensacionHoras | null;
  onClose: () => void;
}

export default function BoletaCompensacionModal({ compensacion, onClose }: BoletaCompensacionModalProps) {
  if (!compensacion) return null;

  const handlePrint = () => {
    window.print();
  };

  const emp = compensacion.empleado_detalle;
  const nombreColaborador = emp ? `${emp.nombre} ${emp.apellido}` : `Colaborador #${compensacion.empleado}`;
  const cargoColaborador = emp?.cargo_display || 'Colaborador';
  const idCarnet = emp?.qr_code_token ? emp.qr_code_token.slice(0, 14) : `ID-${compensacion.empleado}`;

  const fechaJornadaDisplay = new Date(compensacion.fecha_compensacion + 'T00:00:00').toLocaleDateString('es-NI', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const fechaEmision = new Date().toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const esSaldada = Number(compensacion.saldo_restante) === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print-boleta-backdrop">
      {/* Estilos estrictos de impresión: 1 SOLA PÁGINA EXACTA */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 8mm 12mm 8mm 12mm;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }

          .print-hide, header, nav, aside, footer, table:not(.print-table), button, a {
            display: none !important;
          }

          .print-boleta-backdrop {
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
          }

          .print-boleta-modal-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
          }

          .print-boleta-scroll-area {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            height: auto !important;
          }

          /* Hoja ajustada estrictamente para NO romper en página 2 */
          .print-boleta-paper {
            background: white !important;
            border: 1.5pt solid #1c6856 !important;
            border-radius: 3mm !important;
            box-shadow: none !important;
            padding: 5mm 7mm !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 190mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-table {
            display: table !important;
            width: 100% !important;
          }
        }
      `}} />

      <div className="print-boleta-modal-container bg-stone-50 border border-stone-200 w-full max-w-2xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Barra Superior del Modal (Oculta al Imprimir) */}
        <div className="bg-white px-5 py-3.5 border-b border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900 leading-tight">
                Acta Oficial de Deducción y Compensación de Horas
              </h2>
              <p className="text-[11px] text-stone-500 font-medium">
                Formato oficial de 1 página listo para imprimir o guardar como PDF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Descargar PDF / Imprimir (1 Pág)
            </button>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 p-1.5 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja de Documento Físico Simulado (Ajustado para 1 Sola Página) */}
        <div className="print-boleta-scroll-area flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="print-boleta-paper bg-white rounded-2xl p-5 sm:p-7 shadow-md border border-stone-200 text-stone-900 mx-auto max-w-[195mm]">
            
            {/* Encabezado Institucional Compacto */}
            <div className="border-b-2 border-[#1c6856] pb-2.5 mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1c6856] flex items-center justify-center text-white shadow-xs shrink-0">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="font-black text-base tracking-tight text-[#1c6856] uppercase leading-none">
                    Restaurante El Bodegón
                  </h1>
                  <span className="text-[8px] font-bold tracking-widest text-stone-400 uppercase block mt-0.5">
                    BodegónPass — Control de Asistencia y Compensación Laboral
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded-md">
                  ACTA COMP: #{String(compensacion.id).padStart(5, '0')}
                </span>
                <p className="text-[10px] font-medium text-stone-500 mt-0.5">
                  Fecha Emisión: <strong className="text-stone-800">{fechaEmision}</strong>
                </p>
              </div>
            </div>

            {/* Título Principal del Documento */}
            <div className="text-center mb-2.5">
              <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-stone-900 border-b border-stone-200 pb-0.5 inline-block px-3">
                Acta de Compensación y Deducción de Horas
              </h2>
              <p className="text-[9.5px] text-stone-500 font-medium mt-0.5">
                Liquidación de Déficit de Horas Ordinarias con Jornada Extraordinaria
              </p>
            </div>

            {/* Cuadro 1: Datos del Colaborador */}
            <div className="bg-stone-50/90 border border-stone-200 rounded-lg p-2.5 mb-2.5">
              <h3 className="text-[10px] font-black text-[#1c6856] uppercase tracking-wider mb-1 flex items-center gap-1">
                <User className="w-3 h-3" />
                1. Datos del Colaborador
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-stone-400 font-bold block text-[8px] uppercase">Colaborador:</span>
                  <span className="font-black text-stone-900 text-xs truncate block">
                    {nombreColaborador}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[8px] uppercase">Puesto / Cargo:</span>
                  <span className="font-bold text-stone-800 text-xs truncate block">
                    {cargoColaborador}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[8px] uppercase">ID / Carnet:</span>
                  <span className="font-mono text-stone-600 text-[10px]">
                    {idCarnet}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[8px] uppercase">Estado de Saldo:</span>
                  <span className={`font-bold text-[10px] inline-flex items-center gap-1 ${esSaldada ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <CheckCircle className="w-3 h-3" />
                    {esSaldada ? 'Totalmente Liquidada' : `Debe ${Number(compensacion.saldo_restante).toFixed(1)} hrs`}
                  </span>
                </div>
              </div>
            </div>

            {/* Cuadro 2: Jornada Extraordinaria Realizada (Fecha de Aplicación) */}
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-2.5 mb-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div>
                  <span className="text-[8.5px] font-bold text-emerald-800 uppercase tracking-wider block">
                    2. Jornada con Horas Extraordinarias Realizada:
                  </span>
                  <span className="font-black text-stone-900 text-xs capitalize">
                    {fechaJornadaDisplay}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-right">
                    <span className="text-[8px] text-stone-500 uppercase font-bold block">Jornada Total</span>
                    <span className="font-mono font-bold text-stone-800 text-xs">
                      {Number(compensacion.horas_trabajadas_hoy).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] text-emerald-800 uppercase font-bold block">Horas Extra Laboradas</span>
                    <span className="font-mono font-black text-emerald-800 text-xs">
                      +{Number(compensacion.horas_extra_generadas).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] text-[#1c6856] uppercase font-bold block">(-) Aplicadas a Deuda</span>
                    <span className="font-mono font-black text-[#1c6856] text-xs">
                      -{Number(compensacion.horas_deducidas).toFixed(1)} hrs
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cuadro 3: Desglose de Días Adeudados Amortizados */}
            <div className="border border-stone-200 rounded-lg p-2.5 mb-2.5">
              <h3 className="text-[10px] font-black text-stone-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#1c6856]" />
                3. Desglose Diario de Horas Debidas y Amortizadas
              </h3>

              {compensacion.desglose && compensacion.desglose.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[10px] border-collapse print-table">
                    <thead>
                      <tr className="border-b border-stone-200 text-[8.5px] uppercase text-stone-500 font-bold bg-stone-50/80">
                        <th className="py-1 px-1.5">Fecha Adeudada</th>
                        <th className="py-1 px-1.5 text-center">Jornada Laborada (Base 8h)</th>
                        <th className="py-1 px-1.5 text-center text-rose-600">Horas Pendientes (Déficit)</th>
                        <th className="py-1 px-1.5 text-center text-emerald-700">Horas Compensadas</th>
                        <th className="py-1 px-1.5 text-center">Saldo Pendiente</th>
                        <th className="py-1 px-1.5 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-medium">
                      {compensacion.desglose.map((item, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          <td className="py-1 px-1.5 font-bold text-stone-900">
                            {item.fecha_display || item.fecha}
                          </td>
                          <td className="py-1 px-1.5 text-center font-mono text-stone-700">
                            {Number(item.horas_trabajadas).toFixed(1)} hrs
                          </td>
                          <td className="py-1 px-1.5 text-center font-mono text-rose-700 font-bold">
                            -{Number(item.horas_faltaron).toFixed(1)} hrs
                          </td>
                          <td className="py-1 px-1.5 text-center font-mono text-emerald-800 font-black">
                            +{Number(item.horas_aplicadas).toFixed(1)} hrs
                          </td>
                          <td className="py-1 px-1.5 text-center font-mono text-stone-900 font-bold">
                            {Number(item.saldo_dia).toFixed(1)} hrs
                          </td>
                          <td className="py-1 px-1.5 text-right">
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {item.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-stone-50 p-2 rounded text-stone-600 text-[10px]">
                  Amortización directa aplicada sobre el saldo deudor acumulado: {Number(compensacion.horas_deducidas).toFixed(1)} hrs.
                </div>
              )}
            </div>

            {/* Cuadro 4: Balance Consolidado de la Operación */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-2.5 mb-2.5 space-y-2">
              {/* Sección A: Liquidación de Horas Extraordinarias de la Jornada */}
              <div className="bg-white border border-stone-200/80 rounded-lg p-2 shadow-2xs">
                <span className="text-[8.5px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                  A. Liquidación de Horas Extraordinarias de la Jornada:
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-stone-50/80 p-1.5 rounded border border-stone-200/70">
                    <span className="text-[7.5px] text-stone-500 uppercase font-bold block">Horas Extra Laboradas</span>
                    <span className="font-mono font-black text-stone-800 text-xs">
                      +{Number(compensacion.horas_extra_generadas).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="bg-stone-50/80 p-1.5 rounded border border-stone-200/70">
                    <span className="text-[7.5px] text-stone-500 uppercase font-bold block">(-) Aplicadas a Deuda</span>
                    <span className="font-mono font-black text-[#1c6856] text-xs">
                      -{Number(compensacion.horas_deducidas).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="bg-emerald-50 p-1.5 rounded border border-emerald-300">
                    <span className="text-[7.5px] text-emerald-800 uppercase font-bold block">(=) A Pagar en Nómina</span>
                    <span className="font-mono font-black text-emerald-800 text-xs">
                      {Number(compensacion.remanente_extra) > 0 ? `+${Number(compensacion.remanente_extra).toFixed(1)} hrs` : '0.0 hrs'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sección B: Estado del Saldo Pendiente del Colaborador (Bolsa de Horas) */}
              <div className="bg-white border border-stone-200/80 rounded-lg p-2 shadow-2xs">
                <span className="text-[8.5px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                  B. Estado del Saldo Pendiente del Colaborador (Bolsa de Horas):
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-stone-50/80 p-1.5 rounded border border-stone-200/70">
                    <span className="text-[7.5px] text-stone-500 uppercase font-bold block">Saldo Pendiente Anterior</span>
                    <span className="font-mono font-black text-stone-800 text-xs">
                      {Number(compensacion.deuda_previa).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="bg-stone-50/80 p-1.5 rounded border border-stone-200/70">
                    <span className="text-[7.5px] text-stone-500 uppercase font-bold block">(-) Horas Compensadas</span>
                    <span className="font-mono font-black text-emerald-700 text-xs">
                      -{Number(compensacion.horas_deducidas).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className={`p-1.5 rounded border ${
                    esSaldada ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
                  }`}>
                    <span className={`text-[7.5px] uppercase font-bold block ${
                      esSaldada ? 'text-emerald-800' : 'text-rose-800'
                    }`}>
                      (=) Saldo Pendiente Actual
                    </span>
                    <span className={`font-mono font-black text-xs ${
                      esSaldada ? 'text-emerald-800' : 'text-rose-700'
                    }`}>
                      {esSaldada ? '0.0 hrs (Al Día ✅)' : `${Number(compensacion.saldo_restante).toFixed(1)} hrs`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cláusula Legal de Conformidad */}
            <p className="text-[8.5px] text-stone-500 text-justify leading-snug mb-4 italic">
              Se hace constar formalmente que las horas extraordinarias trabajadas en la fecha indicada han sido aplicadas a la amortización y deducción del déficit de horas acumulado previamente por el colaborador, conforme al acuerdo mutuo de bolsa de horas y a las disposiciones laborales del Restaurante El Bodegón. El saldo restante (si hubiere) y/o remanente a pago ha sido debidamente registrado y validado en el sistema BodegónPass.
            </p>

            {/* Bloque Legal de Firmas */}
            <div className="pt-2">
              <div className="grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-0.5">
                  <div className="border-b border-stone-800 w-3/4 mx-auto mb-1.5"></div>
                  <p className="font-black text-stone-900 text-xs truncate">
                    {nombreColaborador}
                  </p>
                  <p className="text-[8.5px] text-stone-500 font-medium uppercase">Firma del Colaborador</p>
                </div>

                <div className="space-y-0.5">
                  <div className="border-b border-stone-800 w-3/4 mx-auto mb-1.5"></div>
                  <p className="font-black text-stone-900 text-xs">Administración / Gerencia</p>
                  <p className="text-[8.5px] text-stone-500 font-medium uppercase">Restaurante El Bodegón</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer del Modal (Oculto al Imprimir) */}
        <div className="bg-white px-5 py-3 border-t border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <span className="text-xs text-stone-500 font-medium">
            📄 Formato oficial calibrado para <strong>1 sola hoja Carta</strong> (Imprimir o Guardar como PDF).
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 rounded-xl bg-[#1c6856] text-white text-xs font-bold hover:bg-[#154f42] transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Descargar PDF / Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
