'use client';

import React, { useEffect, useState } from 'react';
import { RegistroAsistencia } from '@/lib/types';
import { fetchAsistencias } from '@/lib/api-client';
import {
  CalendarCheck,
  RefreshCw,
  Search,
  Image as ImageIcon,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
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
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAsistencias();
      setAsistencias(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

        <button
          onClick={loadData}
          disabled={loading}
          className="bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''} text-[#1c6856]`} />
          Actualizar Historial
        </button>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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
    </div>
  );
}
