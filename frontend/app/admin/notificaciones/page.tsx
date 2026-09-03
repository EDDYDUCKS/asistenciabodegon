'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AlertaAsistencia } from '@/lib/types';
import {
  fetchAlertas,
  updateAlerta,
  resolverAlerta,
  marcarTodasAlertasLeidas,
} from '@/lib/api-client';
import BoletaIncidenciaModal from '@/components/BoletaIncidenciaModal';
import {
  Bell,
  Search,
  Printer,
  Check,
  AlertTriangle,
  Clock,
  CalendarCheck,
  UserX,
  RefreshCw,
  FileText,
  Filter,
} from 'lucide-react';

type FiltroTipo = 'TODAS' | 'SEGUNDA_AUSENCIA' | 'TARDANZA' | 'REGISTRO_INCOMPLETO' | 'LEIDAS';

export default function NotificacionesDetalladasPage() {
  const [alertas, setAlertas] = useState<AlertaAsistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODAS');
  const [search, setSearch] = useState('');
  const [selectedAlerta, setSelectedAlerta] = useState<AlertaAsistencia | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAlertas();
      setAlertas(data);
    } catch (e) {
      console.error('Error cargando alertas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolver = async (id: number, decision: 'JUSTIFICAR' | 'SUMAR_DEUDA') => {
    setProcessingId(id);
    try {
      await resolverAlerta(id, decision);
      await loadData();
    } catch (e) {
      console.error(e);
      alert('Error al resolver alerta');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await updateAlerta(id, { leida: true });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarcarTodas = async () => {
    if (!confirm('¿Desea marcar todas las notificaciones como leídas?')) return;
    try {
      await marcarTodasAlertasLeidas();
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // Contadores por tipo
  const counts = useMemo(() => {
    return {
      todas: alertas.length,
      ausencias: alertas.filter((a) => a.tipo === 'SEGUNDA_AUSENCIA').length,
      tardanzas: alertas.filter((a) => a.tipo === 'TARDANZA' || a.tipo === 'SALIDA_ANTICIPADA').length,
      incompletos: alertas.filter((a) => a.tipo === 'REGISTRO_INCOMPLETO').length,
      leidas: alertas.filter((a) => a.leida).length,
      pendientes: alertas.filter((a) => !a.leida).length,
    };
  }, [alertas]);

  // Filtrado de la lista
  const filteredAlertas = useMemo(() => {
    return alertas.filter((al) => {
      // Filtro por tab
      if (filtroTipo === 'SEGUNDA_AUSENCIA' && al.tipo !== 'SEGUNDA_AUSENCIA') return false;
      if (filtroTipo === 'TARDANZA' && al.tipo !== 'TARDANZA' && al.tipo !== 'SALIDA_ANTICIPADA') return false;
      if (filtroTipo === 'REGISTRO_INCOMPLETO' && al.tipo !== 'REGISTRO_INCOMPLETO') return false;
      if (filtroTipo === 'LEIDAS' && !al.leida) return false;

      // Filtro por buscador
      if (search.trim()) {
        const q = search.toLowerCase();
        const empName = al.empleado_detalle ? `${al.empleado_detalle.nombre} ${al.empleado_detalle.apellido}`.toLowerCase() : '';
        const titulo = al.titulo.toLowerCase();
        const mensaje = al.mensaje.toLowerCase();
        return empName.includes(q) || titulo.includes(q) || mensaje.includes(q);
      }

      return true;
    });
  }, [alertas, filtroTipo, search]);

  const getTipoStyle = (tipo: string, leida: boolean) => {
    if (leida) {
      return {
        badge: 'bg-stone-100 text-stone-600 border-stone-200',
        border: 'border-stone-200 bg-white/80 opacity-80',
        label: 'Resuelta / Leída',
      };
    }
    switch (tipo) {
      case 'SEGUNDA_AUSENCIA':
        return {
          badge: 'bg-purple-100 text-purple-800 border-purple-200',
          border: 'border-purple-200 bg-purple-50/20 shadow-xs',
          label: 'Segunda Ausencia Semanal',
        };
      case 'TARDANZA':
        return {
          badge: 'bg-rose-100 text-rose-800 border-rose-200',
          border: 'border-rose-200 bg-rose-50/20 shadow-xs',
          label: 'Llegada Tardía',
        };
      case 'REGISTRO_INCOMPLETO':
        return {
          badge: 'bg-orange-100 text-orange-800 border-orange-200',
          border: 'border-orange-200 bg-orange-50/20 shadow-xs',
          label: 'Registro Incompleto',
        };
      default:
        return {
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
          border: 'border-amber-200 bg-amber-50/20 shadow-xs',
          label: 'Aviso Operativo',
        };
    }
  };

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#1c6856]/10 text-[#1c6856] flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            Notificaciones Detalladas
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Historial permanente de incidencias, ausencias de 2 días y emisión de actas para expediente físico.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {counts.pendientes > 0 && (
            <button
              onClick={handleMarcarTodas}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Marcar Todo Leído
            </button>
          )}

          <button
            onClick={loadData}
            className="bg-[#1c6856]/10 border border-[#1c6856]/20 hover:bg-[#1c6856]/20 text-[#1c6856] px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Buscador */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-3 sm:p-4 rounded-2xl border border-stone-200 shadow-xs">
        {/* Pestañas de Filtro */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltroTipo('TODAS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroTipo === 'TODAS'
                ? 'bg-[#1c6856] text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Todas ({counts.todas})
          </button>

          <button
            onClick={() => setFiltroTipo('SEGUNDA_AUSENCIA')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroTipo === 'SEGUNDA_AUSENCIA'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            Ausencias Consecutivas ({counts.ausencias})
          </button>

          <button
            onClick={() => setFiltroTipo('TARDANZA')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroTipo === 'TARDANZA'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Tardanzas ({counts.tardanzas})
          </button>

          <button
            onClick={() => setFiltroTipo('REGISTRO_INCOMPLETO')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroTipo === 'REGISTRO_INCOMPLETO'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Incompletos ({counts.incompletos})
          </button>

          <button
            onClick={() => setFiltroTipo('LEIDAS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroTipo === 'LEIDAS'
                ? 'bg-stone-700 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            Resueltas / Leídas ({counts.leidas})
          </button>
        </div>

        {/* Buscador */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por empleado o motivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1c6856]/20 focus:border-[#1c6856]"
          />
        </div>
      </div>

      {/* Listado de Notificaciones */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center text-stone-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#1c6856]" />
          <p className="text-xs font-bold">Cargando notificaciones detalladas...</p>
        </div>
      ) : filteredAlertas.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center text-stone-400 space-y-3">
          <CalendarCheck className="w-12 h-12 mx-auto text-stone-300" />
          <h3 className="text-sm font-black text-stone-700">No hay notificaciones en este filtro</h3>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            {search
              ? 'No se encontraron resultados para la búsqueda ingresada.'
              : 'Todo el personal se encuentra al día sin incidencias pendientes de revisión.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlertas.map((al) => {
            const style = getTipoStyle(al.tipo, al.leida);
            const fechaStr = al.created_at
              ? new Date(al.created_at).toLocaleDateString('es-NI', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';

            return (
              <div
                key={al.id}
                className={`border rounded-2xl p-4 sm:p-5 transition-all ${style.border}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Contenido Principal */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${style.badge}`}
                      >
                        {style.label}
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">
                        REF #{String(al.id).padStart(5, '0')}
                      </span>
                      <span className="text-[11px] font-medium text-stone-400">• {fechaStr}</span>
                    </div>

                    <div>
                      <h3 className="text-sm font-black text-stone-900 leading-tight">
                        {al.titulo}
                      </h3>
                      {al.empleado_detalle && (
                        <p className="text-xs font-bold text-[#1c6856] mt-0.5">
                          Colaborador: {al.empleado_detalle.nombre} {al.empleado_detalle.apellido}{' '}
                          <span className="text-stone-400 font-normal">({al.empleado_detalle.cargo_display})</span>
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-stone-700 leading-relaxed font-normal bg-white/60 p-3 rounded-xl border border-stone-200/60">
                      {al.mensaje}
                    </p>
                  </div>

                  {/* Acciones y Botones */}
                  <div className="flex flex-col sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                    <button
                      onClick={() => setSelectedAlerta(al)}
                      className="bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs hover:border-[#1c6856] hover:text-[#1c6856] active:scale-95"
                      title="Imprimir Acta Oficial para el Expediente Físico"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#1c6856]" />
                      Imprimir Boleta Oficial
                    </button>

                    {/* Acciones interactivas para Segunda Ausencia */}
                    {!al.leida && al.tipo === 'SEGUNDA_AUSENCIA' && (
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          disabled={processingId === al.id}
                          onClick={() => handleResolver(al.id!, 'JUSTIFICAR')}
                          className="flex-1 sm:flex-initial bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          ✅ Justificar
                        </button>
                        <button
                          disabled={processingId === al.id}
                          onClick={() => handleResolver(al.id!, 'SUMAR_DEUDA')}
                          className="flex-1 sm:flex-initial bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
                        >
                          ⏳ Sumar 8h Deuda
                        </button>
                      </div>
                    )}

                    {!al.leida && al.tipo !== 'SEGUNDA_AUSENCIA' && (
                      <button
                        onClick={() => handleMarkAsRead(al.id!)}
                        className="text-[11px] font-bold text-stone-500 hover:text-stone-800 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors flex items-center gap-1 self-end"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Marcar Leída
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Emisión de Boleta Oficial para Expediente Físico */}
      <BoletaIncidenciaModal
        alerta={selectedAlerta}
        onClose={() => setSelectedAlerta(null)}
      />
    </div>
  );
}
