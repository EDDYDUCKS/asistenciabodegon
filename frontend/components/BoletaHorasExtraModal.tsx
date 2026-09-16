'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AutorizacionHorasExtra, RegistroAsistencia } from '@/lib/types';
import { Printer, X, CheckCircle, XCircle, Clock, User, Calendar, FileText, UtensilsCrossed, Shield, Award } from 'lucide-react';

interface BoletaHorasExtraModalProps {
  horaExtra: AutorizacionHorasExtra | null;
  asistencias?: RegistroAsistencia[];
  onClose: () => void;
}

export default function BoletaHorasExtraModal({
  horaExtra,
  asistencias = [],
  onClose,
}: BoletaHorasExtraModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!horaExtra || !mounted) return null;

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

  // Buscar marcaciones reales del reloj biométrico para este colaborador en esta fecha
  const empId = typeof horaExtra.empleado === 'number' ? horaExtra.empleado : (emp?.id || 0);
  const marcajesDia = asistencias
    .filter((a) => {
      const aEmpId = typeof a.empleado === 'number' ? a.empleado : (a.empleado_detalle?.id || 0);
      return aEmpId === empId && a.fecha_hora && a.fecha_hora.startsWith(horaExtra.fecha);
    })
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

  const formatHora = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '--:--';
    }
  };

  const primerMarcaje = marcajesDia.length > 0 ? formatHora(marcajesDia[0].fecha_hora) : '08:00 AM (Aprox)';
  const ultimoMarcaje = marcajesDia.length > 1
    ? formatHora(marcajesDia[marcajesDia.length - 1].fecha_hora)
    : (marcajesDia.length === 1
      ? formatHora(marcajesDia[0].fecha_hora)
      : 'Conforme a Turno');

  // Clasificación de área operativa según cargo
  const getAreaOperativa = (cargo: string) => {
    const c = cargo.toLowerCase();
    if (c.includes('cocin') || c.includes('chef') || c.includes('asistente de cocina') || c.includes('parrilla')) return 'Cocina & Producción Gastronómica';
    if (c.includes('meser') || c.includes('atencion') || c.includes('salon') || c.includes('servicio')) return 'Salón & Servicio al Comensal';
    if (c.includes('bar') || c.includes('bebida') || c.includes('bartender')) return 'Bar & Coctelería';
    if (c.includes('caja') || c.includes('cajero') || c.includes('facturacion')) return 'Caja & Atención al Cliente';
    if (c.includes('limpieza') || c.includes('mantenimiento') || c.includes('steward') || c.includes('lavaloza')) return 'Operaciones & Steward';
    return 'Área Operativa de Restaurante';
  };

  const areaOperativa = getAreaOperativa(cargoColaborador);

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 overflow-y-auto print-horas-extra-backdrop">
      {/* Estilos estrictos de impresión: AISLAMIENTO TOTAL EN 1 SOLA PÁGINA */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
            padding: 20px !important;
            margin: 0 !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }
        }
        `,
        }}
      />

      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden print-he-modal-container my-auto">
        {/* Barra superior de acciones (Oculta al imprimir) */}
        <div className="print-hide flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                esAprobado ? 'bg-emerald-400' : esRechazado ? 'bg-rose-400' : 'bg-amber-400'
              } animate-pulse`}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
              Boleta Oficial de Horas Extra — Restaurante El Bodegón
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
        <div className="p-6 sm:p-7 space-y-4 text-stone-900 font-sans">
          {/* Encabezado Institucional: Restaurante El Bodegón & Administración */}
          <div className="border-b-2 border-[#1c6856] pb-3.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#1c6856] text-white flex items-center justify-center font-black shadow-xs">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-[#1c6856] uppercase leading-tight font-display">
                      Restaurante El Bodegón
                    </h1>
                    <p className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                      Administración
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-stone-500 mt-1 font-medium">
                  Control Oficial de Asistencia, Turnos de Servicio y Jornadas Laborales
                </p>
              </div>

              {/* Folio y Fecha */}
              <div className="text-right shrink-0">
                <div className="inline-block border-2 border-[#1c6856]/40 bg-[#1c6856]/5 rounded-xl px-3.5 py-1.5 text-right shadow-2xs">
                  <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block">
                    Comprobante N°
                  </span>
                  <span className="text-base font-mono font-black text-[#1c6856]">{folio}</span>
                </div>
                <p className="text-[10px] font-mono text-stone-500 mt-1">
                  Resolución: {fechaEmision}
                </p>
              </div>
            </div>

            {/* Título de la Boleta con Estado */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-stone-150">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1c6856]" />
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-stone-800">
                  Resolución de Jornada Extraordinaria
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

          {/* Datos Completos del Colaborador y Puesto */}
          <div className="bg-stone-50/90 border border-stone-200 rounded-2xl p-3.5 shadow-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#1c6856] block mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Información del Personal
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
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Área Operativa:</span>
                <span className="text-[#1c6856] font-semibold">{areaOperativa}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block uppercase font-bold">Cédula / Carnet:</span>
                <span className="font-mono text-stone-700 font-semibold">{idCarnet}</span>
              </div>
            </div>
          </div>

          {/* Desglose Detallado de la Jornada y Marcajes Biométricos */}
          <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-[#1c6856]/10 px-4 py-2 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#1c6856] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Desglose Técnico de la Jornada Laboral
              </span>
              <span className="text-xs font-mono font-bold text-stone-700 capitalize">
                {fechaJornadaDisplay}
              </span>
            </div>

            <div className="p-4 space-y-3.5 bg-white">
              {/* Marcajes biométricos reales registrados */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-stone-50/70 p-3 rounded-xl border border-stone-150 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase block">Hora Entrada (Reloj):</span>
                  <strong className="font-mono text-stone-900 text-xs">{primerMarcaje}</strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase block">Hora Salida (Reloj):</span>
                  <strong className="font-mono text-stone-900 text-xs">{ultimoMarcaje}</strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase block">Jornada Ordinaria Base:</span>
                  <span className="font-mono font-bold text-stone-700">8.0 hrs</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase block">Total Registros Biométricos:</span>
                  <span className="font-mono font-bold text-[#1c6856]">{marcajesDia.length} marcación(es)</span>
                </div>
              </div>

              {/* Tarjetas de Horas Solicitadas vs Horas Autorizadas */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                  <span className="text-stone-500 text-[10px] block uppercase font-bold">
                    Horas Extra Solicitadas (Biométrico):
                  </span>
                  <span className="text-xl font-mono font-black text-stone-900 mt-0.5 block">
                    +{horasSolicitadas.toFixed(1)} hrs
                  </span>
                  <p className="text-[10px] text-stone-500 mt-1">
                    Tiempo extraordinario laborado fuera del horario habitual de turno
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${
                  esAprobado
                    ? 'bg-emerald-50/70 border-emerald-300'
                    : esRechazado
                    ? 'bg-rose-50/70 border-rose-300'
                    : 'bg-amber-50/70 border-amber-300'
                }`}>
                  <span className="text-stone-500 text-[10px] block uppercase font-bold">
                    Horas Extra Autorizadas por Administración:
                  </span>
                  <span className={`text-xl font-mono font-black mt-0.5 block ${
                    esAprobado ? 'text-emerald-800' : esRechazado ? 'text-rose-700' : 'text-amber-800'
                  }`}>
                    {esAprobado ? `+${horasAutorizadas.toFixed(1)} hrs` : '0.0 hrs'}
                  </span>
                  <p className="text-[10px] text-stone-600 font-medium mt-1">
                    {esAprobado
                      ? 'Tiempo efectivo aprobado para remuneración íntegra al 100%'
                      : esRechazado
                      ? 'Solicitud no procedente descartada'
                      : 'En proceso de validación administrativa'}
                  </p>
                </div>
              </div>

              {/* Justificación Operativa y Dictamen de Administración */}
              <div className="bg-stone-50/90 border border-stone-200 rounded-xl p-3 text-xs space-y-1">
                <span className="text-[10px] font-black text-[#1c6856] uppercase tracking-wider block">
                  Motivo Operativo & Dictamen de la Administración:
                </span>
                <p className="text-stone-800 font-medium leading-relaxed italic">
                  &ldquo;
                  {horaExtra.comentario || (esAprobado
                    ? `Tiempo extraordinario laborado por requerimientos operativos de ${areaOperativa} en Restaurante El Bodegón (atención continua a comensales, apoyo en horas de alta demanda y cierre de servicio). Horas autorizadas por la Administración.`
                    : esRechazado
                    ? 'Tiempo extraordinario no autorizado por la Administración por no corresponder a requerimientos de servicio justificados.'
                    : 'En espera de revisión administrativa.')}
                  &rdquo;
                </p>
              </div>
            </div>
          </div>

          {/* Cláusula de Garantía Salarial Intocable (Cero Amortizaciones a Déficit) */}
          <div className="bg-emerald-50/60 border border-emerald-300/80 rounded-2xl p-3 text-[11px] text-emerald-950 leading-relaxed shadow-2xs flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-emerald-900 block">
                Garantía de Remuneración Íntegra (Horas Intocables):
              </strong>
              <p className="text-stone-700 text-[10px] mt-0.5">
                Por resolución expresa de la Administración de <strong>Restaurante El Bodegón</strong>, las horas extraordinarias aprobadas en el presente comprobante constituyen un derecho adquirido por tiempo efectivamente laborado. <u>No están sujetas a deducciones, compensaciones ni amortizaciones por déficit de horas o inasistencias</u>, y serán liquidadas al 100% en la nómina del colaborador.
              </p>
            </div>
          </div>

          {/* Cuadro Legal de Firmas Oficiales */}
          <div className="pt-4 border-t border-stone-200">
            <div className="grid grid-cols-2 gap-8">
              {/* Firma Colaborador */}
              <div className="flex flex-col items-center justify-end text-center">
                <div className="w-full border-b border-stone-400 pb-1 mb-2">
                  <div className="h-12" />
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
                  <div className="h-12" />
                </div>
                <strong className="text-xs font-bold text-stone-900 block">Administración</strong>
                <span className="text-[10px] text-stone-600 font-semibold block">Restaurante El Bodegón</span>
                <span className="text-[9px] text-stone-400 font-medium block mt-0.5">
                  Autorización Oficial y Sello Administrativo
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer del Modal con Acciones Rápidas (Oculto al Imprimir) */}
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
            <span>Imprimir Boleta Oficial / Guardar PDF</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
