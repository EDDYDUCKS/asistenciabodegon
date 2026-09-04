'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  fetchEmpleados,
  fetchAsistencias,
  downloadNominaExcel,
  downloadVacacionesExcel,
  fetchFeriados,
  createFeriado,
  deleteFeriado,
  fetchHorasExtra,
  updateHoraExtra,
  fetchPermisos,
  createPermiso,
  deletePermiso,
  fetchCompensaciones,
} from '@/lib/api-client';
import { Empleado, RegistroAsistencia, DiaFeriado, AutorizacionHorasExtra, PermisoAusencia, TipoPermisoType, CompensacionHoras } from '@/lib/types';
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
  Palmtree,
  KeyRound,
  ShieldCheck,
  Lock,
  Search,
  Scale,
  Layers,
} from 'lucide-react';

const MESES_NOMBRES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
  7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

export default function NominaAdminPage() {
  const [activeTab, setActiveTab] = useState<'reporte' | 'extras' | 'feriados' | 'permisos'>('reporte');
  
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [feriados, setFeriados] = useState<DiaFeriado[]>([]);
  const [horasExtra, setHorasExtra] = useState<AutorizacionHorasExtra[]>([]);
  const [permisos, setPermisos] = useState<PermisoAusencia[]>([]);
  const [compensaciones, setCompensaciones] = useState<CompensacionHoras[]>([]);
  const [subTabExtras, setSubTabExtras] = useState<'pendientes' | 'compensaciones'>('pendientes');
  const [searchCompensacion, setSearchCompensacion] = useState('');
  const [searchExtra, setSearchExtra] = useState('');
  const [separarPorDiaExtras, setSepararPorDiaExtras] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Form State para Modal PIN de Horas Extra (PIN 2322)
  const [showExtraPinModal, setShowExtraPinModal] = useState(false);
  const [pendingExtraAction, setPendingExtraAction] = useState<{
    id: number;
    decision: 'APROBADO' | 'RECHAZADO';
    horas: number;
    comentario: string;
    empNombre?: string;
  } | null>(null);
  const [extraPin, setExtraPin] = useState('');
  const [extraPinError, setExtraPinError] = useState(false);

  // Rango de fechas por defecto: primer día del mes a hoy
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  const primerDiaMes = hoyStr.slice(0, 8) + '01';
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes);
  const [fechaFin, setFechaFin] = useState(hoyStr);
  const [searchColaborador, setSearchColaborador] = useState('');

  // Form State para Feriados
  const [nuevoFeriadoFecha, setNuevoFeriadoFecha] = useState('');
  const [nuevoFeriadoDesc, setNuevoFeriadoDesc] = useState('');
  const [addingFeriado, setAddingFeriado] = useState(false);

  // Form State para Permisos y Vacaciones
  const [nuevoPermisoEmp, setNuevoPermisoEmp] = useState<number>(0);
  const [nuevoPermisoTipo, setNuevoPermisoTipo] = useState<TipoPermisoType>('VACACIONES');
  const [nuevoPermisoInicio, setNuevoPermisoInicio] = useState(hoyStr);
  const [nuevoPermisoFin, setNuevoPermisoFin] = useState(hoyStr);
  const [nuevoPermisoMotivo, setNuevoPermisoMotivo] = useState('');
  const [addingPermiso, setAddingPermiso] = useState(false);

  // State para Reporte Mensual de Vacaciones en Excel
  const hoyFechaObj = new Date();
  const [reporteMes, setReporteMes] = useState<number>(hoyFechaObj.getMonth() + 1);
  const [reporteAnio, setReporteAnio] = useState<number>(hoyFechaObj.getFullYear());
  const [downloadingVacaciones, setDownloadingVacaciones] = useState(false);

  // Form State para Horas Extra (temporal para edición en lista)
  const [editingExtraId, setEditingExtraId] = useState<number | null>(null);
  const [tempAutorizadas, setTempAutorizadas] = useState('0.00');
  const [tempComentario, setTempComentario] = useState('');
  const [savingExtra, setSavingExtra] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empList, asisList, feriadosList, extrasList, permisosList, compList] = await Promise.all([
        fetchEmpleados(),
        fetchAsistencias(),
        fetchFeriados(),
        fetchHorasExtra(),
        fetchPermisos(),
        fetchCompensaciones(),
      ]);
      setEmpleados(empList);
      setAsistencias(asisList);
      setFeriados(feriadosList);
      setHorasExtra(extrasList);
      setPermisos(permisosList);
      setCompensaciones(compList);
      if (empList.length > 0 && nuevoPermisoEmp === 0) {
        setNuevoPermisoEmp(empList[0].id);
      }
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

  // ── PERMISOS Y VACACIONES ACCIONES ─────────────────────────────────────────
  const handleAddPermiso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoPermisoEmp || !nuevoPermisoInicio || !nuevoPermisoFin) {
      alert('Por favor seleccione el empleado y las fechas.');
      return;
    }
    if (nuevoPermisoInicio > nuevoPermisoFin) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }
    setAddingPermiso(true);
    try {
      await createPermiso({
        empleado: nuevoPermisoEmp,
        tipo: nuevoPermisoTipo,
        fecha_inicio: nuevoPermisoInicio,
        fecha_fin: nuevoPermisoFin,
        motivo: nuevoPermisoMotivo.trim(),
      });
      setNuevoPermisoMotivo('');
      const updated = await fetchPermisos();
      setPermisos(updated);
      alert('¡Período registrado con éxito!');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setAddingPermiso(false);
    }
  };

  const handleDeletePermiso = async (id: number) => {
    if (!confirm('¿Seguro que deseas cancelar o eliminar este registro de permiso/vacaciones?')) return;
    try {
      await deletePermiso(id);
      const updated = await fetchPermisos();
      setPermisos(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleDownloadVacacionesExcel = async () => {
    setDownloadingVacaciones(true);
    try {
      await downloadVacacionesExcel({ mes: reporteMes, anio: reporteAnio });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error descargando reporte Excel de vacaciones');
    } finally {
      setDownloadingVacaciones(false);
    }
  };

  // ── HORAS EXTRA ACCIONES CON PIN 2322 ─────────────────────────────────────
  const playExtraPinSound = (success: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (success) {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {}
  };

  const startDecision = (item: AutorizacionHorasExtra) => {
    setEditingExtraId(item.id || null);
    setTempAutorizadas(String(item.horas_extra_solicitadas));
    setTempComentario(item.comentario || '');
  };

  const executeOvertimeDecision = async (
    id: number,
    decision: 'APROBADO' | 'RECHAZADO',
    horasVal: number,
    comentarioStr: string
  ) => {
    setSavingExtra(true);
    try {
      await updateHoraExtra(id, {
        horas_extra_autorizadas: horasVal,
        estado: decision,
        comentario: comentarioStr,
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

  const initiateDecision = (item: AutorizacionHorasExtra, decision: 'APROBADO' | 'RECHAZADO') => {
    const emp = empleados.find((e) => e.id === item.empleado);
    const empName = emp ? `${emp.nombre} ${emp.apellido}` : `Empleado #${item.empleado}`;
    const horasVal = decision === 'APROBADO' ? parseFloat(tempAutorizadas) || 0 : 0;
    const defaultComment = decision === 'APROBADO' ? 'Horas autorizadas' : 'Horas rechazadas';

    setPendingExtraAction({
      id: item.id!,
      decision: decision,
      horas: horasVal,
      comentario: tempComentario.trim() || defaultComment,
      empNombre: empName,
    });
    setExtraPin('');
    setExtraPinError(false);
    setShowExtraPinModal(true);
  };

  const handleExtraPinKeyPress = useCallback((num: string) => {
    setExtraPinError(false);
    setExtraPin((prev) => {
      if (prev.length >= 4) return prev;
      const newPin = prev + num;
      if (newPin === '2322') {
        playExtraPinSound(true);
        setTimeout(() => {
          setPendingExtraAction((currentAction) => {
            if (currentAction) {
              executeOvertimeDecision(
                currentAction.id,
                currentAction.decision,
                currentAction.horas,
                currentAction.comentario
              );
            }
            return null;
          });
          setShowExtraPinModal(false);
          setExtraPin('');
        }, 180);
        return newPin;
      } else if (newPin.length === 4) {
        setTimeout(() => {
          setExtraPinError(true);
          setExtraPin('');
          playExtraPinSound(false);
        }, 200);
      }
      return newPin;
    });
  }, []);

  const handleExtraPinBackspace = useCallback(() => {
    setExtraPin((prev) => prev.slice(0, -1));
    setExtraPinError(false);
  }, []);

  // Soporte de Teclado Físico para el Modal PIN 2322
  useEffect(() => {
    if (!showExtraPinModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleExtraPinKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleExtraPinBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowExtraPinModal(false);
        setPendingExtraAction(null);
        setExtraPin('');
        setExtraPinError(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showExtraPinModal, handleExtraPinKeyPress, handleExtraPinBackspace]);

  // ── CÁLCULO DE NÓMINA EN PANTALLA (SIN IMPORTES MONETARIOS) ───────────────
  const feriadosSet = new Set(feriados.map((f) => f.fecha));

  // Mapear permisos por empleado
  const permisosMapPorEmpleado: Record<number, Set<string>> = {};
  const permisosInfoPorEmpleado: Record<number, string[]> = {};
  permisos.forEach((p) => {
    if (!permisosMapPorEmpleado[p.empleado]) {
      permisosMapPorEmpleado[p.empleado] = new Set();
      permisosInfoPorEmpleado[p.empleado] = [];
    }
    permisosInfoPorEmpleado[p.empleado].push(`${p.tipo_display} (${p.fecha_inicio.slice(5)} al ${p.fecha_fin.slice(5)})`);
    const dStart = new Date(p.fecha_inicio + 'T00:00:00');
    const dEnd = new Date(p.fecha_fin + 'T00:00:00');
    const dCurr = new Date(dStart);
    while (dCurr <= dEnd) {
      permisosMapPorEmpleado[p.empleado].add(dCurr.toISOString().slice(0, 10));
      dCurr.setDate(dCurr.getDate() + 1);
    }
  });

  const asistenciasFiltradas = asistencias.filter((a) => {
    const fecha = new Date(a.fecha_hora).toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
    return fecha >= fechaInicio && fecha <= fechaFin;
  });

  const resumenEmpleados = empleados
    .filter((emp) => emp.activo)
    .map((emp) => {
      const regEmp = asistenciasFiltradas.filter((a) => a.empleado === emp.id);
      const diasPermisoEmp = permisosMapPorEmpleado[emp.id] || new Set<string>();
      
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

      // ── Detectar días libres y ausencias extra usando lógica semanal ────
      let diasLibres = 0;
      horasDebidas = 0;

      if (fechaInicio && fechaFin) {
        const start = new Date(fechaInicio + 'T00:00:00');
        const end = new Date(fechaFin + 'T00:00:00');
        
        // Iterar semana por semana (Lunes a Domingo)
        const semanasProcesadas = new Set<string>();
        const curr = new Date(start);

        while (curr <= end) {
          // Obtener lunes de la semana
          const dOfWeek = (curr.getDay() + 6) % 7; // Lunes=0, Domingo=6
          const lunesSemana = new Date(curr);
          lunesSemana.setDate(curr.getDate() - dOfWeek);
          const semanaKey = lunesSemana.toISOString().slice(0, 10);

          if (!semanasProcesadas.has(semanaKey)) {
            semanasProcesadas.add(semanaKey);
            const domingoSemana = new Date(lunesSemana);
            domingoSemana.setDate(lunesSemana.getDate() + 6);

            const sInicio = lunesSemana < start ? start : lunesSemana;
            const sFin = domingoSemana > end ? end : domingoSemana;

            let ausenciasSemana = 0;
            let deficitSemana = 0;
            let excedenteSemana = 0;
            const sCurr = new Date(sInicio);
            while (sCurr <= sFin) {
              const dateStr = sCurr.toISOString().slice(0, 10);
              // Si es feriado o tiene permiso/vacaciones autorizadas, se exonera de falta y deuda
              if (!feriadosSet.has(dateStr) && !diasPermisoEmp.has(dateStr)) {
                if (!diasMap[dateStr]) {
                  if (ausenciasSemana === 0) {
                    diasLibres++; // 1er día = día libre tomado
                  } else {
                    deficitSemana += 8.0; // 2do+ día = falta
                  }
                  ausenciasSemana++;
                } else {
                  // Día trabajado: calcular déficit de horas
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
                  const horasOrd = Math.min(horasDia, 8.0);
                  const deficit = Math.max(0, 8.0 - horasOrd);
                  deficitSemana += deficit;
                  if (horasDia > 8.0) {
                    excedenteSemana += (horasDia - 8.0);
                  }
                }
              }
              sCurr.setDate(sCurr.getDate() + 1);
            }

            // Compensar déficit de la semana con horas adicionales de la misma semana (Bolsa de Horas)
            const compensadoSemana = Math.min(excedenteSemana, deficitSemana);
            const deficitNetoSemana = Math.max(0, deficitSemana - compensadoSemana);
            horasDebidas += deficitNetoSemana;
            horasNormalesTrabajadas += compensadoSemana;
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
        diasLibres,
        horasOrdinarias: horasNormalesTrabajadas,
        feriadosTrabajadosDias,
        feriadosDetalle,
        horasExtraAprobadas,
        horasDebidas,
        permisosInfo: permisosInfoPorEmpleado[emp.id] || [],
      };
    });

  const resumenFiltrado = useMemo(() => {
    if (!searchColaborador.trim()) return resumenEmpleados;
    const term = searchColaborador.toLowerCase().trim();
    return resumenEmpleados.filter((item) => {
      const nombreCompleto = `${item.emp.nombre} ${item.emp.apellido}`.toLowerCase();
      const cargo = (item.emp.cargo_display || item.emp.cargo || '').toLowerCase();
      return nombreCompleto.includes(term) || cargo.includes(term);
    });
  }, [resumenEmpleados, searchColaborador]);

  const totalOrdinariasPeriodo = resumenFiltrado.reduce((acc, item) => acc + item.horasOrdinarias, 0);
  const totalFeriadasPeriodo = resumenFiltrado.reduce((acc, item) => acc + item.feriadosTrabajadosDias, 0);
  const totalExtrasPeriodo = resumenFiltrado.reduce((acc, item) => acc + item.horasExtraAprobadas, 0);
  const totalDebidasPeriodo = resumenFiltrado.reduce((acc, item) => acc + item.horasDebidas, 0);

  const permisosMesSeleccionado = useMemo(() => {
    const padM = String(reporteMes).padStart(2, '0');
    const inicioMes = `${reporteAnio}-${padM}-01`;
    const ultimoDia = new Date(reporteAnio, reporteMes, 0).getDate();
    const finMes = `${reporteAnio}-${padM}-${String(ultimoDia).padStart(2, '0')}`;
    return permisos.filter((p) => p.fecha_inicio <= finMes && p.fecha_fin >= inicioMes);
  }, [permisos, reporteMes, reporteAnio]);

  const totalDiasMesSeleccionado = useMemo(() => {
    return permisosMesSeleccionado.reduce((acc, p) => acc + (p.total_dias || 0), 0);
  }, [permisosMesSeleccionado]);

  const compensacionesFiltradas = useMemo(() => {
    if (!searchCompensacion.trim()) return compensaciones;
    const term = searchCompensacion.toLowerCase().trim();
    return compensaciones.filter((c) => {
      const emp = c.empleado_detalle || empleados.find((e) => e.id === c.empleado);
      const nombre = emp ? `${emp.nombre} ${emp.apellido}`.toLowerCase() : '';
      const cargo = (emp?.cargo_display || '').toLowerCase();
      return nombre.includes(term) || cargo.includes(term);
    });
  }, [compensaciones, searchCompensacion, empleados]);

  const horasExtraFiltradas = useMemo(() => {
    let list = [...horasExtra];
    if (searchExtra.trim()) {
      const term = searchExtra.toLowerCase().trim();
      list = list.filter((item) => {
        const emp = item.empleado_detalle || empleados.find((e) => e.id === item.empleado);
        const nombre = emp ? `${emp.nombre} ${emp.apellido}`.toLowerCase() : '';
        const cargo = (emp?.cargo_display || '').toLowerCase();
        return nombre.includes(term) || cargo.includes(term);
      });
    }
    return list;
  }, [horasExtra, searchExtra, empleados]);

  const gruposPorDiaExtras = useMemo(() => {
    const hoyNi = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
    const ayerDate = new Date();
    ayerDate.setDate(ayerDate.getDate() - 1);
    const ayerNi = ayerDate.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });

    const gruposMap: Record<string, AutorizacionHorasExtra[]> = {};
    const ordenDias: string[] = [];

    const sorted = [...horasExtraFiltradas].sort((a, b) => b.fecha.localeCompare(a.fecha));

    sorted.forEach((item) => {
      const dia = item.fecha;
      if (!gruposMap[dia]) {
        gruposMap[dia] = [];
        ordenDias.push(dia);
      }
      gruposMap[dia].push(item);
    });

    return ordenDias.map((dia) => {
      const regs = gruposMap[dia];
      const [y, m, d] = dia.split('-').map(Number);
      const dtObj = new Date(y, m - 1, d);
      const labelBase = dtObj.toLocaleDateString('es-NI', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const fechaLabel = labelBase.charAt(0).toUpperCase() + labelBase.slice(1);

      return {
        diaKey: dia,
        fechaLabel,
        esHoy: dia === hoyNi,
        esAyer: dia === ayerNi,
        registros: regs,
      };
    });
  }, [horasExtraFiltradas]);

  const renderFilaExtra = (item: AutorizacionHorasExtra) => {
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
                  onClick={() => initiateDecision(item, 'RECHAZADO')}
                  disabled={savingExtra}
                  className="bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Rechazar
                </button>
                <button
                  onClick={() => initiateDecision(item, 'APROBADO')}
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
  };

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
          onClick={() => setActiveTab('permisos')}
          className={`px-4 py-2.5 font-bold text-xs rounded-t-xl border-t border-x transition-colors flex items-center ${
            activeTab === 'permisos'
              ? 'bg-white border-stone-200 text-[#1c6856] -mb-[1px] z-10'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <Palmtree className="w-3.5 h-3.5 inline-block mr-1.5" />
          Vacaciones & Permisos
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

      {/* ── TAB 1: REPORTE DE HORAS (7 COLUMNAS EJECUTIVAS) ─────────────────── */}
      {activeTab === 'reporte' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/60 pb-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-black text-stone-900 tracking-tight flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-[#1c6856]" />
                Balance de Jornadas
              </h1>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Visualice el balance ejecutivo de horas ordinarias normales, feriados físicos, extras y horas debidas.
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

          {/* Filtros Rango Fechas y Buscador */}
          <div className="glass-panel border border-white rounded-3xl p-5 shadow-premium flex flex-col md:flex-row items-end gap-4 print-hide">
            <div className="w-full md:w-44">
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

            <div className="w-full md:w-44">
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

            <div className="flex-1 w-full">
              <label className="block text-xs font-bold text-stone-600 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                <Search className="w-4 h-4 text-[#1c6856]" />
                Buscar Colaborador:
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Escriba el nombre o cargo del trabajador..."
                  value={searchColaborador}
                  onChange={(e) => setSearchColaborador(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-8 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                />
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                {searchColaborador && (
                  <button
                    onClick={() => setSearchColaborador('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                    title="Limpiar búsqueda"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={loadData}
              className="w-full md:w-auto bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 px-5 py-2.5 rounded-xl font-bold text-xs transition-all border border-stone-200 whitespace-nowrap"
            >
              Recalcular Balance
            </button>
          </div>

          {searchColaborador && (
            <div className="flex items-center justify-between px-2 text-xs text-stone-500 font-medium">
              <span>
                Filtrando por: <strong className="text-stone-800">&quot;{searchColaborador}&quot;</strong> ({resumenFiltrado.length} de {resumenEmpleados.length} colaboradores)
              </span>
              <button
                onClick={() => setSearchColaborador('')}
                className="text-[#1c6856] hover:underline font-bold"
              >
                Mostrar todos
              </button>
            </div>
          )}

          {fechaInicio > fechaFin && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-1 duration-200">
              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>Advertencia: La fecha de inicio ({fechaInicio}) es posterior a la fecha de finalización ({fechaFin}). Ajuste el rango de fechas.</span>
            </div>
          )}

          {/* Tabla de Resumen de Horas (7 Columnas Ejecutivas) */}
          <div className="glass-panel border border-white rounded-3xl overflow-hidden shadow-premium">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1c6856]/5 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Empleado y Puesto</th>
                    <th className="px-6 py-4 text-center">Días Trabajados</th>
                    <th className="px-6 py-4 text-center">Días Libres (Tomados)</th>
                    <th className="px-6 py-4 text-right">Horas Ordinarias</th>
                    <th className="px-6 py-4 text-right">Feriados Trabajados (Días)</th>
                    <th className="px-6 py-4 text-right">Horas Extra Aprobadas</th>
                    <th className="px-6 py-4 text-right text-rose-700 bg-rose-50/50">Horas Debidas (Déficit)</th>
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
                  ) : resumenFiltrado.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-stone-400 font-normal">
                        No se encontró ningún trabajador que coincida con &quot;{searchColaborador}&quot;.
                      </td>
                    </tr>
                  ) : (
                    resumenFiltrado.map((item) => (
                      <tr key={item.emp.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-stone-900 leading-tight">
                            {item.emp.nombre} {item.emp.apellido}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-[#1c6856]/5 border border-[#1c6856]/15 text-[11px] font-bold text-[#1c6856]">
                              {item.emp.cargo_display}
                            </span>
                            {item.permisosInfo.length > 0 && (
                              <span
                                className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700"
                                title={item.permisosInfo.join('\n')}
                              >
                                🏖️ {item.permisosInfo[0]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-stone-700">
                          {item.diasUnicos} {item.diasUnicos === 1 ? 'día' : 'días'}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-emerald-700 bg-emerald-50/30">
                          {item.diasLibres} {item.diasLibres === 1 ? 'libre' : 'libres'}
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

          {/* Sub-Menú: Solicitudes Pendientes vs Deducciones de Horas */}
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3 print-hide">
            <button
              onClick={() => setSubTabExtras('pendientes')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
                subTabExtras === 'pendientes'
                  ? 'bg-[#1c6856] text-white shadow-sm'
                  : 'bg-white border border-stone-200 hover:bg-stone-50 text-stone-600'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Solicitudes de Horas Extra</span>
              {horasExtra.filter((h) => h.estado === 'PENDIENTE').length > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ml-1 ${
                  subTabExtras === 'pendientes' ? 'bg-white text-[#1c6856]' : 'bg-rose-500 text-white'
                }`}>
                  {horasExtra.filter((h) => h.estado === 'PENDIENTE').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setSubTabExtras('compensaciones')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
                subTabExtras === 'compensaciones'
                  ? 'bg-[#1c6856] text-white shadow-sm'
                  : 'bg-white border border-stone-200 hover:bg-stone-50 text-stone-600'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>Reporte de Deducciones y Compensaciones</span>
              {compensaciones.length > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ml-1 ${
                  subTabExtras === 'compensaciones' ? 'bg-white text-[#1c6856]' : 'bg-[#1c6856]/15 text-[#1c6856]'
                }`}>
                  {compensaciones.length}
                </span>
              )}
            </button>
          </div>

          {subTabExtras === 'pendientes' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Barra de Filtros: Buscador por empleado + Toggle de Separadores por Día */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Buscar por colaborador o cargo en horas extra..."
                    value={searchExtra}
                    onChange={(e) => setSearchExtra(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-8 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#1c6856] shadow-sm font-medium"
                  />
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  {searchExtra && (
                    <button
                      onClick={() => setSearchExtra('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSepararPorDiaExtras(!separarPorDiaExtras)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 shadow-2xs ${
                      separarPorDiaExtras
                        ? 'bg-[#1c6856]/10 border-[#1c6856]/30 text-[#1c6856]'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                    title="Alternar entre ver separadores de fecha por día o lista continua"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{separarPorDiaExtras ? 'Separadores por Día: ACTIVADOS' : 'Lista Continua'}</span>
                  </button>
                  <span className="text-xs text-stone-500 font-medium whitespace-nowrap">
                    Mostrando <strong className="text-stone-800">{horasExtraFiltradas.length}</strong> solicitud{horasExtraFiltradas.length !== 1 ? 'es' : ''}
                  </span>
                </div>
              </div>

              {/* Tabla de Solicitudes */}
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
                      ) : horasExtraFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-stone-400 font-normal">
                            No hay solicitudes de horas extra registradas en el sistema.
                          </td>
                        </tr>
                      ) : separarPorDiaExtras ? (
                        gruposPorDiaExtras.map((grupo) => (
                          <React.Fragment key={`grupo-extra-${grupo.diaKey}`}>
                            {/* Separador Visual de Día */}
                            <tr className="bg-stone-100/95 border-y-2 border-[#1c6856]/20">
                              <td colSpan={6} className="px-6 py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-[#1c6856] text-white flex items-center justify-center font-bold shadow-xs">
                                      <Calendar className="w-4 h-4" />
                                    </div>
                                    <span className="font-black text-xs sm:text-sm text-stone-900 tracking-tight">
                                      {grupo.fechaLabel}
                                    </span>
                                    {grupo.esHoy && (
                                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-300">
                                        Hoy
                                      </span>
                                    )}
                                    {grupo.esAyer && (
                                      <span className="bg-stone-200 text-stone-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                                        Ayer
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-bold text-[#1c6856] bg-white px-2.5 py-1 rounded-lg border border-stone-200 shadow-2xs">
                                    {grupo.registros.length} solicitud{grupo.registros.length !== 1 ? 'es' : ''}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {grupo.registros.map((item) => renderFilaExtra(item))}
                          </React.Fragment>
                        ))
                      ) : (
                        horasExtraFiltradas.map((item) => renderFilaExtra(item))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {subTabExtras === 'compensaciones' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Barra de Filtro de Colaborador */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Buscar por colaborador o cargo..."
                    value={searchCompensacion}
                    onChange={(e) => setSearchCompensacion(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-8 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#1c6856] shadow-sm"
                  />
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  {searchCompensacion && (
                    <button
                      onClick={() => setSearchCompensacion('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="text-xs text-stone-500 font-medium">
                  Mostrando <strong className="text-stone-800">{compensacionesFiltradas.length}</strong> registro{compensacionesFiltradas.length !== 1 ? 's' : ''} de compensación
                </div>
              </div>

              {/* Lista de Tarjetas Estilo Notificaciones / Auditoría */}
              {compensacionesFiltradas.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center text-stone-400 text-xs">
                  <Scale className="w-10 h-10 mx-auto text-stone-300 mb-2" />
                  No hay registros de compensación ni deducción de horas en el período.
                </div>
              ) : (
                <div className="space-y-4">
                  {compensacionesFiltradas.map((comp) => {
                    const emp = comp.empleado_detalle || empleados.find((e) => e.id === comp.empleado);
                    const nombreCompleto = emp ? `${emp.nombre} ${emp.apellido}` : `Empleado #${comp.empleado}`;
                    const cargo = emp?.cargo_display || '';
                    const esSaldada = Number(comp.saldo_restante) === 0;

                    return (
                      <div
                        key={comp.id}
                        className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-sm space-y-4 hover:border-emerald-300/80 transition-colors"
                      >
                        {/* Header de la Tarjeta */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold shadow-2xs">
                              <Scale className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-sm text-stone-900">{nombreCompleto}</h3>
                                {cargo && <span className="text-xs text-stone-500 font-medium">({cargo})</span>}
                              </div>
                              <p className="text-[11px] text-stone-400 font-medium mt-0.5">
                                Compensación Automática de Bolsa de Horas (Déficit vs Horas Extra)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs ${
                                esSaldada
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {esSaldada
                                ? 'Deuda Liquidada al 100% ✅'
                                : `Saldo Pendiente: ${Number(comp.saldo_restante).toFixed(2)} hrs ⚠️`}
                            </span>
                          </div>
                        </div>

                        {/* Bloque Día con Horas Extra (Pago) */}
                        <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3.5 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-800 block">
                              🟢 DÍA QUE HIZO LAS HORAS EXTRA (PAGO):
                            </span>
                            <span className="font-bold text-stone-900 text-sm mt-0.5 block font-mono">
                              {new Date(comp.fecha_compensacion + 'T00:00:00').toLocaleDateString('es-NI', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <span className="text-[10px] text-stone-500 block uppercase font-bold">
                                Jornada Realizada
                              </span>
                              <span className="font-mono font-bold text-stone-800">
                                {Number(comp.horas_trabajadas_hoy).toFixed(2)} hrs
                              </span>
                            </div>
                            <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 shadow-2xs">
                              <span className="text-[10px] text-emerald-800 block uppercase font-bold">
                                Horas Extra Generadas
                              </span>
                              <span className="font-mono font-black text-emerald-900 text-sm">
                                +{Number(comp.horas_extra_generadas).toFixed(2)} hrs
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Bloque Desglose Detallado de Días Adeudados */}
                        <div className="space-y-2">
                          <span className="font-bold uppercase tracking-wider text-[11px] text-stone-700 flex items-center gap-1.5">
                            <span>📋 DESGLOSE DETALLADO DE CADA DÍA ADEUDADO:</span>
                          </span>

                          <div className="space-y-2">
                            {comp.desglose && comp.desglose.length > 0 ? (
                              comp.desglose.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 text-xs space-y-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/60 pb-1.5">
                                    <span className="font-bold text-stone-900 flex items-center gap-1.5">
                                      <span>📅</span>
                                      <span>{item.fecha_display || item.fecha}</span>
                                    </span>
                                    <span className="bg-white border border-stone-200 px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-800 shadow-2xs">
                                      {item.estado}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                                      <span className="text-stone-400 block text-[10px] uppercase font-bold">
                                        Horas Trabajadas
                                      </span>
                                      <span className="font-mono font-bold text-stone-800">
                                        {Number(item.horas_trabajadas).toFixed(2)} hrs
                                      </span>
                                      <span className="text-[10px] text-stone-400 block">(base 8.00 hrs)</span>
                                    </div>

                                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                                      <span className="text-rose-500 block text-[10px] uppercase font-bold">
                                        Horas Faltaron (Déficit)
                                      </span>
                                      <span className="font-mono font-bold text-rose-700">
                                        -{Number(item.horas_faltaron).toFixed(2)} hrs
                                      </span>
                                      <span className="text-[10px] text-rose-400 block">Deuda del día</span>
                                    </div>

                                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                                      <span className="text-emerald-700 block text-[10px] uppercase font-bold">
                                        Horas Extra Aplicadas
                                      </span>
                                      <span className="font-mono font-bold text-emerald-800">
                                        +{Number(item.horas_aplicadas).toFixed(2)} hrs
                                      </span>
                                      <span className="text-[10px] text-emerald-600 block">Deducción directa</span>
                                    </div>

                                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                                      <span className="text-stone-500 block text-[10px] uppercase font-bold">
                                        Saldo de esta Fecha
                                      </span>
                                      <span className="font-mono font-bold text-stone-900">
                                        {Number(item.saldo_dia).toFixed(2)} hrs
                                      </span>
                                      <span className="text-[10px] text-stone-400 block">
                                        {Number(item.saldo_dia) === 0 ? 'Liquidado' : 'Pendiente'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="bg-stone-50 p-3 rounded-xl text-stone-500 text-xs">
                                Amortización directa aplicada sobre el saldo deudor acumulado: {Number(comp.horas_deducidas).toFixed(2)} hrs.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer Resumen de la Tarjeta */}
                        <div className="bg-stone-100/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs border border-stone-200/70 font-medium">
                          <div className="flex flex-wrap items-center gap-4">
                            <div>
                              <span className="text-stone-500 text-[10px] uppercase font-bold block">
                                Total Extra Deducido:
                              </span>
                              <span className="font-mono font-bold text-[#1c6856] text-sm">
                                -{Number(comp.horas_deducidas).toFixed(2)} hrs
                              </span>
                            </div>
                            <div>
                              <span className="text-stone-500 text-[10px] uppercase font-bold block">
                                Saldo Global Deudor:
                              </span>
                              <span className="font-mono font-bold text-stone-900 text-sm">
                                {Number(comp.saldo_restante).toFixed(2)} hrs
                              </span>
                            </div>
                            {Number(comp.remanente_extra) > 0 && (
                              <div>
                                <span className="text-amber-700 text-[10px] uppercase font-bold block">
                                  Remanente a Pago de Nómina:
                                </span>
                                <span className="font-mono font-bold text-amber-800 text-sm">
                                  +{Number(comp.remanente_extra).toFixed(2)} hrs
                                </span>
                              </div>
                            )}
                          </div>

                          <span className="text-[11px] font-mono text-stone-400">
                            Registro: {new Date(comp.created_at).toLocaleString('es-NI', { hour12: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: VACACIONES Y PERMISOS AUTORIZADOS ─────────────────────────── */}
      {activeTab === 'permisos' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <Palmtree className="w-6 h-6 text-[#1c6856]" />
              Gestión de Vacaciones & Permisos
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-1">
              Registre ausencias programadas o autorizadas. Durante las fechas asignadas, el trabajador no generará alertas por falta ni horas de deuda.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Formulario Registrar Permiso */}
            <form onSubmit={handleAddPermiso} className="lg:col-span-4 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-[#1c6856] flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Plus className="w-4 h-4" />
                Registrar Permiso o Vacaciones
              </h3>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Empleado</label>
                <select
                  value={nuevoPermisoEmp}
                  onChange={(e) => setNuevoPermisoEmp(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-medium"
                >
                  {empleados.filter((e) => e.activo).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} {emp.apellido} — {emp.cargo_display}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Tipo de Ausencia</label>
                <select
                  value={nuevoPermisoTipo}
                  onChange={(e) => setNuevoPermisoTipo(e.target.value as TipoPermisoType)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-medium"
                >
                  <option value="VACACIONES">🏖️ Vacaciones</option>
                  <option value="VACACIONES_PAGADAS">💰 Vacaciones Pagadas</option>
                  <option value="INCAPACIDAD_MEDICA">🏥 Incapacidad Médica</option>
                  <option value="PERMISO_AUTORIZADO">📋 Permiso Autorizado</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    required
                    value={nuevoPermisoInicio}
                    onChange={(e) => setNuevoPermisoInicio(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    required
                    value={nuevoPermisoFin}
                    onChange={(e) => setNuevoPermisoFin(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Motivo / Justificación</label>
                <input
                  type="text"
                  placeholder="Ej: Vacaciones correspondientes a 2026, cita médica..."
                  value={nuevoPermisoMotivo}
                  onChange={(e) => setNuevoPermisoMotivo(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                />
              </div>

              <button
                type="submit"
                disabled={addingPermiso || !nuevoPermisoEmp || !nuevoPermisoInicio || !nuevoPermisoFin}
                className="w-full bg-[#1c6856] hover:bg-[#154f42] disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
              >
                {addingPermiso ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Guardar Período Autorizado'
                )}
              </button>
            </form>

            {/* Listado de Permisos Registrados */}
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-[#1c6856] flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Palmtree className="w-4 h-4" />
                Permisos y Vacaciones Registradas
              </h3>

              {permisos.length === 0 ? (
                <div className="py-12 text-center text-stone-400 font-normal">
                  No hay permisos o vacaciones programadas activas.
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {permisos.map((p) => {
                    const empObj = p.empleado_detalle || empleados.find((e) => e.id === p.empleado);
                    const empNombre = empObj ? `${empObj.nombre} ${empObj.apellido}` : `Empleado #${p.empleado}`;
                    const cargoNombre = empObj?.cargo_display || '';

                    return (
                      <div
                        key={p.id}
                        className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-white px-3 py-1.5 border border-stone-200 rounded-xl text-center shadow-inner shrink-0 min-w-[75px]">
                            <span className="text-[10px] text-stone-400 block font-bold uppercase tracking-wider leading-none">
                              {p.total_dias || 1} {p.total_dias === 1 ? 'Día' : 'Días'}
                            </span>
                            <strong className="text-[11px] text-[#1c6856] font-mono block mt-1 leading-none">
                              {new Date(p.fecha_inicio + 'T00:00:00').toLocaleDateString('es-NI', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </strong>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-stone-900 text-xs">{empNombre}</h4>
                              {cargoNombre && (
                                <span className="text-[10px] text-stone-500 font-medium">({cargoNombre})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-[#1c6856]/10 text-[10px] font-bold text-[#1c6856]">
                                {p.tipo_display}
                              </span>
                              <span className="text-[10px] text-stone-400 font-mono">
                                Del {p.fecha_inicio} al {p.fecha_fin}
                              </span>
                            </div>
                            {p.motivo && (
                              <p className="text-[11px] text-stone-600 italic mt-1 font-medium bg-white/70 px-2 py-0.5 rounded border border-stone-200/50 inline-block">
                                📝 Motivo: {p.motivo}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeletePermiso(p.id)}
                          className="p-2 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl text-rose-600 transition-colors"
                          title="Eliminar Permiso"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── MÓDULO INFERIOR: REPORTE MENSUAL DE VACACIONES Y PERMISOS EN EXCEL ── */}
          <div className="glass-panel border border-white rounded-3xl p-6 shadow-premium space-y-5 bg-white/90">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/60 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-base text-stone-900 tracking-tight">
                    Reporte Mensual Detallado de Vacaciones & Permisos
                  </h3>
                </div>
                <p className="text-xs text-stone-500 font-medium mt-1">
                  Descargue el informe en Excel (.xlsx) con el desglose individual de cada vacación o permiso concedido (a quién se le otorgó, motivo justificado, fechas y total de días).
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadVacacionesExcel}
                disabled={downloadingVacaciones}
                className="bg-[#1c6856] hover:bg-[#154f42] active:scale-95 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm self-start sm:self-auto shrink-0"
              >
                {downloadingVacaciones ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Descargar Excel Mensual (.xlsx)</span>
              </button>
            </div>

            {/* Controles del Reporte Mensual */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-stone-600 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                  <Calendar className="w-3.5 h-3.5 text-[#1c6856]" />
                  Seleccionar Mes:
                </label>
                <select
                  value={reporteMes}
                  onChange={(e) => setReporteMes(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-bold"
                >
                  <option value={1}>Enero</option>
                  <option value={2}>Febrero</option>
                  <option value={3}>Marzo</option>
                  <option value={4}>Abril</option>
                  <option value={5}>Mayo</option>
                  <option value={6}>Junio</option>
                  <option value={7}>Julio</option>
                  <option value={8}>Agosto</option>
                  <option value={9}>Septiembre</option>
                  <option value={10}>Octubre</option>
                  <option value={11}>Noviembre</option>
                  <option value={12}>Diciembre</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wide">
                  Año:
                </label>
                <select
                  value={reporteAnio}
                  onChange={(e) => setReporteAnio(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono font-bold"
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>

              <div className="sm:col-span-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const hoy = new Date();
                    setReporteMes(hoy.getMonth() + 1);
                    setReporteAnio(hoy.getFullYear());
                  }}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border border-stone-200 shadow-2xs"
                >
                  Mes Actual
                </button>
                <div className="text-xs text-stone-600 font-medium">
                  {permisosMesSeleccionado.length === 0 ? (
                    <span className="text-stone-400">Sin permisos en este mes</span>
                  ) : (
                    <span>
                      <strong className="text-stone-900 font-bold">{permisosMesSeleccionado.length}</strong> registro{permisosMesSeleccionado.length !== 1 ? 's' : ''} (
                      <strong className="text-[#1c6856] font-bold">{totalDiasMesSeleccionado}</strong> días concedidos)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Vista Previa de los Registros del Mes */}
            <div className="bg-stone-50/80 border border-stone-200/80 rounded-2xl p-4">
              <div className="flex items-center justify-between border-b border-stone-200/60 pb-2 mb-3">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Detalle de Registros para el Reporte Excel:</span>
                </h4>
                <span className="text-[11px] font-mono font-bold text-stone-500">
                  {MESES_NOMBRES[reporteMes]} {reporteAnio}
                </span>
              </div>

              {permisosMesSeleccionado.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  No hay vacaciones ni permisos autorizados dentro de este mes. Al exportar, se generará el archivo Excel limpio con la estructura institucional.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                        <th className="py-2 px-3">Colaborador</th>
                        <th className="py-2 px-3">Tipo</th>
                        <th className="py-2 px-3">Fechas</th>
                        <th className="py-2 px-3 text-center">Días</th>
                        <th className="py-2 px-3">Motivo / Justificación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200/60 font-medium text-stone-800">
                      {permisosMesSeleccionado.map((p) => {
                        const emp = p.empleado_detalle || empleados.find((e) => e.id === p.empleado);
                        return (
                          <tr key={`preview-${p.id}`} className="hover:bg-white transition-colors">
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-stone-900 block">
                                {emp ? `${emp.nombre} ${emp.apellido}` : `Empleado #${p.empleado}`}
                              </span>
                              <span className="text-[10px] text-stone-400">
                                {emp?.cargo_display || ''}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-[#1c6856]/10 text-[10px] font-bold text-[#1c6856]">
                                {p.tipo_display}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-stone-600 text-[11px]">
                              {p.fecha_inicio} al {p.fecha_fin}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-stone-900">
                              {p.total_dias} {p.total_dias === 1 ? 'día' : 'días'}
                            </td>
                            <td className="py-2.5 px-3 text-stone-600 italic">
                              {p.motivo ? p.motivo : <span className="text-stone-400 not-italic">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: GESTOR DE FERIADOS DINÁMICOS ───────────────────────────────── */}
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

      {/* ── MODAL DE AUTORIZACIÓN CON PIN 2322 PARA HORAS EXTRA ── */}
      {showExtraPinModal && pendingExtraAction && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200 select-none">
            <div
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto shadow-md transition-colors ${
                pendingExtraAction.decision === 'APROBADO'
                  ? 'bg-emerald-100 border-emerald-300 text-[#1c6856]'
                  : 'bg-rose-100 border-rose-300 text-rose-700'
              }`}
            >
              <KeyRound className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-display font-black text-xl text-stone-900 tracking-tight">
                {pendingExtraAction.decision === 'APROBADO' ? 'Autorizar Horas Extra' : 'Rechazar Horas Extra'}
              </h3>
              <p className="text-xs text-stone-500 font-medium mt-1">
                {pendingExtraAction.decision === 'APROBADO'
                  ? 'Ingrese el PIN de Gerencia (2322) para autorizar el pago de horas extra en nómina.'
                  : 'Ingrese el PIN de Gerencia (2322) para confirmar el rechazo de esta solicitud.'}
              </p>
            </div>

            {/* Ficha Resumen de la Solicitud */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 text-left space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-bold">Colaborador:</span>
                <span className="font-black text-stone-900">{pendingExtraAction.empNombre}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-bold">Decisión a Registrar:</span>
                {pendingExtraAction.decision === 'APROBADO' ? (
                  <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    Aprobar +{pendingExtraAction.horas.toFixed(2)} hrs
                  </span>
                ) : (
                  <span className="font-mono font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                    Rechazar Solicitud (0.00 hrs)
                  </span>
                )}
              </div>
            </div>

            {/* Indicador de 4 Puntos PIN */}
            <div className="flex justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    extraPinError
                      ? 'bg-rose-500 border-rose-500 animate-bounce'
                      : idx < extraPin.length
                      ? 'bg-[#1c6856] border-[#1c6856] scale-110'
                      : 'border-stone-300 bg-stone-50'
                  }`}
                />
              ))}
            </div>

            {extraPinError && (
              <p className="text-xs text-rose-600 font-bold animate-pulse">
                PIN de Aprobación incorrecto. Intente de nuevo.
              </p>
            )}

            {/* Teclado Numérico */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleExtraPinKeyPress(num)}
                  className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleExtraPinBackspace}
                className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 font-bold text-xs text-stone-600 transition-all flex items-center justify-center uppercase"
              >
                Borrar
              </button>

              <button
                type="button"
                onClick={() => handleExtraPinKeyPress('0')}
                className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowExtraPinModal(false);
                  setPendingExtraAction(null);
                  setExtraPin('');
                  setExtraPinError(false);
                }}
                className="w-14 h-14 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all flex items-center justify-center uppercase"
              >
                Cancelar
              </button>
            </div>

            <p className="text-[11px] text-stone-400 font-medium hidden sm:block pt-1">
              💡 Puedes ingresar el PIN con el teclado numérico de tu PC (0-9)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
