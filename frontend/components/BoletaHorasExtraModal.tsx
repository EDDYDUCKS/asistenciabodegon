'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AutorizacionHorasExtra, RegistroAsistencia, CompensacionHoras } from '@/lib/types';
import { Printer, X, CheckCircle, XCircle, Clock, User, Calendar, FileText, UtensilsCrossed, Shield, Award, Scale } from 'lucide-react';

interface BoletaHorasExtraModalProps {
  horaExtra: AutorizacionHorasExtra | null;
  asistencias?: RegistroAsistencia[];
  compensaciones?: CompensacionHoras[];
  onClose: () => void;
}

export default function BoletaHorasExtraModal({
  horaExtra,
  asistencias = [],
  compensaciones = [],
  onClose,
}: BoletaHorasExtraModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!horaExtra) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [horaExtra]);

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
  const esPendiente = horaExtra.estado === 'PENDIENTE';

  // Buscar marcaciones reales del reloj biométrico para este colaborador en esta fecha
  const empId = typeof horaExtra.empleado === 'number' ? horaExtra.empleado : (emp?.id || 0);
  const marcajesDia = asistencias
    .filter((a) => {
      const aEmpId = typeof a.empleado === 'number' ? a.empleado : (a.empleado_detalle?.id || 0);
      return aEmpId === empId && a.fecha_hora && a.fecha_hora.startsWith(horaExtra.fecha);
    })
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

  // Buscar si existió compensación de horas o deducción por déficit en este día
  const compDia = compensaciones.find((c) => {
    const cEmpId = typeof c.empleado === 'number' ? c.empleado : (c.empleado_detalle?.id || 0);
    return cEmpId === empId && c.fecha_compensacion === horaExtra.fecha;
  });

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

  // Obtener desglose de fechas amortizadas de forma segura (sin violar reglas de hooks)
  let desgloseItems: any[] = [];
  if (compDia?.desglose) {
    if (Array.isArray(compDia.desglose)) {
      desgloseItems = compDia.desglose;
    } else if (typeof compDia.desglose === 'string') {
      try {
        const parsed = JSON.parse(compDia.desglose);
        if (Array.isArray(parsed)) {
          desgloseItems = parsed;
        }
      } catch {
        desgloseItems = [];
      }
    }
  }

  const formatDateSafe = (dateStr: string) => {
    if (!dateStr) return 'Fecha';
    try {
      const cleanStr = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
      const d = new Date(cleanStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-NI', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 overflow-y-auto print-horas-extra-backdrop">
      {/* Estilos estrictos de impresión: AISLAMIENTO TOTAL EN 1 SOLA PÁGINA CARTA (SIN RECORTES) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 5mm 8mm 5mm 8mm;
          }

          /* Ocultar absolutamente TODO lo que esté en el body excepto la boleta modal */
          body > *:not(.print-horas-extra-backdrop) {
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
            overflow: visible !important;
          }

          .print-he-modal-container {
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

          .print-boleta-content {
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            padding: 4mm 6mm !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            gap: 2mm !important;
          }

          .print-boleta-content > * {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            overflow: visible !important;
          }

          .print-header-block {
            padding-bottom: 1.5mm !important;
            margin-bottom: 0 !important;
          }

          .print-info-personal {
            padding: 1.8mm 3mm !important;
            border-radius: 6px !important;
          }

          .print-desglose-card {
            border-radius: 6px !important;
            overflow: visible !important;
          }

          .print-desglose-header {
            padding: 1.5mm 3mm !important;
          }

          .print-desglose-body {
            padding: 2mm 3mm !important;
            gap: 1.8mm !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: visible !important;
          }

          .print-desglose-body > * {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }

          .print-reloj-grid {
            padding: 1.5mm 2.5mm !important;
            border-radius: 6px !important;
          }

          .print-solic-auto-grid > div {
            padding: 1.8mm 2.5mm !important;
            border-radius: 6px !important;
          }

          .print-solic-auto-grid .text-xl {
            font-size: 1.15rem !important;
            line-height: 1.25 !important;
          }

          .print-amortizacion-box {
            padding: 2mm 2.5mm !important;
            border-radius: 6px !important;
            border: 1pt solid #b45309 !important;
            background-color: #fffbeb !important;
            overflow: visible !important;
          }

          .print-amortizacion-box .grid {
            padding: 1.2mm 2mm !important;
          }

          .print-amortizacion-desglose {
            padding: 1.5mm 2.5mm !important;
            overflow: visible !important;
          }

          .print-dictamen-box {
            padding: 1.8mm 2.5mm !important;
            border-radius: 6px !important;
          }

          .print-dictamen-box p {
            font-size: 9.5px !important;
            line-height: 1.35 !important;
          }

          .print-legal-text {
            font-size: 8.5px !important;
            line-height: 1.3 !important;
            padding: 1.5mm 2.5mm !important;
            margin: 0 !important;
          }

          .print-firmas-grid {
            padding-top: 3.5mm !important;
            padding-bottom: 0.5mm !important;
            margin: 0 !important;
          }

          .print-firmas-grid .w-48 {
            width: 38mm !important;
          }

          /* Optimización Monocromática de Alto Contraste (Blanco y Negro Nítido) */
          .print-he-modal-container * {
            color: #000000 !important;
            text-shadow: none !important;
            box-shadow: none !important;
          }

          .print-he-modal-container div,
          .print-he-modal-container p,
          .print-he-modal-container span,
          .print-he-modal-container table,
          .print-he-modal-container td,
          .print-he-modal-container th {
            border-color: #333333 !important;
          }

          .print-he-modal-container [class*="bg-"] {
            background-color: #ffffff !important;
          }

          .print-he-modal-container img {
            filter: grayscale(100%) contrast(130%) !important;
          }

          .print-he-modal-container [class*="rounded-full"] {
            border: 1pt solid #000000 !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            font-weight: 800 !important;
          }

          .print-he-modal-container [class*="border-l-"] {
            border-left: 2.5pt solid #000000 !important;
            background-color: #ffffff !important;
          }

          .print-he-modal-container .border-t-2,
          .print-he-modal-container .border-b,
          .print-he-modal-container .border-b-2 {
            border-color: #000000 !important;
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
        <div className="p-6 sm:p-7 space-y-4 text-stone-900 font-sans print-boleta-content">
          {/* Encabezado Institucional: Restaurante El Bodegón & Administración */}
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
          <div className="bg-stone-50/90 border border-stone-200 rounded-2xl p-3.5 shadow-xs print-info-personal">
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
          <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs print-desglose-card">
            <div className="bg-[#1c6856]/10 px-4 py-2 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 print-desglose-header">
              <span className="text-xs font-black uppercase tracking-wider text-[#1c6856] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Desglose Técnico de la Jornada Laboral
              </span>
              <span className="text-xs font-mono font-bold text-stone-700 capitalize">
                {fechaJornadaDisplay}
              </span>
            </div>

            <div className="p-4 space-y-3.5 bg-white print-desglose-body">
              {/* Marcajes biométricos reales registrados */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-stone-50/70 p-3 rounded-xl border border-stone-150 text-xs print-reloj-grid">
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
              <div className="grid grid-cols-2 gap-3 text-xs print-solic-auto-grid">
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

              {/* Desglose de Amortización de Déficit / Salidas Tempranas si aplica */}
              {compDia && Number(compDia.horas_deducidas) > 0 && (
                <div className="bg-amber-50/80 border border-amber-300/80 rounded-xl p-3 text-xs space-y-2 print-amortizacion-box">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-amber-900 font-bold">
                    <span className="flex items-center gap-1.5 uppercase text-[11px] tracking-wide">
                      <Scale className="w-3.5 h-3.5 text-amber-700" />
                      Amortización Automática de Salidas Tempranas (Bolsa de Horas)
                    </span>
                    <span className="font-mono text-[11px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-md">
                      Déficit cubierto: -{Number(compDia.horas_deducidas).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-white/90 p-2.5 rounded-lg border border-amber-200 text-center">
                    <div>
                      <span className="text-[10px] text-stone-500 uppercase block font-bold">Extra Bruto Total:</span>
                      <strong className="text-stone-900 font-mono text-sm">+{Number(compDia.horas_extra_generadas).toFixed(1)} hrs</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-700 uppercase block font-bold">Deducido para Saldo:</span>
                      <strong className="text-amber-700 font-mono text-sm">-{Number(compDia.horas_deducidas).toFixed(1)} hrs</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 uppercase block font-bold">Remanente Neto a Pagar:</span>
                      <strong className="text-emerald-800 font-mono text-sm">+{Number(compDia.remanente_extra).toFixed(1)} hrs</strong>
                    </div>
                  </div>

                  {/* Fechas específicas saldadas */}
                  {desgloseItems.length > 0 && (
                    <div className="bg-white/95 rounded-lg border border-amber-200/90 p-2 space-y-1 print-amortizacion-desglose">
                      <div className="flex items-center justify-between text-[9px] font-bold uppercase text-amber-900 tracking-wider print:text-black">
                        <span>Fechas y déficit saldados en esta resolución ({desgloseItems.length} registro{desgloseItems.length > 1 ? 's' : ''}):</span>
                        <span className="font-mono">Total: -{Number(compDia.horas_deducidas).toFixed(1)} hrs</span>
                      </div>
                      <div className="divide-y divide-amber-100 text-[11px] print:divide-stone-200">
                        {desgloseItems.map((d: any, i: number) => {
                          const fFormat = formatDateSafe(d.fecha || d.fecha_display);
                          const hComp = d.horas_compensadas ?? d.horas_aplicadas ?? d.deficit_original ?? 0;
                          return (
                            <div key={`desglose-${i}`} className="flex items-center justify-between py-0.5 text-stone-800 print:text-black">
                              <span className="font-semibold capitalize flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 print:bg-black"></span>
                                <span>{fFormat} {d.tipo === 'HORAS_EXTRA_ORIGEN' ? '(Abono a extra)' : '(Salida anticipada)'}:</span>
                              </span>
                              <span className="font-mono font-bold text-amber-800 print:text-black">
                                -{Number(hComp).toFixed(1)} hrs
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-amber-900/90 leading-tight">
                    * El colaborador generó {Number(compDia.horas_extra_generadas).toFixed(1)} hrs extraordinarias. Se aplicaron automáticamente {Number(compDia.horas_deducidas).toFixed(1)} hrs para saldar salidas tempranas acumuladas en su Bolsa de Horas (deuda previa de {Number(compDia.deuda_previa).toFixed(1)} hrs saldada), dejando {Number(compDia.remanente_extra).toFixed(1)} hrs netas para pago en nómina.
                  </p>
                </div>
              )}

              {/* Justificación Operativa y Dictamen de Administración */}
              <div className="bg-stone-50/90 border border-stone-200 rounded-xl p-3 text-xs space-y-1 print-dictamen-box">
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

          {/* Constancia Legal y Notificación Conforme */}
          <p className="text-[10px] text-stone-600 leading-relaxed text-justify border-l-2 border-[#1c6856] pl-3 py-1 bg-stone-50/50 rounded-r-lg print-legal-text">
            {esAprobado ? (
              <>
                Por medio del presente comprobante oficial, las partes hacen constar que el/la colaborador(a) abajo firmante ha laborado el tiempo extraordinario aquí detallado por requerimientos operativos de <strong>Restaurante El Bodegón</strong>, el cual ha sido debidamente verificado y autorizado por la Administración conforme a lo preceptuado en el Artículo 62 del Código del Trabajo de la República de Nicaragua. Con la firma de este documento, el/la colaborador(a) manifiesta su entera conformidad con la cantidad de horas autorizadas y su correspondiente liquidación en la nómina del período con el recargo legal del cien por ciento (100%), sirviendo el presente como formal notificación y constancia para ambas partes.
              </>
            ) : esRechazado ? (
              <>
                Por medio del presente comprobante oficial, la Administración de <strong>Restaurante El Bodegón</strong> notifica que el tiempo extraordinario registrado en la fecha indicada no ha sido autorizado conforme a las normativas operativas y de asignación de turnos del establecimiento. El/la colaborador(a) abajo firmante recibe la presente notificación para los fines correspondientes del expediente laboral.
              </>
            ) : (
              <>
                El presente comprobante refleja una solicitud de jornada extraordinaria en proceso de revisión por parte de la Administración de <strong>Restaurante El Bodegón</strong>, pendiente de dictamen oficial para su cómputo en nómina.
              </>
            )}
          </p>

          {/* Firmas Formales Oficiales */}
          <div className="pt-5 pb-1 grid grid-cols-2 gap-8 text-center text-xs print-firmas-grid">
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider text-xs">{nombreColaborador}</p>
              <p className="text-[10px] text-stone-500">Firma del Colaborador(a) • Notificación Conforme</p>
              <p className="text-[9px] text-stone-400 font-mono">Carnet: {idCarnet}</p>
            </div>
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider text-xs">Administración General</p>
              <p className="text-[10px] text-stone-500">Restaurante El Bodegón</p>
              <p className="text-[9px] text-stone-400">Firma Autorizada y Sello Administrativo</p>
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
