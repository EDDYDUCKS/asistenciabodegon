'use client';

import React, { useEffect, useState } from 'react';
import {
  fetchEmpleados,
  fetchAsistencias,
  downloadNominaExcel,
  fetchFeriados,
  createFeriado,
  deleteFeriado,
  fetchHorasExtra,
  updateHoraExtra,
} from '@/lib/api-client';
import { Empleado, RegistroAsistencia, DiaFeriado, AutorizacionHorasExtra } from '@/lib/types';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

export default function NominaAdminPage() {
  const [activeTab, setActiveTab] = useState<'reporte' | 'extras' | 'feriados'>('reporte');
  
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [feriados, setFeriados] = useState<DiaFeriado[]>([]);
  const [horasExtra, setHorasExtra] = useState<AutorizacionHorasExtra[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Rango de fechas por defecto: primer día del mes a hoy
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  const primerDiaMes = hoyStr.slice(0, 8) + '01';
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes);
  const [fechaFin, setFechaFin] = useState(hoyStr);

  // Form State para Feriados
  const [nuevoFeriadoFecha, setNuevoFeriadoFecha] = useState('');
  const [nuevoFeriadoDesc, setNuevoFeriadoDesc] = useState('');
  const [addingFeriado, setAddingFeriado] = useState(false);

  // Form State para Horas Extra (temporal para edición en lista)
  const [editingExtraId, setEditingExtraId] = useState<number | null>(null);
  const [tempAutorizadas, setTempAutorizadas] = useState('0.00');
  const [tempComentario, setTempComentario] = useState('');
  const [savingExtra, setSavingExtra] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empList, asisList, feriadosList, extrasList] = await Promise.all([
        fetchEmpleados(),
        fetchAsistencias(),
        fetchFeriados(),
        fetchHorasExtra(),
      ]);
      setEmpleados(empList);
      setAsistencias(asisList);
      setFeriados(feriadosList);
      setHorasExtra(extrasList);
    } catch (e) {
      console.error('Error cargando datos administrativos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      await downloadNominaExcel(fechaInicio, fechaFin);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error descargando reporte Excel');
    } finally {
      setDownloading(false);
    }
  };

  // ── FERIADOS ACCIONES ──────────────────────────────────────────────────────
  const handleAddFeriado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoFeriadoFecha || !nuevoFeriadoDesc.trim()) return;
    setAddingFeriado(true);
    try {
      await createFeriado({ fecha: nuevoFeriadoFecha, descripcion: nuevoFeriadoDesc.trim() });
      setNuevoFeriadoFecha('');
      setNuevoFeriadoDesc('');
      // Recargar feriados
      const updated = await fetchFeriados();
      setFeriados(updated);
      // Recargar asistencias por si afecta cálculos en pantalla
      const updatedAsis = await fetchAsistencias();
      setAsistencias(updatedAsis);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al crear feriado');
    } finally {
      setAddingFeriado(false);
    }
  };

  const handleDeleteFeriado = async (id: number) => {
    if (!confirm('¿Seguro que deseas eliminar este día feriado? Los marcajes de ese día volverán a computarse como horas normales ordinarias.')) return;
    try {
      await deleteFeriado(id);
      const updated = await fetchFeriados();
      setFeriados(updated);
      const updatedAsis = await fetchAsistencias();
      setAsistencias(updatedAsis);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar feriado');
    }
  };

  // ── HORAS EXTRA ACCIONES ──────────────────────────────────────────────────
  const startDecision = (item: AutorizacionHorasExtra) => {
    setEditingExtraId(item.id || null);
    setTempAutorizadas(String(item.horas_extra_solicitadas));
    setTempComentario(item.comentario || '');
  };

  const handleOvertimeDecision = async (id: number, decision: 'APROBADO' | 'RECHAZADO') => {
    setSavingExtra(true);
    try {
      const horasVal = decision === 'APROBADO' ? parseFloat(tempAutorizadas) || 0 : 0;
      await updateHoraExtra(id, {
        horas_extra_autorizadas: horasVal,
        estado: decision,
        comentario: tempComentario.trim() || (decision === 'APROBADO' ? 'Horas autorizadas' : 'Horas rechazadas'),
      });
      setEditingExtraId(null);
      setTempComentario('');
      // Recargar
      const updatedExtras = await fetchHorasExtra();
      setHorasExtra(updatedExtras);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al guardar decisión');
    } finally {
      setSavingExtra(false);
    }
  };

  // ── CÁLCULO DE NÓMINA EN PANTALLA (SIN IMPORTES MONETARIOS) ───────────────
  const feriadosSet = new Set(feriados.map((f) => f.fecha));

  const asistenciasFiltradas = asistencias.filter((a) => {
    const fecha = new Date(a.fecha_hora).toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
    return fecha >= fechaInicio && fecha <= fechaFin;
  });

  const resumenEmpleados = empleados
    .filter((emp) => emp.activo)
    .map((emp) => {
      const regEmp = asistenciasFiltradas.filter((a) => a.empleado === emp.id);
      
      // Agrupar asistencias por día en hora local de Nicaragua
      const diasMap: Record<string, RegistroAsistencia[]> = {};
      regEmp.forEach((a) => {
        const diaLocal = new Date(a.fecha_hora).toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
        if (!diasMap[diaLocal]) diasMap[diaLocal] = [];
        diasMap[diaLocal].push(a);
      });

      const diasUnicos = Object.keys(diasMap).length;

      let horasNormalesTrabajadas = 0;
      let feriadosTrabajadosDias = 0;
      let horasDebidas = 0;
      const feriadosDetalle: { fecha: string; descripcion: string; horas: number }[] = [];

      Object.entries(diasMap).forEach(([dia, regs]) => {
        regs.sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());
        let entradaTemp: number | null = null;
        let horasDia = 0;
        
        regs.forEach((r) => {
          if (r.tipo_evento === 'ENTRADA' || r.tipo_evento === 'ENTRADA_QUEBRADA') {
            entradaTemp = new Date(r.fecha_hora).getTime();
          } else if (
            (r.tipo_evento === 'SALIDA_QUEBRADA' || r.tipo_evento === 'SALIDA_DEFINITIVA') &&
            entradaTemp
          ) {
            const diff = new Date(r.fecha_hora).getTime() - entradaTemp;
            if (diff > 0) horasDia += diff / (1000 * 60 * 60);
            entradaTemp = null;
          }
        });

        // Limitar a jornada ordinaria diaria máxima (8h)
        let horasOrd = Math.min(horasDia, 8.0);
        
        if (feriadosSet.has(dia)) {
          // Cuenta como feriado doble únicamente si completa 8.0 horas
          if (horasOrd >= 8.0) {
            feriadosTrabajadosDias++;
            const fObj = feriados.find((f) => f.fecha === dia);
            feriadosDetalle.push({
              fecha: dia,
              descripcion: fObj ? fObj.descripcion : 'Día Feriado',
              horas: horasOrd,
            });
          } else {
            // Si no completa las 8 horas en feriado, se suman como horas ordinarias simples
            horasNormalesTrabajadas += horasOrd;
          }
        } else {
          horasNormalesTrabajadas += horasOrd;
        }
      });

      // Calcular Horas Debidas recorriendo cada día del período (inasistencias y tardanzas)
      horasDebidas = 0;
      if (fechaInicio && fechaFin) {
        const start = new Date(fechaInicio + 'T00:00:00');
        const end = new Date(fechaFin + 'T00:00:00');
        const curr = new Date(start);
        while (curr <= end) {
          const dayOfWeek = curr.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
          const dateStr = curr.toISOString().slice(0, 10);
          if (dayOfWeek !== 0 && !feriadosSet.has(dateStr)) {
            if (diasMap[dateStr]) {
              const regs = diasMap[dateStr];
              regs.sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());
              let entradaTemp: number | null = null;
              let horasDia = 0;
              regs.forEach((r) => {
                if (r.tipo_evento === 'ENTRADA' || r.tipo_evento === 'ENTRADA_QUEBRADA') {
                  entradaTemp = new Date(r.fecha_hora).getTime();
                } else if (
                  (r.tipo_evento === 'SALIDA_QUEBRADA' || r.tipo_evento === 'SALIDA_DEFINITIVA') &&
                  entradaTemp
                ) {
                  const diff = new Date(r.fecha_hora).getTime() - entradaTemp;
                  if (diff > 0) horasDia += diff / (1000 * 60 * 60);
                  entradaTemp = null;
                }
              });
              let horasOrd = Math.min(horasDia, 8.0);
              horasDebidas += Math.max(0, 8.0 - horasOrd);
            } else {
              // Ausencia completa (debe las 8 horas)
              horasDebidas += 8.0;
            }
          }
          curr.setDate(curr.getDate() + 1);
        }
      }

      // Sumar horas extras aprobadas para este empleado en el período
      const extrasEmpPeriodo = horasExtra.filter(
        (h) => h.empleado === emp.id && h.fecha >= fechaInicio && h.fecha <= fechaFin && h.estado === 'APROBADO'
      );
      const horasExtraAprobadas = extrasEmpPeriodo.reduce(
        (acc, curr) => acc + (parseFloat(String(curr.horas_extra_autorizadas)) || 0),
        0
      );

      return {
        emp,
        diasUnicos,
        horasOrdinarias: horasNormalesTrabajadas,
        feriadosTrabajadosDias,
        feriadosDetalle,
        horasExtraAprobadas,
        horasDebidas,
      };
    });

  const totalOrdinariasPeriodo = resumenEmpleados.reduce((acc, item) => acc + item.horasOrdinarias, 0);
  const totalFeriadasPeriodo = resumenEmpleados.reduce((acc, item) => acc + item.feriadosTrabajadosDias, 0);
  const totalExtrasPeriodo = resumenEmpleados.reduce((acc, item) => acc + item.horasExtraAprobadas, 0);
  const totalDebidasPeriodo = resumenEmpleados.reduce((acc, item) => acc + item.horasDebidas, 0);

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Pestañas de Navegación */}
      <div className="flex border-b border-stone-200 gap-1 print-hide">
        <button
          onClick={() => setActiveTab('reporte')}
          className={`px-4 py-2.5 font-bold text-xs rounded-t-xl border-t border-x transition-colors ${
            activeTab === 'reporte'
              ? 'bg-white border-stone-200 text-[#1c6856] -mb-[1px] z-10'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 inline-block mr-1.5" />
          Reporte de Horas
        </button>
        <button
          onClick={() => setActiveTab('extras')}
          className={`px-4 py-2.5 font-bold text-xs rounded-t-xl border-t border-x transition-colors flex items-center ${
            activeTab === 'extras'
              ? 'bg-white border-stone-200 text-[#1c6856] -mb-[1px] z-10'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <Clock className="w-3.5 h-3.5 inline-block mr-1.5" />
          Aprobaciones Horas Extra
          {horasExtra.filter((h) => h.estado === 'PENDIENTE').length > 0 && (
            <span className="ml-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('feriados')}
          className={`px-4 py-2.5 font-bold text-xs rounded-t-xl border-t border-x transition-colors ${
            activeTab === 'feriados'
              ? 'bg-white border-stone-200 text-[#1c6856] -mb-[1px] z-10'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 inline-block mr-1.5" />
          Gestor de Feriados
        </button>
      </div>

      {/* ── TAB 1: REPORTE DE HORAS ────────────────────────────────────────── */}
      {activeTab === 'reporte' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/60 pb-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-black text-stone-900 tracking-tight flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-[#1c6856]" />
                Balance de Jornadas
              </h1>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Visualice el desglose de horas ordinarias normales, horas físicas en días feriados y extras autorizadas.
              </p>
            </div>

            <button
              onClick={handleDownloadExcel}
              disabled={downloading}
              className="bg-[#1c6856] hover:bg-[#154f42] active:scale-95 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
            >
              {downloading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Descargar Excel (.xlsx)
            </button>
          </div>

          {/* Filtros Rango Fechas */}
          <div className="glass-panel border border-white rounded-3xl p-5 shadow-premium flex flex-col sm:flex-row items-end gap-4 print-hide">
            <div className="flex-1 w-full">
              <label className="block text-xs font-bold text-stone-600 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-[#1c6856]" />
                Desde:
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono"
              />
            </div>

            <div className="flex-1 w-full">
              <label className="block text-xs font-bold text-stone-600 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-[#1c6856]" />
                Hasta:
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono"
              />
            </div>

            <button
              onClick={loadData}
              className="w-full sm:w-auto bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 px-5 py-2.5 rounded-xl font-bold text-xs transition-all border border-stone-200"
            >
              Recalcular Balance
            </button>
          </div>

          {fechaInicio > fechaFin && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-1 duration-200">
              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>Advertencia: La fecha de inicio ({fechaInicio}) es posterior a la fecha de finalización ({fechaFin}). Ajuste el rango de fechas.</span>
            </div>
          )}

          {/* Tabla de Resumen de Horas */}
          <div className="glass-panel border border-white rounded-3xl overflow-hidden shadow-premium">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1c6856]/5 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Empleado</th>
                    <th className="px-6 py-4">Cargo / Puesto</th>
                    <th className="px-6 py-4 text-center">Días Asistidos</th>
                    <th className="px-6 py-4 text-right">Horas Ordinarias (Normales)</th>
                    <th className="px-6 py-4 text-right">Feriados Trabajados (Días)</th>
                    <th className="px-6 py-4 text-right">Horas Extra Aprobadas</th>
                    <th className="px-6 py-4 text-right text-rose-700 bg-rose-50/50">Horas Debidas (Faltantes)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-stone-400">
                        Calculando registros...
                      </td>
                    </tr>
                  ) : resumenEmpleados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-stone-400 font-normal">
                        No hay registros disponibles para este rango.
                      </td>
                    </tr>
                  ) : (
                    resumenEmpleados.map((item) => (
                      <tr key={item.emp.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-stone-900">
                          {item.emp.nombre} {item.emp.apellido}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold">
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#1c6856]/5 border border-[#1c6856]/15 text-[11px] font-bold text-[#1c6856]">
                            {item.emp.cargo_display}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-stone-700">
                          {item.diasUnicos} {item.diasUnicos === 1 ? 'día' : 'días'}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-stone-900">
                          {item.horasOrdinarias.toFixed(2)} hrs
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-[#1c6856] relative">
                          <div className="flex items-center justify-end gap-1.5">
                            <span>{item.feriadosTrabajadosDias} {item.feriadosTrabajadosDias === 1 ? 'día' : 'días'}</span>
                            {item.feriadosTrabajadosDias > 0 && (
                              <div className="relative inline-block text-left group">
                                <button
                                  type="button"
                                  className="text-stone-400 hover:text-[#1c6856] transition-colors p-0.5 rounded-full hover:bg-stone-100"
                                >
                                  <AlertCircle className="w-3.5 h-3.5" />
                                </button>
                                
                                <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-white border border-stone-200 rounded-xl p-3 shadow-xl z-50 text-left normal-case text-stone-800 font-sans font-medium animate-in fade-in slide-in-from-bottom-2 duration-150">
                                  <h4 className="text-[11px] font-bold text-stone-900 border-b border-stone-100 pb-1.5 mb-1.5 uppercase tracking-wide">
                                    Feriados Completados:
                                  </h4>
                                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                    {item.feriadosDetalle.map((f, idx) => (
                                      <div key={idx} className="flex justify-between items-start text-[11px] gap-2">
                                        <div>
                                          <span className="font-bold text-stone-900 font-mono block">
                                            {new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-NI', {
                                              day: '2-digit',
                                              month: '2-digit',
                                            })}
                                          </span>
                                          <span className="text-[10px] text-stone-500 block truncate max-w-[140px]" title={f.descripcion}>
                                            {f.descripcion}
                                          </span>
                                        </div>
                                        <span className="font-mono font-bold text-[#1c6856] shrink-0">
                                          {f.horas.toFixed(2)} hrs
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="absolute right-3 top-full w-2 h-2 bg-white border-r border-b border-stone-200 rotate-45 -mt-1.5" />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-amber-600">
                          {item.horasExtraAprobadas.toFixed(2)} hrs
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-rose-700 bg-rose-50/20">
                          {item.horasDebidas.toFixed(2)} hrs
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-stone-50 border-t-2 border-stone-200 font-bold text-stone-900">
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-right text-stone-500 uppercase text-xs">
                      Totales del Período:
                    </td>
                    <td className="px-6 py-4 text-right text-stone-950 text-base font-mono font-black">
                      {totalOrdinariasPeriodo.toFixed(2)} hrs
                    </td>
                    <td className="px-6 py-4 text-right text-[#1c6856] text-base font-mono font-black">
                      {totalFeriadasPeriodo} {totalFeriadasPeriodo === 1 ? 'día' : 'días'}
                    </td>
                    <td className="px-6 py-4 text-right text-amber-600 text-base font-mono font-black">
                      {totalExtrasPeriodo.toFixed(2)} hrs
                    </td>
                    <td className="px-6 py-4 text-right text-rose-700 bg-rose-50/50 text-base font-mono font-black">
                      {totalDebidasPeriodo.toFixed(2)} hrs
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: APROBACIONES DE HORAS EXTRA ───────────────────────────────── */}
      {activeTab === 'extras' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <Clock className="w-6 h-6 text-[#1c6856]" />
              Autorización de Horas Extra
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-1">
              Apruebe o rechace las horas trabajadas por encima del límite diario (8 horas) detectadas por el Kiosco.
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1c6856]/5 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Empleado</th>
                    <th className="px-6 py-4 text-right">Exceso Detectado</th>
                    <th className="px-6 py-4 text-right">Horas Aprobadas</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Decisión / Comentario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-400">
                        Cargando solicitudes...
                      </td>
                    </tr>
                  ) : horasExtra.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-400 font-normal">
                        No hay solicitudes de horas extra registradas en el sistema.
                      </td>
                    </tr>
                  ) : (
                    horasExtra.map((item) => {
                      const isEditing = editingExtraId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-stone-600">
                            {new Date(item.fecha + 'T00:00:00').toLocaleDateString('es-NI', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-stone-900">
                              {item.empleado_detalle?.nombre} {item.empleado_detalle?.apellido}
                            </div>
                            <span className="text-[10px] text-stone-400 block font-medium">
                              {item.empleado_detalle?.cargo_display}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-rose-500">
                            +{parseFloat(String(item.horas_extra_solicitadas)).toFixed(2)} hrs
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.10"
                                max={String(item.horas_extra_solicitadas)}
                                value={tempAutorizadas}
                                onChange={(e) => setTempAutorizadas(e.target.value)}
                                className="w-20 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                              />
                            ) : (
                              <span>
                                {item.estado === 'APROBADO'
                                  ? `${parseFloat(String(item.horas_extra_autorizadas)).toFixed(2)} hrs`
                                  : '0.00 hrs'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                item.estado === 'APROBADO'
                                  ? 'bg-emerald-50 border-emerald-250 text-emerald-700'
                                  : item.estado === 'RECHAZADO'
                                  ? 'bg-rose-50 border-rose-250 text-rose-700'
                                  : 'bg-amber-50 border-amber-250 text-amber-700 animate-pulse'
                              }`}
                            >
                              {item.estado}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isEditing ? (
                              <div className="flex flex-col gap-2 max-w-xs ml-auto">
                                <input
                                  type="text"
                                  placeholder="Nota/comentario..."
                                  value={tempComentario}
                                  onChange={(e) => setTempComentario(e.target.value)}
                                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                                />
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => handleOvertimeDecision(item.id!, 'RECHAZADO')}
                                    disabled={savingExtra}
                                    className="bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                                  >
                                    <ThumbsDown className="w-3.5 h-3.5" /> Rechazar
                                  </button>
                                  <button
                                    onClick={() => handleOvertimeDecision(item.id!, 'APROBADO')}
                                    disabled={savingExtra}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                                  >
                                    <ThumbsUp className="w-3.5 h-3.5" /> Aprobar
                                  </button>
                                  <button
                                    onClick={() => setEditingExtraId(null)}
                                    className="border border-stone-200 hover:bg-stone-50 px-2 py-1.5 rounded-lg text-xs"
                                  >
                                    X
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-3">
                                {item.estado !== 'PENDIENTE' && (
                                  <span className="text-xs text-stone-500 font-normal italic max-w-[160px] truncate block" title={item.comentario || ''}>
                                    {item.comentario}
                                  </span>
                                )}
                                <button
                                  onClick={() => startDecision(item)}
                                  className="bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                                >
                                  {item.estado === 'PENDIENTE' ? 'Evaluar' : 'Modificar'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: GESTOR DE FERIADOS DINÁMICOS ───────────────────────────────── */}
      {activeTab === 'feriados' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6 text-[#1c6856]" />
              Gestión Dinámica de Feriados
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-1">
              Añada o elimine fechas feriadas. Toda asistencia registrada en estas fechas computará horas ordinarias al doble.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Formulario Agregar Feriado */}
            <form onSubmit={handleAddFeriado} className="lg:col-span-4 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-[#1c6856] flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Plus className="w-4 h-4" />
                Registrar Feriado
              </h3>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Fecha Feriada</label>
                <input
                  type="date"
                  required
                  value={nuevoFeriadoFecha}
                  onChange={(e) => setNuevoFeriadoFecha(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Descripción / Motivo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Día de la Independencia"
                  value={nuevoFeriadoDesc}
                  onChange={(e) => setNuevoFeriadoDesc(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                />
              </div>

              <button
                type="submit"
                disabled={addingFeriado || !nuevoFeriadoFecha || !nuevoFeriadoDesc.trim()}
                className="w-full bg-[#1c6856] hover:bg-[#154f42] disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
              >
                {addingFeriado ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Registrar Día Feriado'
                )}
              </button>
            </form>

            {/* Listado de Feriados Registrados */}
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-[#1c6856] flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Calendar className="w-4 h-4" />
                Feriados Activos
              </h3>

              {feriados.length === 0 ? (
                <div className="py-12 text-center text-stone-400 font-normal">
                  No hay días feriados registrados. Toda fecha se computará con horas de jornada ordinaria estándar.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {feriados.map((f) => (
                    <div
                      key={f.id}
                      className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white px-3 py-1.5 border border-stone-200 rounded-xl text-center shadow-inner shrink-0">
                          <span className="text-[10px] text-stone-400 block font-bold uppercase tracking-wider leading-none">Feriado</span>
                          <strong className="text-xs text-stone-700 font-mono block mt-1 leading-none">
                            {new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-NI', {
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </strong>
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-900 text-xs">{f.descripcion}</h4>
                          <p className="text-[10px] text-stone-400 font-mono mt-0.5">{f.fecha}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteFeriado(f.id!)}
                        className="p-2 hover:bg-rose-50 border border-transparent hover:border-rose-250 rounded-xl text-rose-600 transition-colors"
                        title="Eliminar Feriado"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
