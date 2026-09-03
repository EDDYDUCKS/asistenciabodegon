'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { RegistroAsistencia } from '@/lib/types';
import { fetchAsistencias, purgarDiaCero } from '@/lib/api-client';
import {
  CalendarCheck,
  RefreshCw,
  Search,
  Image as ImageIcon,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  KeyRound,
  Lock,
  ShieldAlert,
} from 'lucide-react';

interface AnalisisPuntualidad {
  turno: 'Quebrado' | 'Corrido 1' | 'Corrido 2' | 'Desconocido';
  estado: 'A Tiempo' | 'Tardanza' | 'Salida Anticipada' | 'N/A';
  desviacionMinutos: number;
}

// Lógica de cálculo de puntualidad dinámica
function calcularPuntualidadRecord(
  asis: RegistroAsistencia,
  marcajesDelDia: RegistroAsistencia[]
): AnalisisPuntualidad {
  const horaMarcaje = new Date(asis.fecha_hora);
  const tipo = asis.tipo_evento;

  // 1. Clasificación del turno del día
  const tieneQuebrado = marcajesDelDia.some(
    (m) => m.tipo_evento === 'SALIDA_QUEBRADA' || m.tipo_evento === 'ENTRADA_QUEBRADA'
  );

  const primeraEntrada = marcajesDelDia.find(
    (m) => m.tipo_evento === 'ENTRADA' || m.tipo_evento === 'ENTRADA_QUEBRADA'
  );

  let turno: 'Quebrado' | 'Corrido 1' | 'Corrido 2' | 'Desconocido' = 'Desconocido';
  let horaPrimeraEntrada = 12;
  
  if (primeraEntrada) {
    const niTimeStr = new Date(primeraEntrada.fecha_hora).toLocaleTimeString('en-US', {
      timeZone: 'America/Managua',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [heStr, meStr] = niTimeStr.split(':');
    const hour = parseInt(heStr, 10) + parseInt(meStr, 10) / 60;
    if (hour >= 14) {
      horaPrimeraEntrada = 15;
    }
  }

  if (tieneQuebrado) {
    turno = 'Quebrado';
  } else if (primeraEntrada) {
    turno = horaPrimeraEntrada === 15 ? 'Corrido 2' : 'Corrido 1';
  }

  // Horas teóricas en minutos en zona horaria de Nicaragua
  const nicaraguaTimeStr = new Date(asis.fecha_hora).toLocaleTimeString('en-US', {
    timeZone: 'America/Managua',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [hStr, mStr] = nicaraguaTimeStr.split(':');
  const minsMarcados = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

  if (tipo === 'ENTRADA') {
    let target = 720; // 12:00 md
    if (turno === 'Corrido 2' || (turno === 'Desconocido' && minsMarcados > 810)) {
      target = 900; // 3:00 pm
    }

    const diff = minsMarcados - target;
    if (diff > 0) {
      return { turno, estado: 'Tardanza', desviacionMinutos: diff };
    }
    return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
  }

  if (tipo === 'ENTRADA_QUEBRADA') {
    const target = 1080; // 6:00 pm (18:00)
    const diff = minsMarcados - target;
    if (diff > 0) {
      return { turno, estado: 'Tardanza', desviacionMinutos: diff };
    }
    return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
  }

  if (tipo === 'SALIDA_QUEBRADA') {
    const target = 900; // 3:00 pm
    const diff = target - minsMarcados;
    if (diff > 0) {
      return { turno, estado: 'Salida Anticipada', desviacionMinutos: diff };
    }
    return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
  }

  if (tipo === 'SALIDA_DEFINITIVA') {
    let target = 1380; // 11:00 pm
    if (turno === 'Corrido 1') {
      target = 1200; // 8:00 pm
    } else if (turno === 'Desconocido') {
      target = Math.abs(minsMarcados - 1200) < Math.abs(minsMarcados - 1380) ? 1200 : 1380;
    }

    const diff = target - minsMarcados;
    if (diff > 0) {
      return { turno, estado: 'Salida Anticipada', desviacionMinutos: diff };
    }
    return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
  }

  return { turno, estado: 'N/A', desviacionMinutos: 0 };
}

export default function AsistenciaLogPage() {
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Estado para Modal de Marcaje Manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualEmpId, setManualEmpId] = useState<number | ''>('');
  const [manualTipo, setManualTipo] = useState<string>('ENTRADA');
  const [manualFecha, setManualFecha] = useState('');
  const [manualHora, setManualHora] = useState('');
  const [manualObs, setManualObs] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, empList] = await Promise.all([
        fetchAsistencias(),
        (await import('@/lib/api-client')).fetchEmpleados(),
      ]);
      setAsistencias(data);
      setEmpleados(empList.filter((e) => e.activo));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
    const nowTimeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Managua', hour: '2-digit', minute: '2-digit' });
    setManualFecha(hoyStr);
    setManualHora(nowTimeStr);
  }, []);

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmpId || !manualFecha || !manualHora) {
      alert('Por favor complete todos los campos requeridos.');
      return;
    }
    setSavingManual(true);
    try {
      const fechaHoraISO = `${manualFecha}T${manualHora}:00-06:00`;
      const { createAsistenciaManual } = await import('@/lib/api-client');
      // Crear registro manual
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api'}/asistencia/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleado: Number(manualEmpId),
          tipo_evento: manualTipo,
          fecha_hora: fechaHoraISO,
          observacion: manualObs.trim() || 'Marcaje manual registrado por administrador',
        }),
      });

      setShowManualModal(false);
      setManualObs('');
      loadData();
    } catch (err: any) {
      alert('Error guardando marcaje: ' + (err.message || 'Error desconocido'));
    } finally {
      setSavingManual(false);
    }
  };

  // ── ESTADOS Y LÓGICA PARA PURGA DÍA 0 (PIN 2322) ──────────────────────────
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgePin, setPurgePin] = useState('');
  const [purgePinError, setPurgePinError] = useState(false);
  const [purging, setPurging] = useState(false);

  const playPurgeSound = (success: boolean) => {
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

  const handleExecutePurge = async () => {
    setPurging(true);
    try {
      const res = await purgarDiaCero('2322');
      playPurgeSound(true);
      alert(res.mensaje);
      setShowPurgeModal(false);
      setPurgePin('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error al ejecutar la purga de Día 0');
    } finally {
      setPurging(false);
    }
  };

  const handlePurgePinKeyPress = useCallback((num: string) => {
    setPurgePinError(false);
    setPurgePin((prev) => {
      if (prev.length >= 4) return prev;
      const newPin = prev + num;
      if (newPin === '2322') {
        playPurgeSound(true);
        setTimeout(() => {
          handleExecutePurge();
        }, 150);
        return newPin;
      } else if (newPin.length === 4) {
        setTimeout(() => {
          setPurgePinError(true);
          setPurgePin('');
          playPurgeSound(false);
        }, 200);
      }
      return newPin;
    });
  }, []);

  const handlePurgePinBackspace = useCallback(() => {
    setPurgePin((prev) => prev.slice(0, -1));
    setPurgePinError(false);
  }, []);

  // Soporte de Teclado Físico para Modal PIN 2322
  useEffect(() => {
    if (!showPurgeModal || purging) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handlePurgePinKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlePurgePinBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowPurgeModal(false);
        setPurgePin('');
        setPurgePinError(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPurgeModal, purging, handlePurgePinKeyPress, handlePurgePinBackspace]);

  // Agrupar marcajes por empleado y día para autodetección de turno
  const marcajesAgrupadosPorEmpleadoDia: Record<string, RegistroAsistencia[]> = {};
  
  asistencias.forEach((asis) => {
    const dia = asis.fecha_hora.slice(0, 10);
    const key = `${asis.empleado}_${dia}`;
    if (!marcajesAgrupadosPorEmpleadoDia[key]) {
      marcajesAgrupadosPorEmpleadoDia[key] = [];
    }
    marcajesAgrupadosPorEmpleadoDia[key].push(asis);
  });

  // Ordenar cronológicamente cada grupo
  Object.keys(marcajesAgrupadosPorEmpleadoDia).forEach((key) => {
    marcajesAgrupadosPorEmpleadoDia[key].sort(
      (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
    );
  });

  const filtered = asistencias.filter((a) => {
    const search = filterText.toLowerCase();
    const nombre = `${a.empleado_detalle.nombre} ${a.empleado_detalle.apellido}`.toLowerCase();
    const cargo = a.empleado_detalle.cargo_display.toLowerCase();
    const evento = a.tipo_evento_display.toLowerCase();
    return nombre.includes(search) || cargo.includes(search) || evento.includes(search);
  });

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="w-7 h-7 text-[#1c6856]" />
            Historial de Asistencia
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Registro auditable de todas las entradas, salidas, fotografías y puntualidad calculada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowManualModal(true)}
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Registrar Marcaje Manual
          </button>
          <button
            onClick={async () => {
              if (confirm('¿Desea ejecutar la Depuración Semestral (liberar fotos y bitácoras de más de 6 meses)?\n\nEsta acción conserva intactos a todos los empleados, carnets y sus horas.')) {
                const { ejecutarDepuracionSemestral } = await import('@/lib/api-client');
                const res = await ejecutarDepuracionSemestral(6);
                alert(res.mensaje);
                loadData();
              }
            }}
            className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            title="Liberar fotos y registros de más de 6 meses para optimizar almacenamiento"
          >
            <Trash2 className="w-3.5 h-3.5 text-stone-500" />
            Depuración Semestral
          </button>
          <button
            onClick={() => {
              setShowPurgeModal(true);
              setPurgePin('');
              setPurgePinError(false);
            }}
            className="bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Limpiar registros de prueba y reiniciar saldos a 0.00 hrs para el estreno (Requiere PIN 2322)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Purgar Pruebas (Día 0)</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''} text-[#1c6856]`} />
            Actualizar Historial
          </button>
        </div>
      </div>

      {/* Barra de Filtro */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Buscar por empleado, cargo o evento..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] shadow-sm font-medium"
        />
      </div>

      {/* Tabla de Historial */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#1c6856]/5 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Foto</th>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Tipo de Evento</th>
                <th className="px-6 py-4 text-center">Turno Autodetectado</th>
                <th className="px-6 py-4 text-center">Puntualidad</th>
                <th className="px-6 py-4">Fecha & Hora</th>
                <th className="px-6 py-4 text-right">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-stone-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-stone-400">
                    Cargando historial de asistencia...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-stone-400 font-normal">
                    No se encontraron registros de asistencia.
                  </td>
                </tr>
              ) : (
                filtered.map((asis) => {
                  const key = `${asis.empleado}_${asis.fecha_hora.slice(0, 10)}`;
                  const marcajesDia = marcajesAgrupadosPorEmpleadoDia[key] || [];
                  const analisis = calcularPuntualidadRecord(asis, marcajesDia);

                  return (
                    <tr key={asis.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-6 py-4">
                        {asis.foto_verificacion_url ? (
                          <button
                            onClick={() => setSelectedPhoto(asis.foto_verificacion_url!)}
                            className="relative group block"
                          >
                            <img
                              src={asis.foto_verificacion_url}
                              alt="Foto Marcaje"
                              className="w-12 h-12 rounded-xl object-cover border border-stone-200 group-hover:opacity-85 transition-opacity"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-400">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-stone-900">
                          {asis.empleado_detalle.nombre} {asis.empleado_detalle.apellido}
                        </div>
                        <span className="text-[10px] text-stone-400 font-medium">
                          {asis.empleado_detalle.cargo_display}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-white border border-stone-200 text-xs font-bold text-stone-700">
                          {asis.tipo_evento_display}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center font-semibold text-stone-600">
                        {analisis.turno !== 'Desconocido' ? (
                          <span className="text-xs">{analisis.turno}</span>
                        ) : (
                          <span className="text-xs text-stone-400 italic font-normal">No deducido</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {analisis.estado === 'A Tiempo' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-250 text-[10px] font-bold text-emerald-700">
                            <CheckCircle className="w-3 h-3" />
                            A tiempo
                          </span>
                        ) : analisis.estado === 'Tardanza' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-250 text-[10px] font-bold text-rose-700 animate-pulse">
                            <Clock className="w-3 h-3" />
                            Tardanza (+{analisis.desviacionMinutos} min)
                          </span>
                        ) : analisis.estado === 'Salida Anticipada' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-250 text-[10px] font-bold text-amber-700">
                            <AlertCircle className="w-3 h-3" />
                            Anticipado (-{analisis.desviacionMinutos} min)
                          </span>
                        ) : (
                          <span className="text-stone-400 text-xs">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-stone-600 font-semibold">
                        {new Date(asis.fecha_hora).toLocaleString('es-NI', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        })}
                      </td>

                      <td className="px-6 py-4 text-right font-mono text-xs text-stone-400 font-normal">
                        {asis.ip_address || '127.0.0.1'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Foto de Verificación */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 max-w-md w-full rounded-3xl p-6 relative space-y-4 shadow-2xl">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-black text-stone-900 text-base">Fotografía de Verificación</h3>
            <img
              src={selectedPhoto}
              alt="Foto ampliada"
              className="w-full aspect-square object-cover rounded-2xl border border-stone-200 shadow-inner"
            />
          </div>
        </div>
      )}

      {/* Modal Registrar Marcaje Manual */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 max-w-lg w-full rounded-3xl p-6 sm:p-8 relative space-y-5 shadow-2xl">
            <button
              onClick={() => setShowManualModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="font-black text-stone-900 text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#1c6856]" />
                Registrar Marcaje Manual
              </h3>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Utilice esta opción cuando un empleado olvidó marcar salida/entrada o no portaba su carnet.
              </p>
            </div>

            <form onSubmit={handleCreateManual} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                  Empleado *
                </label>
                <select
                  required
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                >
                  <option value="">Seleccione un empleado...</option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} {emp.apellido} — {emp.cargo_display}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                  Tipo de Evento *
                </label>
                <select
                  value={manualTipo}
                  onChange={(e) => setManualTipo(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                >
                  <option value="ENTRADA">ENTRADA (Inicio de Turno)</option>
                  <option value="SALIDA_QUEBRADA">SALIDA_QUEBRADA (Salida a Pausa 3:00 PM)</option>
                  <option value="ENTRADA_QUEBRADA">ENTRADA_QUEBRADA (Retorno de Pausa 6:00 PM)</option>
                  <option value="SALIDA_DEFINITIVA">SALIDA_DEFINITIVA (Fin de Jornada)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={manualFecha}
                    onChange={(e) => setManualFecha(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                    Hora (24h) *
                  </label>
                  <input
                    type="time"
                    required
                    value={manualHora}
                    onChange={(e) => setManualHora(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                  Motivo / Observación (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Olvido de salida, confirmado presencialmente..."
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 font-medium focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs py-2.5 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="flex-1 bg-[#1c6856] hover:bg-[#154f42] text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  {savingManual ? 'Guardando...' : 'Guardar Marcaje'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DE PURGA DÍA 0 CON PIN 2322 ── */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200 select-none">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700 mx-auto shadow-md">
              <KeyRound className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-display font-black text-xl text-stone-900 tracking-tight">
                Limpieza Oficial — Día 0
              </h3>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Ingrese el PIN de Gerencia (2322) para purgar todos los registros de prueba y dejar el sistema listo para el estreno.
              </p>
            </div>

            <div className="bg-rose-50/80 border border-rose-200/80 rounded-2xl p-3 text-left space-y-1 text-[11px] text-rose-900 leading-relaxed">
              <p className="font-bold flex items-center gap-1 text-rose-700">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Alcance de la limpieza:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-stone-600 text-[10.5px]">
                <li>Elimina marcajes de asistencia y fotos de prueba.</li>
                <li>Elimina alertas y horas extra acumuladas.</li>
                <li>Reinicia el saldo de horas de todos a <strong>0.00 hrs</strong>.</li>
                <li><strong>Conserva intactos</strong> los 13 empleados, sus carnets y los feriados.</li>
              </ul>
            </div>

            {/* Indicador de 4 Puntos PIN */}
            <div className="flex justify-center gap-4 py-1">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    purgePinError
                      ? 'bg-rose-500 border-rose-500 animate-bounce'
                      : idx < purgePin.length
                      ? 'bg-rose-600 border-rose-600 scale-110'
                      : 'border-stone-300 bg-stone-50'
                  }`}
                />
              ))}
            </div>

            {purgePinError && (
              <p className="text-xs text-rose-600 font-bold animate-pulse">
                PIN de Gerencia incorrecto. Intente de nuevo.
              </p>
            )}

            {purging ? (
              <div className="py-4 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 text-rose-600 animate-spin" />
                <span className="text-xs font-bold text-stone-700">Ejecutando limpieza oficial en la base de datos...</span>
              </div>
            ) : (
              <>
                {/* Teclado Numérico */}
                <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePurgePinKeyPress(num)}
                      className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
                    >
                      {num}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handlePurgePinBackspace}
                    className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 font-bold text-xs text-stone-600 transition-all flex items-center justify-center uppercase"
                  >
                    Borrar
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePurgePinKeyPress('0')}
                    className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
                  >
                    0
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPurgeModal(false);
                      setPurgePin('');
                      setPurgePinError(false);
                    }}
                    className="w-14 h-14 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all flex items-center justify-center uppercase"
                  >
                    Cancelar
                  </button>
                </div>

                <p className="text-[11px] text-stone-400 font-medium hidden sm:block pt-1">
                  💡 Puedes ingresar el PIN con el teclado numérico de tu PC (0-9)
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
