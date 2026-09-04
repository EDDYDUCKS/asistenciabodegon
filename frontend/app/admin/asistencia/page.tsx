'use client';

import React, { useEffect, useState } from 'react';
import { RegistroAsistencia } from '@/lib/types';
import { fetchAsistencias, deleteAsistencia } from '@/lib/api-client';
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
  Pencil,
} from 'lucide-react';

interface AnalisisPuntualidad {
  turno: string;
  estado: 'A Tiempo' | 'Retraso Leve' | 'Tardanza' | 'Salida Anticipada' | 'Jornada Cumplida 8h' | 'Horas Extra' | 'N/A';
  desviacionMinutos: number;
}

// Lógica de cálculo de puntualidad inteligente y flexible para El Bodegón
function calcularPuntualidadRecord(
  asis: RegistroAsistencia,
  marcajesDelDia: RegistroAsistencia[]
): AnalisisPuntualidad {
  const tipo = asis.tipo_evento;

  // Horas en minutos en zona horaria de Nicaragua
  const nicaraguaTimeStr = new Date(asis.fecha_hora).toLocaleTimeString('en-US', {
    timeZone: 'America/Managua',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [hStr, mStr] = nicaraguaTimeStr.split(':');
  const minsMarcados = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

  // 1. Identificar franja según la primera entrada del día
  const primeraEntrada = marcajesDelDia.find((m) => m.tipo_evento === 'ENTRADA');
  let minsPrimeraEntrada = minsMarcados;
  if (primeraEntrada) {
    const niEntStr = new Date(primeraEntrada.fecha_hora).toLocaleTimeString('en-US', {
      timeZone: 'America/Managua',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [hE, mE] = niEntStr.split(':');
    minsPrimeraEntrada = parseInt(hE, 10) * 60 + parseInt(mE, 10);
  }

  // 4 Franjas Base: 9:00 AM (540), 11:00 AM (660), 12:00 PM (720), 3:00 PM (900)
  const FRANJAS = [540, 660, 720, 900];
  const franjaBaseEntrada = FRANJAS.reduce((prev, curr) =>
    Math.abs(curr - minsPrimeraEntrada) < Math.abs(prev - minsPrimeraEntrada) ? curr : prev
  );

  const tieneQuebrado = marcajesDelDia.some(
    (m) => m.tipo_evento === 'SALIDA_QUEBRADA' || m.tipo_evento === 'ENTRADA_QUEBRADA'
  );

  let turno = 'Tarde (3 PM)';
  if (tieneQuebrado) {
    turno = franjaBaseEntrada === 660 ? 'Quebrado (11 AM)' : 'Quebrado (12 PM)';
  } else if (franjaBaseEntrada === 540) {
    turno = 'Mañana (9 AM)';
  } else if (franjaBaseEntrada === 720) {
    turno = 'Almuerzo (12 PM)';
  } else if (franjaBaseEntrada === 660) {
    turno = 'Cocina (11 AM)';
  }

  // ── ENTRADA INICIAL ──
  if (tipo === 'ENTRADA') {
    const franjaBaseEsta = FRANJAS.reduce((prev, curr) =>
      Math.abs(curr - minsMarcados) < Math.abs(prev - minsMarcados) ? curr : prev
    );
    const diff = minsMarcados - franjaBaseEsta;

    if (diff <= 0) {
      return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
    } else if (diff <= 10) {
      return { turno, estado: 'Retraso Leve', desviacionMinutos: diff };
    } else {
      return { turno, estado: 'Tardanza', desviacionMinutos: diff };
    }
  }

  // ── RETORNO DE PAUSA ──
  if (tipo === 'ENTRADA_QUEBRADA') {
    // Si la entrada fue cerca de 11:00 AM (hizo 4h en la mañana), su retorno esperado es 7:00 PM (1140 min)
    let horaEsperadaRetorno = 1080; // 6:00 PM por defecto
    const primeraPausa = marcajesDelDia.find((m) => m.tipo_evento === 'SALIDA_QUEBRADA');
    if (primeraEntrada && primeraPausa) {
      const duracionB1 = (new Date(primeraPausa.fecha_hora).getTime() - new Date(primeraEntrada.fecha_hora).getTime()) / 3600000;
      if (duracionB1 >= 3.6) {
        horaEsperadaRetorno = 1140; // 7:00 PM
      }
    }

    const diff = minsMarcados - horaEsperadaRetorno;
    if (diff <= 0) {
      return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
    } else if (diff <= 10) {
      return { turno, estado: 'Retraso Leve', desviacionMinutos: diff };
    } else {
      return { turno, estado: 'Tardanza', desviacionMinutos: diff };
    }
  }

  // ── SALIDA A PAUSA ──
  if (tipo === 'SALIDA_QUEBRADA') {
    return { turno, estado: 'A Tiempo', desviacionMinutos: 0 };
  }

  // ── SALIDA DEFINITIVA (Cálculo exacto por horas netas de jornada) ──
  if (tipo === 'SALIDA_DEFINITIVA') {
    let totalMilisegundos = 0;
    let entradaTemp: Date | null = null;

    marcajesDelDia.forEach((m) => {
      const dt = new Date(m.fecha_hora);
      if (m.tipo_evento === 'ENTRADA' || m.tipo_evento === 'ENTRADA_QUEBRADA') {
        entradaTemp = dt;
      } else if ((m.tipo_evento === 'SALIDA_QUEBRADA' || m.tipo_evento === 'SALIDA_DEFINITIVA') && entradaTemp) {
        totalMilisegundos += Math.max(0, dt.getTime() - entradaTemp.getTime());
        entradaTemp = null;
      }
    });

    const horasNetas = totalMilisegundos / 3600000;

    // Tolerancia de 10 minutos (7.83 horas = 7 horas y 50 minutos)
    if (horasNetas >= 8.1) {
      const extraMins = Math.round((horasNetas - 8.0) * 60);
      return { turno, estado: 'Horas Extra', desviacionMinutos: extraMins };
    } else if (horasNetas >= 7.83) {
      return { turno, estado: 'Jornada Cumplida 8h', desviacionMinutos: 0 };
    } else {
      const deficitMins = Math.round((8.0 - horasNetas) * 60);
      return { turno, estado: 'Salida Anticipada', desviacionMinutos: deficitMins };
    }
  }

  return { turno, estado: 'N/A', desviacionMinutos: 0 };
}

export default function AsistenciaLogPage() {
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Record<number, boolean>>({});

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

  // ── ESTADO PARA ELIMINAR UN REGISTRO INDIVIDUAL ERRÓNEO ────────────────────
  const [recordToDelete, setRecordToDelete] = useState<RegistroAsistencia | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);

  // ── ESTADO PARA CORREGIR EL TIPO DE EVENTO DE UN REGISTRO ──────────────────
  const [editEventoRecord, setEditEventoRecord] = useState<RegistroAsistencia | null>(null);
  const [editNuevoTipo, setEditNuevoTipo] = useState<string>('ENTRADA');
  const [savingEdit, setSavingEdit] = useState(false);

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setDeletingRecord(true);
    try {
      await deleteAsistencia(recordToDelete.id);
      setRecordToDelete(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error al eliminar el registro de asistencia.');
    } finally {
      setDeletingRecord(false);
    }
  };

  const handleEditTipoEvento = async () => {
    if (!editEventoRecord) return;
    setSavingEdit(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';
      const res = await fetch(`${API_BASE_URL}/asistencia/${editEventoRecord.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_evento: editNuevoTipo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al actualizar el tipo de evento.');
      }
      setEditEventoRecord(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar el tipo de evento.');
    } finally {
      setSavingEdit(false);
    }
  };

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
                <th className="px-6 py-4 text-center">IP Address</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-stone-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-stone-400">
                    Cargando historial de asistencia...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-stone-400 font-normal">
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
                        {asis.foto_verificacion_url && !failedPhotoIds[asis.id] ? (
                          <button
                            onClick={() => setSelectedPhoto(asis.foto_verificacion_url!)}
                            className="relative group block"
                          >
                            <img
                              src={asis.foto_verificacion_url}
                              alt="Foto Marcaje"
                              onError={() => setFailedPhotoIds((prev) => ({ ...prev, [asis.id]: true }))}
                              className="w-12 h-12 rounded-xl object-cover border border-stone-200 group-hover:opacity-85 transition-opacity"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-400" title="Foto no disponible">
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
                        ) : analisis.estado === 'Jornada Cumplida 8h' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-250 text-[10px] font-bold text-emerald-700">
                            <CheckCircle className="w-3 h-3" />
                            Jornada 8h
                          </span>
                        ) : analisis.estado === 'Retraso Leve' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700" title="Dentro de los 10 minutos de gracia. No se alerta al administrador.">
                            <Clock className="w-3 h-3" />
                            Gracia (+{analisis.desviacionMinutos} min)
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
                        ) : analisis.estado === 'Horas Extra' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-250 text-[10px] font-bold text-blue-700">
                            <CheckCircle className="w-3 h-3" />
                            Extra (+{analisis.desviacionMinutos} min)
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

                      <td className="px-6 py-4 text-center font-mono text-xs text-stone-400 font-normal">
                        {asis.ip_address || '127.0.0.1'}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditEventoRecord(asis);
                              setEditNuevoTipo(asis.tipo_evento);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-stone-50 hover:bg-amber-50 border border-stone-200 hover:border-amber-300 text-stone-600 hover:text-amber-700 transition-all font-bold text-xs active:scale-95 shadow-xs"
                            title="Corregir el tipo de evento auto-detectado (ej: SALIDA_DEFINITIVA → SALIDA_QUEBRADA)"
                          >
                            <Pencil className="w-3.5 h-3.5 text-stone-400" />
                            <span>Corregir</span>
                          </button>
                          <button
                            onClick={() => setRecordToDelete(asis)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-250 text-stone-600 hover:text-rose-700 transition-all font-bold text-xs active:scale-95 shadow-xs"
                            title="Eliminar este marcaje (si marcó por error o carnet equivocado)"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-stone-400" />
                            <span>Borrar</span>
                          </button>
                        </div>
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

      {/* ── MODAL: CORREGIR TIPO DE EVENTO ── */}
      {editEventoRecord && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setEditEventoRecord(null)}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shadow-sm shrink-0">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 text-base leading-tight">
                  Corregir Tipo de Evento
                </h3>
                <p className="text-xs text-stone-500 font-medium mt-0.5">
                  Úsalo cuando el sistema auto-detectó el tipo de marcaje incorrecto.
                </p>
              </div>
            </div>

            {/* Ficha del registro afectado */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex justify-between items-center border-b border-stone-200/60 pb-1.5">
                <span className="text-stone-500 font-bold uppercase text-[10px]">Colaborador:</span>
                <span className="font-black text-stone-800">
                  {editEventoRecord.empleado_detalle.nombre} {editEventoRecord.empleado_detalle.apellido}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-stone-200/60 pb-1.5">
                <span className="text-stone-500 font-bold uppercase text-[10px]">Evento Actual:</span>
                <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                  {editEventoRecord.tipo_evento_display}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-bold uppercase text-[10px]">Fecha y Hora:</span>
                <span className="font-mono font-bold text-stone-700">
                  {new Date(editEventoRecord.fecha_hora).toLocaleString('es-NI', {
                    hour12: true,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>

            {/* Selector del nuevo tipo */}
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                Cambiar a:
              </label>
              <select
                value={editNuevoTipo}
                onChange={(e) => setEditNuevoTipo(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="ENTRADA">🟢 ENTRADA — Inicio de Turno</option>
                <option value="SALIDA_QUEBRADA">🟡 SALIDA_QUEBRADA — Salida a Pausa (3:00 PM)</option>
                <option value="ENTRADA_QUEBRADA">🔵 ENTRADA_QUEBRADA — Retorno de Pausa (6:00 PM)</option>
                <option value="SALIDA_DEFINITIVA">🔴 SALIDA_DEFINITIVA — Fin de Jornada</option>
              </select>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2 mt-2 font-medium">
                ⚠️ Esto corrige únicamente este registro. Los marcajes siguientes del colaborador en el mismo día continuarán la secuencia desde el tipo corregido.
              </p>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditEventoRecord(null)}
                disabled={savingEdit}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEditTipoEvento}
                disabled={savingEdit || editNuevoTipo === editEventoRecord.tipo_evento}
                className="flex-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Aplicar Corrección</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMACIÓN: ELIMINAR REGISTRO ERRÓNEO ── */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 mx-auto shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="font-display font-black text-lg text-stone-900">
                ¿Eliminar marcaje erróneo?
              </h3>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Utiliza esto si un empleado tomó por error el carnet de un compañero o marcó por equivocación.
              </p>
            </div>

            <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex justify-between items-center border-b border-stone-200/60 pb-1.5">
                <span className="text-stone-500 font-bold uppercase text-[10px]">Colaborador:</span>
                <span className="font-black text-stone-800">
                  {recordToDelete.empleado_detalle.nombre} {recordToDelete.empleado_detalle.apellido}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-stone-200/60 pb-1.5">
                <span className="text-stone-500 font-bold uppercase text-[10px]">Evento:</span>
                <span className="font-bold text-stone-800">{recordToDelete.tipo_evento_display}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-bold uppercase text-[10px]">Fecha y Hora:</span>
                <span className="font-mono font-bold text-stone-700">
                  {new Date(recordToDelete.fecha_hora).toLocaleString('es-NI', {
                    hour12: true,
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-center font-medium">
              ⚠️ Al borrar este registro, el colaborador correcto podrá acercarse al Kiosco y registrar su marcaje real sin conflictos.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={deletingRecord}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingRecord}
                className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {deletingRecord ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Borrando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sí, Eliminar Marcaje</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
