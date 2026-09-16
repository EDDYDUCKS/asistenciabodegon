'use client';

import React from 'react';
import { AutorizacionHorasExtra } from '@/lib/types';
import { Printer, X, CheckCircle, XCircle, Clock, User, Calendar, FileText } from 'lucide-react';

interface BoletaHorasExtraModalProps {
  horaExtra: AutorizacionHorasExtra | null;
  onClose: () => void;
}

export default function BoletaHorasExtraModal({
  horaExtra,
  onClose,
}: BoletaHorasExtraModalProps) {
  if (!horaExtra) return null;

  const handlePrint = () => {
    window.print();
  };

  const emp = horaExtra.empleado_detalle;
  const nombreColaborador = emp ? `${emp.nombre} ${emp.apellido || ''}`.trim() : 'Colaborador';
  const cargoColaborador = emp?.cargo_display || 'Colaborador';
  const idCarnet = emp?.cedula_carnet || (emp?.qr_code_token ? emp.qr_code_token.slice(0, 14) : `EMP-${horaExtra.empleado}`);

  const year = horaExtra.fecha ? new Date(horaExtra.fecha + 'T00:00:00').getFullYear() : new Date().getFullYear();
  const folio = `BHE-${year}-${String(horaExtra.id || 1).padStart(4, '0')}`;

  const fechaJornadaDisplay = new Date(horaExtra.fecha + 'T00:00:00').toLocaleDateString('es-NI', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const fechaEmision = new Date(horaExtra.updated_at || horaExtra.created_at || new Date()).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const horasSolicitadas = parseFloat(String(horaExtra.horas_extra_solicitadas || 0));
  const horasAutorizadas = parseFloat(String(horaExtra.horas_extra_autorizadas || 0));
  const esAprobado = horaExtra.estado === 'APROBADO';
  const esRechazado = horaExtra.estado === 'RECHAZADO';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print-horas-extra-backdrop overflow-y-auto">
      {/* Estilos estrictos de impresión: AISLAMIENTO TOTAL EN 1 SOLA PÁGINA */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 10mm 14mm 10mm 14mm;
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

          .print-horas-extra-backdrop {
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

          .print-he-modal-container {
            border: 1.5px solid #1c6856 !important;
            box-shadow: none !important;
            padding: 24px !important;
            margin: 0 !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }

          .print-border {
            border-color: #000 !important;
          }
        }
        `,
        }}
      />

      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden print-he-modal-container my-auto">
        {/* Barra superior de acciones (Oculta al imprimir) */}
        <div className="print-hide flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                esAprobado ? 'bg-emerald-400' : esRechazado ? 'bg-rose-400' : 'bg-amber-400'
              } animate-pulse`}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
              Boleta Oficial de Horas Extra
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1c6856] hover:bg-[#154f41] text-white text-xs font-bold transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Boleta</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── CONTENIDO IMPRIMIBLE DE LA BOLETA ── */}
        <div className="p-6 sm:p-8 space-y-5 text-stone-900 font-sans">
          {/* Encabezado Institucional */}
          <div className="border-b-2 border-[#1c6856] pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#1c6856] text-white flex items-center justify-center font-black text-sm shadow-xs">
                    EB
                  </div>
                  <div>
                    <h1 className="text-lg font-black tracking-tight text-[#1c6856] uppercase leading-tight font-display">
                      Comercial El Bodegón
                    </h1>
                    <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                      Departamento de Recursos Humanos & Nómina
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-stone-500 mt-1">
                  Sistema Automatizado de Asistencia y Gestión de Jornadas Laborales
                </p>
              </div>

              {/* Folio y Fecha */}
              <div className="text-right shrink-0">
                <div className="inline-block border border-[#1c6856]/40 bg-[#1c6856]/5 rounded-xl px-3 py-1.5 text-right shadow-2xs">
                  <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block">
                    Comprobante N°
                  </span>
                  <span className="text-sm font-mono font-black text-[#1c6856]">{folio}</span>
                </div>
                <p className="text-[10px] font-mono text-stone-500 mt-1">
                  Resolución: {fechaEmision}
                </p>
              </div>
            </div>

            {/* Título de la Boleta con Estado */}
            <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-stone-150">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1c6856]" />
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-stone-800">
                  Resolución Oficial de Horas Extra
                </h2>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border ${
                  esAprobado
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : esRechazado
                    ? 'bg-rose-50 text-rose-900 border-rose-300'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                {esAprobado ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                ) : esRechazado ? (
                  <XCircle className="w-3.5 h-3.5 text-rose-700" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                )}
                <span>{esAprobado ? 'HORAS EXTRA AUTORIZADAS' : esRechazado ? 'SOLICITUD RECHAZADA' : 'PENDIENTE DE REVISIÓN'}</span>
              </span>
            </div>
          </div>

          {/* Datos del Colaborador */}
          <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#1c6856] block mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Datos del Colaborador
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Colaborador:</span>
                <strong className="text-stone-900 font-bold text-sm">{nombreColaborador}</strong>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Puesto / Cargo:</span>
                <span className="text-stone-800 font-semibold">{cargoColaborador}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Cédula / Carnet:</span>
                <span className="font-mono text-stone-700 font-semibold">{idCarnet}</span>
              </div>
            </div>
          </div>

          {/* Detalle Técnico de las Horas Extra */}
          <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-[#1c6856]/10 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#1c6856] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Detalle de la Jornada Extraordinaria
              </span>
              <span className="text-[11px] font-mono font-bold text-stone-600 capitalize">
                {fechaJornadaDisplay}
              </span>
            </div>

            <div className="p-4 space-y-3 bg-white">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-150">
                  <span className="text-stone-500 text-[10px] block uppercase font-bold">
                    Horas Solicitadas (Marcaje):
                  </span>
                  <span className="text-lg font-mono font-black text-stone-900">
                    +{horasSolicitadas.toFixed(1)} hrs
                  </span>
                  <p className="text-[10px] text-stone-500 mt-0.5">Tiempo extraordinario detectado por reloj</p>
                </div>

                <div className={`p-3 rounded-xl border ${
                  esAprobado
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : esRechazado
                    ? 'bg-rose-50/60 border-rose-200'
                    : 'bg-amber-50/60 border-amber-200'
                }`}>
                  <span className="text-stone-500 text-[10px] block uppercase font-bold">
                    Horas Autorizadas (Nómina):
                  </span>
                  <span className={`text-lg font-mono font-black ${
                    esAprobado ? 'text-emerald-800' : esRechazado ? 'text-rose-700' : 'text-amber-800'
                  }`}>
                    {esAprobado ? `+${horasAutorizadas.toFixed(1)} hrs` : '0.0 hrs'}
                  </span>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    {esAprobado
                      ? 'Tiempo efectivo aprobado para compensación/pago'
                      : esRechazado
                      ? 'Solicitud no computada para nómina'
                      : 'Pendiente de evaluación gerencial'}
                  </p>
                </div>
              </div>

              {/* Dictamen y Observaciones */}
              <div className="bg-stone-50/80 border border-stone-200/80 rounded-xl p-3 text-xs">
                <span className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Observaciones / Dictamen de Administración:
                </span>
                <p className="text-stone-800 font-medium italic">
                  {horaExtra.comentario || (esAprobado ? 'Horas autorizadas conforme a actividades extraordinarias requeridas.' : esRechazado ? 'Horas extraordinarias no autorizadas por la gerencia.' : 'En espera de revisión administrativa.')}
                </p>
              </div>
            </div>
          </div>

          {/* Marco Legal Institucional */}
          <div className="bg-stone-50/60 border border-stone-200/70 rounded-xl p-3 text-[10px] text-stone-500 leading-relaxed">
            <p>
              <strong>Aviso Institucional:</strong> El presente comprobante formaliza la resolución gerencial sobre la jornada extraordinaria indicada, en estricto cumplimiento del Código del Trabajo de Nicaragua y las políticas internas de <em>Comercial El Bodegón</em>. Las horas autorizadas son liquidadas en el balance de nómina correspondiente o amortizadas a la bolsa de horas compensatorias.
            </p>
          </div>

          {/* Cuadro de Firmas Legales */}
          <div className="pt-6 border-t border-stone-200">
            <div className="grid grid-cols-2 gap-8">
              {/* Firma Colaborador */}
              <div className="flex flex-col items-center justify-end text-center">
                <div className="w-full border-b border-stone-400 pb-1 mb-2">
                  <div className="h-14" />
                </div>
                <strong className="text-xs font-bold text-stone-900 block">{nombreColaborador}</strong>
                <span className="text-[10px] text-stone-500 font-medium block">
                  Colaborador — {cargoColaborador}
                </span>
                <span className="text-[9px] text-stone-400 font-medium block mt-0.5">
                  Conformidad y Notificación Recibida
                </span>
              </div>

              {/* Firma Administración */}
              <div className="flex flex-col items-center justify-end text-center">
                <div className="w-full border-b border-stone-400 pb-1 mb-2">
                  <div className="h-14" />
                </div>
                <strong className="text-xs font-bold text-stone-900 block">Administración / Gerencia</strong>
                <span className="text-[10px] text-stone-500 font-medium block">Comercial El Bodegón</span>
                <span className="text-[9px] text-stone-400 font-medium block mt-0.5">
                  Resolución y Sello Autorizado
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
