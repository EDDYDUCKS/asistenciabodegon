'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchEmpleados,
  fetchAsistencias,
  fetchHorasExtra,
  fetchAlertas,
  fetchPermisos,
} from '@/lib/api-client';
import {
  Empleado,
  RegistroAsistencia,
  AutorizacionHorasExtra,
  AlertaAsistencia,
  PermisoAusencia,
} from '@/lib/types';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  Users,
  Award,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Utensils,
  RefreshCw,
  FileSpreadsheet,
  Sparkles,
  Info,
  X,
} from 'lucide-react';

export default function RendimientoAyerPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [horasExtra, setHorasExtra] = useState<AutorizacionHorasExtra[]>([]);
  const [alertas, setAlertas] = useState<AlertaAsistencia[]>([]);
  const [permisos, setPermisos] = useState<PermisoAusencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPuntualidadFila, setSelectedPuntualidadFila] = useState<any | null>(null);

  // Calcular la fecha de ayer por defecto en la zona horaria de Managua, Nicaragua
  const hoyManagua = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  }, []);

  const ayerManagua = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  }, []);

  const antierManagua = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  }, []);

  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(ayerManagua);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [empList, asisList, extraList, alertList, permList] = await Promise.all([
        fetchEmpleados(),
        fetchAsistencias(),
        fetchHorasExtra(),
        fetchAlertas(),
        fetchPermisos(),
      ]);
      setEmpleados(empList);
      setAsistencias(asisList);
      setHorasExtra(extraList);
      setAlertas(alertList);
      setPermisos(permList);
    } catch (err) {
      console.error('Error cargando datos para resumen diario:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Calcular día siguiente calendario para capturar salidas nocturnas (madrugada)
  const diaSiguienteCal = useMemo(() => {
    const parts = fechaSeleccionada.split('-');
    if (parts.length !== 3) return '';
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, [fechaSeleccionada]);

  // Procesamiento y balance de la jornada seleccionada
  const reporteJornada = useMemo(() => {
    const activos = empleados.filter((e) => e.activo);

    const filas = activos.map((emp) => {
      // 1. Filtrar registros de asistencia correspondientes a esta jornada
      const regsDia = asistencias.filter((a) => {
        if (a.empleado !== emp.id) return false;
        const fh = a.fecha_hora;
        // Evento del mismo día de la jornada
        if (fh.startsWith(fechaSeleccionada)) return true;
        // O evento de salida en la madrugada del día siguiente (antes de las 04:00 AM)
        if (diaSiguienteCal && fh.startsWith(diaSiguienteCal)) {
          const hora = parseInt(fh.substring(11, 13), 10);
          if (hora < 4 && a.tipo_evento === 'SALIDA_DEFINITIVA') {
            return true;
          }
        }
        return false;
      });

      // Ordenar cronológicamente (más antiguo primero)
      const sorted = [...regsDia].sort(
        (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
      );

      // Eventos clave de la jornada
      const entrada = sorted.find((r) => r.tipo_evento === 'ENTRADA') || sorted[0];
      const salidaQuebrada = sorted.find((r) => r.tipo_evento === 'SALIDA_QUEBRADA');
      const retornoQuebrada = sorted.find((r) => r.tipo_evento === 'ENTRADA_QUEBRADA');
      const salidaDef = [...sorted]
        .reverse()
        .find((r) => r.tipo_evento === 'SALIDA_DEFINITIVA');

      // Calcular tiempo de pausa quebrada si aplica
      let horasPausa = 0;
      if (salidaQuebrada && retornoQuebrada) {
        const msPausa =
          new Date(retornoQuebrada.fecha_hora).getTime() -
          new Date(salidaQuebrada.fecha_hora).getTime();
        if (msPausa > 0) {
          horasPausa = msPausa / (1000 * 60 * 60);
        }
      }

      // Calcular horas netas de la jornada
      let horasNetas = 0;
      if (entrada && salidaDef) {
        const msTotal =
          new Date(salidaDef.fecha_hora).getTime() - new Date(entrada.fecha_hora).getTime();
        horasNetas = Math.max(0, msTotal / (1000 * 60 * 60) - horasPausa);
      }

      // 2. Verificar puntualidad con la regla de tolerancia exacta de El Bodegón
      let puntual = true;
      let minutosTarde = 0;
      let turnoEsperadoStr = '12:00 PM';
      let horaEntradaMarcadaStr = '--:--';
      let explicacionPuntualidad = '';
      let horaRetornoEsperadaStr = '';
      let horaRetornoMarcadaStr = '';
      let explicacionRetorno = '';

      // Consultar si el sistema generó alerta oficial de tardanza en este día
      const alertaTardanza = alertas.find(
        (al) =>
          al.empleado === emp.id &&
          al.tipo === 'TARDANZA' &&
          al.created_at?.startsWith(fechaSeleccionada)
      );

      if (entrada) {
        const dEnt = new Date(entrada.fecha_hora);
        horaEntradaMarcadaStr = dEnt.toLocaleTimeString('es-NI', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const minsMarcados = dEnt.getHours() * 60 + dEnt.getMinutes();

        // Determinar franja base de entrada según El Bodegón (views.py):
        // 9:00 AM (540), 11:00 AM (660), 11:30 AM (690), 12:00 PM (720), 3:00 PM (900), 5:00 PM (1020)
        let franjaBase = 720;
        if (salidaQuebrada || retornoQuebrada) {
          // Colaborador con jornada partida (quebrada)
          if (minsMarcados <= 675) {
            franjaBase = 660; // 11:00 AM (ej. Nelly 11:06 AM)
          } else if (minsMarcados <= 705) {
            franjaBase = 690; // 11:30 AM (ej. Lucero 11:29 AM)
          } else {
            franjaBase = 720; // 12:00 PM (ej. Estefani 11:57 AM)
          }
        } else if (minsMarcados >= 675 && minsMarcados <= 735) {
          // Entre 11:15 AM y 12:15 PM corrido -> Turno de 12:00 PM (ej. Carlos a las 11:55 AM)
          franjaBase = 720;
        } else {
          const FRANJAS = [540, 660, 690, 720, 900, 1020];
          franjaBase = FRANJAS.reduce((prev, curr) =>
            Math.abs(curr - minsMarcados) < Math.abs(prev - minsMarcados) ? curr : prev
          );
        }

        const HORA_LABELS: Record<number, string> = {
          540: '9:00 AM',
          660: '11:00 AM',
          690: '11:30 AM',
          720: '12:00 PM',
          900: '3:00 PM',
          1020: '5:00 PM',
        };

        turnoEsperadoStr = HORA_LABELS[franjaBase] || '12:00 PM';
        const diff = minsMarcados - franjaBase;

        // Distinguir si la alerta fue en la entrada o en la pausa
        const esAlertaDePausa = alertaTardanza?.mensaje.toLowerCase().includes('pausa');

        if (alertaTardanza && !esAlertaDePausa) {
          puntual = false;
          const match = alertaTardanza.mensaje.match(/(\d+)\s*min/i);
          minutosTarde = match ? parseInt(match[1], 10) : Math.max(1, diff);
          explicacionPuntualidad = `Alerta de tardanza registrada: ${alertaTardanza.mensaje}`;
        } else if (diff > 10) {
          puntual = false;
          minutosTarde = diff;
          explicacionPuntualidad = `Llegó a las ${horaEntradaMarcadaStr} (+${diff} min tarde respecto a su horario programado de las ${turnoEsperadoStr}). Excedió la tolerancia de 10 min por ${diff - 10} min.`;
        } else if (diff <= 0) {
          puntual = true;
          minutosTarde = 0;
          explicacionPuntualidad = `Llegó a las ${horaEntradaMarcadaStr} (${Math.abs(diff)} min antes de su turno de las ${turnoEsperadoStr}). Marcaje puntual.`;
        } else {
          puntual = true;
          minutosTarde = 0;
          explicacionPuntualidad = `Llegó a las ${horaEntradaMarcadaStr} (+${diff} min respecto a las ${turnoEsperadoStr}), dentro del margen institucional de 10 minutos de cortesía.`;
        }

        // Si tiene pausa quebrada, evaluar también la puntualidad del retorno
        if (salidaQuebrada && retornoQuebrada) {
          const dRet = new Date(retornoQuebrada.fecha_hora);
          horaRetornoMarcadaStr = dRet.toLocaleTimeString('es-NI', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          const minsRet = dRet.getHours() * 60 + dRet.getMinutes();

          const msB1 =
            new Date(salidaQuebrada.fecha_hora).getTime() - new Date(entrada.fecha_hora).getTime();
          const durB1 = msB1 / (1000 * 60 * 60);

          // Lógica Maestra El Bodegón:
          // Con cierre a las 11:00 PM (23:00), la hora límite de retorno permite completar las 8 horas diarias:
          let horaEsperadaRet = 1080; // 6:00 PM
          if (durB1 >= 3.8) {
            horaEsperadaRet = 1140; // 7:00 PM (Turno 11:00 AM, acumuló ~4.0h)
          } else if (durB1 >= 3.2) {
            horaEsperadaRet = 1110; // 6:30 PM (Turno 11:30 AM, acumuló ~3.5h, ej. Lucero)
          } else {
            horaEsperadaRet = 1080; // 6:00 PM (Turno 12:00 PM, acumuló ~3.0h, ej. Estefani)
          }

          const retLabels: Record<number, string> = {
            1140: '7:00 PM',
            1110: '6:30 PM',
            1080: '6:00 PM',
          };
          horaRetornoEsperadaStr = retLabels[horaEsperadaRet] || '6:00 PM';

          const diffRet = minsRet - horaEsperadaRet;
          const horasFaltantes = Math.max(0, 8.0 - durB1);

          if (diffRet > 10) {
            puntual = false;
            minutosTarde = Math.max(minutosTarde, diffRet);
            explicacionRetorno = `Retornó a las ${horaRetornoMarcadaStr} (+${diffRet} min tarde respecto a las ${horaRetornoEsperadaStr}). Con ${durB1.toFixed(1)}h hechas en la mañana, debía regresar a las ${horaRetornoEsperadaStr} para completar las ${horasFaltantes.toFixed(1)}h restantes antes del cierre (11:00 PM).`;
          } else if (diffRet <= 0) {
            explicacionRetorno = `Retornó a las ${horaRetornoMarcadaStr} (${Math.abs(diffRet)} min antes de las ${horaRetornoEsperadaStr}). Con ${durB1.toFixed(1)}h hechas en la mañana, dispone del tiempo exacto para completar sus 8h antes del cierre.`;
          } else {
            explicacionRetorno = `Retornó a las ${horaRetornoMarcadaStr} (+${diffRet} min respecto a las ${horaRetornoEsperadaStr}, dentro de la tolerancia de 10 min). En tiempo para completar sus 8h.`;
          }
        }
      }

      // 3. Estado de Asistencia y Cierre
      let estadoCierre: 'PRESENTE_CERRADO' | 'SIN_SALIDA' | 'PERMISO' | 'AUSENTE' = 'AUSENTE';
      const tienePermiso = permisos.some(
        (p) =>
          p.empleado === emp.id &&
          fechaSeleccionada >= p.fecha_inicio &&
          fechaSeleccionada <= p.fecha_fin
      );

      if (entrada && salidaDef) {
        estadoCierre = 'PRESENTE_CERRADO';
      } else if (entrada && !salidaDef) {
        estadoCierre = 'SIN_SALIDA';
      } else if (tienePermiso) {
        estadoCierre = 'PERMISO';
      } else {
        estadoCierre = 'AUSENTE';
      }

      // 4. Horas Extra de la jornada
      const heObj = horasExtra.find(
        (h) => h.empleado === emp.id && h.fecha === fechaSeleccionada
      );

      return {
        empleado: emp,
        entrada,
        salida: salidaDef,
        salidaQuebrada,
        retornoQuebrada,
        horasPausa,
        pausa: Boolean(salidaQuebrada || retornoQuebrada),
        horasNetas,
        puntual,
        minutosTarde,
        turnoEsperadoStr,
        horaEntradaMarcadaStr,
        explicacionPuntualidad,
        horaRetornoEsperadaStr,
        horaRetornoMarcadaStr,
        explicacionRetorno,
        estadoCierre,
        horasExtra: heObj || null,
        todosRegistros: sorted,
      };
    });

    // Métricas Agregadas de la Jornada
    const totalActivos = activos.length;
    const presentes = filas.filter(
      (f) => f.estadoCierre === 'PRESENTE_CERRADO' || f.estadoCierre === 'SIN_SALIDA'
    );
    const cerradosOk = filas.filter((f) => f.estadoCierre === 'PRESENTE_CERRADO');
    const sinSalida = filas.filter((f) => f.estadoCierre === 'SIN_SALIDA');
    const ausentes = filas.filter((f) => f.estadoCierre === 'AUSENTE');
    const conPermiso = filas.filter((f) => f.estadoCierre === 'PERMISO');

    const puntuales = presentes.filter((f) => f.puntual);
    const impuntuales = presentes.filter((f) => !f.puntual);

    const totalHorasOrdinarias = presentes.reduce(
      (acc, f) => acc + Math.min(8.0, f.horasNetas),
      0
    );

    const horasExtraList = filas
      .filter((f) => f.horasExtra !== null)
      .map((f) => f.horasExtra!);

    const totalHorasExtraGeneradas = horasExtraList.reduce(
      (acc, h) => acc + parseFloat(String(h.horas_extra_solicitadas || 0)),
      0
    );

    const hePendientes = horasExtraList.filter((h) => h.estado === 'PENDIENTE');

    // Determinación del Semáforo Ejecutivo
    let semaforo: 'VERDE' | 'AMBAR' | 'ROJO' = 'VERDE';
    let semaforoTitulo = 'Operación Impecable y Cierre Exitoso';
    let semaforoMensaje =
      'Todo el personal que laboró registró su salida oportunamente y no se presentaron incidencias críticas en la jornada.';

    if (sinSalida.length > 0 || ausentes.length > 2) {
      semaforo = 'ROJO';
      semaforoTitulo = 'Atención Requerida: Registros Incompletos o Ausencias';
      semaforoMensaje = `Se detectaron ${sinSalida.length} colaborador(es) sin marcaje de salida al cierre o ${ausentes.length} ausencias sin justificar.`;
    } else if (hePendientes.length > 0 || impuntuales.length > 0) {
      semaforo = 'AMBAR';
      semaforoTitulo = 'Operación Estable con Novedades en Cierre';
      semaforoMensaje = `La jornada cerró bien, pero hay ${hePendientes.length} solicitud(es) de horas extra pendientes de autorizar y ${impuntuales.length} llegada(s) tarde.`;
    }

    return {
      filas,
      totalActivos,
      presentesCount: presentes.length,
      cerradosOkCount: cerradosOk.length,
      sinSalidaCount: sinSalida.length,
      ausentesCount: ausentes.length,
      conPermisoCount: conPermiso.length,
      puntualesCount: puntuales.length,
      impuntualesCount: impuntuales.length,
      tasaPuntualidad:
        presentes.length > 0
          ? Math.round((puntuales.length / presentes.length) * 100)
          : 100,
      tasaAsistencia:
        totalActivos > 0 ? Math.round((presentes.length / totalActivos) * 100) : 0,
      totalHorasOrdinarias,
      totalHorasExtraGeneradas,
      hePendientes,
      sinSalida,
      impuntuales,
      semaforo,
      semaforoTitulo,
      semaforoMensaje,
    };
  }, [empleados, asistencias, horasExtra, alertas, permisos, fechaSeleccionada, diaSiguienteCal]);

  // Formato bonito de la fecha evaluada
  const fechaDisplay = useMemo(() => {
    try {
      const parts = fechaSeleccionada.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('es-NI', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return fechaSeleccionada;
    }
  }, [fechaSeleccionada]);

  return (
    <div className="space-y-6 select-none font-sans pb-16">
      {/* ── BARRA SUPERIOR DE NAVEGACIÓN Y TÍTULO ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/70 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-10 h-10 rounded-2xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center transition-all shadow-2xs active:scale-95 shrink-0"
            title="Volver al Dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-display font-black text-stone-900 tracking-tight flex items-center gap-2">
                <TrendingUp className="w-7 h-7 text-[#1c6856]" />
                Rendimiento de Ayer
              </h1>
              <span className="bg-[#1c6856]/10 text-[#1c6856] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-[#1c6856]/20">
                Briefing Ejecutivo Matutino
              </span>
            </div>
            <p className="text-xs text-stone-500 font-medium mt-1">
              Evaluación consolidada de asistencia, puntualidad, horas trabajadas y cierre operativo de{' '}
              <strong className="text-stone-800 capitalize">{fechaDisplay}</strong>.
            </p>
          </div>
        </div>

        {/* Selector Rápido de Fechas */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white border border-stone-200 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setFechaSeleccionada(ayerManagua)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                fechaSeleccionada === ayerManagua
                  ? 'bg-[#1c6856] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => setFechaSeleccionada(antierManagua)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                fechaSeleccionada === antierManagua
                  ? 'bg-[#1c6856] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Antier
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <input
              type="date"
              value={fechaSeleccionada}
              max={hoyManagua}
              onChange={(e) => e.target.value && setFechaSeleccionada(e.target.value)}
              className="text-xs font-mono font-bold text-stone-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={loadAllData}
            disabled={loading}
            className="w-9 h-9 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''} text-[#1c6856]`} />
          </button>
        </div>
      </div>

      {/* ── 1. SEMÁFORO GLOBAL EJECUTIVO DE LA JORNADA ───────────────────────── */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border transition-all ${
          reporteJornada.semaforo === 'VERDE'
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : reporteJornada.semaforo === 'AMBAR'
            ? 'bg-amber-50/80 border-amber-200 text-amber-950'
            : 'bg-rose-50/80 border-rose-200 text-rose-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                reporteJornada.semaforo === 'VERDE'
                  ? 'bg-emerald-600 text-white'
                  : reporteJornada.semaforo === 'AMBAR'
                  ? 'bg-amber-600 text-white'
                  : 'bg-rose-600 text-white'
              }`}
            >
              {reporteJornada.semaforo === 'VERDE' ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : reporteJornada.semaforo === 'AMBAR' ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <XCircle className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded bg-white/70 border border-black/5">
                  Diagnóstico General de Cierre
                </span>
                <span className="text-xs font-mono font-bold text-stone-500">
                  {fechaDisplay}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                {reporteJornada.semaforoTitulo}
              </h2>
              <p className="text-xs font-medium text-stone-600 mt-0.5 leading-snug">
                {reporteJornada.semaforoMensaje}
              </p>
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-stone-200/60 sm:pl-4 shrink-0 flex items-center sm:flex-col sm:items-end justify-between gap-1">
            <span className="text-[10px] text-stone-500 uppercase font-bold">Estado Operativo</span>
            <span
              className={`text-xs font-black px-2.5 py-1 rounded-full border font-mono ${
                reporteJornada.semaforo === 'VERDE'
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  : reporteJornada.semaforo === 'AMBAR'
                  ? 'bg-amber-100 border-amber-300 text-amber-900'
                  : 'bg-rose-100 border-rose-300 text-rose-900'
              }`}
            >
              {reporteJornada.semaforo === 'VERDE'
                ? '🟢 ÓPTIMO'
                : reporteJornada.semaforo === 'AMBAR'
                ? '🟡 NOVEDADES'
                : '🔴 REVISAR'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. CUATRO TARJETAS DE MÉTRICAS CLAVE ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Métrica 1: Tasa de Asistencia */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              1. Asistencia Operativa
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-display font-black text-stone-900 leading-none">
                {reporteJornada.presentesCount}/{reporteJornada.totalActivos}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700">
                ({reporteJornada.tasaAsistencia}%)
              </span>
            </div>
            <span className="text-[10px] text-stone-500 font-medium block mt-1">
              {reporteJornada.cerradosOkCount} cerrados con salida normal
            </span>
          </div>
        </div>

        {/* Métrica 2: Índice de Puntualidad */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center border border-[#1c6856]/20 shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              2. Puntualidad en Entradas
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-display font-black text-stone-900 leading-none">
                {reporteJornada.tasaPuntualidad}%
              </span>
              <span className="text-xs font-mono font-bold text-stone-500">
                ({reporteJornada.puntualesCount} de {reporteJornada.presentesCount})
              </span>
            </div>
            <span
              className={`text-[10px] font-bold block mt-1 ${
                reporteJornada.impuntualesCount === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {reporteJornada.impuntualesCount === 0
                ? '0 llegadas tarde (100% puntual)'
                : `${reporteJornada.impuntualesCount} con tolerancia excedida`}
            </span>
          </div>
        </div>

        {/* Métrica 3: Horas Ordinarias Producidas */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              3. Volumen Laborado (Base)
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-display font-black text-stone-900 leading-none">
                {reporteJornada.totalHorasOrdinarias.toFixed(1)}
              </span>
              <span className="text-xs font-mono font-bold text-stone-500">horas</span>
            </div>
            <span className="text-[10px] text-stone-500 font-medium block mt-1">
              Promedio:{' '}
              {reporteJornada.presentesCount > 0
                ? (reporteJornada.totalHorasOrdinarias / reporteJornada.presentesCount).toFixed(1)
                : '0.0'}{' '}
              h / persona
            </span>
          </div>
        </div>

        {/* Métrica 4: Horas Extra / Cierre Nocturno */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 ${
              reporteJornada.hePendientes.length > 0
                ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                : 'bg-emerald-50 text-emerald-700 border-emerald-100'
            }`}
          >
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              4. Cierre & Horas Extra
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-display font-black text-emerald-700 leading-none">
                +{reporteJornada.totalHorasExtraGeneradas.toFixed(2)}
              </span>
              <span className="text-xs font-mono font-bold text-stone-500">hrs extra</span>
            </div>
            <span
              className={`text-[10px] font-bold block mt-1 ${
                reporteJornada.hePendientes.length > 0 ? 'text-amber-700' : 'text-stone-500'
              }`}
            >
              {reporteJornada.hePendientes.length > 0
                ? `⚠️ ${reporteJornada.hePendientes.length} pendiente(s) por autorizar`
                : 'Todas evaluadas'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. NOVEDADES QUE REQUIEREN ATENCIÓN (FILTRO RÁPIDO) ─────────────── */}
      {(reporteJornada.sinSalida.length > 0 ||
        reporteJornada.hePendientes.length > 0 ||
        reporteJornada.impuntuales.length > 0 ||
        reporteJornada.ausentesCount > 0) && (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            Novedades del Cierre que Requieren Atención Administrativa:
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Caso A: Horas Extra Pendientes de Autorizar */}
            {reporteJornada.hePendientes.length > 0 && (
              <div className="bg-white p-3 rounded-xl border border-amber-200 flex items-start justify-between gap-3 shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                    Horas Extra del Cierre sin Aprobar
                  </span>
                  <p className="text-xs font-bold text-stone-900 mt-0.5">
                    Hay {reporteJornada.hePendientes.length} solicitud(es) esperando revisión gerencial.
                  </p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Se generaron por exceder las 8 horas en el cierre nocturno.
                  </p>
                </div>
                <Link
                  href="/admin/nomina"
                  className="bg-[#1c6856] hover:bg-[#154f42] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 shadow-2xs cursor-pointer"
                >
                  Evaluar <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}

            {/* Caso B: Salidas no marcadas */}
            {reporteJornada.sinSalida.length > 0 && (
              <div className="bg-white p-3 rounded-xl border border-rose-200 shadow-2xs">
                <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                  Colaboradores sin Marcaje de Salida
                </span>
                <ul className="mt-1 space-y-1">
                  {reporteJornada.sinSalida.map((f, i) => (
                    <li key={i} className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                      {f.empleado.nombre} {f.empleado.apellido} ({f.empleado.cargo_display})
                      <span className="text-[10px] font-normal text-stone-500">
                        — Entró a las {f.entrada ? f.entrada.fecha_hora.substring(11, 16) : '--:--'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Caso C: Tardanzas */}
            {reporteJornada.impuntuales.length > 0 && (
              <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                  Llegadas Tarde ({reporteJornada.impuntuales.length})
                </span>
                <ul className="mt-1 space-y-1">
                  {reporteJornada.impuntuales.map((f, i) => (
                    <li key={i} className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                      {f.empleado.nombre} {f.empleado.apellido}:
                      <span className="text-amber-800 font-mono text-[11px] ml-1">
                        +{f.minutosTarde} min de retraso
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Caso D: Ausentes */}
            {reporteJornada.ausentesCount > 0 && (
              <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-2xs">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                  Personal Ausente ({reporteJornada.ausentesCount})
                </span>
                <ul className="mt-1 space-y-1">
                  {reporteJornada.filas
                    .filter((f) => f.estadoCierre === 'AUSENTE')
                    .map((f, i) => (
                      <li key={i} className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                        {f.empleado.nombre} {f.empleado.apellido} ({f.empleado.cargo_display})
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. TABLA DETALLADA POR COLABORADOR ────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-stone-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#1c6856]" />
              Desglose Individual de la Jornada
            </h3>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Registro cronológico de entradas, salidas y cómputo de horas de cada colaborador.
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-stone-500 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 self-start sm:self-auto">
            Total Colaboradores: {reporteJornada.filas.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-[10px] uppercase font-bold text-stone-400 bg-stone-50/70">
                <th className="py-3 px-4">Colaborador</th>
                <th className="py-3 px-3 text-center">Entrada</th>
                <th className="py-3 px-3 text-center">Pausa Intermedia (Quebrada)</th>
                <th className="py-3 px-3 text-center">Salida</th>
                <th className="py-3 px-3 text-right">Horas Netas</th>
                <th className="py-3 px-3 text-center">Puntualidad</th>
                <th className="py-3 px-3 text-right">Horas Extra</th>
                <th className="py-3 px-4 text-center">Estatus Cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {reporteJornada.filas.map((fila) => {
                const emp = fila.empleado;
                const horaEntrada = fila.entrada
                  ? new Date(fila.entrada.fecha_hora).toLocaleTimeString('es-NI', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : '--:--';
                const horaSalidaQ = fila.salidaQuebrada
                  ? new Date(fila.salidaQuebrada.fecha_hora).toLocaleTimeString('es-NI', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : null;
                const horaRetornoQ = fila.retornoQuebrada
                  ? new Date(fila.retornoQuebrada.fecha_hora).toLocaleTimeString('es-NI', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : null;
                const horaSalida = fila.salida
                  ? new Date(fila.salida.fecha_hora).toLocaleTimeString('es-NI', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : '--:--';

                return (
                  <tr key={emp.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">
                        {emp.nombre} {emp.apellido}
                      </div>
                      <span className="text-[10px] text-stone-400 block font-normal">
                        {emp.cargo_display} • {fila.pausa ? 'Horario Quebrado' : 'Horario Corrido'}
                      </span>
                    </td>

                    {/* Hora de Entrada */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-stone-800">
                      {fila.entrada ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {horaEntrada}
                        </span>
                      ) : (
                        <span className="text-stone-300">--:--</span>
                      )}
                    </td>

                    {/* Pausa Quebrada: Salida y Retorno */}
                    <td className="py-3 px-3 text-center">
                      {horaSalidaQ && horaRetornoQ ? (
                        <div className="inline-flex flex-col items-center">
                          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md shadow-2xs">
                            <span title="Salida a Pausa">{horaSalidaQ}</span>
                            <span className="text-amber-400 font-normal">➔</span>
                            <span title="Retorno de Pausa">{horaRetornoQ}</span>
                          </div>
                          <span className="text-[9.5px] text-stone-500 font-medium mt-0.5">
                            Pausa de {fila.horasPausa.toFixed(1)} hrs
                          </span>
                        </div>
                      ) : horaSalidaQ && !horaRetornoQ ? (
                        <div className="inline-flex flex-col items-center">
                          <div className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            <span>{horaSalidaQ}</span>
                            <span className="text-amber-400 font-normal">➔</span>
                            <span className="text-rose-600 font-bold">Sin retorno</span>
                          </div>
                        </div>
                      ) : !horaSalidaQ && horaRetornoQ ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="text-[11px] font-mono font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            Retorno: {horaRetornoQ}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10.5px] text-stone-400 font-normal">
                          Turno Corrido
                        </span>
                      )}
                    </td>

                    {/* Hora de Salida */}
                    <td className="py-3 px-3 text-center font-mono font-bold">
                      {fila.salida ? (
                        <span className="inline-flex items-center gap-1 text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                          {horaSalida}
                        </span>
                      ) : fila.entrada ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[10px] font-black">
                          Sin Salida
                        </span>
                      ) : (
                        <span className="text-stone-300">--:--</span>
                      )}
                    </td>

                    {/* Horas Netas */}
                    <td className="py-3 px-3 text-right font-mono font-black text-stone-900">
                      {fila.horasNetas > 0 ? `${fila.horasNetas.toFixed(2)} hrs` : '0.00 hrs'}
                    </td>

                    {/* Puntualidad Interactiva */}
                    <td className="py-3 px-3 text-center">
                      {!fila.entrada ? (
                        <span className="text-[10px] text-stone-400">N/A</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedPuntualidadFila(fila)}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
                            fila.puntual
                              ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border-emerald-200'
                              : 'text-amber-800 bg-amber-50 hover:bg-amber-100/80 border-amber-200 animate-pulse'
                          }`}
                          title="Toca o haz clic para ver horario programado y detalle exacto de puntualidad"
                        >
                          {fila.puntual ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>A Tiempo</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Tarde (+{fila.minutosTarde}m)</span>
                            </>
                          )}
                          <Info className="w-2.5 h-2.5 opacity-60 ml-0.5 shrink-0" />
                        </button>
                      )}
                    </td>

                    {/* Horas Extra */}
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      {fila.horasExtra ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded border font-black ${
                            fila.horasExtra.estado === 'APROBADO'
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : fila.horasExtra.estado === 'PENDIENTE'
                              ? 'text-amber-800 bg-amber-50 border-amber-200 animate-pulse'
                              : 'text-stone-400 bg-stone-50 border-stone-200 line-through'
                          }`}
                        >
                          +{parseFloat(String(fila.horasExtra.horas_extra_solicitadas)).toFixed(2)}h
                        </span>
                      ) : (
                        <span className="text-stone-300 font-normal">--</span>
                      )}
                    </td>

                    {/* Estatus Cierre */}
                    <td className="py-3 px-4 text-center">
                      {fila.estadoCierre === 'PRESENTE_CERRADO' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Cerrado OK
                        </span>
                      ) : fila.estadoCierre === 'SIN_SALIDA' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Falta Salida
                        </span>
                      ) : fila.estadoCierre === 'PERMISO' ? (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                          Permiso
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
                          Ausente
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. BOTÓN DE CIERRE (VUELTA AL DASHBOARD) ─────────────────────────── */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center shrink-0">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-stone-800">
              ¿Listo con la revisión de ayer?
            </h4>
            <p className="text-xs text-stone-500 font-medium">
              Puedes regresar al Dashboard en cualquier momento para seguir monitoreando el turno actual en vivo.
            </p>
          </div>
        </div>

        <Link
          href="/admin"
          className="w-full sm:w-auto bg-[#1c6856] hover:bg-[#154f42] text-white px-6 py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 cursor-pointer text-center"
        >
          <ArrowLeft className="w-4 h-4" />
          Cerrar y Volver al Dashboard
        </Link>
      </div>

      {/* ── MODAL EXPLICATIVO DE PUNTUALIDAD (CLICK EN DESKTOP / TAP EN MÓVIL) ── */}
      {selectedPuntualidadFila && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedPuntualidadFila(null)}
        >
          <div
            className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 text-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedPuntualidadFila.puntual
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-stone-900 leading-tight">
                    Detalle de Horario y Puntualidad
                  </h3>
                  <p className="text-[11px] font-bold text-stone-500">
                    {selectedPuntualidadFila.empleado.nombre} {selectedPuntualidadFila.empleado.apellido}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPuntualidadFila(null)}
                className="text-stone-400 hover:text-stone-700 p-1.5 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cargo y Modalidad de Turno */}
            <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-[9px] uppercase font-bold text-stone-400 block">Puesto / Cargo</span>
                <span className="font-bold text-stone-800">{selectedPuntualidadFila.empleado.cargo_display}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-stone-400 block">Modalidad de Turno</span>
                <span className="font-bold text-stone-800">
                  {selectedPuntualidadFila.pausa ? 'Horario Quebrado' : 'Horario Corrido'}
                </span>
              </div>
            </div>

            {/* Tarjeta 1: Entrada Principal */}
            <div
              className={`rounded-2xl p-3.5 border space-y-2.5 ${
                selectedPuntualidadFila.puntual
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-amber-50/70 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-stone-700">
                  Entrada Principal
                </span>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    selectedPuntualidadFila.puntual
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-amber-100 border-amber-300 text-amber-900'
                  }`}
                >
                  {selectedPuntualidadFila.puntual ? '✅ PUNTUAL' : '⚠️ TARDANZA'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/90 p-2 rounded-lg border border-stone-200/80">
                  <span className="text-[9px] text-stone-400 uppercase font-bold block">Horario Programado</span>
                  <span className="font-mono font-bold text-stone-800 text-xs">
                    {selectedPuntualidadFila.turnoEsperadoStr}
                  </span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-stone-200/80">
                  <span className="text-[9px] text-stone-400 uppercase font-bold block">Marcaje Registrado</span>
                  <span className="font-mono font-bold text-stone-900 text-xs">
                    {selectedPuntualidadFila.horaEntradaMarcadaStr}
                  </span>
                </div>
              </div>

              <p className="text-xs font-medium text-stone-800 leading-snug bg-white/80 p-2.5 rounded-xl border border-stone-200/60">
                {selectedPuntualidadFila.explicacionPuntualidad}
              </p>
            </div>

            {/* Tarjeta 2: Retorno de Pausa (si aplica horario quebrado) */}
            {selectedPuntualidadFila.pausa && (
              <div className="rounded-2xl p-3.5 border bg-stone-50 border-stone-200 space-y-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-stone-700 block">
                  Pausa Intermedia y Retorno (Horario Quebrado)
                </span>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-stone-200">
                    <span className="text-[9px] text-stone-400 uppercase font-bold block">Salida a Pausa</span>
                    <span className="font-mono font-bold text-stone-800 text-xs">
                      {selectedPuntualidadFila.salidaQuebrada
                        ? new Date(selectedPuntualidadFila.salidaQuebrada.fecha_hora).toLocaleTimeString('es-NI', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '--:--'}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-stone-200">
                    <span className="text-[9px] text-stone-400 uppercase font-bold block">Retorno Registrado</span>
                    <span className="font-mono font-bold text-stone-800 text-xs">
                      {selectedPuntualidadFila.retornoQuebrada
                        ? new Date(selectedPuntualidadFila.retornoQuebrada.fecha_hora).toLocaleTimeString('es-NI', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'Sin retorno'}
                    </span>
                  </div>
                </div>

                {selectedPuntualidadFila.explicacionRetorno && (
                  <p className="text-xs font-medium text-stone-700 bg-white p-2 rounded-lg border border-stone-200">
                    {selectedPuntualidadFila.explicacionRetorno}
                  </p>
                )}
              </div>
            )}

            {/* Nota institucional */}
            <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-emerald-950 font-medium">
              <Info className="w-4 h-4 text-[#1c6856] shrink-0 mt-0.5" />
              <span>
                <strong>Regla Institucional:</strong> Restaurante El Bodegón concede <strong>10 minutos de cortesía</strong> después de la hora oficial programada antes de registrar tardanza administrativa.
              </span>
            </div>

            {/* Footer */}
            <button
              onClick={() => setSelectedPuntualidadFila(null)}
              className="w-full bg-[#1c6856] hover:bg-[#154f42] text-white py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              Entendido / Cerrar Detalle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
