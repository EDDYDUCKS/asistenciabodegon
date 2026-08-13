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
} from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asistencias, setAsistencias] = useState<RegistroAsistencia[]>([]);
  const [loading, setLoading] = useState(true);

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

        <button
          onClick={loadData}
          disabled={loading}
          className="bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''} text-[#1c6856]`} />
          Actualizar Estado
        </button>
      </div>

      {/* Tarjetas de Métricas de Hoy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
