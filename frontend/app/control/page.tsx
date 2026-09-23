'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  CreditCard,
  Truck,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Printer,
  ChevronLeft,
  ChevronRight,
  Info,
  Building2,
  Receipt,
  Wallet,
  CheckCircle2,
  Clock,
  BarChart3,
  Layers,
  X,
  Check,
  Send,
  Camera,
  Trash2,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  Lock,
  AlertCircle,
  ArrowLeft,
  Percent,
} from 'lucide-react';
import PinSecurityGate from '@/components/PinSecurityGate';

interface ParsedSalesData {
  salesCash: number;
  cardsBAC: number;
  cardsFicohsa: number;
  cardsBanpro: number;
  cardsLafise: number;
  totalCards: number;
  salesPedidosYa: number;
  totalGrossSales: number;
  tips?: number;
  source: 'JSON' | 'REGEX' | 'DEFAULT';
}

type TabType = 'VENTAS' | 'GASTOS' | 'CONSOLIDADO';
type DetailModalType =
  | 'CASH'
  | 'CARDS'
  | 'BAC'
  | 'FICOHSA'
  | 'BANPRO'
  | 'LAFISE'
  | 'DELIVERY'
  | 'GROSS'
  | 'NET'
  | null;

// Chips de proveedores frecuentes para registrar gastos rápidamente
const PROVEEDORES_FRECUENTES = [
  'San Martín (Carnes)',
  'Mercado Oriental',
  'Panadería Victoria',
  'Verdulería Central',
  'Coca-Cola / FEMSA',
  'Compañía Cervecera',
  'Super Express',
  'Distribuidora Roma',
];

