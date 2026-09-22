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
  Lock,
  Landmark,
  ShoppingBag,
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  User,
} from 'lucide-react';
import PinSecurityGate from '@/components/PinSecurityGate';

export default function ComprasMovilPage() {
  const [tabEjecutiva, setTabEjecutiva] = useState<'CAJA_CHICA' | 'CAJA_GENERAL'>('CAJA_CHICA');
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

  // Modal 1: Reportar Compra de Gerencia
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGastoType>('CARNES');
  const [proveedor, setProveedor] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPagoType>('TRANSFERENCIA');
  const [estadoPago, setEstadoPago] = useState<EstadoPagoType>('PAGADO');
  const [referenciaBanco, setReferenciaBanco] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [submittingGasto, setSubmittingGasto] = useState(false);
  const [errorMsgGasto, setErrorMsgGasto] = useState<string | null>(null);

  // Modal 2: Reportar Depósito / Inyección a Caja Chica (Fondeo)
  const [showModalFondeo, setShowModalFondeo] = useState(false);
  const [montoFondeo, setMontoFondeo] = useState('');
  const [metodoFondeo, setMetodoFondeo] = useState<'TRANSFERENCIA' | 'EFECTIVO'>('TRANSFERENCIA');
  const [bancoFondeo, setBancoFondeo] = useState('BAC Credomatic');
  const [notaFondeo, setNotaFondeo] = useState('');
  const [submittingFondeo, setSubmittingFondeo] = useState(false);
  const [errorMsgFondeo, setErrorMsgFondeo] = useState<string | null>(null);

  // Modal Ver Foto
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);

  // Modal Confirmar Transferencia
  const [gastoAConfirmar, setGastoAConfirmar] = useState<CompraGasto | null>(null);
  const [refConfirmacion, setRefConfirmacion] = useState('');
  const [confirmingTransf, setConfirmingTransf] = useState(false);

  // Cargar datos iniciales
  const cargarDatos = useCallback(async () => {
    try {
      // 1. Obtener última jornada registrada
      const { data: jornadas } = await supabase
        .from('jornadas_diarias')
        .select('*')
        .order('id', { ascending: false })
        .limit(1);

      if (jornadas && jornadas.length > 0) {
        setJornadaActual(jornadas[0]);
      } else {
        setJornadaActual(null);
      }

      // 2. Obtener gastos y compras
      const { data: gastosData, error } = await supabase
        .from('compras_gastos')
        .select('*')
        .order('fecha_hora', { ascending: false })
        .limit(150);

      if (error) throw error;
      setGastos((gastosData as CompraGasto[]) || []);
    } catch (err: any) {
      console.error('Error cargando datos de compras:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Suscripción en Tiempo Real con Supabase
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
      const img = document.createElement('img');
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
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setFotoBase64(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 1. Guardar Compra del Jefe
  const handleSubmitGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsgGasto(null);

    const m = parseFloat(monto);
    if (isNaN(m) || m <= 0) {
      setErrorMsgGasto('Ingrese un monto válido mayor a 0');
      return;
    }
    if (!concepto.trim()) {
      setErrorMsgGasto('El concepto o detalle es requerido');
      return;
    }

    setSubmittingGasto(true);
    try {
      const nuevoGasto = {
        jornada_id: jornadaActual?.id || null,
        fecha_hora: new Date().toISOString(),
        concepto: concepto.trim(),
        categoria,
        proveedor: proveedor.trim() || null,
        monto: m,
        tipo: 'EGRESO',
        metodo_pago: metodoPago,
        estado_pago: estadoPago,
        foto_comprobante: fotoBase64,
        referencia_banco: referenciaBanco.trim() || null,
        registrado_por: 'Jefe / Gerencia',
        observaciones: 'Compra reportada desde Móvil Gerencial',
      };

      const { data, error } = await supabase.from('compras_gastos').insert(nuevoGasto).select().single();
      if (error) throw error;

      if (data) {
        setGastos((prev) => [data as CompraGasto, ...prev]);
      }

      setConcepto('');
      setMonto('');
      setProveedor('');
      setReferenciaBanco('');
      setFotoBase64(null);
      setShowModalGasto(false);
    } catch (err: any) {
      setErrorMsgGasto('Error al registrar compra: ' + err.message);
    } finally {
      setSubmittingGasto(false);
    }
  };

  // 2. Guardar Depósito / Inyección a Caja Chica (Fondeo)
  const handleSubmitFondeo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsgFondeo(null);

    const m = parseFloat(montoFondeo);
    if (isNaN(m) || m <= 0) {
      setErrorMsgFondeo('Ingrese un monto de depósito válido mayor a 0');
      return;
    }

    setSubmittingFondeo(true);
    try {
      const nuevoFondeo = {
        jornada_id: jornadaActual?.id || null,
        fecha_hora: new Date().toISOString(),
        concepto: `Depósito a Caja Chica (${bancoFondeo})`,
        categoria: 'OTROS',
        proveedor: 'Aporte de Gerencia',
        monto: m,
        tipo: 'INGRESO_FONDEO',
        metodo_pago: metodoFondeo,
        estado_pago: 'PAGADO',
        registrado_por: 'Jefe / Gerencia',
        observaciones: notaFondeo.trim() ? `Nota: ${notaFondeo.trim()} • Banco: ${bancoFondeo}` : `Banco: ${bancoFondeo}`,
      };

      const { data, error } = await supabase.from('compras_gastos').insert(nuevoFondeo).select().single();
      if (error) throw error;

      if (data) {
        setGastos((prev) => [data as CompraGasto, ...prev]);
      }

      setMontoFondeo('');
      setNotaFondeo('');
      setShowModalFondeo(false);
    } catch (err: any) {
      setErrorMsgFondeo('Error al reportar depósito: ' + err.message);
    } finally {
      setSubmittingFondeo(false);
    }
  };

  // Confirmar Transferencia Pendiente
  const handleConfirmarTransferencia = async () => {
    if (!gastoAConfirmar) return;
    setConfirmingTransf(true);

    try {
      const { error } = await supabase
        .from('compras_gastos')
        .update({
          estado_pago: 'PAGADO',
          referencia_banco: refConfirmacion.trim() || 'Transferencia Confirmada',
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

  // Filtrado de gastos
  const ayerDate = new Date();
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayerStr = ayerDate.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });

  const gastosFiltrados = useMemo(() => {
    return gastos.filter((g) => {
      const fechaGastoStr = g.fecha_hora.slice(0, 10);

      if (filtroFecha === 'HOY' && fechaGastoStr !== hoyStr) return false;
      if (filtroFecha === 'AYER' && fechaGastoStr !== ayerStr) return false;
      if (filtroFecha === 'SEMANA') {
        const d = new Date(g.fecha_hora);
        const hoy = new Date();
        const diffDays = (hoy.getTime() - d.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      }

      if (filtroMetodo === 'EFECTIVO' && g.metodo_pago !== 'EFECTIVO') return false;
      if (filtroMetodo === 'TRANSFERENCIA' && g.metodo_pago !== 'TRANSFERENCIA') return false;
      if (filtroMetodo === 'PENDIENTES' && g.estado_pago !== 'PENDIENTE_TRANSFERENCIA') return false;

      if (filtroCategoria !== 'TODAS' && g.categoria !== filtroCategoria) return false;

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
    let totFondeos = 0;
    let pendientesTransf = 0;
    let montoPendiente = 0;

    gastosFiltrados.forEach((g) => {
      const m = Number(g.monto) || 0;
      if (g.tipo === 'INGRESO_FONDEO') {
        totFondeos += m;
      } else {
        if (g.metodo_pago === 'EFECTIVO') {
          totEfectivo += m;
        } else if (g.metodo_pago === 'TRANSFERENCIA') {
          totTransferencia += m;
        }
        if (g.estado_pago === 'PENDIENTE_TRANSFERENCIA') {
          pendientesTransf += 1;
          montoPendiente += m;
        }
      }
    });

    return {
      total: totEfectivo + totTransferencia,
      efectivo: totEfectivo,
      transferencia: totTransferencia,
      fondeos: totFondeos,
      pendientesCount: pendientesTransf,
      montoPendiente,
    };
  }, [gastosFiltrados]);

  return (
    <PinSecurityGate
      title="Portal de Gerencia"
      subtitle="Supervisión Ejecutiva • El Bodegón"
      pinRequired="4512"
      sessionKey="bodegon_control_pin_verified"
    >
      <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col font-sans pb-24">
        {/* ── HEADER EJECUTIVO MÓVIL ── */}
        <header className="sticky top-0 z-30 bg-stone-950/95 backdrop-blur-md border-b border-stone-800 px-4 py-3 shadow-md">
          <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-white font-black shadow-sm text-sm">
                👑
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-black text-sm text-white tracking-tight">El Bodegón</h1>
                  <span className="text-[10px] font-extrabold text-amber-400 bg-amber-950/70 border border-amber-800/80 px-2 py-0.2 rounded-full">
                    Gerencia
                  </span>
                </div>
                <p className="text-[10px] text-stone-400 flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full inline-block ${
                      realtimeStatus === 'conectado' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  {realtimeStatus === 'conectado' ? 'Conectado a la PC en Vivo' : 'Conectando...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('bodegon_control_pin_verified');
                    window.location.reload();
                  }
                }}
                className="p-1.5 text-stone-400 hover:text-white bg-stone-800/80 rounded-lg border border-stone-700/80 active:scale-95 transition-all cursor-pointer"
                title="Bloquear sesión con PIN"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              </button>
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

          {/* Selector de Pestañas Ejecutivas (Solo Lectura / Supervisión) */}
          <div className="flex items-center gap-2 max-w-2xl mx-auto mt-2.5 pt-2 border-t border-stone-850">
            <button
              onClick={() => setTabEjecutiva('CAJA_CHICA')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                tabEjecutiva === 'CAJA_CHICA'
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Caja Chica & Compras</span>
            </button>

            <button
              onClick={() => setTabEjecutiva('CAJA_GENERAL')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                tabEjecutiva === 'CAJA_GENERAL'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Caja General (Ventas)</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-3 max-w-2xl mx-auto w-full space-y-3.5">
          {/* ========================================================================= */}
          {/* PESTAÑA 1: CAJA CHICA & COMPRAS */}
          {/* ========================================================================= */}
          {tabEjecutiva === 'CAJA_CHICA' && (
            <>
              {/* ── ESTADO INFORMATIVO DE CAJA CHICA (SOLO LECTURA) ── */}
              <div className="bg-stone-850/80 border border-stone-700/80 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      jornadaActual?.estado === 'ABIERTA' ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'
                    }`}
                  />
                  <div>
                    <span className="font-bold text-white block">
                      {jornadaActual?.estado === 'ABIERTA'
                        ? `Caja Chica en Operación (Turno ${jornadaActual.turno})`
                        : 'Caja Chica Cerrada'}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {jornadaActual?.estado === 'ABIERTA'
                        ? `Aperturada por ${jornadaActual.responsable} • Fondo inicial: C$ ${Number(jornadaActual.fondo_inicial).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
                        : 'El restaurante no tiene jornada abierta actualmente.'}
                    </span>
                  </div>
                </div>

                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-stone-800 text-stone-400 border border-stone-700 shrink-0">
                  Modo Supervisión
                </span>
              </div>

              {/* ── BOTONES DE ACCIÓN RÁPIDA EXCLUSIVOS DEL JEFE ── */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => setShowModalGasto(true)}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs py-3 px-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Reportar Mi Compra</span>
                </button>

                <button
                  onClick={() => setShowModalFondeo(true)}
                  className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-xs py-3 px-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Inyectar Fondeo</span>
                </button>
              </div>

              {/* ── ALERTA DE TRANSFERENCIAS PENDIENTES DE PAGO ── */}
              {resumen.pendientesCount > 0 && (
                <div className="bg-gradient-to-r from-amber-500/20 via-amber-600/15 to-amber-500/20 border border-amber-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
                      <Clock className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-200">
                        {resumen.pendientesCount} compra{resumen.pendientesCount !== 1 ? 's' : ''} pendiente{resumen.pendientesCount !== 1 ? 's' : ''} de transferir
                      </p>
                      <p className="text-xs font-mono font-black text-amber-400">
                        C$ {resumen.montoPendiente.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFiltroMetodo('PENDIENTES')}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 py-1.5 rounded-xl font-bold text-[11px] shadow-sm active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    Ver compras
                  </button>
                </div>
              )}

              {/* ── KPI CARD RESUMEN DE COMPRAS DEL DÍA ── */}
              <div className="bg-gradient-to-br from-stone-800 to-stone-850 border border-stone-700/80 rounded-3xl p-4.5 shadow-md">
                <div className="flex items-center justify-between text-stone-400 text-xs font-semibold">
                  <span>Total Compras ({filtroFecha === 'HOY' ? 'Hoy' : filtroFecha})</span>
                  {resumen.fondeos > 0 && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                      + C$ {resumen.fondeos.toLocaleString('es-NI', { minimumFractionDigits: 2 })} Inyectados
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono text-white tracking-tight">
                    C$ {resumen.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-stone-700/70 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      En Efectivo (Caja)
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      C$ {resumen.efectivo.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      Por Transferencia
                    </span>
                    <span className="font-mono font-bold text-sky-400 text-sm">
                      C$ {resumen.transferencia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── FILTROS RÁPIDOS ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  {(['HOY', 'AYER', 'SEMANA', 'TODOS'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFiltroFecha(f)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                        filtroFecha === f
                          ? 'bg-amber-500 text-stone-950 shadow-sm'
                          : 'bg-stone-800/80 text-stone-400 hover:text-white border border-stone-700/70'
                      }`}
                    >
                      {f === 'HOY' ? 'Hoy' : f === 'AYER' ? 'Ayer' : f === 'SEMANA' ? 'Últimos 7d' : 'Todo'}
                    </button>
                  ))}

                  <span className="text-stone-700 px-1">|</span>

                  <button
                    onClick={() => setFiltroMetodo('TODOS')}
                    className={`px-2.5 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                      filtroMetodo === 'TODOS'
                        ? 'bg-stone-200 text-stone-950 font-black'
                        : 'bg-stone-800/80 text-stone-400 hover:text-white border border-stone-700/70'
                    }`}
                  >
                    Todos
                  </button>

                  <button
                    onClick={() => setFiltroMetodo('PENDIENTES')}
                    className={`px-2.5 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                      filtroMetodo === 'PENDIENTES'
                        ? 'bg-amber-500 text-stone-950 font-black'
                        : 'bg-stone-800/80 text-amber-400 border border-amber-900/60'
                    }`}
                  >
                    Pendientes {resumen.pendientesCount > 0 ? `(${resumen.pendientesCount})` : ''}
                  </button>
                </div>

                {/* Buscador */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por proveedor, carnicería, notas..."
                    className="w-full bg-stone-800/90 border border-stone-700 text-stone-100 placeholder-stone-500 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* ── LISTADO DE COMPRAS Y MOVIMIENTOS ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-400 font-bold px-1">
                  <span>Listado de Compras & Movimientos</span>
                  <span>{gastosFiltrados.length} registros</span>
                </div>

                {gastosFiltrados.length === 0 ? (
                  <div className="bg-stone-850 border border-stone-800 rounded-2xl p-8 text-center space-y-2">
                    <p className="text-stone-400 text-xs font-bold">No hay compras registradas para este filtro.</p>
                    <p className="text-stone-500 text-[11px]">Usa el botón "Reportar Mi Compra" para registrar la primera.</p>
                  </div>
                ) : (
                  gastosFiltrados.map((g) => {
                    const esFondeo = g.tipo === 'INGRESO_FONDEO';
                    const catDef = CATEGORIAS_GASTO.find((c) => c.id === g.categoria);
                    const horaStr = new Date(g.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={g.id}
                        className={`rounded-2xl border p-3 flex flex-col gap-2 transition-all ${
                          esFondeo
                            ? 'bg-emerald-950/20 border-emerald-700/40'
                            : g.estado_pago === 'PENDIENTE_TRANSFERENCIA'
                            ? 'bg-amber-950/20 border-amber-500/50'
                            : 'bg-stone-850/90 border-stone-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
                                esFondeo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-stone-800'
                              }`}
                            >
                              {esFondeo ? '📥' : catDef?.emoji || '🥩'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-extrabold text-xs text-white">
                                  {g.proveedor ? `${g.proveedor}` : g.concepto}
                                </h4>
                                {g.estado_pago === 'PENDIENTE_TRANSFERENCIA' ? (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500 text-stone-950">
                                    Por Transferir
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-1.5 py-0.2 rounded">
                                    Pagado
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-400 mt-0.5">{g.concepto}</p>
                              <p className="text-[10px] text-stone-500 mt-0.5">
                                {horaStr} • {g.metodo_pago} • Registrado: {g.registrado_por}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`font-mono font-black text-sm ${
                                esFondeo ? 'text-emerald-400' : 'text-white'
                              }`}
                            >
                              {esFondeo ? '+' : '-'} C$ {Number(g.monto).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </div>

                            {g.foto_comprobante && (
                              <button
                                onClick={() => setFotoModalUrl(g.foto_comprobante!)}
                                className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5 justify-end mt-1 cursor-pointer"
                              >
                                <Receipt className="w-3 h-3" />
                                <span>Ver Recibo</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Botón para que el jefe pague y confirme transferencias pendientes */}
                        {g.estado_pago === 'PENDIENTE_TRANSFERENCIA' && (
                          <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-amber-300 font-bold">
                              ¿Ya hiciste la transferencia bancaria?
                            </span>
                            <button
                              onClick={() => {
                                setGastoAConfirmar(g);
                                setRefConfirmacion('');
                              }}
                              className="bg-sky-500 hover:bg-sky-400 text-stone-950 text-[11px] font-black px-3 py-1 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirmar Pago</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 2: CAJA GENERAL (SOLO SUPERVISIÓN DE VENTAS Y PROPINAS) */}
          {/* ========================================================================= */}
          {tabEjecutiva === 'CAJA_GENERAL' && (
            <div className="space-y-4">
              <div className="bg-stone-850 border border-stone-700/80 rounded-3xl p-5 space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">Caja General del Restaurante</h3>
                      <p className="text-[11px] text-stone-400">Ventas del turno, cobros y propinas</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Solo Supervisión
                  </span>
                </div>

                {/* Parámetros de Operación */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-800 text-xs">
                  <div className="bg-stone-900/80 p-3 rounded-2xl border border-stone-800">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      Tasa Oficial Restaurante
                    </span>
                    <span className="font-mono font-black text-amber-400 text-base mt-0.5 block">
                      C$ 36.00 por $1 USD
                    </span>
                    <span className="text-[10px] text-stone-500">Tipo de cambio estándar</span>
                  </div>

                  <div className="bg-stone-900/80 p-3 rounded-2xl border border-stone-800">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      Gaveta de Caja
                    </span>
                    <span className="font-mono font-black text-white text-base mt-0.5 block">
                      Fondo Operativo
                    </span>
                    <span className="text-[10px] text-stone-500">Manejo de vueltos y cobros</span>
                  </div>
                </div>

                {/* Regla de Negocio: Propinas */}
                <div className="bg-amber-950/20 border border-amber-600/30 rounded-2xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                    <Coins className="w-4 h-4" />
                    <span>Regla de Propinas del Personal</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Las propinas de meseros y cocina se extraen y liquidan <strong>únicamente de Caja General</strong> al finalizar el turno de la noche, mediante el Acta Oficial A4 de Cierre de Caja.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── MODAL 1: REPORTAR COMPRA DEL JEFE ── */}
        {showModalGasto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black">
                    🛒
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">Reportar Compra</h3>
                    <p className="text-[10px] text-stone-400">Gasto asumido por Gerencia</p>
                  </div>
                </div>
                <button onClick={() => setShowModalGasto(false)} className="text-stone-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {errorMsgGasto && (
                <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold">
                  {errorMsgGasto}
                </div>
              )}

              <form onSubmit={handleSubmitGasto} className="space-y-3 text-xs">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Monto de la Compra (C$)*</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-white font-mono font-black text-base focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-bold mb-1">Concepto o Producto*</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 50 lbs de Puntas de Jalapeño"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-stone-300 font-bold mb-1">Categoría</label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value as CategoriaGastoType)}
                      className="w-full bg-stone-800 border border-stone-700 rounded-xl px-2.5 py-2 text-white focus:border-amber-500 outline-none font-bold"
                    >
                      {CATEGORIAS_GASTO.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 font-bold mb-1">Proveedor / Lugar</label>
                    <input
                      type="text"
                      placeholder="Ej: Carnicería SM"
                      value={proveedor}
                      onChange={(e) => setProveedor(e.target.value)}
                      className="w-full bg-stone-800 border border-stone-700 rounded-xl px-2.5 py-2 text-white focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-stone-300 font-bold mb-1">Método de Pago</label>
                    <select
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value as MetodoPagoType)}
                      className="w-full bg-stone-800 border border-stone-700 rounded-xl px-2.5 py-2 text-white focus:border-amber-500 outline-none font-bold"
                    >
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="EFECTIVO">Efectivo Personal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 font-bold mb-1">Estado de Pago</label>
                    <select
                      value={estadoPago}
                      onChange={(e) => setEstadoPago(e.target.value as EstadoPagoType)}
                      className="w-full bg-stone-800 border border-stone-700 rounded-xl px-2.5 py-2 text-white focus:border-amber-500 outline-none font-bold"
                    >
                      <option value="PAGADO">Pagado Ya</option>
                      <option value="PENDIENTE_TRANSFERENCIA">Por Transferir</option>
                    </select>
                  </div>
                </div>

                {/* Subida de Foto de Factura / Ticket */}
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Foto de Factura o Recibo (Opcional)</label>
                  <label className="w-full border-2 border-dashed border-stone-700 hover:border-amber-500/80 rounded-2xl p-3 flex flex-col items-center justify-center cursor-pointer bg-stone-800/50 transition">
                    <Camera className="w-5 h-5 text-stone-400 mb-1" />
                    <span className="text-[11px] text-stone-300 font-bold">Tomar foto o subir comprobante</span>
                    <input type="file" accept="image/*" capture="environment" onChange={handleFotoChange} className="hidden" />
                  </label>
                  {fotoBase64 && (
                    <div className="relative mt-2 w-20 h-20 rounded-xl overflow-hidden border border-stone-700">
                      <img src={fotoBase64} alt="Comprobante" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFotoBase64(null)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
                  <button
                    type="button"
                    onClick={() => setShowModalGasto(false)}
                    className="px-4 py-2 rounded-xl text-stone-400 hover:bg-stone-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingGasto}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-2 rounded-xl active:scale-95 transition"
                  >
                    {submittingGasto ? 'Guardando...' : 'Guardar Compra'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL 2: REPORTAR DEPÓSITO / INYECCIÓN A CAJA CHICA (FONDEO) ── */}
        {showModalFondeo && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                    📥
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">Inyectar Dinero a Caja Chica</h3>
                    <p className="text-[10px] text-stone-400">Depósito para compras del restaurante</p>
                  </div>
                </div>
                <button onClick={() => setShowModalFondeo(false)} className="text-stone-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {errorMsgFondeo && (
                <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold">
                  {errorMsgFondeo}
                </div>
              )}

              <form onSubmit={handleSubmitFondeo} className="space-y-3 text-xs">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Monto a Inyectar (C$)*</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={montoFondeo}
                    onChange={(e) => setMontoFondeo(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-white font-mono font-black text-base focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-stone-300 font-bold mb-1">Vía de Depósito</label>
                    <select
                      value={metodoFondeo}
                      onChange={(e) => setMetodoFondeo(e.target.value as 'TRANSFERENCIA' | 'EFECTIVO')}
                      className="w-full bg-stone-800 border border-stone-700 rounded-xl px-2.5 py-2 text-white focus:border-emerald-500 outline-none font-bold"
                    >
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="EFECTIVO">Efectivo Físico</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 font-bold mb-1">Banco / Origen</label>
                    <select
                      value={bancoFondeo}
                      onChange={(e) => setBancoFondeo(e.target.value)}
                      className="w-full bg-stone-800 border border-stone-700 rounded-xl px-2.5 py-2 text-white focus:border-emerald-500 outline-none font-bold"
                    >
                      <option value="BAC Credomatic">BAC</option>
                      <option value="Banpro">Banpro</option>
                      <option value="Banco Lafise">Lafise</option>
                      <option value="Banco Ficohsa">Ficohsa</option>
                      <option value="Efectivo en Mano">Efectivo en Mano</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-stone-300 font-bold mb-1">Nota o Destino (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Para compra de verduras y gas del fin de semana"
                    value={notaFondeo}
                    onChange={(e) => setNotaFondeo(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
                  <button
                    type="button"
                    onClick={() => setShowModalFondeo(false)}
                    className="px-4 py-2 rounded-xl text-stone-400 hover:bg-stone-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingFondeo}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-5 py-2 rounded-xl active:scale-95 transition"
                  >
                    {submittingFondeo ? 'Reportando...' : 'Confirmar Depósito'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: CONFIRMAR TRANSFERENCIA BANCARIA ── */}
        {gastoAConfirmar && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                <h3 className="font-black text-sm text-white">Confirmar Pago de Transferencia</h3>
                <button onClick={() => setGastoAConfirmar(null)} className="text-stone-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-stone-800/80 p-3 rounded-2xl space-y-1 text-xs">
                <div className="flex justify-between font-bold text-stone-300">
                  <span>{gastoAConfirmar.proveedor || gastoAConfirmar.concepto}</span>
                  <span className="font-mono text-white">
                    C$ {Number(gastoAConfirmar.monto).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-[10px] text-stone-400">{gastoAConfirmar.concepto}</p>
              </div>

              <div>
                <label className="block text-stone-300 font-bold text-xs mb-1">
                  Número de Referencia o Banco (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: BAC Ref #948201"
                  value={refConfirmacion}
                  onChange={(e) => setRefConfirmacion(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
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
    </PinSecurityGate>
  );
}
