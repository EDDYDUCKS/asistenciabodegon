'use client';

import React, { useEffect, useState } from 'react';
import { fetchEmpleados, fetchAsistencias } from '@/lib/api-client';
import { Empleado, RegistroAsistencia } from '@/lib/types';
import {
  Users,
  CheckCircle2,
  Sun,
  XCircle,
  Clock,
  RefreshCw,
  QrCode,
  ArrowRight,
  Utensils,
  TrendingUp,
  Coins,
  X,
  Copy,
  Check,
  Gavel,
} from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModalPropinas, setShowModalPropinas] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empList, asisList] = await Promise.all([
        fetchEmpleados(),
        fetchAsistencias(),
      ]);
      setEmpleados(empList);
      setAsistencias(asisList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtrar asistencias de hoy (Managua Nicaragua)
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  const asistenciasHoy = asistencias.filter(
    (a) => a.fecha_hora.startsWith(hoyStr)
  );

  // Determinar estado actual de cada empleado hoy (el primer registro en orden descendente es el más reciente)
  const estadoMap: Record<number, string> = {};
  asistenciasHoy.forEach((a) => {
    if (!estadoMap[a.empleado]) {
      estadoMap[a.empleado] = a.tipo_evento;
    }
  });

  const presentes = empleados.filter(
    (e) => e.activo && (estadoMap[e.id] === 'ENTRADA' || estadoMap[e.id] === 'ENTRADA_QUEBRADA')
  );
  const enQuebrada = empleados.filter(
    (e) => e.activo && estadoMap[e.id] === 'SALIDA_QUEBRADA'
  );
  const ausentes = empleados.filter((e) => e.activo && !estadoMap[e.id]);
  const totalActivos = empleados.filter((e) => e.activo).length;

  // Trabajadores que han llegado / registrado asistencia hoy (base para reparto de propinas)
  const llegaronHoy = empleados.filter((e) => e.activo && !!estadoMap[e.id]);

  const getPrimerMarcajeHoy = (empleadoId: number) => {
    const empMarcajes = asistenciasHoy.filter((a) => a.empleado === empleadoId);
    if (empMarcajes.length === 0) return null;
    return [...empMarcajes].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];
  };

  const getFotoHoy = (empleadoId: number) => {
    const withFoto = asistenciasHoy.find((a) => a.empleado === empleadoId && a.foto_verificacion_url);
    return withFoto?.foto_verificacion_url;
  };

  const copiarLista = () => {
    if (llegaronHoy.length === 0) return;
    const lineas = llegaronHoy.map((e, idx) => {
      const primer = getPrimerMarcajeHoy(e.id);
      const horaStr = primer
        ? ` (${new Date(primer.fecha_hora).toLocaleTimeString('es-NI', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })})`
        : '';
      return `${idx + 1}. ${e.nombre} ${e.apellido} - ${e.cargo_display}${horaStr}`;
    });
    const texto = `Personal Presente El Bodegón (${llegaronHoy.length}):\n` + lineas.join('\n');
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // Fecha de ayer para acceso directo al informe
  const ayerDate = new Date();
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayerDisplay = ayerDate.toLocaleDateString('es-NI', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Encabezado Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/60 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Utensils className="w-7 h-7 text-[#1c6856]" />
            Monitoreo en Vivo
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Asistencia en tiempo real de El Bodegón para el día de hoy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <Link
            href="/admin/rendimiento-ayer"
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-emerald-300" />
            <span>Rendimiento de Ayer</span>
            <span className="bg-white/20 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-md capitalize">
              {ayerDisplay}
            </span>
          </Link>

          <Link
            href="/admin/notificaciones"
            className="bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-200 text-stone-700 hover:text-rose-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
            title="Ir a Alertas y Sanciones Disciplinarias"
          >
            <Gavel className="w-3.5 h-3.5 text-rose-500" />
            <span>Sanciones y Alertas</span>
          </Link>

          <button
            onClick={loadData}
            disabled={loading}
            className="bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''} text-[#1c6856]`} />
            Actualizar Estado
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas de Hoy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Tarjeta Propinas: Llegaron Hoy (Clickable) */}
        <button
          type="button"
          onClick={() => setShowModalPropinas(true)}
          title="Toca para ver el desglose detallado de quiénes asistieron hoy"
          className="text-left glass-panel border border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-amber-50/30 rounded-3xl p-5 flex items-center justify-between gap-3 shadow-premium transition-all hover:scale-[1.02] hover:shadow-lg hover:border-amber-400 active:scale-[0.98] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-400/50"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100/90 border border-amber-200 rounded-2xl text-amber-700 shadow-sm group-hover:bg-amber-200 group-hover:text-amber-800 transition-colors">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800/80 block mb-0.5">
                Llegaron Hoy
              </span>
              <div className="text-2xl font-display font-black text-stone-900 leading-none">
                {llegaronHoy.length}
              </div>
              <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5 group-hover:underline">
                Toca para ver lista &rarr;
              </span>
            </div>
          </div>
        </button>

        <div className="glass-panel border border-white rounded-3xl p-5 flex items-center gap-4 shadow-premium">
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              Trabajando Ahora
            </span>
            <div className="text-2xl font-display font-black text-stone-900 leading-none">{presentes.length}</div>
            <span className="text-[10px] text-emerald-600 font-medium">Presentes en turno</span>
          </div>
        </div>

        <div className="glass-panel border border-white rounded-3xl p-5 flex items-center gap-4 shadow-premium">
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-amber-600">
            <Sun className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              En Quebrada
            </span>
            <div className="text-2xl font-display font-black text-stone-900 leading-none">{enQuebrada.length}</div>
            <span className="text-[10px] text-amber-600 font-medium">Horario dividido/pausa</span>
          </div>
        </div>

        <div className="glass-panel border border-white rounded-3xl p-5 flex items-center gap-4 shadow-premium">
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              Ausentes Hoy
            </span>
            <div className="text-2xl font-display font-black text-stone-900 leading-none">{ausentes.length}</div>
            <span className="text-[10px] text-rose-600 font-medium">Sin marcar entrada</span>
          </div>
        </div>

        <div className="glass-panel border border-white rounded-3xl p-5 flex items-center gap-4 shadow-premium">
          <div className="p-3 bg-[#1c6856]/5 border border-[#1c6856]/10 rounded-2xl text-[#1c6856]">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
              Personal Activo
            </span>
            <div className="text-2xl font-display font-black text-stone-900 leading-none">{totalActivos}</div>
            <span className="text-[10px] text-stone-500 font-medium">De {empleados.length} en total</span>
          </div>
        </div>
      </div>

      {/* Dos Columnas: Feed de Actividad vs Lista de Personal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Feed de Actividad Reciente */}
        <div className="lg:col-span-7 glass-panel rounded-3xl p-6 shadow-premium space-y-4 border border-white">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="font-black text-base text-stone-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#1c6856]" />
              Actividad Reciente (Hoy)
            </h2>
            <Link
              href="/admin/asistencia"
              className="text-xs font-bold text-[#1c6856] hover:underline flex items-center gap-1"
            >
              Ver Detalle <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {asistenciasHoy.length === 0 ? (
            <div className="py-16 text-center text-stone-400">
              <QrCode className="w-10 h-10 mx-auto mb-2 opacity-25 text-stone-500" />
              No se han registrado marcajes el día de hoy.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {asistenciasHoy.map((asis) => (
                <div
                  key={asis.id}
                  className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    {asis.foto_verificacion_url ? (
                      <img
                        src={asis.foto_verificacion_url}
                        alt="Foto"
                        className="w-10 h-10 rounded-lg object-cover border border-stone-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center font-bold text-sm">
                        {asis.empleado_detalle.nombre[0]}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-stone-900 text-xs">
                        {asis.empleado_detalle.nombre} {asis.empleado_detalle.apellido}
                      </h4>
                      <p className="text-[10px] text-stone-500 font-medium">
                        {asis.empleado_detalle.cargo_display}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-white border border-stone-200 text-stone-700">
                      {asis.tipo_evento_display}
                    </span>
                    <p className="text-[10px] text-stone-500 font-mono mt-1 font-bold">
                      {new Date(asis.fecha_hora).toLocaleTimeString('es-NI', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado Actual del Personal */}
        <div className="lg:col-span-5 glass-panel rounded-3xl p-6 shadow-premium space-y-4 border border-white">
          <h2 className="font-display font-black text-base text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-3">
            <Users className="w-5 h-5 text-[#1c6856]" />
            Plantilla Activa
          </h2>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {empleados
              .filter((emp) => emp.activo)
              .map((emp) => {
                const est = estadoMap[emp.id];
                let statusBadge = (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-250">
                    Sin Marcar
                  </span>
                );

                if (est === 'ENTRADA' || est === 'ENTRADA_QUEBRADA') {
                  statusBadge = (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      🟢 Turno
                    </span>
                  );
                } else if (est === 'SALIDA_QUEBRADA') {
                  statusBadge = (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      Pauser
                    </span>
                  );
                } else if (est === 'SALIDA_DEFINITIVA') {
                  statusBadge = (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-stone-50 text-stone-600 border border-stone-300">
                      Terminó
                    </span>
                  );
                }

                return (
                  <div
                    key={emp.id}
                    className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex items-center justify-between text-xs font-semibold"
                  >
                    <div>
                      <span className="font-bold text-stone-900">
                        {emp.nombre} {emp.apellido}
                      </span>
                      <span className="text-[10px] text-stone-500 block font-medium">{emp.cargo_display}</span>
                    </div>
                    {statusBadge}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Modal de Lista de Trabajadores que Llegaron Hoy (Propinas) */}
      {showModalPropinas && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setShowModalPropinas(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header con gradiente ámbar */}
            <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-white p-5 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-2xl text-white">
                  <Coins className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-black text-lg leading-tight">
                    Personal que Llegó Hoy
                  </h3>
                  <p className="text-xs text-amber-100 font-medium">
                    Base para división de propinas • {llegaronHoy.length}{' '}
                    {llegaronHoy.length === 1 ? 'colaborador' : 'colaboradores'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModalPropinas(false)}
                className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Listado de colaboradores */}
            <div className="p-5 overflow-y-auto space-y-2.5 flex-1 divide-y divide-stone-100">
              {llegaronHoy.length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <Coins className="w-12 h-12 mx-auto mb-2 opacity-30 text-amber-500" />
                  <p className="text-sm font-bold text-stone-600">
                    Aún no hay marcajes hoy
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    Cuando el personal registre su asistencia, aparecerán listados aquí.
                  </p>
                </div>
              ) : (
                llegaronHoy.map((emp, index) => {
                  const est = estadoMap[emp.id];
                  const primer = getPrimerMarcajeHoy(emp.id);
                  const foto = getFotoHoy(emp.id);

                  let statusText = 'En turno';
                  let statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  if (est === 'SALIDA_QUEBRADA') {
                    statusText = 'En Quebrada';
                    statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                  } else if (est === 'SALIDA_DEFINITIVA') {
                    statusText = 'Terminó Jornada';
                    statusBg = 'bg-stone-100 text-stone-600 border-stone-200';
                  }

                  return (
                    <div
                      key={emp.id}
                      className="pt-2.5 first:pt-0 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-stone-400 font-mono w-5">
                          #{index + 1}
                        </span>
                        {foto ? (
                          <img
                            src={foto}
                            alt="Foto"
                            className="w-10 h-10 rounded-xl object-cover border border-stone-200 shadow-xs"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 font-black text-sm flex items-center justify-center border border-amber-200 shadow-xs">
                            {emp.nombre[0]}
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold text-stone-900 text-xs sm:text-sm">
                            {emp.nombre} {emp.apellido}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 font-medium flex-wrap">
                            <span>{emp.cargo_display}</span>
                            {primer && (
                              <>
                                <span>•</span>
                                <span className="font-mono text-stone-600 font-semibold">
                                  Llegó:{' '}
                                  {new Date(primer.fecha_hora).toLocaleTimeString('es-NI', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true,
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusBg}`}
                        >
                          {statusText}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer con botón de copiar y cerrar */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={copiarLista}
                disabled={llegaronHoy.length === 0}
                className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-xs"
              >
                {copiado ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">¡Copiado al portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-stone-500" />
                    <span>Copiar Lista</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowModalPropinas(false)}
                className="bg-stone-900 hover:bg-stone-800 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