export default function BodegonControlPage() {
  const [gastos, setGastos] = useState<CompraGasto[]>([]);
  const [jornadas, setJornadas] = useState<JornadaDiaria[]>([]);
  const [jornadaActiva, setJornadaActiva] = useState<JornadaDiaria | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'conectado' | 'conectando' | 'error'>('conectando');

  // Pestaña principal activa
  const [activeTab, setActiveTab] = useState<TabType>('VENTAS');

  // Fecha seleccionada para visualización de ventas (YYYY-MM-DD)
  const hoyStr = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' }), []);
  const [selectedDate, setSelectedDate] = useState<string>(hoyStr);
  const [timeFilterDays, setTimeFilterDays] = useState<7 | 14 | 30>(7);

  // Modales interactivos informativos de ventas
  const [activeDetailModal, setActiveDetailModal] = useState<DetailModalType>(null);

  // Filtros de gastos
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [filtroMetodo, setFiltroMetodo] = useState<'TODOS' | 'EFECTIVO' | 'TRANSFERENCIA'>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PAGADO' | 'PENDIENTE_TRANSFERENCIA'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales de funciones
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [showModalPrint, setShowModalPrint] = useState(false);
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);

  // Formulario único permitido: Registro de Compra / Gasto
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGastoType>('CARNES');
  const [proveedor, setProveedor] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPagoType>('EFECTIVO');
  const [estadoPago, setEstadoPago] = useState<EstadoPagoType>('PAGADO');
  const [referenciaBanco, setReferenciaBanco] = useState('');
  const [registradoPor, setRegistradoPor] = useState('Gerencia / Online');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Cargar datos desde Supabase
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: jData, error: jError }, { data: gData, error: gError }] = await Promise.all([
        supabase.from('jornadas_diarias').select('*').order('fecha', { ascending: false }).limit(60),
        supabase.from('compras_gastos').select('*').order('fecha_hora', { ascending: false }).limit(350),
      ]);

      if (jError) console.warn('Aviso jornadas:', jError.message);
      if (gError) console.warn('Aviso gastos:', gError.message);

      const jList = (jData as JornadaDiaria[]) || [];
      setJornadas(jList);

      // Determinar si hay alguna jornada actualmente ABIERTA en la PC del restaurante
      const activa = jList.find((j) => j.estado === 'ABIERTA') || null;
      setJornadaActiva(activa);

      setGastos((gData as CompraGasto[]) || []);
    } catch (err: any) {
      console.error('Error cargando datos de Bodegón Control:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Suscripción en Tiempo Real
  useEffect(() => {
    cargarDatos();

    const channel = supabase
      .channel('bodegon_control_web_realtime')
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

  // 3. Parser de datos de ventas desde observaciones
  const parseVentasFromObservaciones = useCallback((obs?: string | null): ParsedSalesData => {
    if (!obs) {
      return {
        salesCash: 0,
        cardsBAC: 0,
        cardsFicohsa: 0,
        cardsBanpro: 0,
        cardsLafise: 0,
        totalCards: 0,
        salesPedidosYa: 0,
        totalGrossSales: 0,
        source: 'DEFAULT',
      };
    }

    // A. Formato JSON estructurado: [VENTAS_DATA:{...}]
    const jsonMatch = obs.match(/\[VENTAS_DATA:(\{.*?\})\]/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const salesCash = Number(parsed.salesCash) || 0;
        const cardsBAC = Number(parsed.cardsBAC) || 0;
        const cardsFicohsa = Number(parsed.cardsFicohsa) || 0;
        const cardsBanpro = Number(parsed.cardsBanpro) || 0;
        const cardsLafise = Number(parsed.cardsLafise) || 0;
        const totalCards = Number(parsed.totalCards) || (cardsBAC + cardsFicohsa + cardsBanpro + cardsLafise);
        const salesPedidosYa = Number(parsed.salesPedidosYa) || 0;
        const totalGrossSales = Number(parsed.totalGrossSales) || (salesCash + totalCards + salesPedidosYa);
        const tips = Number(parsed.tips) || 0;

        return {
          salesCash,
          cardsBAC,
          cardsFicohsa,
          cardsBanpro,
          cardsLafise,
          totalCards,
          salesPedidosYa,
          totalGrossSales,
          tips,
          source: 'JSON',
        };
      } catch (e) {
        // Fallback a regex
      }
    }

    // B. Formato texto plano por Regex
    const extractNum = (regex: RegExp) => {
      const match = obs.match(regex);
      if (!match || !match[1]) return 0;
      return parseFloat(match[1].replace(/,/g, '')) || 0;
    };

    const salesCash = extractNum(/Efectivo\s*C\$?\s*([0-9.,]+)/i);
    const cardsBAC = extractNum(/BAC:\s*([0-9.,]+)/i);
    const cardsFicohsa = extractNum(/Fico:\s*([0-9.,]+)/i);
    const cardsBanpro = extractNum(/Banpro:\s*([0-9.,]+)/i);
    const cardsLafise = extractNum(/Laf:\s*([0-9.,]+)/i);
    const totalCardsParsed = extractNum(/Tarjetas\s*C\$?\s*([0-9.,]+)/i);
    const totalCards = totalCardsParsed || (cardsBAC + cardsFicohsa + cardsBanpro + cardsLafise);
    const salesPedidosYa = extractNum(/PedidosYa\s*C\$?\s*([0-9.,]+)/i);
    const totalGrossSalesParsed = extractNum(/Ventas\s*Brutas:\s*C\$?\s*([0-9.,]+)/i);
    const totalGrossSales = totalGrossSalesParsed || (salesCash + totalCards + salesPedidosYa);

    return {
      salesCash,
      cardsBAC,
      cardsFicohsa,
      cardsBanpro,
      cardsLafise,
      totalCards,
      salesPedidosYa,
      totalGrossSales,
      source: 'REGEX',
    };
  }, []);

  // 4. Map de días consolidado para la gráfica y tabla histórica
  const dailyHistoryMap = useMemo(() => {
    const map = new Map<string, {
      date: string;
      jornada?: JornadaDiaria;
      sales: ParsedSalesData;
      expensesTotal: number;
      expensesCash: number;
      expensesTransf: number;
      netProfit: number;
      marginPercent: number;
    }>();

    // Indexar jornadas
    jornadas.forEach((j) => {
      const sales = parseVentasFromObservaciones(j.observaciones);
      map.set(j.fecha, {
        date: j.fecha,
        jornada: j,
        sales,
        expensesTotal: 0,
        expensesCash: 0,
        expensesTransf: 0,
        netProfit: 0,
        marginPercent: 0,
      });
    });

    // Agregar y sumar gastos por fecha
    gastos.forEach((g) => {
      const f = g.fecha_hora.slice(0, 10);
      const montoNum = Number(g.monto) || 0;
      let item = map.get(f);
      if (!item) {
        item = {
          date: f,
          sales: {
            salesCash: 0,
            cardsBAC: 0,
            cardsFicohsa: 0,
            cardsBanpro: 0,
            cardsLafise: 0,
            totalCards: 0,
            salesPedidosYa: 0,
            totalGrossSales: 0,
            source: 'DEFAULT',
          },
          expensesTotal: 0,
          expensesCash: 0,
          expensesTransf: 0,
          netProfit: 0,
          marginPercent: 0,
        };
        map.set(f, item);
      }
      item.expensesTotal += montoNum;
      if (g.metodo_pago === 'EFECTIVO') item.expensesCash += montoNum;
      if (g.metodo_pago === 'TRANSFERENCIA') item.expensesTransf += montoNum;
    });

    // Calcular ganancia neta y margen de cada día
    map.forEach((item) => {
      item.netProfit = item.sales.totalGrossSales - item.expensesTotal;
      item.marginPercent =
        item.sales.totalGrossSales > 0
          ? (item.netProfit / item.sales.totalGrossSales) * 100
          : 0;
    });

    return map;
  }, [jornadas, gastos, parseVentasFromObservaciones]);

  // 5. Datos del día seleccionado
  const selectedDayData = useMemo(() => {
    const existing = dailyHistoryMap.get(selectedDate);
    if (existing) return existing;

    // Día sin jornada registrada aún
    const dayGastos = gastos.filter((g) => g.fecha_hora.slice(0, 10) === selectedDate);
    let expTot = 0;
    let expCash = 0;
    let expTransf = 0;
    dayGastos.forEach((g) => {
      const m = Number(g.monto) || 0;
      expTot += m;
      if (g.metodo_pago === 'EFECTIVO') expCash += m;
      if (g.metodo_pago === 'TRANSFERENCIA') expTransf += m;
    });

    return {
      date: selectedDate,
      jornada: undefined,
      sales: {
        salesCash: 0,
        cardsBAC: 0,
        cardsFicohsa: 0,
        cardsBanpro: 0,
        cardsLafise: 0,
        totalCards: 0,
        salesPedidosYa: 0,
        totalGrossSales: 0,
        source: 'DEFAULT' as const,
      },
      expensesTotal: expTot,
      expensesCash: expCash,
      expensesTransf: expTransf,
      netProfit: 0 - expTot,
      marginPercent: 0,
    };
  }, [dailyHistoryMap, selectedDate, gastos]);

  // Navegación de fechas
  const cambiarDia = (diasDelta: number) => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const fecha = new Date(y, m - 1, d);
      fecha.setDate(fecha.getDate() + diasDelta);
      const nuevaStr = fecha.toISOString().slice(0, 10);
      setSelectedDate(nuevaStr);
    } catch {
      // fallback
    }
  };

  // 6. Lista cronológica para la gráfica (últimos 7, 14 o 30 días)
  const chartDaysList = useMemo(() => {
    const list = [];
    const base = new Date();
    for (let i = timeFilterDays - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const dStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
      const item = dailyHistoryMap.get(dStr);
      const dayName = d.toLocaleDateString('es-NI', { weekday: 'short' });
      const dayNum = d.getDate();

      list.push({
        dateStr: dStr,
        label: `${dayName} ${dayNum}`,
        grossSales: item?.sales.totalGrossSales || 0,
        expenses: item?.expensesTotal || 0,
        netProfit: item?.netProfit || 0,
      });
    }
    return list;
  }, [dailyHistoryMap, timeFilterDays]);

  const maxChartValue = useMemo(() => {
    let max = 1000;
    chartDaysList.forEach((c) => {
      if (c.grossSales > max) max = c.grossSales;
      if (c.expenses > max) max = c.expenses;
    });
    return max * 1.15;
  }, [chartDaysList]);

  // 7. Lista completa ordenada para la Tabla del Tiempo
  const timelineDaysList = useMemo(() => {
    const arr = Array.from(dailyHistoryMap.values());
    arr.sort((a, b) => b.date.localeCompare(a.date));
    return arr.slice(0, 30);
  }, [dailyHistoryMap]);

  // 8. Gastos filtrados para la pestaña de Gastos / Caja Chica (estrictamente por la fecha seleccionada)
  const gastosFiltrados = useMemo(() => {
    return gastos.filter((g) => {
      const fechaGastoStr = g.fecha_hora.slice(0, 10);
      // Filtrar SIEMPRE por la fecha seleccionada (por defecto hoy)
      if (selectedDate && fechaGastoStr !== selectedDate) {
        return false;
      }
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
  }, [gastos, selectedDate, filtroCategoria, filtroMetodo, filtroEstado, searchTerm]);

  // Métricas del día seleccionado para gastos
  const metricasGastosDia = useMemo(() => {
    let totEfectivo = 0;
    let totTransf = 0;
    let pendientesCount = 0;
    let pendientesMonto = 0;

    const gastosDelDia = gastos.filter((g) => g.fecha_hora.slice(0, 10) === selectedDate);
    gastosDelDia.forEach((g) => {
      const m = Number(g.monto) || 0;
      if (g.metodo_pago === 'EFECTIVO') totEfectivo += m;
      if (g.metodo_pago === 'TRANSFERENCIA') totTransf += m;
      if (g.estado_pago === 'PENDIENTE_TRANSFERENCIA') {
        pendientesCount++;
        pendientesMonto += m;
      }
    });

    const fondoCaja = Number(selectedDayData.jornada?.fondo_inicial || 0);
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
  }, [gastos, selectedDate, selectedDayData]);

  // Manejo de foto del comprobante
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        ctx?.drawImage(img, 0, 0, w, h);
        setFotoBase64(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Guardar Gasto (Única función activa de escritura)
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
          jornada_id: jornadaActiva?.id || selectedDayData.jornada?.id || null,
          fecha_hora: new Date().toISOString(),
          concepto: concepto.trim(),
          categoria,
          proveedor: proveedor.trim() || null,
          monto: montoNum,
          metodo_pago: metodoPago,
          estado_pago: metodoPago === 'TRANSFERENCIA' ? estadoPago : 'PAGADO',
          referencia_banco: referenciaBanco.trim() || null,
          foto_comprobante: fotoBase64,
          registrado_por: registradoPor.trim() || 'Gerencia Online',
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

  // Cambiar estado de transferencia a Pagado / Pendiente
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

  // 9. Impresión Oficial en Blanco y Negro (Formato 1 o 2 Hojas para Archivo y Firmas)
  const handleImprimirActaOficial = (modo: 'TODO' | 'GENERAL' | 'CHICA') => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const fechaObj = new Date(y, m - 1, d);
      const diaSemana = fechaObj.toLocaleDateString('es-NI', { weekday: 'long' });
      const fechaLarga = fechaObj.toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
      const diaSemanaCap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);

      const horaEmision = new Date().toLocaleTimeString('es-NI', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const dayGastos = gastos
        .filter((g) => g.fecha_hora.slice(0, 10) === selectedDate)
        .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

      const sales = selectedDayData.sales;
      const totalGross = sales.totalGrossSales;
      const salesCash = sales.salesCash;
      const cardsBAC = sales.cardsBAC;
      const cardsFicohsa = sales.cardsFicohsa;
      const cardsBanpro = sales.cardsBanpro;
      const cardsLafise = sales.cardsLafise;
      const totalCards = sales.totalCards;
      const salesPedidosYa = sales.salesPedidosYa;
      const expensesTotal = selectedDayData.expensesTotal;
      const expensesCash = selectedDayData.expensesCash;
      const expensesTransf = selectedDayData.expensesTransf;
      const netProfit = selectedDayData.netProfit;
      const marginPercent = selectedDayData.marginPercent;

      const cashPct = totalGross > 0 ? ((salesCash / totalGross) * 100).toFixed(1) : '0.0';
      const bacPct = totalGross > 0 ? ((cardsBAC / totalGross) * 100).toFixed(1) : '0.0';
      const ficoPct = totalGross > 0 ? ((cardsFicohsa / totalGross) * 100).toFixed(1) : '0.0';
      const banproPct = totalGross > 0 ? ((cardsBanpro / totalGross) * 100).toFixed(1) : '0.0';
      const lafisePct = totalGross > 0 ? ((cardsLafise / totalGross) * 100).toFixed(1) : '0.0';
      const cardsPct = totalGross > 0 ? ((totalCards / totalGross) * 100).toFixed(1) : '0.0';
      const pedidosYaPct = totalGross > 0 ? ((salesPedidosYa / totalGross) * 100).toFixed(1) : '0.0';

      const jornada = selectedDayData.jornada;
      const fondoInicial = Number(jornada?.fondo_inicial || 0);
      const saldoRemanente = fondoInicial - expensesCash;
      const responsableCaja = jornada?.responsable || 'Caja Principal';
      const turnoJornada = jornada?.turno || 'COMPLETO';
      const estadoCaja = jornada?.estado || (selectedDate === hoyStr ? 'ABIERTA' : 'CERRADA');
      const observacionesClean = (jornada?.observaciones || '')
        .replace(/\[VENTAS_DATA:\{.*?\}\]\s*/g, '')
        .trim();

      // Generar filas de gastos para la Hoja 2
      let rowsGastosHtml = '';
      if (dayGastos.length === 0) {
        rowsGastosHtml = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 14px; color: #444; font-style: italic;">
              No se registraron compras ni egresos de caja chica en la fecha indicada.
            </td>
          </tr>
        `;
      } else {
        rowsGastosHtml = dayGastos
          .map((g, idx) => {
            const horaGasto = new Date(g.fecha_hora).toLocaleTimeString('es-NI', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
            const catLabel = CATEGORIAS_GASTO.find((c) => c.id === g.categoria)?.label || g.categoria;
            const metodoTxt = g.metodo_pago === 'EFECTIVO' ? 'Efectivo' : 'Transf.';
            const estadoRef =
              g.metodo_pago === 'TRANSFERENCIA'
                ? (g.estado_pago === 'PAGADO' ? 'Pagado' : 'Pendiente') +
                  (g.referencia_banco ? ` (Ref: ${g.referencia_banco})` : '')
                : 'Pagado';

            return `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td style="text-align: center; font-family: monospace;">${horaGasto}</td>
                <td>${catLabel}</td>
                <td><strong>${g.concepto}</strong></td>
                <td>${g.proveedor || '-'}</td>
                <td style="text-align: center;">${metodoTxt}</td>
                <td style="text-align: center; font-size: 9px;">${estadoRef}</td>
                <td class="text-right font-mono font-bold">C$ ${Number(g.monto).toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
              </tr>
            `;
          })
          .join('');
      }

      // Estilos CSS expresamente para impresión en Blanco y Negro (B/N)
      const printStyles = `
        <style>
          @page {
            size: letter portrait;
            margin: 8mm 12mm 8mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #000;
            background: #fff;
            font-size: 10px;
            line-height: 1.25;
          }
          .sheet {
            page-break-after: always;
            break-after: page;
            padding: 0;
            min-height: 97vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .sheet:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .header-box {
            border-bottom: 2px solid #000;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .brand {
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.5px;
          }
          .doc-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            margin-top: 1px;
          }
          .doc-subtitle {
            font-size: 8.5px;
            color: #333;
            letter-spacing: 0.3px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 6px;
          }
          th, td {
            border: 1px solid #000;
            padding: 3.5px 5px;
            text-align: left;
            font-size: 9.5px;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 9px;
          }
          .meta-table td {
            border: 1px solid #555;
            font-size: 9px;
            padding: 3px 5px;
          }
          .section-title {
            font-size: 9.5px;
            font-weight: bold;
            text-transform: uppercase;
            background-color: #e5e5e5;
            border: 1px solid #000;
            padding: 2.5px 5px;
            margin-top: 4px;
            margin-bottom: 2px;
            letter-spacing: 0.3px;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
          .font-mono {
            font-family: "Courier New", Courier, monospace;
          }
          .font-bold {
            font-weight: bold;
          }
          .highlight-row td {
            font-weight: bold;
            background-color: #f7f7f7;
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
          }
          .signatures {
            margin-top: 8px;
            display: flex;
            justify-content: space-between;
            gap: 40px;
          }
          .sig-box {
            flex: 1;
            text-align: center;
            border-top: 1px solid #000;
            padding-top: 3px;
            font-size: 9px;
          }
        </style>
      `;

      // HOJA 1: CAJA GENERAL & VENTAS
      const sheet1Html = `
        <div class="sheet">
          <div>
            <div class="header-box">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <div class="brand">EL BODEGÓN RESTAURANTE & BAR</div>
                  <div class="doc-title">ACTA OFICIAL DE CONTROL, VENTAS Y CAJA GENERAL</div>
                  <div class="doc-subtitle">SISTEMA INTEGRAL DE AUDITORÍA Y CONTROL CONTABLE</div>
                </div>
                <div style="text-align: right; font-size: 9px; font-family: monospace;">
                  <div>DOC. OFICIAL N° <strong>CG-${selectedDate.replace(/-/g, '')}</strong></div>
                  <div>EMISIÓN: ${horaEmision}</div>
                </div>
              </div>
            </div>

            <table class="meta-table">
              <tr>
                <td style="width: 25%;"><strong>FECHA CONTABLE:</strong><br>${diaSemanaCap}, ${fechaLarga}</td>
                <td style="width: 25%;"><strong>TURNO OPERATIVO:</strong><br>${turnoJornada}</td>
                <td style="width: 25%;"><strong>RESPONSABLE DE CAJA:</strong><br>${responsableCaja}</td>
                <td style="width: 25%;"><strong>ESTADO DE CAJA:</strong><br>${estadoCaja}</td>
              </tr>
              <tr>
                <td><strong>FONDO INICIAL CAJA:</strong><br>C$ ${fondoInicial.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                <td><strong>TOTAL INGRESOS BRUTOS:</strong><br>C$ ${totalGross.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                <td><strong>TOTAL EGRESOS DEL DÍA:</strong><br>C$ ${expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                <td><strong>GANANCIA NETA REAL:</strong><br><strong>C$ ${netProfit.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </table>

            <div class="section-title">1. CONCILIACIÓN DE VENTAS POR CANAL DE COBRO (INGRESOS BRUTOS)</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 28%;">CANAL / MÉTODO</th>
                  <th style="width: 42%;">DETALLE OPERATIVO / INSTITUCIÓN</th>
                  <th style="width: 18%;" class="text-right">TOTAL EN C$</th>
                  <th style="width: 12%;" class="text-right">% DEL TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>💵 Ventas en Efectivo</strong></td>
                  <td>Ingreso físico en gaveta de caja general</td>
                  <td class="text-right font-mono">C$ ${salesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">${cashPct}%</td>
                </tr>
                <tr>
                  <td rowspan="4"><strong>💳 Tarjetas POS (Datafast)</strong></td>
                  <td>POS BAC Credomatic</td>
                  <td class="text-right font-mono">C$ ${cardsBAC.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">${bacPct}%</td>
                </tr>
                <tr>
                  <td>POS Banco Ficohsa</td>
                  <td class="text-right font-mono">C$ ${cardsFicohsa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">${ficoPct}%</td>
                </tr>
                <tr>
                  <td>POS Banpro Grupo Promerica</td>
                  <td class="text-right font-mono">C$ ${cardsBanpro.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">${banproPct}%</td>
                </tr>
                <tr>
                  <td>POS Banco LAFISE Bancentro</td>
                  <td class="text-right font-mono">C$ ${cardsLafise.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">${lafisePct}%</td>
                </tr>
                <tr style="background-color: #fafafa;">
                  <td colspan="2" style="text-align: right; padding-right: 8px;"><strong>SUBTOTAL TODAS LAS TARJETAS POS:</strong></td>
                  <td class="text-right font-mono font-bold">C$ ${totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono font-bold">${cardsPct}%</td>
                </tr>
                <tr>
                  <td><strong>🛵 Delivery PedidosYa</strong></td>
                  <td>Despachos de pedidos por aplicación digital externa</td>
                  <td class="text-right font-mono">C$ ${salesPedidosYa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">${pedidosYaPct}%</td>
                </tr>
                <tr class="highlight-row">
                  <td colspan="2"><strong>TOTAL VENTAS BRUTAS DEL DÍA (INGRESOS TOTALES)</strong></td>
                  <td class="text-right font-mono" style="font-size: 10.5px;"><strong>C$ ${totalGross.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong></td>
                  <td class="text-right font-mono"><strong>100.0%</strong></td>
                </tr>
              </tbody>
            </table>

            <div class="section-title">2. LIQUIDACIÓN OPERATIVA Y RENDIMIENTO NETO DEL DÍA</div>
            <table>
              <tbody>
                <tr>
                  <td style="width: 70%;"><strong>(+) Total Ventas Brutas Facturadas</strong> (Efectivo + Tarjetas + Delivery)</td>
                  <td style="width: 30%;" class="text-right font-mono">C$ ${totalGross.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td><strong>(-) Menos Egresos de Caja Chica del Día</strong> (Compras de insumos en efectivo y transferencias)</td>
                  <td class="text-right font-mono">- C$ ${expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr class="highlight-row" style="font-size: 10.5px;">
                  <td><strong>(=) GANANCIA NETA DEL DÍA (UTILIDAD LÍQUIDA DISPONIBLE)</strong></td>
                  <td class="text-right font-mono"><strong>C$ ${netProfit.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
                <tr>
                  <td><strong>Porcentaje de Margen Operativo Real</strong></td>
                  <td class="text-right font-mono font-bold">${marginPercent.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>

            <div class="section-title">3. OBSERVACIONES / AUDITORÍA DEL TURNO</div>
            <div style="border: 1px solid #000; padding: 4px 6px; font-size: 9px; min-height: 28px; background-color: #fff;">
              ${observacionesClean || 'Jornada liquidada y conciliada conforme a los registros oficiales del sistema Bodegón Control.'}
            </div>
          </div>

          <div>
            <div style="font-size: 8px; color: #444; margin-bottom: 5px; text-align: center;">
              El presente documento constituye fe pública del cierre financiero del turno. Cualquier discrepancia debe reportarse a Gerencia de inmediato.
            </div>
            <div class="signatures">
              <div class="sig-box">
                <div style="height: 25px;"></div>
                <div>
                  <strong>CAJERO(A) / RESPONSABLE DEL TURNO</strong><br>
                  <span style="font-size: 8px;">Nombre: ${responsableCaja}</span><br>
                  <span style="font-size: 8px;">Firma y Cédula: ________________________</span>
                </div>
              </div>
              <div class="sig-box">
                <div style="height: 25px;"></div>
                <div>
                  <strong>ADMINISTRACIÓN / GERENCIA GENERAL</strong><br>
                  <span style="font-size: 8px;">Revisado y Aprobado</span><br>
                  <span style="font-size: 8px;">Firma y Sello: ________________________</span>
                </div>
              </div>
            </div>
            <div style="font-size: 7.5px; color: #666; text-align: center; margin-top: 5px;">
              El Bodegón Restaurante & Bar • Documento Oficial B/N • ${modo === 'TODO' ? 'Página 1 de 2' : 'Página 1 de 1'}
            </div>
          </div>
        </div>
      `;

      // HOJA 2: CAJA CHICA & GASTOS DETALLADOS
      const sheet2Html = `
        <div class="sheet">
          <div>
            <div class="header-box">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <div class="brand">EL BODEGÓN RESTAURANTE & BAR</div>
                  <div class="doc-title">REPORTE DETALLADO DE COMPRAS, GASTOS & CAJA CHICA</div>
                  <div class="doc-subtitle">CONTROL DIARIO DE INSUMOS, PROVEEDORES Y COMPROBANTES</div>
                </div>
                <div style="text-align: right; font-size: 9px; font-family: monospace;">
                  <div>DOC. OFICIAL N° <strong>CC-${selectedDate.replace(/-/g, '')}</strong></div>
                  <div>EMISIÓN: ${horaEmision}</div>
                </div>
              </div>
            </div>

            <table class="meta-table">
              <tr>
                <td style="width: 25%;"><strong>FECHA CONTABLE:</strong><br>${diaSemanaCap}, ${fechaLarga}</td>
                <td style="width: 25%;"><strong>TOTAL MOVIMIENTOS:</strong><br>${dayGastos.length} compras / egresos</td>
                <td style="width: 25%;"><strong>RESPONSABLE:</strong><br>${responsableCaja}</td>
                <td style="width: 25%;"><strong>PAGOS EN EFECTIVO:</strong><br>C$ ${expensesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td><strong>FONDO INICIAL ASIGNADO:</strong><br>C$ ${fondoInicial.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                <td><strong>TRANSFERENCIAS BANCARIAS:</strong><br>C$ ${expensesTransf.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                <td><strong>PENDIENTES DE TRANSFERIR:</strong><br>C$ ${metricasGastosDia.pendientesMonto.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                <td><strong>SALDO RESTANTE EN GAVETA:</strong><br><strong>C$ ${saldoRemanente.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </table>

            <div class="section-title">1. BALANCE Y LIQUIDACIÓN DEL FONDO DE CAJA CHICA</div>
            <table>
              <thead>
                <tr>
                  <th>CONCEPTO DE FONDO Y MOVIMIENTOS</th>
                  <th style="width: 25%;" class="text-right">IMPORTE (C$)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>(+) Fondo Inicial de Caja Chica Asignado para el Turno</td>
                  <td class="text-right font-mono">C$ ${fondoInicial.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td>(-) Total Compras y Gastos Pagados en Efectivo (Salidas de Gaveta)</td>
                  <td class="text-right font-mono">- C$ ${expensesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr style="background-color: #fafafa; font-weight: bold;">
                  <td>(=) SALDO EFECTIVO RESTANTE EN GAVETA FÍSICA</td>
                  <td class="text-right font-mono">C$ ${saldoRemanente.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td>(+) Facturas y Compras Pagadas mediante Transferencia Bancaria</td>
                  <td class="text-right font-mono">C$ ${expensesTransf.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr class="highlight-row">
                  <td><strong>TOTAL GENERAL DE EGRESOS DEL DÍA (EFECTIVO + TRANSFERENCIAS)</strong></td>
                  <td class="text-right font-mono" style="font-size: 10.5px;"><strong>C$ ${expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              </tbody>
            </table>

            <div class="section-title">2. RELACIÓN DETALLADA DE COMPRAS Y GASTOS REALIZADOS EN EL DÍA</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 4%; text-align: center;">#</th>
                  <th style="width: 9%; text-align: center;">HORA</th>
                  <th style="width: 14%;">CATEGORÍA</th>
                  <th style="width: 29%;">CONCEPTO / DETALLE EXACTO</th>
                  <th style="width: 15%;">PROVEEDOR</th>
                  <th style="width: 10%; text-align: center;">MÉTODO</th>
                  <th style="width: 9%; text-align: center;">ESTADO</th>
                  <th style="width: 10%;" class="text-right">MONTO (C$)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsGastosHtml}
                <tr class="highlight-row">
                  <td colspan="7" style="text-align: right; font-weight: bold;">TOTAL ACUMULADO DE COMPRAS / EGRESOS:</td>
                  <td class="text-right font-mono font-bold" style="font-size: 10.5px;">C$ ${expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div style="font-size: 8px; color: #444; margin-bottom: 5px; text-align: center;">
              Certifico que cada una de las compras detalladas cuenta con factura, ticket o voucher bancario físico resguardado en archivo.
            </div>
            <div class="signatures">
              <div class="sig-box">
                <div style="height: 25px;"></div>
                <div>
                  <strong>RESPONSABLE DE COMPRAS / CAJA CHICA</strong><br>
                  <span style="font-size: 8px;">Elaborado por: ${responsableCaja}</span><br>
                  <span style="font-size: 8px;">Firma de Conformidad: ___________________</span>
                </div>
              </div>
              <div class="sig-box">
                <div style="height: 25px;"></div>
                <div>
                  <strong>GERENCIA / AUDITORÍA CONTABLE</strong><br>
                  <span style="font-size: 8px;">Revisado y Aprobado</span><br>
                  <span style="font-size: 8px;">Firma y Sello: ________________________</span>
                </div>
              </div>
            </div>
            <div style="font-size: 7.5px; color: #666; text-align: center; margin-top: 5px;">
              El Bodegón Restaurante & Bar • Documento Oficial B/N • ${modo === 'TODO' ? 'Página 2 de 2' : 'Página 1 de 1'}
            </div>
          </div>
        </div>
      `;

      let docBody = '';
      if (modo === 'TODO') {
        docBody = `${sheet1Html}${sheet2Html}`;
      } else if (modo === 'GENERAL') {
        docBody = sheet1Html;
      } else if (modo === 'CHICA') {
        docBody = sheet2Html;
      }

      const fullHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <title>Acta Oficial El Bodegón - ${selectedDate}</title>
          ${printStyles}
        </head>
        <body>
          ${docBody}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'width=950,height=800');
      if (printWindow) {
        printWindow.document.write(fullHtml);
        printWindow.document.close();
      } else {
        window.print();
      }
      setShowModalPrint(false);
    } catch (err: any) {
      alert('Error generando impresión: ' + err.message);
    }
  };

  return (
    <PinSecurityGate
      title="Bodegón Control"
      subtitle="Auditoría Online • Ventas, Ganancias & Caja Chica"
      pinRequired="4512"
      sessionKey="bodegon_control_pin_verified"
    >
      <div className="min-h-screen bg-[#fcf9f5] text-stone-900 font-sans flex flex-col selection:bg-amber-100">
        {/* ── TOPBAR PRINCIPAL ── */}
        <header className="bg-white border-b border-stone-200/90 sticky top-0 z-30 shadow-2xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm border border-stone-200 bg-[#1c6856] flex items-center justify-center text-white shrink-0">
                <Image src="/logo.png" alt="El Bodegón" width={40} height={40} className="w-full h-full object-cover" priority />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-black text-base sm:text-lg text-stone-900 tracking-tight">Bodegón Control</h1>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
                    Online
                  </span>
                  <span
                    className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border items-center gap-1 ${
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
                    <span className="hidden sm:inline">{realtimeStatus === 'conectado' ? 'En Vivo' : 'Conectando'}</span>
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 font-medium hidden sm:block">
                  Monitoreo de Ganancias, Efectivo, Tarjetas POS & Control de Gastos
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
                title="Bloquear acceso con PIN"
                className="text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-stone-500" />
                <span className="hidden md:inline">Bloquear</span>
              </button>

              <Link
                href="/"
                className="text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Volver al</span>
                <span>Portal</span>
              </Link>

              {/* Botón de Impresión Oficial B/N */}
              <button
                type="button"
                onClick={() => setShowModalPrint(true)}
                className="bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                title="Imprimir Acta Oficial en Blanco y Negro (1 o 2 Hojas)"
              >
                <Printer className="w-4 h-4 text-stone-700" />
                <span className="hidden sm:inline">🖨️ Imprimir Acta (B/N)</span>
                <span className="sm:hidden">Imprimir</span>
              </button>

              {/* Botón único de acción permitida */}
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setShowModalGasto(true);
                }}
                className="bg-[#1c6856] hover:bg-[#154f42] text-white px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Registrar Gasto</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── CUERPO PRINCIPAL ── */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5 flex-1 w-full">
          {/* ── BANNER INFORMATIVO: ESTADO DE CAJA EN RESTAURANTE (ESTRICTAMENTE SOLO LECTURA) ── */}
          <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-stone-100 rounded-3xl p-5 shadow-sm border border-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 border ${
                  jornadaActiva
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-stone-800 text-stone-400 border-stone-700'
                }`}
              >
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-base text-white tracking-tight">
                    {jornadaActiva
                      ? `Caja Física Restaurante: Turno ${jornadaActiva.turno}`
                      : 'Caja Física del Restaurante Cerrada'}
                  </h3>
                  {jornadaActiva ? (
                    <span className="bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ABIERTA AHORA
                    </span>
                  ) : (
                    <span className="bg-stone-700 text-stone-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      CERRADA
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  {jornadaActiva
                    ? `Responsable: ${jornadaActiva.responsable || 'Cajero'} • Fecha: ${jornadaActiva.fecha} • Fondo Inicial: C$ ${Number(jornadaActiva.fondo_inicial).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
                    : 'No hay turno activo en el restaurante en este momento. Esperando apertura en caja física.'}
                </p>
              </div>
            </div>

            {/* Sello de seguridad: Control exclusivo en PC de caja física */}
            <div className="flex items-center gap-2.5 bg-stone-950/60 border border-stone-800 px-3.5 py-2 rounded-2xl text-[11px] text-stone-400">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-stone-200 block text-[10px] uppercase tracking-wider">
                  Control de Turno Exclusivo en PC
                </span>
                <span className="text-[10px] text-stone-400">
                  Apertura y Cierre con arqueo solo en el restaurante.
                </span>
              </div>
            </div>
          </div>

          {/* ── NAVEGACIÓN POR PESTAÑAS ── */}
          <div className="flex items-center justify-between gap-3 border-b border-stone-200/90 pb-2">
            <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-2xl border border-stone-200/80">
              <button
                onClick={() => setActiveTab('VENTAS')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === 'VENTAS'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-600" />
                <span>Ganancias & Ventas Diarias</span>
              </button>

              <button
                onClick={() => setActiveTab('GASTOS')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === 'GASTOS'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                <span>Gastos & Caja Chica ({gastosFiltrados.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('CONSOLIDADO')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === 'CONSOLIDADO'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tabla del Tiempo Histórica</span>
              </button>
            </div>
          </div>

          {/* ── BARRA MAESTRA DE CONTROL DE FECHA (GRANDE, VISIBLE Y FÁCIL DE CAPACITAR) ── */}
          <div className="bg-white border-2 border-stone-200/90 rounded-3xl p-3.5 sm:p-4.5 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
            {/* Botón Día Anterior */}
            <button
              onClick={() => cambiarDia(-1)}
              className="flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 px-4 sm:px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition cursor-pointer active:scale-95 border border-stone-300 shadow-2xs shrink-0"
              title="Ir al día anterior"
            >
              <ChevronLeft className="w-5 h-5 text-stone-700" />
              <span>◀ DÍA ANTERIOR</span>
            </button>

            {/* Display Central Grande con Fecha Completa */}
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-3.5 py-1.5 px-4 bg-amber-50/70 rounded-2xl border border-amber-200">
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider">
                    Viendo fecha:
                  </span>
                  {selectedDate === hoyStr ? (
                    <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      HOY (EN VIVO)
                    </span>
                  ) : (
                    <span className="bg-stone-300 text-stone-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      DÍA ANTERIOR
                    </span>
                  )}
                </div>
                <div className="text-base sm:text-xl font-black text-stone-900 capitalize tracking-tight mt-0.5">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-NI', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>

              {/* Selector de calendario grande */}
              <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-stone-300 shadow-2xs hover:border-amber-500 transition">
                <Calendar className="w-5 h-5 text-amber-700 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs sm:text-sm font-mono font-black text-stone-900 bg-transparent outline-none cursor-pointer"
                  title="Toca para cambiar a cualquier fecha"
                />
              </div>
            </div>

            {/* Controles Derecha: Día Siguiente, Botón de Volver a Hoy e Imprimir */}
            <div className="flex items-center gap-2 justify-stretch shrink-0 flex-wrap sm:flex-nowrap">
              <button
                onClick={() => cambiarDia(1)}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 px-4 sm:px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition cursor-pointer active:scale-95 border border-stone-300 shadow-2xs"
                title="Ir al día siguiente"
              >
                <span>DÍA SIGUIENTE ▶</span>
                <ChevronRight className="w-5 h-5 text-stone-700" />
              </button>

              <button
                onClick={() => setSelectedDate(hoyStr)}
                className={`px-4 sm:px-5 py-3 rounded-2xl text-xs sm:text-sm font-black transition cursor-pointer shadow-sm active:scale-95 flex items-center justify-center gap-1.5 ${
                  selectedDate === hoyStr
                    ? 'bg-amber-500 text-stone-950 border border-amber-600 shadow-md ring-2 ring-amber-300'
                    : 'bg-[#1c6856] hover:bg-[#154f42] text-white'
                }`}
                title="Regresar a la fecha de hoy"
              >
                <span>⚡ VER HOY</span>
              </button>

              <button
                onClick={() => setShowModalPrint(true)}
                className="px-4 sm:px-5 py-3 rounded-2xl text-xs sm:text-sm font-black transition cursor-pointer shadow-sm active:scale-95 flex items-center justify-center gap-2 bg-stone-900 hover:bg-black text-white border border-stone-800"
                title="Imprimir Acta Oficial en Blanco y Negro de este día"
              >
                <Printer className="w-4.5 h-4.5 text-amber-400" />
                <span>🖨️ IMPRIMIR DÍA</span>
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── TAB 1: GANANCIAS & VENTAS DIARIAS (AL NIVEL DEL EJECUTABLE) ── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'VENTAS' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Resumen del Día Seleccionado */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-stone-900 flex items-center gap-2">
                    <span>Ventas del Día:</span>
                    <span className="text-amber-700 font-mono">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-NI', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    {selectedDate === hoyStr && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        En Curso
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-stone-500">
                    Haz clic en cualquier tarjeta para ver su desglose interactivo detallado.
                  </p>
                </div>

                <button
                  onClick={() => setShowModalPrint(true)}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-stone-700 hover:text-stone-950 bg-white border border-stone-300 hover:bg-stone-50 px-3.5 py-2 rounded-xl shadow-2xs transition cursor-pointer"
                  title="Imprimir Acta Oficial en Blanco y Negro"
                >
                  <Printer className="w-4 h-4 text-stone-700" />
                  <span>🖨️ Imprimir Acta (B/N)</span>
                </button>
              </div>

              {/* ── GRID DE TARJETAS PRINCIPALES DE VENTAS ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. VENTAS EN EFECTIVO */}
                <div
                  onClick={() => setActiveDetailModal('CASH')}
                  className="bg-white rounded-3xl p-5 border border-emerald-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span>Ventas Efectivo</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 group-hover:bg-emerald-100 transition">
                      Ver detalle ➜
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-3xl font-black font-mono text-emerald-700 tracking-tight">
                      C$ {selectedDayData.sales.salesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1.5 flex items-center justify-between">
                    <span>Cobrado directamente en caja</span>
                    <span className="font-bold text-emerald-700 font-mono">
                      {selectedDayData.sales.totalGrossSales > 0
                        ? `${((selectedDayData.sales.salesCash / selectedDayData.sales.totalGrossSales) * 100).toFixed(1)}% del total`
                        : '0%'}
                    </span>
                  </p>
                </div>

                {/* 2. VENTAS EN TARJETAS (CON DESGLOSE DE BANCOS) */}
                <div
                  onClick={() => setActiveDetailModal('CARDS')}
                  className="bg-white rounded-3xl p-5 border border-indigo-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <span>Tarjetas POS (Datafast)</span>
                    </span>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 group-hover:bg-indigo-100 transition">
                      Ver desglose ➜
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-3xl font-black font-mono text-indigo-900 tracking-tight">
                      C$ {selectedDayData.sales.totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Chips de Bancos BAC, Ficohsa, Banpro, Lafise */}
                  <div className="mt-3 pt-3 border-t border-indigo-50 grid grid-cols-2 gap-1.5 text-[10px]">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDetailModal('BAC');
                      }}
                      className="bg-rose-50 hover:bg-rose-100 p-1.5 rounded-xl border border-rose-200/80 flex items-center justify-between font-bold text-rose-900 transition"
                    >
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                        BAC
                      </span>
                      <span className="font-mono font-black">
                        C$ {selectedDayData.sales.cardsBAC.toLocaleString('es-NI')}
                      </span>
                    </div>

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDetailModal('FICOHSA');
                      }}
                      className="bg-sky-50 hover:bg-sky-100 p-1.5 rounded-xl border border-sky-200/80 flex items-center justify-between font-bold text-sky-900 transition"
                    >
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
                        Ficohsa
                      </span>
                      <span className="font-mono font-black">
                        C$ {selectedDayData.sales.cardsFicohsa.toLocaleString('es-NI')}
                      </span>
                    </div>

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDetailModal('BANPRO');
                      }}
                      className="bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-xl border border-emerald-200/80 flex items-center justify-between font-bold text-emerald-900 transition"
                    >
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        Banpro
                      </span>
                      <span className="font-mono font-black">
                        C$ {selectedDayData.sales.cardsBanpro.toLocaleString('es-NI')}
                      </span>
                    </div>

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDetailModal('LAFISE');
                      }}
                      className="bg-amber-50 hover:bg-amber-100 p-1.5 rounded-xl border border-amber-200/80 flex items-center justify-between font-bold text-amber-900 transition"
                    >
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                        LAFISE
                      </span>
                      <span className="font-mono font-black">
                        C$ {selectedDayData.sales.cardsLafise.toLocaleString('es-NI')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. DELIVERY / PEDIDOSYA */}
                <div
                  onClick={() => setActiveDetailModal('DELIVERY')}
                  className="bg-white rounded-3xl p-5 border border-amber-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-amber-600" />
                      <span>Delivery / PedidosYa</span>
                    </span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 group-hover:bg-amber-100 transition">
                      Ver detalle ➜
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-3xl font-black font-mono text-amber-700 tracking-tight">
                      C$ {selectedDayData.sales.salesPedidosYa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1.5 flex items-center justify-between">
                    <span>Pedidos por app externa</span>
                    <span className="font-bold text-amber-700 font-mono">
                      {selectedDayData.sales.totalGrossSales > 0
                        ? `${((selectedDayData.sales.salesPedidosYa / selectedDayData.sales.totalGrossSales) * 100).toFixed(1)}% del total`
                        : '0%'}
                    </span>
                  </p>
                </div>
              </div>

              {/* ── FILA INFERIOR DE TOTALES: VENTAS BRUTAS, GASTOS & GANANCIA NETA ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* VENTAS BRUTAS TOTALES */}
                <div
                  onClick={() => setActiveDetailModal('GROSS')}
                  className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-stone-500 text-xs font-extrabold uppercase tracking-wider">
                    <span>Ventas Brutas Totales</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2.5">
                    <span className="text-3xl font-black font-mono text-stone-900">
                      C$ {selectedDayData.sales.totalGrossSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">Efectivo + Tarjetas + Delivery</p>
                </div>

                {/* GASTOS DE CAJA CHICA DEL DÍA */}
                <div
                  onClick={() => setActiveTab('GASTOS')}
                  className="bg-white rounded-3xl p-5 border border-rose-200 shadow-2xs hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-rose-800 text-xs font-extrabold uppercase tracking-wider">
                    <span>Gastos del Día</span>
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="mt-2.5">
                    <span className="text-3xl font-black font-mono text-rose-700">
                      C$ {selectedDayData.expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-600 mt-1">
                    C$ {selectedDayData.expensesCash.toLocaleString('es-NI')} efectivo • C$ {selectedDayData.expensesTransf.toLocaleString('es-NI')} transf.
                  </p>
                </div>

                {/* GANANCIA NETA */}
                <div
                  onClick={() => setActiveDetailModal('NET')}
                  className={`rounded-3xl p-5 border shadow-2xs hover:shadow-md transition cursor-pointer ${
                    selectedDayData.netProfit >= 0
                      ? 'bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-950 text-white border-emerald-600/40'
                      : 'bg-gradient-to-br from-rose-950 via-stone-900 to-stone-950 text-white border-rose-600/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-extrabold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Ganancia Neta Real</span>
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-stone-200">
                      {selectedDayData.marginPercent.toFixed(1)}% Margen
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <span
                      className={`text-3xl font-black font-mono ${
                        selectedDayData.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      C$ {selectedDayData.netProfit.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">Ventas Brutas - Total Egresos del Día</p>
                </div>
              </div>

              {/* ── GRÁFICA DE EVOLUCIÓN HISTÓRICA DE VENTAS VS GASTOS ── */}
              <div className="bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#1c6856]" />
                    <h3 className="font-black text-sm text-stone-900">
                      Comparativa Temporal: Ventas Brutas vs Egresos
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setTimeFilterDays(7)}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        timeFilterDays === 7 ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500'
                      }`}
                    >
                      7 Días
                    </button>
                    <button
                      onClick={() => setTimeFilterDays(14)}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        timeFilterDays === 14 ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500'
                      }`}
                    >
                      14 Días
                    </button>
                    <button
                      onClick={() => setTimeFilterDays(30)}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        timeFilterDays === 30 ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500'
                      }`}
                    >
                      30 Días
                    </button>
                  </div>
                </div>

                {/* Contenedor de barras */}
                <div className="h-44 w-full flex items-end gap-2 sm:gap-4 pt-6 pb-2 px-2 border-b border-stone-100">
                  {chartDaysList.map((c) => {
                    const salesHeight = maxChartValue > 0 ? (c.grossSales / maxChartValue) * 100 : 0;
                    const expHeight = maxChartValue > 0 ? (c.expenses / maxChartValue) * 100 : 0;
                    const isSelected = c.dateStr === selectedDate;

                    return (
                      <div
                        key={c.dateStr}
                        onClick={() => setSelectedDate(c.dateStr)}
                        className={`flex-1 flex flex-col items-center justify-end h-full group cursor-pointer transition-all ${
                          isSelected ? 'scale-105' : 'opacity-85 hover:opacity-100'
                        }`}
                        title={`${c.label}: Ventas C$ ${c.grossSales.toLocaleString('es-NI')} | Gastos C$ ${c.expenses.toLocaleString('es-NI')}`}
                      >
                        <div className="w-full flex items-end justify-center gap-1 h-32">
                          {/* Barra Ventas */}
                          <div
                            style={{ height: `${Math.max(salesHeight, 4)}%` }}
                            className={`w-1/2 rounded-t-md transition-all ${
                              isSelected
                                ? 'bg-emerald-600 shadow-sm'
                                : 'bg-emerald-500/80 group-hover:bg-emerald-600'
                            }`}
                          />
                          {/* Barra Gastos */}
                          <div
                            style={{ height: `${Math.max(expHeight, 4)}%` }}
                            className={`w-1/2 rounded-t-md transition-all ${
                              isSelected
                                ? 'bg-rose-600 shadow-sm'
                                : 'bg-rose-400/80 group-hover:bg-rose-500'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-[9px] sm:text-[10px] font-bold mt-2 truncate w-full text-center ${
                            isSelected ? 'text-[#1c6856] font-black' : 'text-stone-500'
                          }`}
                        >
                          {c.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-center gap-6 text-xs text-stone-500 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-emerald-500" />
                    <span>Ventas Brutas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-rose-500" />
                    <span>Gastos / Egresos</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── TAB 2: GASTOS & CAJA CHICA (CON CONTROL DE COMPROBANTES) ──── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'GASTOS' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Tarjetas KPI de Gastos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 text-stone-500 text-xs font-bold uppercase tracking-wider">
                    <span>Total Gastos del Día</span>
                    <TrendingDown className="w-4 h-4 text-stone-700" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-stone-900">
                      C$ {metricasGastosDia.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">Efectivo + Transferencias</p>
                </div>

                <div className="bg-white border border-emerald-200/90 rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                    <span>Efectivo (Caja Chica)</span>
                    <Banknote className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-emerald-700">
                      C$ {metricasGastosDia.efectivo.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-600 mt-1">
                    Fondo inicial: C$ {metricasGastosDia.fondoCaja.toLocaleString('es-NI')} • Restante: C${' '}
                    {metricasGastosDia.saldoEfectivoRestante.toLocaleString('es-NI')}
                  </p>
                </div>

                <div className="bg-white border border-sky-200/90 rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 text-sky-800 text-xs font-bold uppercase tracking-wider">
                    <span>Transferencias</span>
                    <Send className="w-4 h-4 text-sky-700" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-sky-700">
                      C$ {metricasGastosDia.transferencia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-600 mt-1">Pagos bancarios directos</p>
                </div>

                <div className="bg-white border border-amber-200/90 rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
                    <span>Pendientes Transferir</span>
                    <Clock className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-amber-700">
                      C$ {metricasGastosDia.pendientesMonto.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-600 mt-1">
                    {metricasGastosDia.pendientesCount} pago{metricasGastosDia.pendientesCount !== 1 ? 's' : ''} por emitir
                  </p>
                </div>
              </div>

              {/* Filtros de Gastos */}
              <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
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
                      <option value="PENDIENTE_TRANSFERENCIA">Pendiente</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-end gap-2 flex-1 sm:max-w-md">
                  <div className="relative flex-1">
                    <label className="block text-[10px] text-stone-500 font-bold uppercase mb-1">Buscar Gasto</label>
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

                  <button
                    type="button"
                    onClick={() => handleImprimirActaOficial('CHICA')}
                    className="flex items-center gap-1.5 text-xs font-bold text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200 border border-stone-300 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs whitespace-nowrap mb-0.5"
                    title="Imprimir Acta Oficial de Caja Chica y Detalle de Compras en 1 Hoja B/N"
                  >
                    <Printer className="w-3.5 h-3.5 text-stone-700" />
                    <span className="hidden lg:inline">Imprimir Caja Chica (1 Hoja)</span>
                    <span className="lg:hidden">Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Tabla de Compras & Gastos */}
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
                          <td colSpan={10} className="py-12 text-center text-stone-400">
                            <span className="text-4xl block mb-2">🛒</span>
                            <p className="font-black text-stone-800 text-sm">
                              No hay compras ni gastos registrados para el {selectedDate === hoyStr ? 'día de hoy' : `día ${selectedDate}`}.
                            </p>
                            <p className="text-xs text-stone-500 mt-1">
                              {selectedDate === hoyStr
                                ? 'Usa el botón "+ Registrar Gasto" arriba para ingresar una nueva compra de hoy.'
                                : 'Puedes usar las flechas del selector para navegar a otra fecha o presionar "⚡ VER HOY".'}
                            </p>
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
                                esPendiente ? 'bg-amber-50/40' : ''
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
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
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
                                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 p-1.5 rounded-lg border border-stone-300 cursor-pointer transition"
                                    title="Ver comprobante"
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
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── TAB 3: TABLA DEL TIEMPO HISTÓRICA CONSOLIDADA ─────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'CONSOLIDADO' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-stone-900">
                    Historial Cronológico de Turnos & Ganancias
                  </h2>
                  <p className="text-xs text-stone-500">
                    Consolidado diario de ventas, tarjetas desglosadas por banco, gastos de caja chica y ganancia neta.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-stone-200/90 rounded-2xl shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-bold">
                        <th className="py-3 px-4">Fecha</th>
                        <th className="py-3 px-4">Estado Caja</th>
                        <th className="py-3 px-4 text-right">Efectivo (C$)</th>
                        <th className="py-3 px-4 text-right">Tarjetas POS (C$)</th>
                        <th className="py-3 px-4 text-right">Delivery (C$)</th>
                        <th className="py-3 px-4 text-right font-black">Ventas Brutas (C$)</th>
                        <th className="py-3 px-4 text-right text-rose-700">Gastos (C$)</th>
                        <th className="py-3 px-4 text-right font-black">Ganancia Neta (C$)</th>
                        <th className="py-3 px-4 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-stone-700">
                      {timelineDaysList.map((day) => {
                        const isAbierta = day.jornada?.estado === 'ABIERTA';
                        const isSelected = day.date === selectedDate;

                        return (
                          <tr
                            key={day.date}
                            onClick={() => setSelectedDate(day.date)}
                            className={`hover:bg-stone-50/70 transition-colors cursor-pointer ${
                              isSelected ? 'bg-amber-50/30 font-semibold' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-bold text-stone-900">
                              {day.date}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border ${
                                  isAbierta
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : 'bg-stone-100 text-stone-600 border-stone-200'
                                }`}
                              >
                                {isAbierta ? 'ABIERTA' : 'CERRADA'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-700">
                              C$ {day.sales.salesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-indigo-700">
                              C$ {day.sales.totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-amber-700">
                              C$ {day.sales.salesPedidosYa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-stone-900">
                              C$ {day.sales.totalGrossSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                              C$ {day.expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black">
                              <span
                                className={day.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                              >
                                C$ {day.netProfit.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(day.date);
                                  setActiveTab('VENTAS');
                                }}
                                className="text-[10px] font-bold text-[#1c6856] hover:underline"
                              >
                                Ver Dashboard ➜
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── MODAL ÚNICO DE ESCRITURA: + REGISTRAR COMPRA / GASTO ──────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {showModalGasto && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95">
              <div className="bg-[#1c6856] text-white p-4.5 flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Registrar Compra / Gasto de Insumos</span>
                </h3>
                <button
                  onClick={() => setShowModalGasto(false)}
                  className="text-emerald-100 hover:text-white cursor-pointer"
                >
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
                      autoFocus
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
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-medium"
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
                  <label className="block text-stone-700 font-bold mb-1">Concepto / Detalle de la Compra *</label>
                  <input
                    type="text"
                    placeholder="Ej: 30 lbs carne de res para bistec, 2 sacos de papa..."
                    required
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Proveedor / Negocio</label>
                  <input
                    type="text"
                    placeholder="Nombre del proveedor o distribuidora..."
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900 mb-2"
                  />
                  {/* Chips de proveedores rápidos */}
                  <div className="flex flex-wrap gap-1.5">
                    {PROVEEDORES_FRECUENTES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setProveedor(p)}
                        className="text-[10px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg border border-stone-200 transition cursor-pointer"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-700 font-bold mb-1">Método de Pago</label>
                    <select
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value as any)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-bold"
                    >
                      <option value="EFECTIVO">💵 Efectivo (Caja Chica)</option>
                      <option value="TRANSFERENCIA">📲 Transferencia Bancaria</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-700 font-bold mb-1">Registrado Por</label>
                    <input
                      type="text"
                      value={registradoPor}
                      onChange={(e) => setRegistradoPor(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-medium"
                    />
                  </div>
                </div>

                {metodoPago === 'TRANSFERENCIA' && (
                  <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                    <div>
                      <label className="block text-stone-600 font-bold mb-1">Estado de Pago</label>
                      <select
                        value={estadoPago}
                        onChange={(e) => setEstadoPago(e.target.value as any)}
                        className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-stone-900 font-bold"
                      >
                        <option value="PAGADO">✓ Ya Transferido</option>
                        <option value="PENDIENTE_TRANSFERENCIA">⚠️ Pendiente de Transferir</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-stone-600 font-bold mb-1">No. Referencia Banco</label>
                      <input
                        type="text"
                        placeholder="BAC / LAFISE / Banpro..."
                        value={referenciaBanco}
                        onChange={(e) => setReferenciaBanco(e.target.value)}
                        className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 font-mono text-stone-900"
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
                    className="w-full text-stone-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1c6856]/10 file:text-[#1c6856] hover:file:bg-[#1c6856]/20 cursor-pointer"
                  />
                  {fotoBase64 && (
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">✓ Imagen adjunta lista para sincronizar</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setShowModalGasto(false)}
                    className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 cursor-pointer font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-[#1c6856] hover:bg-[#154f42] text-white px-5 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Guardando en la Nube...' : 'Registrar y Sincronizar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── MODAL DE DETALLE INTERACTIVO DE VENTAS (ESTILO EJECUTABLE) ─── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeDetailModal && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => setActiveDetailModal(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-stone-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#1c6856] text-white p-4.5 flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-300" />
                  <span>
                    {activeDetailModal === 'CASH' && 'Detalle: Ventas en Efectivo'}
                    {activeDetailModal === 'CARDS' && 'Detalle: Tarjetas POS Datafast'}
                    {activeDetailModal === 'BAC' && 'Detalle: POS BAC Credomatic'}
                    {activeDetailModal === 'FICOHSA' && 'Detalle: POS Banco Ficohsa'}
                    {activeDetailModal === 'BANPRO' && 'Detalle: POS Banpro'}
                    {activeDetailModal === 'LAFISE' && 'Detalle: POS LAFISE Bancentro'}
                    {activeDetailModal === 'DELIVERY' && 'Detalle: Ventas PedidosYa'}
                    {activeDetailModal === 'GROSS' && 'Detalle: Ventas Brutas Totales'}
                    {activeDetailModal === 'NET' && 'Detalle: Conciliación Ganancia Neta'}
                  </span>
                </h3>
                <button
                  onClick={() => setActiveDetailModal(null)}
                  className="text-emerald-100 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-stone-700">
                <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-center">
                  <span className="text-[10px] text-stone-500 font-bold uppercase block">
                    Fecha del Turno
                  </span>
                  <span className="font-mono font-black text-stone-900 text-sm">
                    {selectedDate}
                  </span>
                </div>

                {activeDetailModal === 'CASH' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-stone-100">
                      <span className="text-stone-600">Total Efectivo Recaudado:</span>
                      <span className="font-mono font-black text-emerald-700 text-base">
                        C$ {selectedDayData.sales.salesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-stone-500 leading-relaxed text-[11px]">
                      Este valor corresponde a los pagos ingresados físicamente en la gaveta de caja durante el turno.
                      El arqueo físico y liquidación de billetes se realiza en la computadora de caja.
                    </p>
                  </div>
                )}

                {(activeDetailModal === 'CARDS' ||
                  activeDetailModal === 'BAC' ||
                  activeDetailModal === 'FICOHSA' ||
                  activeDetailModal === 'BANPRO' ||
                  activeDetailModal === 'LAFISE') && (
                  <div className="space-y-2.5">
                    <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 flex justify-between items-center">
                      <span className="font-bold text-indigo-950">Total Tarjetas POS:</span>
                      <span className="font-mono font-black text-indigo-900 text-lg">
                        C$ {selectedDayData.sales.totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between items-center p-2 rounded-xl bg-rose-50 border border-rose-100">
                        <span className="font-bold text-rose-900">🔴 BAC Credomatic</span>
                        <span className="font-mono font-black text-rose-950">
                          C$ {selectedDayData.sales.cardsBAC.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center p-2 rounded-xl bg-sky-50 border border-sky-100">
                        <span className="font-bold text-sky-900">🔵 Banco Ficohsa</span>
                        <span className="font-mono font-black text-sky-950">
                          C$ {selectedDayData.sales.cardsFicohsa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                        <span className="font-bold text-emerald-900">🟢 Banpro Grupo Promerica</span>
                        <span className="font-mono font-black text-emerald-950">
                          C$ {selectedDayData.sales.cardsBanpro.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center p-2 rounded-xl bg-amber-50 border border-amber-100">
                        <span className="font-bold text-amber-900">🟡 Banco LAFISE Bancentro</span>
                        <span className="font-mono font-black text-amber-950">
                          C$ {selectedDayData.sales.cardsLafise.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeDetailModal === 'DELIVERY' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-stone-100">
                      <span className="text-stone-600">Total Delivery PedidosYa:</span>
                      <span className="font-mono font-black text-amber-700 text-base">
                        C$ {selectedDayData.sales.salesPedidosYa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-stone-500 leading-relaxed text-[11px]">
                      Ventas realizadas a través de la aplicación de delivery PedidosYa para despacho a domicilio.
                    </p>
                  </div>
                )}

                {activeDetailModal === 'GROSS' && (
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                      <span>Ventas Efectivo:</span>
                      <span className="font-mono font-bold text-stone-900">
                        C$ {selectedDayData.sales.salesCash.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                      <span>Tarjetas POS (Datafast):</span>
                      <span className="font-mono font-bold text-stone-900">
                        C$ {selectedDayData.sales.totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                      <span>Delivery PedidosYa:</span>
                      <span className="font-mono font-bold text-stone-900">
                        C$ {selectedDayData.sales.salesPedidosYa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 font-black text-sm text-[#1c6856]">
                      <span>Ventas Brutas Totales:</span>
                      <span className="font-mono">
                        C$ {selectedDayData.sales.totalGrossSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {activeDetailModal === 'NET' && (
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                      <span>(+) Ventas Brutas Totales:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        C$ {selectedDayData.sales.totalGrossSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                      <span>(-) Total Gastos de Caja Chica:</span>
                      <span className="font-mono font-bold text-rose-700">
                        C$ {selectedDayData.expensesTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 font-black text-base text-stone-900">
                      <span>(=) Ganancia Neta Real:</span>
                      <span
                        className={`font-mono ${
                          selectedDayData.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        C$ {selectedDayData.netProfit.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 flex justify-between items-center text-[11px] font-bold">
                      <span className="text-stone-600">Margen Operativo:</span>
                      <span className="text-stone-900 font-mono">
                        {selectedDayData.marginPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-2 text-right">
                  <button
                    onClick={() => setActiveDetailModal(null)}
                    className="bg-stone-900 text-white px-4 py-2 rounded-xl font-bold cursor-pointer hover:bg-stone-800 transition"
                  >
                    Cerrar Detalle
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── MODAL: SELECCIÓN DE IMPRESIÓN OFICIAL B/N (1 O 2 HOJAS) ───── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {showModalPrint && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setShowModalPrint(false)}
          >
            <div
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-stone-900 text-white flex items-center justify-center text-xl shadow-md shrink-0">
                    <Printer className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-stone-900 leading-tight">
                      Impresión Oficial en B/N
                    </h3>
                    <p className="text-xs text-stone-500">
                      El Bodegón • Documentos para Archivo Físico & Firmas
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModalPrint(false)}
                  className="text-stone-400 hover:text-stone-700 p-1 rounded-xl hover:bg-stone-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Indicador de Fecha */}
              <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 mb-5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                    Fecha del Acta a Imprimir:
                  </span>
                  <span className="text-sm font-black text-stone-900 capitalize">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-NI', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded-xl border border-amber-300 text-amber-950">
                  {selectedDate}
                </span>
              </div>

              <div className="space-y-3">
                {/* Opción 1: Acta Completa (2 Hojas) */}
                <button
                  onClick={() => handleImprimirActaOficial('TODO')}
                  className="w-full text-left p-4 rounded-2xl border-2 border-stone-900 bg-stone-900 hover:bg-stone-800 text-white transition cursor-pointer flex items-center justify-between group shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-white">
                        📑 IMPRIMIR ACTA COMPLETA (2 HOJAS B/N)
                      </span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400 text-stone-950">
                        Recomendado
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-300 mt-1 leading-snug">
                      Hoja 1: Caja General & Ventas (Arqueo, Tarjetas POS, Margen)
                      <br />
                      Hoja 2: Caja Chica & Detalle Exhaustivo de Compras del Día
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition shrink-0" />
                </button>

                {/* Opción 2: Solo Hoja 1 */}
                <button
                  onClick={() => handleImprimirActaOficial('GENERAL')}
                  className="w-full text-left p-4 rounded-2xl border border-stone-200 hover:border-stone-400 bg-stone-50 hover:bg-white text-stone-900 transition cursor-pointer flex items-center justify-between group"
                >
                  <div>
                    <span className="font-black text-sm text-stone-900">
                      💵 SOLO HOJA 1: CAJA GENERAL & VENTAS (1 HOJA)
                    </span>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Ingresos brutos, desglose BAC/Ficohsa/Banpro/Lafise, PedidosYa y utilidad líquida con firmas.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-400 group-hover:translate-x-1 transition shrink-0" />
                </button>

                {/* Opción 3: Solo Hoja 2 */}
                <button
                  onClick={() => handleImprimirActaOficial('CHICA')}
                  className="w-full text-left p-4 rounded-2xl border border-stone-200 hover:border-stone-400 bg-stone-50 hover:bg-white text-stone-900 transition cursor-pointer flex items-center justify-between group"
                >
                  <div>
                    <span className="font-black text-sm text-stone-900">
                      🛒 SOLO HOJA 2: CAJA CHICA & GASTOS DETALLADOS (1 HOJA)
                    </span>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Balance del fondo en gaveta y la relación detallada de cada compra/gasto individual con firmas.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-400 group-hover:translate-x-1 transition shrink-0" />
                </button>
              </div>

              <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                <span>Diseño B/N estricto para impresoras láser / térmicas</span>
                <button
                  onClick={() => setShowModalPrint(false)}
                  className="px-4 py-2 font-bold text-stone-600 hover:text-stone-900 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── MODAL: VER COMPROBANTE DE COMPRA ─────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {fotoModalUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setFotoModalUrl(null)}
          >
            <div className="relative max-w-xl w-full max-h-[90vh] bg-stone-950 rounded-2xl overflow-hidden p-2">
              <button
                onClick={() => setFotoModalUrl(null)}
                className="absolute top-3 right-3 bg-stone-800 text-white p-1.5 rounded-full z-10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={fotoModalUrl}
                alt="Comprobante de compra"
                className="w-full h-auto max-h-[85vh] object-contain rounded-xl"
              />
            </div>
          </div>
        )}
      </div>
    </PinSecurityGate>
  );
}
