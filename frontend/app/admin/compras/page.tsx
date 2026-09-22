'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
  CompraGasto,
  JornadaDiaria,
  CategoriaGastoType,
  MetodoPagoType,
  EstadoPagoType,
  CATEGORIAS_GASTO,
} from '@/lib/compras-types';
import {
  Plus,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  Banknote,
  Send,
  Camera,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Check,
  X,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  TrendingDown,
  Wallet,
} from 'lucide-react';

export default function AdminComprasPage() {
  const [gastos, setGastos] = useState<CompraGasto[]>([]);
  const [jornadas, setJornadas] = useState<JornadaDiaria[]>([]);
  const [jornadaActiva, setJornadaActiva] = useState<JornadaDiaria | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'conectado' | 'conectando' | 'error'>('conectando');

  // Filtros
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  const [filtroFecha, setFiltroFecha] = useState(hoyStr);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [filtroMetodo, setFiltroMetodo] = useState<'TODOS' | 'EFECTIVO' | 'TRANSFERENCIA'>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PAGADO' | 'PENDIENTE_TRANSFERENCIA'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [showModalJornada, setShowModalJornada] = useState(false);
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);

  // Form Gasto
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGastoType>('CARNES');
  const [proveedor, setProveedor] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPagoType>('EFECTIVO');
  const [estadoPago, setEstadoPago] = useState<EstadoPagoType>('PAGADO');
  const [referenciaBanco, setReferenciaBanco] = useState('');
  const [registradoPor, setRegistradoPor] = useState('Administración PC');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Jornada (Abrir Turno)
  const [nuevoFondoInicial, setNuevoFondoInicial] = useState('1000.00');
  const [nuevoTurno, setNuevoTurno] = useState<'ALMUERZO' | 'CENA' | 'COMPLETO'>('COMPLETO');
  const [nuevoResponsable, setNuevoResponsable] = useState('Caja Principal');
  const [creandoJornada, setCreandoJornada] = useState(false);

  // Cargar datos
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: jData }, { data: gData, error: gError }] = await Promise.all([
        supabase.from('jornadas_diarias').select('*').order('id', { ascending: false }).limit(30),
        supabase.from('compras_gastos').select('*').order('fecha_hora', { ascending: false }).limit(250),
      ]);

      if (gError) throw gError;

      const jList = (jData as JornadaDiaria[]) || [];
      setJornadas(jList);
      const activa = jList.find((j) => j.estado === 'ABIERTA') || null;
      setJornadaActiva(activa);
      setGastos((gData as CompraGasto[]) || []);
    } catch (err: any) {
      console.error('Error cargando compras:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Suscripción Realtime
  useEffect(() => {
    cargarDatos();

    const channel = supabase
      .channel('admin_compras_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'compras_gastos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const nuevo = payload.new as CompraGasto;
            setGastos((prev) => [nuevo, ...prev.filter((g) => g.id !== nuevo.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const actualizado = payload.new as CompraGasto;
            setGastos((prev) =>
              prev.map((g) => (g.id === actualizado.id ? actualizado : g))
            );
          } else if (payload.eventType === 'DELETE') {
            const borradoId = payload.old.id;
            setGastos((prev) => prev.filter((g) => g.id !== borradoId));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jornadas_diarias' },
        () => {
          cargarDatos();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('conectado');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cargarDatos]);

  // Manejo de foto
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        setFotoBase64(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Guardar Gasto
  const handleGuardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const montoNum = parseFloat(monto);
    if (!concepto.trim() || isNaN(montoNum) || montoNum <= 0) {
      setErrorMsg('Ingresa un concepto y un monto válido en C$.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('compras_gastos').insert([
        {
          jornada_id: jornadaActiva?.id || null,
          concepto: concepto.trim(),
          categoria,
          proveedor: proveedor.trim() || null,
          monto: montoNum,
          metodo_pago: metodoPago,
          estado_pago: metodoPago === 'TRANSFERENCIA' ? estadoPago : 'PAGADO',
          referencia_banco: referenciaBanco.trim() || null,
          foto_comprobante: fotoBase64,
          registrado_por: registradoPor.trim() || 'Administración',
        },
      ]);

      if (error) throw error;

      setConcepto('');
      setMonto('');
      setProveedor('');
      setReferenciaBanco('');
      setFotoBase64(null);
      setShowModalGasto(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando gasto.');
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir Nueva Jornada de Caja
  const handleCrearJornada = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreandoJornada(true);
    try {
      // Cerrar cualquier jornada abierta previa
      if (jornadaActiva) {
        await supabase
          .from('jornadas_diarias')
          .update({ estado: 'CERRADA', fecha_cierre: new Date().toISOString() })
          .eq('id', jornadaActiva.id);
      }

      const { error } = await supabase.from('jornadas_diarias').insert([
        {
          fecha: hoyStr,
          turno: nuevoTurno,
          estado: 'ABIERTA',
          fondo_inicial: parseFloat(nuevoFondoInicial) || 0,
          responsable: nuevoResponsable.trim() || 'Cajero',
        },
      ]);

      if (error) throw error;
      setShowModalJornada(false);
      cargarDatos();
    } catch (err: any) {
      alert('Error creando jornada: ' + err.message);
    } finally {
      setCreandoJornada(false);
    }
  };

  // Cerrar Jornada Actual
  const handleCerrarJornada = async () => {
    if (!jornadaActiva) return;
    const confirm = window.confirm(
      `¿Desea cerrar la jornada de caja actual (${jornadaActiva.turno} del ${jornadaActiva.fecha})?`
    );
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('jornadas_diarias')
        .update({
          estado: 'CERRADA',
          fecha_cierre: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jornadaActiva.id);

      if (error) throw error;
      cargarDatos();
    } catch (err: any) {
      alert('Error cerrando jornada: ' + err.message);
    }
  };

  // Eliminar gasto
  const handleEliminarGasto = async (g: CompraGasto) => {
    if (!window.confirm(`¿Eliminar gasto "${g.concepto}" por C$ ${g.monto}?`)) return;
    try {
      const { error } = await supabase.from('compras_gastos').delete().eq('id', g.id);
      if (error) throw error;
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Cambiar estado de transferencia a Pagado
  const handleToggleEstadoTransferencia = async (g: CompraGasto) => {
    const nuevoEstado = g.estado_pago === 'PAGADO' ? 'PENDIENTE_TRANSFERENCIA' : 'PAGADO';
    try {
      const { error } = await supabase
        .from('compras_gastos')
        .update({ estado_pago: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', g.id);
      if (error) throw error;
    } catch (err: any) {
      alert('Error actualizando estado: ' + err.message);
    }
  };

  // Filtrado de gastos
  const gastosFiltrados = useMemo(() => {
    return gastos.filter((g) => {
      const fechaGastoStr = g.fecha_hora.slice(0, 10);
      if (filtroFecha && fechaGastoStr !== filtroFecha) return false;
      if (filtroCategoria !== 'TODAS' && g.categoria !== filtroCategoria) return false;
      if (filtroMetodo !== 'TODOS' && g.metodo_pago !== filtroMetodo) return false;
      if (filtroEstado !== 'TODOS' && g.estado_pago !== filtroEstado) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const m1 = g.concepto.toLowerCase().includes(term);
        const m2 = g.proveedor?.toLowerCase().includes(term);
        const m3 = g.registrado_por.toLowerCase().includes(term);
        if (!m1 && !m2 && !m3) return false;
      }
      return true;
    });
  }, [gastos, filtroFecha, filtroCategoria, filtroMetodo, filtroEstado, searchTerm]);

  // Resumen métrico
  const metricas = useMemo(() => {
    let totEfectivo = 0;
    let totTransf = 0;
    let pendientesCount = 0;
    let pendientesMonto = 0;

    gastosFiltrados.forEach((g) => {
      const m = Number(g.monto) || 0;
      if (g.metodo_pago === 'EFECTIVO') totEfectivo += m;
      if (g.metodo_pago === 'TRANSFERENCIA') totTransf += m;
      if (g.estado_pago === 'PENDIENTE_TRANSFERENCIA') {
        pendientesCount++;
        pendientesMonto += m;
      }
    });

    const fondoCaja = Number(jornadaActiva?.fondo_inicial || 0);
    const saldoEfectivoRestante = fondoCaja - totEfectivo;

    return {
      total: totEfectivo + totTransf,
      efectivo: totEfectivo,
      transferencia: totTransf,
      pendientesCount,
      pendientesMonto,
      fondoCaja,
      saldoEfectivoRestante,
    };
  }, [gastosFiltrados, jornadaActiva]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── HEADER PRINCIPAL ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <span className="text-2xl">🥩</span>
              Compras y Gastos Diarios
            </h1>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                realtimeStatus === 'conectado'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  realtimeStatus === 'conectado' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {realtimeStatus === 'conectado' ? 'En Vivo (Supabase)' : 'Conectando'}
            </span>
          </div>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Gestión de caja chica, compras de insumos, carnes y sincronización instantánea con el móvil del jefe.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/compras"
            target="_blank"
            className="bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-600" />
            <span>Ver Modo Móvil</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>

          <button
            onClick={() => {
              setErrorMsg(null);
              setShowModalGasto(true);
            }}
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Gasto</span>
          </button>
        </div>
      </div>

      {/* ── SECCIÓN: CONTROL DE JORNADA / CAJA CHICA ── */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-stone-100 rounded-2xl p-4.5 shadow-sm border border-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xl shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base text-white">
                {jornadaActiva ? `Jornada Activa: Turno ${jornadaActiva.turno}` : 'No hay jornada abierta hoy'}
              </h3>
              {jornadaActiva ? (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  ABIERTA
                </span>
              ) : (
                <span className="bg-stone-700 text-stone-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  CERRADA
                </span>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              {jornadaActiva
                ? `Responsable: ${jornadaActiva.responsable} • Fecha: ${jornadaActiva.fecha}`
                : 'Inicia una nueva jornada para registrar egresos contra el fondo de caja.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-stone-800">
          {jornadaActiva && (
            <div className="text-right">
              <span className="text-[10px] text-stone-400 font-bold uppercase block">Fondo Inicial Caja</span>
              <span className="font-mono font-black text-amber-400 text-lg">
                C$ {Number(jornadaActiva.fondo_inicial).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {jornadaActiva ? (
              <button
                onClick={handleCerrarJornada}
                className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/80 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                Cerrar Jornada
              </button>
            ) : (
              <button
                onClick={() => setShowModalJornada(true)}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95"
              >
                Abrir Jornada de Hoy
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── TARJETAS KPI DE GASTOS DEL DÍA ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-stone-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Gastos</span>
            <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black font-mono text-stone-900">
              C$ {metricas.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-stone-400 mt-1">Efectivo + Transferencias</p>
        </div>

        <div className="bg-white border border-emerald-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
            <span>Efectivo (Caja)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black font-mono text-emerald-700">
              C$ {metricas.efectivo.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-emerald-600 mt-1">
            Saldo caja: C$ {metricas.saldoEfectivoRestante.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white border border-sky-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-sky-800 text-xs font-bold uppercase tracking-wider">
            <span>Transferencias</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black font-mono text-sky-700">
              C$ {metricas.transferencia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-sky-600 mt-1">Pagos bancarios emitidos</p>
        </div>

        <div className="bg-white border border-amber-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
            <span>Pendientes Transferir</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black font-mono text-amber-700">
              C$ {metricas.pendientesMonto.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-amber-600 mt-1">
            {metricas.pendientesCount} gasto{metricas.pendientesCount !== 1 ? 's' : ''} por confirmar
          </p>
        </div>
      </div>

      {/* ── BARRA DE FILTROS ── */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <label className="block text-[10px] text-stone-500 font-bold uppercase mb-1">Fecha</label>
              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-stone-500 font-bold uppercase mb-1">Categoría</label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900"
              >
                <option value="TODAS">Todas</option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-stone-500 font-bold uppercase mb-1">Método</label>
              <select
                value={filtroMetodo}
                onChange={(e) => setFiltroMetodo(e.target.value as any)}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900"
              >
                <option value="TODOS">Todos</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-stone-500 font-bold uppercase mb-1">Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as any)}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900"
              >
                <option value="TODOS">Todos</option>
                <option value="PAGADO">Pagado</option>
                <option value="PENDIENTE_TRANSFERENCIA">Pendiente de Transferir</option>
              </select>
            </div>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <label className="block text-[10px] text-stone-500 font-bold uppercase mb-1">Buscar</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Concepto o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-900"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
      </div>

      {/* ── TABLA DE COMPRAS & GASTOS ── */}
      <div className="bg-white border border-stone-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-bold">
                <th className="py-3 px-4">Hora</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Concepto / Detalle</th>
                <th className="py-3 px-4">Proveedor</th>
                <th className="py-3 px-4 text-right">Monto (C$)</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Registrado Por</th>
                <th className="py-3 px-4 text-center">Ticket</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {gastosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-stone-400">
                    No se encontraron gastos para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                gastosFiltrados.map((g) => {
                  const catConfig = CATEGORIAS_GASTO.find((c) => c.id === g.categoria) || {
                    emoji: '📝',
                    label: g.categoria,
                    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
                  };

                  const horaStr = new Date(g.fecha_hora).toLocaleTimeString('es-NI', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });

                  const esPendiente = g.estado_pago === 'PENDIENTE_TRANSFERENCIA';

                  return (
                    <tr
                      key={g.id}
                      className={`hover:bg-stone-50/70 transition-colors ${
                        esPendiente ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-stone-500">{horaStr}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${catConfig.badgeClass}`}
                        >
                          <span>{catConfig.emoji}</span>
                          <span>{catConfig.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-stone-900 max-w-xs truncate">
                        {g.concepto}
                        {g.referencia_banco && (
                          <span className="block text-[10px] text-stone-400 font-mono font-normal">
                            Ref: {g.referencia_banco}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {g.proveedor || <span className="text-stone-300">-</span>}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-stone-900 text-sm">
                        C$ {Number(g.monto).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            g.metodo_pago === 'EFECTIVO'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}
                        >
                          {g.metodo_pago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleEstadoTransferencia(g)}
                          title="Clic para cambiar estado"
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                            esPendiente
                              ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {esPendiente ? '⚠️ Falta Transferir' : '✓ Pagado'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-stone-500">{g.registrado_por}</td>
                      <td className="py-3 px-4 text-center">
                        {g.foto_comprobante ? (
                          <button
                            onClick={() => setFotoModalUrl(g.foto_comprobante!)}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-700 p-1 rounded-lg border border-stone-300 cursor-pointer"
                            title="Ver ticket de compra"
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-600" />
                          </button>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleEliminarGasto(g)}
                          className="text-stone-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: REGISTRAR GASTO EN PC ── */}
      {showModalGasto && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95">
            <div className="bg-[#1c6856] text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span>Registrar Gasto de Compra</span>
              </h3>
              <button onClick={() => setShowModalGasto(false)} className="text-emerald-100 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarGasto} className="p-5 space-y-4 text-xs">
              {errorMsg && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 p-2.5 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">Monto en C$ *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-sm text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Categoría</label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as any)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900"
                  >
                    {CATEGORIAS_GASTO.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Concepto / Detalle *</label>
                <input
                  type="text"
                  placeholder="Ej: 30 lbs carne de res para bistec..."
                  required
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">Proveedor</label>
                  <input
                    type="text"
                    placeholder="Ej: Distribuidora Central"
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Método de Pago</label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as any)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900"
                  >
                    <option value="EFECTIVO">Efectivo (Caja Chica)</option>
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  </select>
                </div>
              </div>

              {metodoPago === 'TRANSFERENCIA' && (
                <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200">
                  <div>
                    <label className="block text-stone-600 font-bold mb-1">Estado</label>
                    <select
                      value={estadoPago}
                      onChange={(e) => setEstadoPago(e.target.value as any)}
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5"
                    >
                      <option value="PAGADO">Ya Transferido</option>
                      <option value="PENDIENTE_TRANSFERENCIA">Pendiente de Transferir</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-600 font-bold mb-1">No. Referencia</label>
                    <input
                      type="text"
                      placeholder="BAC / LAFISE..."
                      value={referenciaBanco}
                      onChange={(e) => setReferenciaBanco(e.target.value)}
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-stone-700 font-bold mb-1">Ticket / Factura (Opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFotoChange}
                  className="w-full text-stone-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1c6856]/10 file:text-[#1c6856] hover:file:bg-[#1c6856]/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowModalGasto(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#1c6856] hover:bg-[#154f42] text-white px-5 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                >
                  {submitting ? 'Guardando...' : 'Registrar y Sincronizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ABRIR JORNADA ── */}
      {showModalJornada && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-stone-200 animate-in fade-in">
            <div className="bg-amber-600 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span>Apertura de Jornada de Caja</span>
              </h3>
              <button onClick={() => setShowModalJornada(false)} className="text-amber-100 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearJornada} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-stone-700 font-bold mb-1">Turno</label>
                <select
                  value={nuevoTurno}
                  onChange={(e) => setNuevoTurno(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900"
                >
                  <option value="ALMUERZO">Turno Almuerzo</option>
                  <option value="CENA">Turno Cena</option>
                  <option value="COMPLETO">Turno Completo (Todo el Día)</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Fondo Inicial de Caja Chica (C$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={nuevoFondoInicial}
                  onChange={(e) => setNuevoFondoInicial(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-sm text-stone-900"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Responsable</label>
                <input
                  type="text"
                  required
                  value={nuevoResponsable}
                  onChange={(e) => setNuevoResponsable(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowModalJornada(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoJornada}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-xl font-bold shadow-sm active:scale-95"
                >
                  {creandoJornada ? 'Iniciando...' : 'Iniciar Jornada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: VER COMPROBANTE ── */}
      {fotoModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setFotoModalUrl(null)}
        >
          <div className="relative max-w-xl w-full max-h-[90vh] bg-stone-950 rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setFotoModalUrl(null)}
              className="absolute top-3 right-3 bg-stone-800 text-white p-1.5 rounded-full z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={fotoModalUrl} alt="Comprobante" className="w-full h-auto max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
