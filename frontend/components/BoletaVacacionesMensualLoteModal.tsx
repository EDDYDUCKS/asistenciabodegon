'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Empleado,
  PermisoAusencia,
  CompensacionFeriado,
  PagoVacaciones,
  RegistroAsistencia,
} from '@/lib/types';
import { fetchAsistencias } from '@/lib/api-client';
import {
  Printer,
  X,
  Palmtree,
  User,
  Calendar,
  Scissors,
  Users,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react';

const MESES_NOMBRES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

interface BoletaVacacionesMensualLoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  empleados: Empleado[];
  permisos: PermisoAusencia[];
  compensacionesFeriados?: CompensacionFeriado[];
  pagosVacaciones?: PagoVacaciones[];
  initialMes?: number;
  initialAnio?: number;
  initialEmpleadoId?: number | null;
}

export default function BoletaVacacionesMensualLoteModal({
  isOpen,
  onClose,
  empleados,
  permisos,
  compensacionesFeriados = [],
  pagosVacaciones = [],
  initialMes,
  initialAnio,
  initialEmpleadoId = null,
}: BoletaVacacionesMensualLoteModalProps) {
  const [mounted, setMounted] = useState(false);

  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState<number>(initialMes || hoy.getMonth() + 1);
  const [anio, setAnio] = useState<number>(initialAnio || hoy.getFullYear());
  const [asistenciasMes, setAsistenciasMes] = useState<RegistroAsistencia[]>([]);
  const [loadingAsis, setLoadingAsis] = useState(false);

  const empleadosActivos = useMemo(
    () => empleados.filter((e) => e.activo),
    [empleados]
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialMes) setMes(initialMes);
    if (initialAnio) setAnio(initialAnio);
  }, [initialMes, initialAnio]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialEmpleadoId) {
      setSelectedIds(new Set([initialEmpleadoId]));
    } else {
      setSelectedIds(new Set(empleadosActivos.map((e) => e.id)));
    }
  }, [isOpen, initialEmpleadoId, empleadosActivos]);

  // Cargar asistencias del mes seleccionado para contar exactamente los días laborados del mes
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const cargarAsistenciasDelMes = async () => {
      setLoadingAsis(true);
      try {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDiaNum = new Date(anio, mes, 0).getDate();
        const ultimoDia = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDiaNum).padStart(2, '0')}`;
        const data = await fetchAsistencias({
          fecha_desde: primerDia,
          fecha_hasta: ultimoDia,
        });
        if (!cancelled) {
          setAsistenciasMes(data);
        }
      } catch (e) {
        console.warn('Error cargando asistencias para reporte mensual de vacaciones:', e);
      } finally {
        if (!cancelled) setLoadingAsis(false);
      }
    };
    cargarAsistenciasDelMes();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mes, anio]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const toggleEmpleado = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTodos = () => {
    if (selectedIds.size === empleadosActivos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(empleadosActivos.map((e) => e.id)));
    }
  };

  const empleadosAImprimir = empleadosActivos.filter((e) => selectedIds.has(e.id));

  const ultimoDiaMesNum = new Date(anio, mes, 0).getDate();
  const nombreMes = MESES_NOMBRES[mes] || String(mes);
  const periodoTexto = `01 al ${String(ultimoDiaMesNum).padStart(2, '0')} de ${nombreMes} ${anio}`;
  const prefijoMes = `${anio}-${String(mes).padStart(2, '0')}`;

  const fechaEmision = new Date().toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Renderizador de una colilla (mitad de página)
  const renderColilla = (emp: Empleado, tipoCopia: 'COLABORADOR' | 'ADMIN') => {
    const nombreColaborador = `${emp.nombre} ${emp.apellido || ''}`.trim();
    const cargoColaborador = emp.cargo_display || 'Colaborador';
    const idCarnet = emp.qr_code_token ? emp.qr_code_token.slice(0, 12) : `ID-${emp.id}`;

    // Días físicamente laborados en el mes seleccionado (fechas únicas en zona horaria Nicaragua)
    const fechasTrabajadasSet = new Set<string>();
    for (const reg of asistenciasMes) {
      if (reg.empleado === emp.id && reg.fecha_hora) {
        const fechaLocal = new Date(reg.fecha_hora).toLocaleDateString('en-CA', {
          timeZone: 'America/Managua',
        });
        if (fechaLocal.startsWith(prefijoMes)) {
          fechasTrabajadasSet.add(fechaLocal);
        }
      }
    }
    const diasLaboradosMes = fechasTrabajadasSet.size;
    const vacGanadasLeyMes = Number(((diasLaboradosMes * 2.5) / 30).toFixed(2));

    // Feriados acreditados en el mes seleccionado
    const feriadosMes = (compensacionesFeriados || []).filter(
      (cf) =>
        cf.empleado === emp.id &&
        (cf.fecha_feriado || '').startsWith(prefijoMes) &&
        (cf.estado === 'VACACIONES' || Number(cf.dias_acreditados_vacaciones) > 0)
    );
    const diasFeriadosMes = feriadosMes.reduce(
      (acc, cf) => acc + Number(cf.dias_acreditados_vacaciones || 2.0),
      0
    );
    const totalGanadoMes = Number((vacGanadasLeyMes + diasFeriadosMes).toFixed(2));

    // Permisos / Vacaciones de este empleado (histórico total y del mes)
    const permisosVacTotal = permisos.filter(
      (p) =>
        p.empleado === emp.id &&
        (p.tipo === 'VACACIONES' ||
          p.tipo === 'VACACIONES_PAGADAS' ||
          (p.tipo === 'PERMISO_AUTORIZADO' && (p.motivo || '').toLowerCase().includes('vacaciones')))
    );

    const permisosVacMes = permisosVacTotal.filter(
      (p) => (p.fecha_inicio || '').startsWith(prefijoMes) || (p.fecha_fin || '').startsWith(prefijoMes)
    );

    const diasInasistenciaMes = permisosVacMes
      .filter(
        (p) =>
          (p.motivo || '').toLowerCase().includes('inasistencia') ||
          (p.motivo || '').toLowerCase().includes('falta')
      )
      .reduce((acc, p) => acc + (p.total_dias || 1), 0);

    const diasGozadosMes = permisosVacMes
      .filter(
        (p) =>
          !(p.motivo || '').toLowerCase().includes('inasistencia') &&
          !(p.motivo || '').toLowerCase().includes('falta')
      )
      .reduce((acc, p) => acc + (p.total_dias || 1), 0);

    const pagosMes = (pagosVacaciones || []).filter(
      (pv) => pv.empleado === emp.id && (pv.fecha_pago || '').startsWith(prefijoMes)
    );
    const diasPagadosMes = pagosMes.reduce((acc, pv) => acc + Number(pv.dias_pagados || 0), 0);

    const totalDescontadoMes = Number((diasInasistenciaMes + diasGozadosMes + diasPagadosMes).toFixed(2));

    // Totales acumulados y disponibles actuales al cierre
    const vacAcumTotal = parseFloat(String(emp.dias_vacaciones_acumuladas || 0));
    const vacTomTotal = permisosVacTotal.reduce((acc, p) => acc + (p.total_dias || 0), 0);
    const vacDispActual = Number((vacAcumTotal - vacTomTotal).toFixed(2));

    // Movimientos del mes para tabla compacta
    const movimientosMes: Array<{
      id: string;
      fecha: string;
      concepto: string;
      impacto: string;
      signo: 'PLUS' | 'MINUS';
      detalle: string;
    }> = [
      ...feriadosMes.map((cf) => ({
        id: `cf-${cf.id}`,
        fecha: cf.fecha_feriado,
        concepto: 'Feriado Laborado',
        impacto: `+${Number(cf.dias_acreditados_vacaciones || 2.0).toFixed(2)} d`,
        signo: 'PLUS' as const,
        detalle: cf.nombre_feriado || 'Abono por feriado trabajado',
      })),
      ...permisosVacMes.map((p) => {
        const esFalta =
          (p.motivo || '').toLowerCase().includes('inasistencia') ||
          (p.motivo || '').toLowerCase().includes('falta');
        return {
          id: `p-${p.id}`,
          fecha: p.fecha_inicio === p.fecha_fin ? p.fecha_inicio : `${p.fecha_inicio} a ${p.fecha_fin}`,
          concepto: esFalta ? 'Deducción Inasistencia' : 'Vacaciones Tomadas',
          impacto: `-${Number(p.total_dias || 1).toFixed(2)} d`,
          signo: 'MINUS' as const,
          detalle: p.motivo || (esFalta ? 'Falta deducida de vacaciones' : 'Descanso remunerado'),
        };
      }),
      ...pagosMes.map((pv) => ({
        id: `pv-${pv.id}`,
        fecha: pv.fecha_pago,
        concepto: 'Vacaciones Pagadas',
        impacto: `-${Number(pv.dias_pagados || 0).toFixed(2)} d`,
        signo: 'MINUS' as const,
        detalle: `Recibo ${pv.numero_recibo} (C$ ${Number(pv.monto_pagado || 0).toLocaleString('es-NI')})`,
      })),
    ];

    return (
      <div className="print-colilla-half bg-white border-2 border-stone-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between text-stone-900">
        {/* Bloque Superior: Encabezado + Datos + Resumen */}
        <div className="space-y-2">
          {/* Header Institucional */}
          <div className="flex items-center justify-between border-b-2 border-[#1c6856] pb-1.5 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-[#1c6856]/40 bg-[#1c6856]">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xs sm:text-sm tracking-tight text-[#1c6856] uppercase leading-none">
                    Restaurante El Bodegón
                  </span>
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-stone-800 bg-stone-100 text-stone-900">
                    {tipoCopia === 'COLABORADOR'
                      ? 'COPIA 1: COLABORADOR'
                      : 'COPIA 2: ADMINISTRACIÓN (ARCHIVO)'}
                  </span>
                </div>
                <span className="text-[7.5px] font-bold tracking-wider text-stone-500 uppercase block mt-0.5">
                  Estado de Cuenta Mensual de Vacaciones — Cierre {nombreMes} {anio} (Art. 76 C.T.)
                </span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[8.5px] font-mono font-bold text-stone-700 block">
                EMISIÓN: {fechaEmision}
              </span>
              <span className="text-[8px] font-mono text-stone-500 block">
                CARNET: {idCarnet}
              </span>
            </div>
          </div>

          {/* Barra Datos del Colaborador */}
          <div className="grid grid-cols-3 gap-2 bg-stone-50 border border-stone-300 rounded-lg px-2.5 py-1.5 text-[10px]">
            <div>
              <span className="text-[7.5px] font-bold uppercase text-stone-400 block leading-none">
                Colaborador:
              </span>
              <span className="font-black text-stone-900 text-[11px] truncate block mt-0.5">
                {nombreColaborador}
              </span>
            </div>
            <div>
              <span className="text-[7.5px] font-bold uppercase text-stone-400 block leading-none">
                Cargo / Área:
              </span>
              <span className="font-bold text-stone-800 text-[10px] truncate block mt-0.5">
                {cargoColaborador}
              </span>
            </div>
            <div>
              <span className="text-[7.5px] font-bold uppercase text-stone-400 block leading-none">
                Período Evaluado:
              </span>
              <span className="font-mono font-bold text-stone-900 text-[9.5px] block mt-0.5">
                {periodoTexto}
              </span>
            </div>
          </div>

          {/* 4 Tarjetas de Resumen Matemático del Mes y Saldo Actual */}
          <div className="grid grid-cols-4 gap-2">
            {/* 1. Ganado en el Mes */}
            <div className="border border-stone-300 rounded-lg p-1.5 bg-stone-50/70">
              <span className="text-[7.5px] font-black uppercase text-stone-500 block leading-tight">
                1. Ganado en {nombreMes}
              </span>
              <div className="text-xs sm:text-sm font-mono font-black text-emerald-800 leading-tight mt-0.5">
                +{totalGanadoMes.toFixed(2)} d
              </div>
              <span className="text-[7.5px] text-stone-600 font-medium block leading-tight">
                {diasLaboradosMes} d laborados (+0.0833/d)
                {diasFeriadosMes > 0 ? ` +${diasFeriadosMes}d feriado` : ''}
              </span>
            </div>

            {/* 2. Tomado / Deducido en el Mes */}
            <div className="border border-stone-300 rounded-lg p-1.5 bg-stone-50/70">
              <span className="text-[7.5px] font-black uppercase text-stone-500 block leading-tight">
                2. Restado en {nombreMes}
              </span>
              <div className="text-xs sm:text-sm font-mono font-black text-rose-800 leading-tight mt-0.5">
                -{totalDescontadoMes.toFixed(2)} d
              </div>
              <span className="text-[7.5px] text-stone-600 font-medium block leading-tight">
                {diasGozadosMes > 0 || diasInasistenciaMes > 0
                  ? `${diasGozadosMes}d vac. / ${diasInasistenciaMes}d faltas`
                  : '0 días descontados en el mes'}
              </span>
            </div>

            {/* 3. Balance Histórico Acumulado */}
            <div className="border border-stone-300 rounded-lg p-1.5 bg-stone-50/70">
              <span className="text-[7.5px] font-black uppercase text-stone-500 block leading-tight">
                3. Histórico Total
              </span>
              <div className="text-[11px] font-mono font-black text-stone-900 leading-tight mt-0.5">
                +{vacAcumTotal.toFixed(2)}d / -{vacTomTotal.toFixed(2)}d
              </div>
              <span className="text-[7.5px] text-stone-600 font-medium block leading-tight">
                Total Acumulado vs Tomado
              </span>
            </div>

            {/* 4. Saldo Disponible Actual (Destacado) */}
            <div className="border-2 border-stone-900 rounded-lg p-1.5 bg-emerald-50/80 text-center">
              <span className="text-[7.5px] font-black uppercase text-stone-800 block leading-tight">
                ⭐ SALDO DISPONIBLE
              </span>
              <div className="text-sm sm:text-base font-mono font-black text-stone-950 leading-tight mt-0.5">
                {vacDispActual.toFixed(2)} DÍAS
              </div>
              <span className="text-[7px] font-bold text-stone-700 block leading-tight">
                Disponibles al cierre
              </span>
            </div>
          </div>

          {/* Detalle de Movimientos del Mes */}
          <div className="border border-stone-300 rounded-lg p-1.5">
            <div className="flex items-center justify-between border-b border-stone-200 pb-0.5 mb-1">
              <span className="text-[8px] font-black uppercase text-stone-700 tracking-wide">
                Detalle de Movimientos Registrados en {nombreMes} {anio}
              </span>
              <span className="text-[7.5px] font-mono text-stone-500">
                +{vacGanadasLeyMes.toFixed(2)} d por {diasLaboradosMes} días trabajados en {nombreMes}
              </span>
            </div>

            {movimientosMes.length === 0 ? (
              <div className="py-1 text-center text-[8.5px] text-stone-600 font-medium">
                ✅ Sin días descontados ni inasistencias en {nombreMes} {anio} — Acumulación íntegra de +{totalGanadoMes.toFixed(2)} días en el mes.
              </div>
            ) : (
              <table className="w-full text-left text-[8.5px] border-collapse print-table">
                <thead>
                  <tr className="border-b border-stone-200 text-[7.5px] uppercase text-stone-500 font-bold">
                    <th className="py-0.5 px-1">Fecha</th>
                    <th className="py-0.5 px-1">Concepto</th>
                    <th className="py-0.5 px-1 text-center">Días</th>
                    <th className="py-0.5 px-1">Observación / Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {movimientosMes.slice(0, 5).map((m) => (
                    <tr key={m.id}>
                      <td className="py-0.5 px-1 font-mono font-bold text-stone-900">{m.fecha}</td>
                      <td className="py-0.5 px-1 font-bold text-stone-800">{m.concepto}</td>
                      <td className="py-0.5 px-1 text-center font-mono font-black">
                        {m.impacto}
                      </td>
                      <td className="py-0.5 px-1 text-stone-600 truncate max-w-[75mm]">
                        {m.detalle}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pie diferenciado: Firma en Copia Colaborador vs Sin Firma en Copia Administración */}
        {tipoCopia === 'COLABORADOR' ? (
          <div className="pt-2 border-t border-stone-300 flex items-end justify-between gap-4 text-[8.5px]">
            <div className="flex-1">
              <p className="text-[7.5px] text-stone-500 leading-tight italic">
                Comprobante mensual de vacaciones para conocimiento y respaldo del colaborador (Art. 76 C.T. Nicaragua: +0.0833 días por cada día físicamente laborado).
              </p>
            </div>
            <div className="w-52 text-center shrink-0 pt-2">
              <div className="border-b border-stone-900 w-full mb-0.5"></div>
              <span className="font-black text-stone-900 text-[8.5px] block truncate">
                Firma: {nombreColaborador}
              </span>
              <span className="text-[7px] text-stone-500 uppercase font-bold block">
                Recibí y Revisé Conforme — Colaborador
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-1.5 border-t border-stone-300 flex items-center justify-between text-[8px] text-stone-600">
            <span className="font-bold uppercase tracking-wide text-stone-700">
              📋 Copia de Archivo para Administración (Sin Firma) — Expediente Laboral BodegónPass
            </span>
            <span className="font-mono font-black text-stone-900">
              Saldo Auditado al Cierre: {vacDispActual.toFixed(2)} días disponibles
            </span>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-start justify-center p-2 sm:p-5 overflow-y-auto print-vac-lote-backdrop">
      {/* Estilos de Impresión: 1 Hoja Carta por Trabajador con 2 Colillas Simétricas y Línea de Corte en el Centro */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 6mm 10mm 6mm 10mm;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }

          .print-hide, header, nav, aside, footer, button, input, select, a {
            display: none !important;
          }

          .print-vac-lote-backdrop {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-vac-lote-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
          }

          .print-vac-lote-scroll {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            height: auto !important;
            display: block !important;
          }

          /* Cada trabajador ocupa exactamente 1 hoja Carta Vertical (264mm útiles) */
          .print-vac-mensual-page {
            width: 100% !important;
            height: 263mm !important;
            min-height: 263mm !important;
            max-height: 264mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            background: white !important;
          }

          .print-vac-mensual-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* Cada mitad (Colaborador arriba / Administración abajo) mide exactamente 125mm */
          .print-colilla-half {
            height: 125mm !important;
            min-height: 125mm !important;
            max-height: 125mm !important;
            border: 1.5pt solid #000000 !important;
            border-radius: 6px !important;
            padding: 4mm 5.5mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            background: white !important;
            overflow: hidden !important;
          }

          /* Área de corte central (11mm) */
          .print-cut-line {
            height: 11mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-colilla-half * {
            color: #000000 !important;
            text-shadow: none !important;
            box-shadow: none !important;
          }

          .print-colilla-half [class*="bg-"] {
            background-color: #ffffff !important;
          }

          .print-colilla-half img {
            filter: grayscale(100%) contrast(130%) !important;
          }

          .print-table {
            display: table !important;
            width: 100% !important;
          }
        }
      `,
        }}
      />

      <div className="print-vac-lote-container bg-stone-100 border border-stone-200 w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Barra Superior de Configuración (Oculta al imprimir) */}
        <div className="bg-white px-5 py-4 border-b border-stone-200 flex flex-col gap-3 shrink-0 print-hide">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center font-bold">
                <Palmtree className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-stone-900 leading-tight">
                  Impresión Mensual de Vacaciones (Doble Colilla con Área de Corte)
                </h2>
                <p className="text-xs text-stone-500 font-medium">
                  1 hoja por trabajador: Mitad superior para el Colaborador (con firma) y mitad inferior para Administración (sin firma).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => window.print()}
                disabled={empleadosAImprimir.length === 0 || loadingAsis}
                className="bg-[#1c6856] hover:bg-[#154f42] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>
                  Imprimir {empleadosAImprimir.length}{' '}
                  {empleadosAImprimir.length === 1 ? 'Hoja' : 'Hojas'}
                </span>
              </button>
              <button
                onClick={onClose}
                className="text-stone-400 hover:text-stone-600 p-2 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Controles de Mes, Año y Selección de Colaboradores */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1c6856]" />
              <span className="text-xs font-bold text-stone-700">Mes de Cierre:</span>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-bold text-stone-900"
              >
                {Object.entries(MESES_NOMBRES).map(([num, nombre]) => (
                  <option key={num} value={Number(num)}>
                    {nombre}
                  </option>
                ))}
              </select>
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-stone-900"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
              {loadingAsis && (
                <span className="text-[11px] text-[#1c6856] font-bold flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Calculando días laborados...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTodos}
                className="bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {selectedIds.size === empleadosActivos.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[#1c6856]" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-stone-400" />
                )}
                <span>
                  {selectedIds.size === empleadosActivos.length
                    ? 'Desmarcar Todos'
                    : `Seleccionar Todos (${empleadosActivos.length})`}
                </span>
              </button>
            </div>
          </div>

          {/* Pills de selección rápida de colaboradores */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
            {empleadosActivos.map((emp) => {
              const checked = selectedIds.has(emp.id);
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggleEmpleado(emp.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                    checked
                      ? 'bg-[#1c6856] text-white border-[#1c6856]'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span>
                    {emp.nombre} {emp.apellido}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Área de Vista Previa e Impresión */}
        <div className="print-vac-lote-scroll flex-1 overflow-y-auto p-3 sm:p-6 space-y-8">
          {empleadosAImprimir.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-stone-400 font-medium print-hide">
              Seleccione al menos un colaborador activo arriba para generar su hoja mensual de vacaciones.
            </div>
          ) : (
            empleadosAImprimir.map((emp) => (
              <div
                key={`page-${emp.id}`}
                className="print-vac-mensual-page bg-white rounded-2xl p-4 sm:p-6 shadow-md border border-stone-300 mx-auto max-w-[200mm] flex flex-col justify-between gap-2"
              >
                {/* MITAD SUPERIOR: COPIA COLABORADOR (CON ESPACIO DE FIRMA) */}
                {renderColilla(emp, 'COLABORADOR')}

                {/* LÍNEA CENTRAL DE CORTE */}
                <div className="print-cut-line flex items-center gap-2 py-1 select-none">
                  <Scissors className="w-4 h-4 text-stone-500 shrink-0" />
                  <div className="w-full border-t-2 border-dashed border-stone-500"></div>
                  <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-stone-500 whitespace-nowrap px-2">
                    ÁREA DE CORTE — ENTREGAR ARRIBA AL COLABORADOR / ARCHIVAR ABAJO EN ADMINISTRACIÓN
                  </span>
                  <div className="w-full border-t-2 border-dashed border-stone-500"></div>
                  <Scissors className="w-4 h-4 text-stone-500 shrink-0 rotate-180" />
                </div>

                {/* MITAD INFERIOR: COPIA ADMINISTRACIÓN (SIN FIRMA) */}
                {renderColilla(emp, 'ADMIN')}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
