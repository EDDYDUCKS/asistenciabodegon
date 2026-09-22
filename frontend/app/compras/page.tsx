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
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Banknote,
  Send,
  AlertCircle,
  X,
  Trash2,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Check,
} from 'lucide-react';

export default function ComprasMovilPage() {
  const [gastos, setGastos] = useState<CompraGasto[]>([]);
  const [jornadaActual, setJornadaActual] = useState<JornadaDiaria | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'conectado' | 'conectando' | 'error'>('conectando');

  // Filtros
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
  const [filtroFecha, setFiltroFecha] = useState<'HOY' | 'AYER' | 'SEMANA' | 'TODOS'>('HOY');
  const [filtroMetodo, setFiltroMetodo] = useState<'TODOS' | 'EFECTIVO' | 'TRANSFERENCIA' | 'PENDIENTES'>('TODOS');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Nuevo Gasto
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGastoType>('CARNES');
  const [proveedor, setProveedor] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPagoType>('EFECTIVO');
  const [estadoPago, setEstadoPago] = useState<EstadoPagoType>('PAGADO');
  const [referenciaBanco, setReferenciaBanco] = useState('');
  const [registradoPor, setRegistradoPor] = useState('Jefe / Gerencia');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal Ver Foto
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);

  // Modal Confirmar Transferencia
  const [gastoAConfirmar, setGastoAConfirmar] = useState<CompraGasto | null>(null);
  const [refConfirmacion, setRefConfirmacion] = useState('');
  const [confirmingTransf, setConfirmingTransf] = useState(false);

  // Cargar datos iniciales
  const cargarDatos = useCallback(async () => {
    try {
      // 1. Obtener jornada activa
      const { data: jornadas } = await supabase
        .from('jornadas_diarias')
        .select('*')
        .eq('estado', 'ABIERTA')
        .order('id', { ascending: false })
        .limit(1);

      if (jornadas && jornadas.length > 0) {
        setJornadaActual(jornadas[0]);
      }

      // 2. Obtener gastos
      const { data: gastosData, error } = await supabase
        .from('compras_gastos')
        .select('*')
        .order('fecha_hora', { ascending: false })
        .limit(150);

      if (error) throw error;
      setGastos((gastosData as CompraGasto[]) || []);
    } catch (err: any) {
      console.error('Error cargando gastos:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Suscripción Realtime en Supabase
  useEffect(() => {
    cargarDatos();

    const channel = supabase
      .channel('compras_realtime_channel')
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

  // Manejo de imagen de comprobante
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen es muy pesada. Máximo 5 MB.');
      return;
    }

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
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        setFotoBase64(compressedBase64);
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
    if (!concepto.trim()) {
      setErrorMsg('Ingresa el concepto o detalle del gasto.');
      return;
    }
    if (isNaN(montoNum) || montoNum <= 0) {
      setErrorMsg('Ingresa un monto válido mayor a C$ 0.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('compras_gastos').insert([
        {
          jornada_id: jornadaActual?.id || null,
          concepto: concepto.trim(),
          categoria,
          proveedor: proveedor.trim() || null,
          monto: montoNum,
          metodo_pago: metodoPago,
          estado_pago: metodoPago === 'TRANSFERENCIA' ? estadoPago : 'PAGADO',
          referencia_banco: referenciaBanco.trim() || null,
          foto_comprobante: fotoBase64,
          registrado_por: registradoPor.trim() || 'Jefe',
        },
      ]);

      if (error) throw error;

      // Limpiar formulario y cerrar
      setConcepto('');
      setMonto('');
      setProveedor('');
      setReferenciaBanco('');
      setFotoBase64(null);
      setShowModalGasto(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar el gasto.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirmar Transferencia
  const handleConfirmarTransferencia = async () => {
    if (!gastoAConfirmar) return;
    setConfirmingTransf(true);
    try {
      const { error } = await supabase
        .from('compras_gastos')
        .update({
          estado_pago: 'PAGADO',
          referencia_banco: refConfirmacion.trim() || gastoAConfirmar.referencia_banco || 'Confirmado por Jefe',
          updated_at: new Date().toISOString(),
        })
        .eq('id', gastoAConfirmar.id);

      if (error) throw error;
      setGastoAConfirmar(null);
      setRefConfirmacion('');
    } catch (err: any) {
      alert('Error confirmando transferencia: ' + err.message);
    } finally {
      setConfirmingTransf(false);
    }
  };

  // Eliminar gasto
  const handleEliminarGasto = async (g: CompraGasto) => {
    const confirm = window.confirm(
      `¿Deseas eliminar el gasto "${g.concepto}" por C$ ${Number(g.monto).toLocaleString('es-NI', { minimumFractionDigits: 2 })}?`
    );
    if (!confirm) return;

    try {
      const { error } = await supabase.from('compras_gastos').delete().eq('id', g.id);
      if (error) throw error;
    } catch (err: any) {
      alert('Error eliminando: ' + err.message);
    }
  };

  // Filtrado de gastos
  const ayerDate = new Date();
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayerStr = ayerDate.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });

  const gastosFiltrados = useMemo(() => {
    return gastos.filter((g) => {
      const fechaGastoStr = g.fecha_hora.slice(0, 10);

      // Filtro de fecha
      if (filtroFecha === 'HOY' && fechaGastoStr !== hoyStr) return false;
      if (filtroFecha === 'AYER' && fechaGastoStr !== ayerStr) return false;
      if (filtroFecha === 'SEMANA') {
        const d = new Date(g.fecha_hora);
        const hoy = new Date();
        const diffDays = (hoy.getTime() - d.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      }

      // Filtro de método / estado
      if (filtroMetodo === 'EFECTIVO' && g.metodo_pago !== 'EFECTIVO') return false;
      if (filtroMetodo === 'TRANSFERENCIA' && g.metodo_pago !== 'TRANSFERENCIA') return false;
      if (filtroMetodo === 'PENDIENTES' && g.estado_pago !== 'PENDIENTE_TRANSFERENCIA') return false;

      // Filtro de categoría
      if (filtroCategoria !== 'TODAS' && g.categoria !== filtroCategoria) return false;

      // Búsqueda de texto
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchConcepto = g.concepto.toLowerCase().includes(term);
        const matchProveedor = g.proveedor?.toLowerCase().includes(term);
        const matchReg = g.registrado_por.toLowerCase().includes(term);
        if (!matchConcepto && !matchProveedor && !matchReg) return false;
      }

      return true;
    });
  }, [gastos, filtroFecha, filtroMetodo, filtroCategoria, searchTerm, hoyStr, ayerStr]);

  // Cálculos de resumen
  const resumen = useMemo(() => {
    let totEfectivo = 0;
    let totTransferencia = 0;
    let pendientesTransf = 0;
    let montoPendiente = 0;

    gastosFiltrados.forEach((g) => {
      const m = Number(g.monto) || 0;
      if (g.metodo_pago === 'EFECTIVO') {
        totEfectivo += m;
      } else if (g.metodo_pago === 'TRANSFERENCIA') {
        totTransferencia += m;
      }
      if (g.estado_pago === 'PENDIENTE_TRANSFERENCIA') {
        pendientesTransf += 1;
        montoPendiente += m;
      }
    });

    return {
      total: totEfectivo + totTransferencia,
      efectivo: totEfectivo,
      transferencia: totTransferencia,
      pendientesCount: pendientesTransf,
      montoPendiente,
    };
  }, [gastosFiltrados]);

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col font-sans pb-24">
      {/* ── HEADER MÓVIL PRINCIPAL ── */}
      <header className="sticky top-0 z-30 bg-stone-950/95 backdrop-blur-md border-b border-stone-800 px-4 py-3 shadow-md">
        <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-white font-black shadow-sm text-sm">
              🥩
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm text-white tracking-tight">El Bodegón</h1>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/70 border border-amber-800/80 px-1.5 py-0.2 rounded">
                  Compras & Gastos
                </span>
              </div>
              <p className="text-[10px] text-stone-400 flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full inline-block ${
                    realtimeStatus === 'conectado'
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-amber-400'
                  }`}
                />
                {realtimeStatus === 'conectado' ? 'Sincronizado en Vivo' : 'Conectando...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-[11px] font-bold text-stone-300 bg-stone-800 hover:bg-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-700 flex items-center gap-1 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Portal</span>
            </Link>
            <button
              onClick={cargarDatos}
              className="p-1.5 text-stone-400 hover:text-white bg-stone-800/80 rounded-lg border border-stone-700/80 active:scale-95 transition-all"
              title="Actualizar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-3 max-w-2xl mx-auto w-full space-y-3.5">
        {/* ── ALERTA DE TRANSFERENCIAS PENDIENTES DE PAGO ── */}
        {resumen.pendientesCount > 0 && (
          <div className="bg-gradient-to-r from-amber-500/15 via-amber-600/10 to-amber-500/15 border border-amber-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-200">
                  {resumen.pendientesCount} gasto{resumen.pendientesCount !== 1 ? 's' : ''} pendiente{resumen.pendientesCount !== 1 ? 's' : ''} de transferir
                </p>
                <p className="text-xs font-mono font-black text-amber-400">
                  C$ {resumen.montoPendiente.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <button
              onClick={() => setFiltroMetodo('PENDIENTES')}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 py-1.5 rounded-xl font-bold text-[11px] shadow-sm active:scale-95 transition-all shrink-0"
            >
              Ver cuáles
            </button>
          </div>
        )}

        {/* ── KPI CARD PRINCIPAL: GASTOS TOTALES ── */}
        <div className="bg-gradient-to-br from-stone-800 to-stone-850 border border-stone-700/80 rounded-3xl p-4.5 shadow-md">
          <div className="flex items-center justify-between text-stone-400 text-xs font-semibold">
            <span>Total Compras ({filtroFecha === 'HOY' ? 'Hoy' : filtroFecha})</span>
            {jornadaActual ? (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Caja {jornadaActual.turno}
              </span>
            ) : (
              <span className="text-[10px] text-stone-500">Sin caja abierta</span>
            )}
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              C$ {resumen.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Desglose Efectivo vs Transferencia */}
          <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-stone-700/70 text-xs">
            <div className="bg-stone-900/60 border border-stone-750 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 text-stone-400 text-[11px]">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <span>En Efectivo (Caja)</span>
              </div>
              <p className="font-mono font-bold text-emerald-400 text-sm mt-1">
                C$ {resumen.efectivo.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-stone-900/60 border border-stone-750 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 text-stone-400 text-[11px]">
                <Send className="w-3.5 h-3.5 text-sky-400" />
                <span>Por Transferencia</span>
              </div>
              <p className="font-mono font-bold text-sky-400 text-sm mt-1">
                C$ {resumen.transferencia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* ── SELECTOR RÁPIDO DE FECHA (PILLS) ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(['HOY', 'AYER', 'SEMANA', 'TODOS'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroFecha(f)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer active:scale-95 ${
                filtroFecha === f
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'bg-stone-800 text-stone-400 border border-stone-750 hover:text-white'
              }`}
            >
              {f === 'HOY' ? '📅 Hoy' : f === 'AYER' ? 'Ayer' : f === 'SEMANA' ? 'Últimos 7 días' : 'Historial'}
            </button>
          ))}
        </div>

        {/* ── BARRA DE BÚSQUEDA Y FILTRO RÁPIDO ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar gasto, proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700/80 rounded-xl pl-9 pr-7 py-2 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="bg-stone-800 border border-stone-700/80 rounded-xl px-2.5 py-2 text-xs text-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="TODAS">Todas las Categorías</option>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── FEED DE GASTOS EN VIVO ── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-stone-400 font-semibold px-1">
            <span>Registros ({gastosFiltrados.length})</span>
            <span>{filtroMetodo !== 'TODOS' ? `Filtro: ${filtroMetodo}` : ''}</span>
          </div>

          {gastosFiltrados.length === 0 ? (
            <div className="bg-stone-850 border border-stone-800 rounded-2xl p-8 text-center text-stone-400 text-xs">
              <span className="text-3xl block mb-2">🛒</span>
              <p className="font-bold text-stone-300">No hay compras registradas para este filtro.</p>
              <p className="text-[11px] text-stone-500 mt-1">
                Toca el botón amarillo de abajo para registrar el primer gasto del día.
              </p>
            </div>
          ) : (
            gastosFiltrados.map((g) => {
              const catConfig = CATEGORIAS_GASTO.find((c) => c.id === g.categoria) || {
                emoji: '📝',
                label: g.categoria,
                badgeClass: 'bg-stone-800 text-stone-300 border-stone-700',
              };

              const horaGasto = new Date(g.fecha_hora).toLocaleTimeString('es-NI', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });

              const esPendiente = g.estado_pago === 'PENDIENTE_TRANSFERENCIA';

              return (
                <div
                  key={g.id}
                  className={`bg-stone-850 border rounded-2xl p-3.5 transition-all shadow-sm ${
                    esPendiente
                      ? 'border-amber-500/70 bg-gradient-to-r from-stone-850 via-amber-950/20 to-stone-850'
                      : 'border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-lg shrink-0">
                        {catConfig.emoji}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-white truncate">{g.concepto}</h3>
                        <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                          {g.proveedor && <span className="text-stone-300 font-medium">{g.proveedor} •</span>}
                          <span>{horaGasto}</span>
                          <span>• por {g.registrado_por}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-black text-white text-base block">
                        C$ {Number(g.monto).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border mt-1 ${
                          g.metodo_pago === 'EFECTIVO'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                            : esPendiente
                            ? 'bg-amber-950/80 text-amber-400 border-amber-800 animate-pulse'
                            : 'bg-sky-950/80 text-sky-400 border-sky-800'
                        }`}
                      >
                        {g.metodo_pago === 'EFECTIVO'
                          ? 'Efectivo (Caja)'
                          : esPendiente
                          ? '⚠️ Falta Transferir'
                          : 'Transferido'}
                      </span>
                    </div>
                  </div>

                  {/* Acciones y Detalles Inferiores */}
                  <div className="mt-3 pt-2.5 border-t border-stone-800 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {g.foto_comprobante && (
                        <button
                          onClick={() => setFotoModalUrl(g.foto_comprobante!)}
                          className="bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95"
                        >
                          <Camera className="w-3 h-3 text-amber-400" />
                          <span>Ver Ticket</span>
                        </button>
                      )}
                      {g.referencia_banco && (
                        <span className="text-[10px] font-mono text-stone-400 bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                          Ref: {g.referencia_banco}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {esPendiente && (
                        <button
                          onClick={() => {
                            setGastoAConfirmar(g);
                            setRefConfirmacion('');
                          }}
                          className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Marcar Transferido</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleEliminarGasto(g)}
                        className="text-stone-500 hover:text-rose-400 p-1 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ── BOTÓN FLOTANTE PRINCIPAL: REGISTRAR COMPRA / GASTO ── */}
      <div className="fixed bottom-4 left-0 right-0 z-40 px-4 max-w-2xl mx-auto flex justify-center">
        <button
          onClick={() => {
            setErrorMsg(null);
            setShowModalGasto(true);
          }}
          className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-105 text-stone-950 font-black text-sm py-3.5 px-6 rounded-2xl shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>+ Registrar Compra o Gasto</span>
        </button>
      </div>

      {/* ── MODAL: REGISTRAR GASTO RÁPIDO ── */}
      {showModalGasto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 text-stone-100 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛒</span>
                <h2 className="font-bold text-base text-white">Nuevo Gasto / Compra</h2>
              </div>
              <button
                onClick={() => setShowModalGasto(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarGasto} className="space-y-4 pt-3.5 text-xs">
              {errorMsg && (
                <div className="bg-rose-950/80 border border-rose-800 text-rose-300 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Monto Grande en C$ */}
              <div>
                <label className="block text-stone-400 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  Monto en Córdobas (C$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-lg text-amber-400">
                    C$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    autoFocus
                    required
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-2xl pl-12 pr-4 py-3 text-2xl font-mono font-black text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-stone-400 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  ¿Qué se compró? (Detalle) *
                </label>
                <input
                  type="text"
                  placeholder="Ej: 30 lbs pechuga de pollo, 2 sacos de cebolla..."
                  required
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Selector de Categoría por Chips */}
              <div>
                <label className="block text-stone-400 font-bold mb-1.5 uppercase tracking-wider text-[10px]">
                  Categoría
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {CATEGORIAS_GASTO.map((cat) => {
                    const selected = categoria === cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategoria(cat.id)}
                        className={`p-2 rounded-xl border text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                          selected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        <span className="text-base">{cat.emoji}</span>
                        <span className="text-[11px] truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Método de Pago */}
              <div>
                <label className="block text-stone-400 font-bold mb-1.5 uppercase tracking-wider text-[10px]">
                  Método de Pago
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMetodoPago('EFECTIVO');
                      setEstadoPago('PAGADO');
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      metodoPago === 'EFECTIVO'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : 'bg-stone-950 border-stone-800 text-stone-400'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Efectivo (Caja)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMetodoPago('TRANSFERENCIA');
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      metodoPago === 'TRANSFERENCIA'
                        ? 'bg-sky-950/80 border-sky-500 text-sky-300'
                        : 'bg-stone-950 border-stone-800 text-stone-400'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    <span>Transferencia</span>
                  </button>
                </div>
              </div>

              {/* Opciones si es Transferencia */}
              {metodoPago === 'TRANSFERENCIA' && (
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-2.5">
                  <label className="block text-stone-400 font-bold uppercase tracking-wider text-[10px]">
                    Estado de la Transferencia
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEstadoPago('PAGADO')}
                      className={`py-2 px-2.5 rounded-lg font-bold border text-center ${
                        estadoPago === 'PAGADO'
                          ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                          : 'bg-stone-900 border-stone-800 text-stone-500'
                      }`}
                    >
                      ✓ Ya Transferido
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstadoPago('PENDIENTE_TRANSFERENCIA')}
                      className={`py-2 px-2.5 rounded-lg font-bold border text-center ${
                        estadoPago === 'PENDIENTE_TRANSFERENCIA'
                          ? 'bg-amber-950 border-amber-600 text-amber-300'
                          : 'bg-stone-900 border-stone-800 text-stone-500'
                      }`}
                    >
                      ⏳ Falta Transferir
                    </button>
                  </div>

                  <div>
                    <label className="block text-stone-500 text-[10px] mb-1">
                      Banco / No. Referencia (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: BAC 98402, LAFISE, etc."
                      value={referenciaBanco}
                      onChange={(e) => setReferenciaBanco(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {/* Proveedor y Registrado Por */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-400 font-bold mb-1 uppercase tracking-wider text-[10px]">
                    Proveedor / Negocio
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Carnicería El Torito"
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-400 font-bold mb-1 uppercase tracking-wider text-[10px]">
                    Registrado Por
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Jefe, Eddy, Cocinero"
                    value={registradoPor}
                    onChange={(e) => setRegistradoPor(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Foto Comprobante / Ticket */}
              <div>
                <label className="block text-stone-400 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  Foto de Factura / Ticket (Opcional)
                </label>
                {fotoBase64 ? (
                  <div className="relative rounded-xl overflow-hidden border border-stone-700 max-h-36 bg-black">
                    <img src={fotoBase64} alt="Ticket" className="w-full h-36 object-contain" />
                    <button
                      type="button"
                      onClick={() => setFotoBase64(null)}
                      className="absolute top-2 right-2 bg-rose-600 text-white p-1 rounded-lg text-xs"
                    >
                      Quitar Foto
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-stone-700 hover:border-amber-500/80 rounded-xl p-3 flex flex-col items-center justify-center gap-1 text-stone-400 cursor-pointer bg-stone-950">
                    <Camera className="w-5 h-5 text-amber-400" />
                    <span className="text-[11px] font-bold">Tomar foto o subir comprobante</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFotoChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Botón de Enviar */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-black py-3 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Guardar y Publicar en Vivo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMAR TRANSFERENCIA ── */}
      {gastoAConfirmar && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-sm p-4 text-stone-100 shadow-2xl space-y-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" />
              <span>Confirmar Transferencia Bancaria</span>
            </h3>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs space-y-1">
              <p className="text-stone-400">Concepto: <strong className="text-white">{gastoAConfirmar.concepto}</strong></p>
              <p className="text-stone-400">Monto: <strong className="font-mono text-emerald-400 font-bold text-sm">C$ {Number(gastoAConfirmar.monto).toFixed(2)}</strong></p>
              {gastoAConfirmar.proveedor && <p className="text-stone-400">Proveedor: <span className="text-stone-300">{gastoAConfirmar.proveedor}</span></p>}
            </div>

            <div>
              <label className="block text-[11px] text-stone-400 font-bold mb-1">
                Número de Referencia / Banco (Opcional):
              </label>
              <input
                type="text"
                placeholder="Ej: BAC 1029482..."
                value={refConfirmacion}
                onChange={(e) => setRefConfirmacion(e.target.value)}
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setGastoAConfirmar(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-stone-400 hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarTransferencia}
                disabled={confirmingTransf}
                className="bg-sky-500 hover:bg-sky-400 text-stone-950 px-4 py-1.5 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 active:scale-95"
              >
                {confirmingTransf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Confirmar Pago</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: VER COMPROBANTE / FOTO ── */}
      {fotoModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 cursor-pointer"
          onClick={() => setFotoModalUrl(null)}
        >
          <div className="relative max-w-lg w-full max-h-[90vh] bg-stone-950 rounded-2xl overflow-hidden p-2">
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
