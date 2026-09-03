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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print-boleta-backdrop">
      {/* Estilos estrictos de impresión para el acta */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 12mm 15mm;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
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

          .print-boleta-paper {
            background: white !important;
            border: 2px solid #1c6856 !important;
            border-radius: 4mm !important;
            box-shadow: none !important;
            padding: 8mm 10mm !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 185mm !important;
            box-sizing: border-box !important;
          }

          .print-border-exact {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />

      <div className="bg-stone-50 border border-stone-200 w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Barra Superior del Modal (Oculta al Imprimir) */}
        <div className="bg-white px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900 leading-tight">
                Acta Oficial de Incidencia de Asistencia
              </h2>
              <p className="text-xs text-stone-500 font-medium">
                Documento administrativo listo para imprimir y anexar al expediente físico del personal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Imprimir Acta
            </button>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 p-2 rounded-xl hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja de Documento Físico Simulado */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="print-boleta-paper bg-white rounded-2xl p-6 sm:p-10 shadow-md border border-stone-200 text-stone-900 mx-auto max-w-[210mm] print-border-exact">
            
            {/* Encabezado Institucional */}
            <div className="border-b-2 border-[#1c6856] pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#1c6856] flex items-center justify-center text-white shadow-sm shrink-0">
                  <Utensils className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="font-black text-lg tracking-tight text-[#1c6856] uppercase leading-tight">
                    Restaurante El Bodegón
                  </h1>
                  <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block">
                    BodegónPass — Control de Asistencia y Personal
                  </span>
                </div>
              </div>

              <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-100">
                <span className="inline-block bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full mb-1">
                  ACTA REF: #{String(alerta.id).padStart(5, '0')}
                </span>
                <p className="text-[11px] font-medium text-stone-500">
                  Emisión: <strong className="text-stone-800">{new Date().toLocaleDateString('es-NI')}</strong>
                </p>
              </div>
            </div>

            {/* Título Principal del Documento */}
            <div className="text-center my-6">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase text-stone-900 border-b border-stone-200 pb-2 inline-block px-4">
                Notificación de Incidencia Laboral
              </h2>
              <p className="text-[11px] text-stone-500 font-medium mt-1">
                Conforme al Reglamento Interno y Normas de Control de Jornada de El Bodegón
              </p>
            </div>

            {/* Cuadro de Datos del Colaborador */}
            <div className="bg-stone-50/80 border border-stone-200 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-black text-[#1c6856] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                1. Datos del Colaborador
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-stone-400 font-bold block text-[10px] uppercase">Nombre Completo:</span>
                  <span className="font-black text-stone-900 text-sm">
                    {alerta.empleado_detalle ? `${alerta.empleado_detalle.nombre} ${alerta.empleado_detalle.apellido}` : 'Personal General / No Asignado'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[10px] uppercase">Puesto / Cargo:</span>
                  <span className="font-bold text-stone-800">
                    {alerta.empleado_detalle?.cargo_display || 'Colaborador'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[10px] uppercase">ID de Carnet:</span>
                  <span className="font-mono text-stone-600 text-[11px]">
                    {alerta.empleado_detalle?.qr_code_token ? alerta.empleado_detalle.qr_code_token.slice(0, 16) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold block text-[10px] uppercase">Fecha y Hora de Detección:</span>
                  <span className="font-bold text-stone-800">
                    {fechaAlerta} — {horaAlerta}
                  </span>
                </div>
              </div>
            </div>

            {/* Cuadro de Descripción de la Incidencia */}
            <div className="border border-stone-200 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-black text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                2. Descripción y Detalle de la Incidencia
              </h3>
              <div className="bg-rose-50/40 border border-rose-100 rounded-lg p-3 text-xs space-y-1 mb-3">
                <div className="flex justify-between items-center border-b border-rose-200/50 pb-1 mb-1.5">
                  <span className="font-bold text-rose-950 uppercase text-[10px]">Tipo de Falta:</span>
                  <span className="font-black text-rose-700">{getTipoLabel(alerta.tipo)}</span>
                </div>
                <p className="text-stone-800 leading-relaxed font-medium">
                  {alerta.mensaje}
                </p>
              </div>
              <p className="text-[10px] text-stone-400 italic">
                * Incidencia registrada de forma automática por el sistema biométrico y de control horario BodegónPass.
              </p>
            </div>

            {/* Espacio para Descargo u Observaciones del Colaborador (Escrito a mano) */}
            <div className="border border-dashed border-stone-300 rounded-xl p-4 mb-8">
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                3. Descargo / Observaciones del Colaborador (A mano):
              </h3>
              <div className="space-y-4 pt-2 pb-1">
                <div className="border-b border-stone-300 h-5"></div>
                <div className="border-b border-stone-300 h-5"></div>
                <div className="border-b border-stone-300 h-5"></div>
              </div>
            </div>

            {/* Bloque Legal de Firmas */}
            <div className="mt-8 pt-4">
              <p className="text-[10px] text-stone-500 text-center mb-10 italic">
                Al firmar este documento, el colaborador certifica haber recibido notificación de la presente incidencia y comprende las políticas de asistencia y puntualidad del establecimiento.
              </p>

              <div className="grid grid-cols-2 gap-12 text-center text-xs">
                <div className="space-y-1">
                  <div className="border-b border-stone-800 w-4/5 mx-auto mb-2"></div>
                  <p className="font-black text-stone-900">
                    {alerta.empleado_detalle ? `${alerta.empleado_detalle.nombre} ${alerta.empleado_detalle.apellido}` : 'Firma del Colaborador'}
                  </p>
                  <p className="text-[10px] text-stone-500 font-medium uppercase">Colaborador / Empleado</p>
                </div>

                <div className="space-y-1">
                  <div className="border-b border-stone-800 w-4/5 mx-auto mb-2"></div>
                  <p className="font-black text-stone-900">Administración / Gerencia</p>
                  <p className="text-[10px] text-stone-500 font-medium uppercase">Restaurante El Bodegón</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer del Modal (Oculto al Imprimir) */}
        <div className="bg-white px-6 py-3.5 border-t border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <span className="text-xs text-stone-500 font-medium">
            💡 <strong>Tip:</strong> Imprime este documento para recabar la firma del colaborador y archivarlo en su expediente.
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
              className="px-5 py-2 rounded-xl bg-[#1c6856] text-white text-xs font-bold hover:bg-[#154f42] transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimir Boleta Oficial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
