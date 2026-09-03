'use client';

import React from 'react';
import { AlertaAsistencia } from '@/lib/types';
import { Utensils, Printer, X, AlertTriangle, User, FileText } from 'lucide-react';

interface BoletaIncidenciaModalProps {
  alerta: AlertaAsistencia | null;
  onClose: () => void;
}

export default function BoletaIncidenciaModal({ alerta, onClose }: BoletaIncidenciaModalProps) {
  if (!alerta) return null;

  const handlePrint = () => {
    window.print();
  };

  const fechaAlerta = alerta.created_at
    ? new Date(alerta.created_at).toLocaleDateString('es-NI', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Fecha no especificada';

  const horaAlerta = alerta.created_at
    ? new Date(alerta.created_at).toLocaleTimeString('es-NI', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '';

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'TARDANZA':
        return 'LLEGADA TARDÍA / RETRASO';
      case 'SEGUNDA_AUSENCIA':
        return 'SEGUNDA AUSENCIA SEMANAL (CONSECUTIVA)';
      case 'REGISTRO_INCOMPLETO':
        return 'REGISTRO DE JORNADA INCOMPLETO (OMISIÓN DE SALIDA)';
      case 'SALIDA_ANTICIPADA':
        return 'SALIDA ANTICIPADA NO AUTORIZADA';
      case 'MARCACION_SOSPECHOSA':
        return 'MARCAJE FUERA DE HORARIO HABITUAL';
      default:
        return 'INCIDENCIA DE ASISTENCIA Y PUNTUALIDAD';
    }
  };

  // Redacción formal ejecutiva para el expediente laboral (eliminando instrucciones internas del admin)
  const formatDetalleFormal = (al: AlertaAsistencia): string => {
    if (al.tipo === 'SEGUNDA_AUSENCIA') {
      const matchFechas = al.mensaje.match(/\((.*?)\)/);
      const fechas = matchFechas ? matchFechas[1] : 'días de la semana en curso';
      return `Se hace constar que el colaborador acumula dos (2) jornadas laborales sin registrar asistencia en la presente semana (${fechas}). Conforme a las normas de jornada y turnos de El Bodegón, el primer día corresponde a su descanso semanal, constituyendo el segundo día una ausencia no programada que se notifica por este medio para el debido descargo y registro en su expediente laboral.`;
    }

    if (al.tipo === 'TARDANZA') {
      const cleanMsg = al.mensaje
        .replace(/\(Turno.*?\)/gi, '')
        .replace(/\(Offline\)/gi, '')
        .trim();
      return `Se registra llegada tardía respecto a la hora de entrada estipulada (${cleanMsg}). Se emite la presente boleta de notificación para control de puntualidad conforme a las políticas del restaurante.`;
    }

    if (al.tipo === 'REGISTRO_INCOMPLETO') {
      return `Se constató omisión de registro en el marcaje de salida de la jornada laboral en el kiosco biométrico. Se notifica la incidencia para su debida regularización y constancia en el expediente de asistencia.`;
    }

    if (al.tipo === 'SALIDA_ANTICIPADA') {
      const cleanMsg = al.mensaje
        .replace(/\(Turno.*?\)/gi, '')
        .replace(/\(Offline\)/gi, '')
        .trim();
      return `Se registra retiro previo a la finalización oficial del turno (${cleanMsg}) sin autorización documentada previa. Se anexa la presente acta al expediente personal.`;
    }

    // Limpieza general de frases de instrucción interna administrativa
    return al.mensaje
      .replace(/Decida si autoriza la falta o si suma las 8 horas como deuda pendiente\.?/gi, '')
      .replace(/Por favor, agregue la salida manualmente.*?horas\.?/gi, '')
      .replace(/Puede ejecutar la Depuración Semestral.*?gratuito\.?/gi, '')
      .trim();
  };

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

          .print-hide, header, nav, aside, footer, table, button, a {
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
        }
      `}} />

      <div className="print-boleta-modal-container bg-stone-50 border border-stone-200 w-full max-w-2xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Barra Superior del Modal (Oculta al Imprimir) */}
        <div className="bg-white px-5 py-3.5 border-b border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900 leading-tight">
                Boleta de Notificación de Incidencia
              </h2>
              <p className="text-[11px] text-stone-500 font-medium">
                Formato oficial de 1 página listo para firma y archivo en expediente físico.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Imprimir Boleta (1 Página)
            </button>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 p-1.5 rounded-xl hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja de Documento Físico Simulado (Ajustado para 1 Sola Página) */}
        <div className="print-boleta-scroll-area flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="print-boleta-paper bg-white rounded-2xl p-5 sm:p-7 shadow-md border border-stone-200 text-stone-900 mx-auto max-w-[195mm]">
            
            {/* Encabezado Institucional Compacto */}
            <div className="border-b-2 border-[#1c6856] pb-3 mb-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1c6856] flex items-center justify-center text-white shadow-xs shrink-0">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="font-black text-base tracking-tight text-[#1c6856] uppercase leading-none">
                    Restaurante El Bodegón
                  </h1>
                  <span className="text-[8px] font-bold tracking-widest text-stone-400 uppercase block mt-0.5">
                    BodegónPass — Control de Asistencia y Personal
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block bg-rose-50 text-rose-800 border border-rose-200 text-[9px] font-mono font-bold px-2 py-0.5 rounded-md">
                  ACTA REF: #{String(alerta.id).padStart(5, '0')}
                </span>
                <p className="text-[10px] font-medium text-stone-500 mt-0.5">
                  Fecha Emisión: <strong className="text-stone-800">{new Date().toLocaleDateString('es-NI')}</strong>
                </p>
              </div>
            </div>

            {/* Título Principal del Documento */}
            <div className="text-center mb-3">
              <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-stone-900 border-b border-stone-200 pb-1 inline-block px-3">
                Notificación de Incidencia Laboral
              </h2>
              <p className="text-[9.5px] text-stone-500 font-medium mt-0.5">
                Constancia de Cumplimiento de Horario y Reglamento Interno de Trabajo
              </p>
            </div>

            {/* Cuadro de Datos del Colaborador */}
            <div className="bg-stone-50/90 border border-stone-200 rounded-lg p-2.5 mb-3">
              <h3 className="text-[10px] font-black text-[#1c6856] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <User className="w-3 h-3" />
                1. Datos del Colaborador
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-stone-400 font-bold block text-[8.5px] uppercase">Colaborador:</span>
                  <span className="font-black text-stone-900 text-xs truncate block">
                    {alerta.empleado_detalle ? `${alerta.empleado_detalle.nombre} ${alerta.empleado_detalle.apellido}` : 'Personal General'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[8.5px] uppercase">Puesto / Cargo:</span>
                  <span className="font-bold text-stone-800 text-xs truncate block">
                    {alerta.empleado_detalle?.cargo_display || 'Colaborador'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[8.5px] uppercase">ID de Carnet:</span>
                  <span className="font-mono text-stone-600 text-[10px]">
                    {alerta.empleado_detalle?.qr_code_token ? alerta.empleado_detalle.qr_code_token.slice(0, 14) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[8.5px] uppercase">Fecha de Detección:</span>
                  <span className="font-bold text-stone-800 text-[10.5px]">
                    {fechaAlerta} ({horaAlerta})
                  </span>
                </div>
              </div>
            </div>

            {/* Cuadro de Descripción Formal de la Incidencia */}
            <div className="border border-stone-200 rounded-lg p-2.5 mb-3">
              <h3 className="text-[10px] font-black text-rose-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                2. Descripción de la Falta o Incidencia
              </h3>
              <div className="bg-rose-50/40 border border-rose-100 rounded-md p-2 text-xs space-y-1">
                <div className="flex justify-between items-center border-b border-rose-200/50 pb-1">
                  <span className="font-bold text-rose-950 uppercase text-[9px]">Tipo de Falta:</span>
                  <span className="font-black text-rose-700 text-[10.5px]">{getTipoLabel(alerta.tipo)}</span>
                </div>
                <p className="text-stone-800 leading-relaxed font-normal text-[11px] pt-0.5">
                  {formatDetalleFormal(alerta)}
                </p>
              </div>
            </div>

            {/* Espacio para Descargo u Observaciones del Colaborador (A mano) */}
            <div className="border border-dashed border-stone-300 rounded-lg p-2.5 mb-4">
              <h3 className="text-[10px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                3. Descargo u Observaciones del Colaborador (Completar a mano):
              </h3>
              <div className="space-y-3.5 pt-1.5 pb-0.5">
                <div className="border-b border-stone-300 h-3.5"></div>
                <div className="border-b border-stone-300 h-3.5"></div>
                <div className="border-b border-stone-300 h-3.5"></div>
              </div>
            </div>

            {/* Bloque Legal de Firmas */}
            <div className="mt-4 pt-2">
              <p className="text-[9px] text-stone-500 text-center mb-7 italic">
                El colaborador certifica haber recibido notificación de la presente incidencia y comprende las normas de asistencia de El Bodegón.
              </p>

              <div className="grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-0.5">
                  <div className="border-b border-stone-800 w-3/4 mx-auto mb-1.5"></div>
                  <p className="font-black text-stone-900 text-xs">
                    {alerta.empleado_detalle ? `${alerta.empleado_detalle.nombre} ${alerta.empleado_detalle.apellido}` : 'Firma del Colaborador'}
                  </p>
                  <p className="text-[9px] text-stone-500 font-medium uppercase">Firma del Colaborador</p>
                </div>

                <div className="space-y-0.5">
                  <div className="border-b border-stone-800 w-3/4 mx-auto mb-1.5"></div>
                  <p className="font-black text-stone-900 text-xs">Administración / Gerencia</p>
                  <p className="text-[9px] text-stone-500 font-medium uppercase">Restaurante El Bodegón</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer del Modal (Oculto al Imprimir) */}
        <div className="bg-white px-5 py-3 border-t border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <span className="text-xs text-stone-500 font-medium">
            📄 Formato compacto calibrado para <strong>1 sola hoja Carta</strong>.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 rounded-xl bg-[#1c6856] text-white text-xs font-bold hover:bg-[#154f42] transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Imprimir Boleta (1 Página)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
