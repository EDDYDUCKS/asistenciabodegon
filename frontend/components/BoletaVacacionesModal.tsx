'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Empleado, PermisoAusencia, CompensacionFeriado, PagoVacaciones } from '@/lib/types';
import { Utensils, Printer, X, Palmtree, User, CheckCircle, Clock, Edit3, Award, Banknote } from 'lucide-react';

interface BoletaVacacionesModalProps {
  empleado: Empleado | null;
  permisos: PermisoAusencia[];
  compensacionesFeriados?: CompensacionFeriado[];
  pagosVacaciones?: PagoVacaciones[];
  onClose: () => void;
  onAjustar?: () => void;
}

export default function BoletaVacacionesModal({
  empleado,
  permisos,
  compensacionesFeriados = [],
  pagosVacaciones = [],
  onClose,
  onAjustar,
}: BoletaVacacionesModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!empleado || !mounted) return null;

  const handlePrint = () => {
    window.print();
  };

  const emp = empleado;
  const nombreColaborador = `${emp.nombre} ${emp.apellido || ''}`.trim();
  const cargoColaborador = emp.cargo_display || 'Colaborador';
  const idCarnet = emp.qr_code_token ? emp.qr_code_token.slice(0, 14) : `ID-${emp.id}`;

  const vacAcum = parseFloat(String(emp.dias_vacaciones_acumuladas || 0));

  // Feriados laborados acreditados (+2 días)
  const feriadosEmp = (compensacionesFeriados || []).filter(
    (cf) => cf.empleado === emp.id && (cf.estado === 'VACACIONES' || Number(cf.dias_acreditados_vacaciones) > 0)
  );
  const diasFeriados = feriadosEmp.reduce((acc, cf) => acc + Number(cf.dias_acreditados_vacaciones || 2.0), 0);

  // Pagos de vacaciones liquidados en dinero
  const pagosEmp = (pagosVacaciones || []).filter((pv) => pv.empleado === emp.id);
  const diasPagados = pagosEmp.reduce((acc, pv) => acc + Number(pv.dias_pagados || 0), 0);

  // Vacaciones gozadas en tiempo
  const permisosVac = permisos.filter(
    (p) =>
      p.empleado === emp.id &&
      (p.tipo === 'VACACIONES' ||
        (p.tipo === 'PERMISO_AUTORIZADO' && (p.motivo || '').toLowerCase().includes('vacaciones')))
  );
  const diasGozados = permisosVac.reduce((acc, p) => acc + (p.total_dias || 0), 0);

  // Saldo disponible real
  const vacDisp = Number((vacAcum - diasGozados).toFixed(2));
  const vacBaseLey = Number(Math.max(0, vacAcum + diasPagados - diasFeriados).toFixed(2));

  // Historial unificado cronológico de movimientos
  const movimientos: Array<{
    id: string;
    fecha: string;
    tipo: 'FERIADO' | 'GOCE' | 'PAGO';
    badge: string;
    diasStr: string;
    diasSign: 'PLUS' | 'MINUS';
    descripcion: string;
    fechaReg: string;
  }> = [
    ...feriadosEmp.map((cf) => ({
      id: `cf-${cf.id}`,
      fecha: cf.fecha_feriado,
      tipo: 'FERIADO' as const,
      badge: 'Feriado Laborado (+2d)',
      diasStr: `+${Number(cf.dias_acreditados_vacaciones || 2.0).toFixed(1)} d`,
      diasSign: 'PLUS' as const,
      descripcion: `Abono por feriado laborado: ${cf.nombre_feriado || 'Feriado Nacional'}`,
      fechaReg: cf.fecha_liquidacion ? new Date(cf.fecha_liquidacion).toLocaleDateString('es-NI') : cf.fecha_feriado,
    })),
    ...permisosVac.map((p) => ({
      id: `p-${p.id}`,
      fecha: p.fecha_inicio,
      tipo: 'GOCE' as const,
      badge: 'Vacaciones Gozadas',
      diasStr: `-${(p.total_dias || 1).toFixed(1)} d`,
      diasSign: 'MINUS' as const,
      descripcion: `Período del ${p.fecha_inicio} al ${p.fecha_fin}${p.motivo ? ` — ${p.motivo}` : ''}`,
      fechaReg: p.created_at ? new Date(p.created_at).toLocaleDateString('es-NI') : p.fecha_inicio,
    })),
    ...pagosEmp.map((pv) => ({
      id: `pv-${pv.id}`,
      fecha: pv.fecha_pago,
      tipo: 'PAGO' as const,
      badge: 'Vacaciones Pagadas Dinero',
      diasStr: `-${Number(pv.dias_pagados).toFixed(1)} d`,
      diasSign: 'MINUS' as const,
      descripcion: `Boleta ${pv.numero_recibo} (C$ ${Number(pv.monto_pagado).toLocaleString('es-NI', { minimumFractionDigits: 2 })}). ${pv.motivo || ''}`.trim(),
      fechaReg: pv.fecha_pago,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const corteStr = emp.ultimo_corte_vacaciones
    ? new Date(emp.ultimo_corte_vacaciones + 'T00:00:00').toLocaleDateString('es-NI', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Al día';

  const fechaEmision = new Date().toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 overflow-y-auto print-vacaciones-backdrop">
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

          .print-vacaciones-backdrop {
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

          .print-vacaciones-modal-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
          }

          .print-vacaciones-scroll-area {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            height: auto !important;
          }

          /* Hoja ajustada estrictamente para NO romper en página 2 ni mezclarse con la tabla trasera */
          .print-vacaciones-paper {
            background: white !important;
            border: 1.5pt solid #1c6856 !important;
            border-radius: 3mm !important;
            box-shadow: none !important;
            padding: 6mm 8mm !important;
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
      `,
        }}
      />

      <div className="print-vacaciones-modal-container bg-stone-50 border border-stone-200 w-full max-w-2xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Barra Superior del Modal (Oculta al Imprimir) */}
        <div className="bg-white px-5 py-3.5 border-b border-stone-200 flex items-center justify-between shrink-0 print-hide">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center font-bold">
              <Palmtree className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900 leading-tight">
                Estado de Cuenta y Auditoría de Vacaciones
              </h2>
              <p className="text-[11px] text-stone-500 font-medium">
                Formato oficial de 1 página listo para imprimir o exportar como PDF legal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Hoja Oficial / PDF (1 Pág)</span>
            </button>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 p-1.5 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja de Documento Físico Simulado (Calibrada para 1 Sola Página) */}
        <div className="print-vacaciones-scroll-area flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="print-vacaciones-paper bg-white rounded-2xl p-5 sm:p-7 shadow-md border border-stone-200 text-stone-900 mx-auto max-w-[195mm] space-y-3">
            {/* Encabezado Institucional Compacto */}
            <div className="border-b-2 border-[#1c6856] pb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1c6856] flex items-center justify-center text-white shadow-xs shrink-0">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="font-black text-base tracking-tight text-[#1c6856] uppercase leading-none">
                    Restaurante El Bodegón
                  </h1>
                  <span className="text-[8px] font-bold tracking-widest text-stone-400 uppercase block mt-0.5">
                    BodegónPass — Control de Asistencia y Nómina Laboral
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded-md">
                  AUDITORÍA-VAC: #{String(emp.id).padStart(5, '0')}
                </span>
                <p className="text-[10px] font-medium text-stone-500 mt-0.5">
                  Fecha Emisión: <strong className="text-stone-800">{fechaEmision}</strong>
                </p>
              </div>
            </div>

            {/* Título Principal del Documento */}
            <div className="text-center">
              <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-stone-900 border-b border-stone-200 pb-0.5 inline-block px-3">
                Estado de Cuenta y Auditoría Legal de Vacaciones
              </h2>
              <p className="text-[9.5px] text-stone-500 font-medium mt-0.5">
                Cómputo Laboral Conforme al Art. 76 del Código del Trabajo de la República de Nicaragua
              </p>
            </div>

            {/* Cuadro 1: Datos del Colaborador */}
            <div className="bg-stone-50/90 border border-stone-200 rounded-lg p-2.5">
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
                  <span className="text-stone-400 font-bold block text-[8px] uppercase">Período de Corte:</span>
                  <span className="font-mono font-bold text-stone-800 text-[10px] capitalize">
                    {corteStr}
                  </span>
                </div>
              </div>
            </div>

            {/* Hero Card: Saldo Disponible Destacado */}
            <div
              className={`rounded-xl p-3.5 border text-center space-y-0.5 shadow-xs ${
                vacDisp >= 0
                  ? 'bg-gradient-to-br from-emerald-50 via-teal-50/40 to-emerald-100/50 border-emerald-300 text-emerald-950'
                  : 'bg-gradient-to-br from-rose-50 via-amber-50/40 to-rose-100/50 border-rose-300 text-rose-950'
              }`}
            >
              <span className="text-[9px] uppercase font-black tracking-wider opacity-75 block">
                Saldo Disponible Actual de Vacaciones
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight leading-tight">
                {vacDisp.toFixed(2)} {Math.abs(vacDisp) === 1 ? 'Día' : 'Días'}
              </div>
              <p className="text-[10px] font-medium opacity-90">
                {vacDisp >= 0
                  ? '✅ Días hábiles remunerados disponibles para gozar conforme a ley.'
                  : '⚠️ El colaborador tiene días pendientes de acumulación por corte legal.'}
              </p>
            </div>

            {/* Cuadro 3: Desglose Matemático y Legal en 4 Tarjetas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* 1. Acumuladas Ley */}
              <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-2 space-y-0.5">
                <span className="text-[8.5px] text-stone-500 uppercase font-black tracking-wider block">
                  📈 1. Base Ley
                </span>
                <div className="text-sm font-mono font-black text-stone-900">
                  +{vacBaseLey.toFixed(2)} <span className="text-[9px] font-sans font-bold text-stone-500">días</span>
                </div>
                <p className="text-[8px] text-stone-500 font-medium leading-tight">
                  +0.0833d/día (+2.5d/mes) Art. 76 C.T.
                </p>
              </div>

              {/* 2. Feriados Laborados */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-2 space-y-0.5">
                <span className="text-[8.5px] text-emerald-900 uppercase font-black tracking-wider block">
                  ⭐ 2. Feriados (+2d)
                </span>
                <div className="text-sm font-mono font-black text-emerald-800">
                  +{diasFeriados.toFixed(2)} <span className="text-[9px] font-sans font-bold text-emerald-600">días</span>
                </div>
                <p className="text-[8px] text-emerald-700 font-medium leading-tight">
                  {feriadosEmp.length} feriado(s) laborado(s) (+2d c/u).
                </p>
              </div>

              {/* 3. Días Gozados / Pagados */}
              <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-2 space-y-0.5">
                <span className="text-[8.5px] text-amber-900 uppercase font-black tracking-wider block">
                  📉 3. Goces y Pagos
                </span>
                <div className="text-sm font-mono font-black text-amber-800">
                  -{(diasGozados + diasPagados).toFixed(2)}{' '}
                  <span className="text-[9px] font-sans font-bold text-amber-600">días</span>
                </div>
                <p className="text-[8px] text-stone-500 font-medium leading-tight">
                  {diasGozados.toFixed(1)}d en tiempo + {diasPagados.toFixed(1)}d dinero.
                </p>
              </div>

              {/* 4. Saldo Disponible */}
              <div className="bg-emerald-100/50 border border-emerald-300 rounded-xl p-2 space-y-0.5">
                <span className="text-[8.5px] text-emerald-950 uppercase font-black tracking-wider block">
                  🧮 4. Saldo Neto
                </span>
                <div className="text-sm font-mono font-black text-emerald-900">
                  {vacDisp.toFixed(2)} <span className="text-[9px] font-sans font-bold text-emerald-700">días</span>
                </div>
                <p className="text-[8px] text-emerald-800 font-medium leading-tight">
                  Balance oficial disponible al corte.
                </p>
              </div>
            </div>

            {/* Cuadro 4: Historial Detallado de Movimientos (Feriados, Goces y Pagos) */}
            <div className="border border-stone-200 rounded-xl p-2.5">
              <h3 className="text-[10px] font-black text-stone-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#1c6856]" />
                  4. Historial Detallado de Movimientos de Vacaciones
                </span>
                <span className="text-[9px] font-mono text-stone-400 font-normal">
                  {movimientos.length} movimiento{movimientos.length !== 1 ? 's' : ''} registrado{movimientos.length !== 1 ? 's' : ''}
                </span>
              </h3>

              {movimientos.length === 0 ? (
                <div className="bg-stone-50/80 p-2.5 rounded-lg text-center text-[10px] text-stone-400 italic">
                  🌴 El colaborador no tiene movimientos registrados de vacaciones a la fecha.
                </div>
              ) : (
                <table className="w-full text-left text-[10px] border-collapse print-table">
                  <thead>
                    <tr className="border-b border-stone-200 text-[8.5px] uppercase text-stone-500 font-bold bg-stone-50/80">
                      <th className="py-1 px-1.5">Fecha</th>
                      <th className="py-1 px-1.5">Tipo / Concepto</th>
                      <th className="py-1 px-1.5 text-center">Impacto Días</th>
                      <th className="py-1 px-1.5">Detalle / Descripción</th>
                      <th className="py-1 px-1.5 text-right">Fecha Registro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {movimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-stone-50/50">
                        <td className="py-1 px-1.5 font-bold text-stone-900 font-mono text-[9px]">
                          {m.fecha}
                        </td>
                        <td className="py-1 px-1.5">
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold ${
                              m.tipo === 'FERIADO'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : m.tipo === 'PAGO'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {m.badge}
                          </span>
                        </td>
                        <td
                          className={`py-1 px-1.5 text-center font-mono font-bold text-[9.5px] ${
                            m.diasSign === 'PLUS' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {m.diasStr}
                        </td>
                        <td className="py-1 px-1.5 text-stone-700 text-[9px]">
                          {m.descripcion}
                        </td>
                        <td className="py-1 px-1.5 text-right font-mono text-stone-400 text-[8.5px]">
                          {m.fechaReg}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Cláusula Legal de Conformidad */}
            <p className="text-[8px] text-stone-500 text-justify leading-snug italic pt-0.5">
              Se hace constar formalmente el balance de días de vacaciones correspondientes al colaborador citado, computados a razón de 2.5 días hábiles remunerados por cada mes continuo laborado conforme al Artículo 76 del Código del Trabajo de la República de Nicaragua, más los abonos por feriados laborados (+2 días c/u) y deducciones por vacaciones gozadas y pagadas en dinero. El saldo aquí auditado coincide con los libros oficiales de asistencia y planilla del Restaurante El Bodegón.
            </p>

            {/* Bloque Legal de Firmas */}
            <div className="pt-2">
              <div className="grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-0.5">
                  <div className="border-b border-stone-800 w-3/4 mx-auto mb-1"></div>
                  <p className="font-black text-stone-900 text-xs truncate">
                    {nombreColaborador}
                  </p>
                  <p className="text-[8.5px] text-stone-500 font-medium uppercase">Firma del Colaborador</p>
                </div>

                <div className="space-y-0.5">
                  <div className="border-b border-stone-800 w-3/4 mx-auto mb-1"></div>
                  <p className="font-black text-stone-900 text-xs">Administración</p>
                  <p className="text-[8.5px] text-stone-500 font-medium uppercase">Restaurante El Bodegón</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer del Modal (Oculto al Imprimir) */}
        <div className="bg-white px-5 py-3 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print-hide">
          <div className="flex items-center gap-2">
            {onAjustar && (
              <button
                type="button"
                onClick={onAjustar}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Ajustar Saldo Acumulado</span>
              </button>
            )}
            <span className="text-[11px] text-stone-400 font-medium hidden sm:inline">
              Formato oficial para imprimir o guardar en PDF.
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
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
              <span>Imprimir Hoja Oficial / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
