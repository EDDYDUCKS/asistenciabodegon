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
  Landmark,
  ShoppingCart,
  Download,
  FileSpreadsheet,
  Save,
  Edit3,
} from 'lucide-react';
import PinSecurityGate from '@/components/PinSecurityGate';

export interface ParsedSalesData {
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

export interface ParsedOpeningData {
  totalOpeningNIO: number;
  totalOpeningUSD: number;
  exchangeRate: number;
  totalOpeningEquivNIO: number;
  openingNotes?: string;
  openedBy?: string;
}

export interface ParsedClosingAudit {
  actualCashNIO: number;
  expectedCashNIO: number;
  differenceNIO: number;
  auditStatus: 'SQUARED' | 'SURPLUS' | 'SHORTAGE';
  dailyNetProfit: number;
  closedBy?: string;
  closedAt?: string;
}

export interface ParsedPettyClosing {
  actualCashCounted: number;
  expectedBalance: number;
  difference: number;
  auditStatus: 'SQUARED' | 'SURPLUS' | 'SHORTAGE';
  closedBy?: string;
  closedAt?: string;
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
  const [sortChronological, setSortChronological] = useState<boolean>(true); // true = Cronológico (Mañana ➔ Noche, como en Excel)

  // Modales de funciones
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [showModalPrint, setShowModalPrint] = useState(false);
  const [showModalEditSales, setShowModalEditSales] = useState(false);
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);

  // Formulario de ventas (para carga/edición manual del jefe)
  const [salesForm, setSalesForm] = useState({
    salesCash: '',
    cardsBAC: '',
    cardsFicohsa: '',
    cardsBanpro: '',
    cardsLafise: '',
    salesPedidosYa: '',
    tips: '',
  });
  const [submittingSales, setSubmittingSales] = useState(false);

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

      // Determinar si hay alguna jornada actualmente ABIERTA en la PC del restaurante estrictamente para el día de hoy
      const activa = jList.find((j) => j.estado === 'ABIERTA' && j.fecha === hoyStr) || null;
      setJornadaActiva(activa);

      setGastos((gData as CompraGasto[]) || []);
    } catch (err: any) {
      console.error('Error cargando datos de Bodegón Control:', err.message);
    } finally {
      setLoading(false);
    }
  }, [hoyStr]);

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

  // Helper para parsear datos de apertura de Caja General
  const parseOpeningFromObservaciones = useCallback((obs?: string | null, fallbackFondo: number = 0): ParsedOpeningData => {
    if (obs) {
      const match = obs.match(/\[OPENING_DATA:(\{.*?\})\]/);
      if (match && match[1]) {
        try {
          const p = JSON.parse(match[1]);
          const nio = Number(p.totalOpeningNIO) || 0;
          const usd = Number(p.totalOpeningUSD) || 0;
          const rate = Number(p.exchangeRate) || 36.0;
          const equiv = Number(p.totalOpeningEquivNIO) || (nio + usd * rate);
          return {
            totalOpeningNIO: nio,
            totalOpeningUSD: usd,
            exchangeRate: rate,
            totalOpeningEquivNIO: equiv,
            openingNotes: p.openingNotes || '',
            openedBy: p.openedBy || '',
          };
        } catch {}
      }
    }
    return {
      totalOpeningNIO: fallbackFondo,
      totalOpeningUSD: 0,
      exchangeRate: 36.0,
      totalOpeningEquivNIO: fallbackFondo,
      openingNotes: '',
      openedBy: '',
    };
  }, []);

  // Helper para parsear la auditoría de cierre de Caja General
  const parseClosingAuditFromObservaciones = useCallback((obs?: string | null): ParsedClosingAudit | null => {
    if (!obs) return null;
    const match = obs.match(/\[CLOSING_AUDIT:(\{.*?\})\]/);
    if (match && match[1]) {
      try {
        const a = JSON.parse(match[1]);
        return {
          actualCashNIO: Number(a.actualCashNIO) || 0,
          expectedCashNIO: Number(a.expectedCashNIO) || 0,
          differenceNIO: Number(a.differenceNIO) || 0,
          auditStatus: a.auditStatus || 'SQUARED',
          dailyNetProfit: Number(a.dailyNetProfit) || 0,
          closedBy: a.closedBy || '',
          closedAt: a.closedAt || '',
        };
      } catch {}
    }
    return null;
  }, []);

  // Helper para parsear el cierre de Caja Chica
  const parsePettyClosingFromObservaciones = useCallback((obs?: string | null): ParsedPettyClosing | null => {
    if (!obs) return null;
    const match = obs.match(/\[PETTY_CLOSING:(\{.*?\})\]/);
    if (match && match[1]) {
      try {
        const p = JSON.parse(match[1]);
        return {
          actualCashCounted: Number(p.actualCashCounted) || 0,
          expectedBalance: Number(p.expectedBalance) || 0,
          difference: Number(p.difference) || 0,
          auditStatus: p.auditStatus || 'SQUARED',
          closedBy: p.closedBy || '',
          closedAt: p.closedAt || '',
        };
      } catch {}
    }
    return null;
  }, []);

  // 4. Map de días consolidado para la gráfica y tabla histórica
  const dailyHistoryMap = useMemo(() => {
    const map = new Map<string, {
      date: string;
      jornada?: JornadaDiaria;
      sales: ParsedSalesData;
      opening: ParsedOpeningData;
      closingAudit: ParsedClosingAudit | null;
      pettyClosing: ParsedPettyClosing | null;
      isCajaGeneralOpen: boolean;
      isCajaChicaOpen: boolean;
      expensesTotal: number;
      expensesCash: number;
      expensesTransf: number;
      netProfit: number;
      marginPercent: number;
    }>();

    // Indexar jornadas
    jornadas.forEach((j) => {
      const sales = parseVentasFromObservaciones(j.observaciones);
      const opening = parseOpeningFromObservaciones(j.observaciones, Number(j.fondo_inicial) || 0);
      const closingAudit = parseClosingAuditFromObservaciones(j.observaciones);
      const pettyClosing = parsePettyClosingFromObservaciones(j.observaciones);

      const hasGeneralOpening = /\[OPENING_DATA:\{.*?\}\]/.test(j.observaciones || '');
      const hasPettyOpening = /\[FONDOS_COMPOSITION:\{.*?\}\]/.test(j.observaciones || '') || Number(j.fondo_inicial) > 0;

      const isCajaGeneralOpen = j.estado === 'ABIERTA' && (hasGeneralOpening || !closingAudit);
      const isCajaChicaOpen = j.estado === 'ABIERTA' && hasPettyOpening && !pettyClosing && !/Cierre liquidado/.test(j.observaciones || '');

      map.set(j.fecha, {
        date: j.fecha,
        jornada: j,
        sales,
        opening,
        closingAudit,
        pettyClosing,
        isCajaGeneralOpen,
        isCajaChicaOpen,
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
          opening: {
            totalOpeningNIO: 0,
            totalOpeningUSD: 0,
            exchangeRate: 36.0,
            totalOpeningEquivNIO: 0,
          },
          closingAudit: null,
          pettyClosing: null,
          isCajaGeneralOpen: false,
          isCajaChicaOpen: false,
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
  }, [jornadas, gastos, parseVentasFromObservaciones, parseOpeningFromObservaciones, parseClosingAuditFromObservaciones, parsePettyClosingFromObservaciones]);

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
      opening: {
        totalOpeningNIO: 0,
        totalOpeningUSD: 0,
        exchangeRate: 36.0,
        totalOpeningEquivNIO: 0,
      },
      closingAudit: null,
      pettyClosing: null,
      isCajaGeneralOpen: false,
      isCajaChicaOpen: false,
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

  // Helper para parsear la composición de fondos iniciales
  const parseFondosComposition = useCallback((obs?: string | null, fallbackFondoInicial: number = 0) => {
    if (obs) {
      const match = obs.match(/\[FONDOS_COMPOSITION:(\{.*?\})\]/);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          return {
            previousDayRemaining: Number(parsed.previousDayRemaining) || 0,
            generalCashTransfer: Number(parsed.generalCashTransfer) || 0,
            bossContribution: Number(parsed.bossContribution) || 0,
          };
        } catch {
          // ignore
        }
      }
    }
    return {
      previousDayRemaining: 0,
      generalCashTransfer: 0,
      bossContribution: fallbackFondoInicial,
    };
  }, []);

  // Métricas del día seleccionado para gastos (desglose claro de efectivo vs banco)
  const metricasGastosDia = useMemo(() => {
    let totEfectivo = 0;
    let totTransf = 0;
    let totFondeosExtras = 0;
    let pendientesCount = 0;
    let pendientesMonto = 0;

    const gastosDelDia = gastos.filter((g) => g.fecha_hora.slice(0, 10) === selectedDate);
    gastosDelDia.forEach((g) => {
      const m = Number(g.monto) || 0;
      if (g.tipo === 'INGRESO_FONDEO') {
        totFondeosExtras += m;
      } else if (g.metodo_pago === 'TRANSFERENCIA') {
        totTransf += m;
        if (g.estado_pago === 'PENDIENTE_TRANSFERENCIA') {
          pendientesCount++;
          pendientesMonto += m;
        }
      } else {
        totEfectivo += m;
      }
    });

    const jornada = selectedDayData.jornada;
    const hasGeneralOpening = /\[OPENING_DATA:\{.*?\}\]/.test(jornada?.observaciones || '');
    const fallbackFondo = hasGeneralOpening ? 0 : Number(jornada?.fondo_inicial || 0);
    const fondosComp = parseFondosComposition(jornada?.observaciones, fallbackFondo);
    const fondoInicial = (fondosComp.previousDayRemaining || 0) + (fondosComp.generalCashTransfer || 0) + (fondosComp.bossContribution || 0);
    const totalEntradas = fondoInicial + totFondeosExtras;
    const saldoEfectivoRestante = totalEntradas - totEfectivo;

    return {
      total: totEfectivo + totTransf,
      efectivo: totEfectivo,
      transferencia: totTransf,
      pendientesCount,
      pendientesMonto,
      fondoCaja: fondoInicial,
      fondosComp,
      totFondeosExtras,
      totalEntradas,
      saldoEfectivoRestante,
    };
  }, [gastos, selectedDate, selectedDayData, parseFondosComposition]);

  // Métricas del día de hoy en vivo para el banner superior
  const metricasGastosHoy = useMemo(() => {
    let totEfectivo = 0;
    let totTransf = 0;
    let totFondeosExtras = 0;

    const gastosHoy = gastos.filter((g) => g.fecha_hora.slice(0, 10) === hoyStr);
    gastosHoy.forEach((g) => {
      const m = Number(g.monto) || 0;
      if (g.tipo === 'INGRESO_FONDEO') {
        totFondeosExtras += m;
      } else if (g.metodo_pago === 'TRANSFERENCIA') {
        totTransf += m;
      } else {
        totEfectivo += m;
      }
    });

    const jornadaHoy = jornadas.find((j) => j.fecha === hoyStr);
    const hasGeneralOpening = /\[OPENING_DATA:\{.*?\}\]/.test(jornadaHoy?.observaciones || '');
    const fallbackFondo = hasGeneralOpening ? 0 : Number(jornadaHoy?.fondo_inicial || 0);
    const fondosComp = parseFondosComposition(jornadaHoy?.observaciones, fallbackFondo);
    const fondoCajaChica = (fondosComp.previousDayRemaining || 0) + (fondosComp.generalCashTransfer || 0) + (fondosComp.bossContribution || 0);
    const totalEntradas = fondoCajaChica + totFondeosExtras;
    const saldoEfectivoRestante = totalEntradas - totEfectivo;

    return {
      total: totEfectivo + totTransf,
      efectivo: totEfectivo,
      transferencia: totTransf,
      saldoEfectivoRestante,
      fondoCajaChica,
    };
  }, [gastos, hoyStr, jornadas, parseFondosComposition]);

  // Resumen del estado hoy para Caja General y Caja Chica
  const todaySummary = useMemo(() => {
    const jornadaHoy = jornadas.find((j) => j.fecha === hoyStr && j.estado === 'ABIERTA');
    const isCajaGeneralAbierta = Boolean(jornadaHoy && /\[OPENING_DATA:\{.*?\}\]/.test(jornadaHoy.observaciones || ''));
    const isCajaChicaAbierta = Boolean(
      jornadaHoy &&
      (/\[FONDOS_COMPOSITION:\{.*?\}\]/.test(jornadaHoy.observaciones || '') || Number(jornadaHoy.fondo_inicial) > 0) &&
      !/\[PETTY_CLOSING:\{.*?\}\]/.test(jornadaHoy.observaciones || '') &&
      !/Cierre liquidado/.test(jornadaHoy.observaciones || '')
    );

    const opening = parseOpeningFromObservaciones(jornadaHoy?.observaciones, Number(jornadaHoy?.fondo_inicial) || 0);
    const sales = parseVentasFromObservaciones(jornadaHoy?.observaciones);

    return {
      jornadaHoy,
      isCajaGeneralAbierta,
      isCajaChicaAbierta,
      opening,
      sales,
    };
  }, [jornadas, hoyStr, parseOpeningFromObservaciones, parseVentasFromObservaciones]);

  // Libro Diario Contable estilo Excel (orden cronológico con running balance de gaveta)
  const ledgerItems = useMemo(() => {
    const jornada = selectedDayData.jornada;
    const fondoInicial = Number(jornada?.fondo_inicial || 0);
    const fondosComp = parseFondosComposition(jornada?.observaciones, fondoInicial);

    const rows: {
      id: string;
      isOpening?: boolean;
      hora: string;
      concepto: string;
      categoriaEmoji?: string;
      categoriaLabel?: string;
      proveedor?: string;
      tipoPago: 'EFECTIVO' | 'TRANSFERENCIA' | '-';
      montoTotalBanco: number | null;
      reembolsoCajaChica: number | null;
      gastosCajaChica: number | null;
      saldoGaveta: number;
      registradoPor?: string;
      referenciaBanco?: string;
      fotoComprobante?: string | null;
      rawGasto?: CompraGasto;
    }[] = [];

    let runningSaldo = 0;

    // 1. Filas de apertura de caja
    if (jornada) {
      if (fondosComp.previousDayRemaining > 0) {
        runningSaldo = fondosComp.previousDayRemaining;
        rows.push({
          id: 'apertura-anterior',
          isOpening: true,
          hora: '08:00 AM',
          concepto: 'Fondo de caja anterior (Sobrante de ayer)',
          tipoPago: '-',
          montoTotalBanco: null,
          reembolsoCajaChica: null,
          gastosCajaChica: null,
          saldoGaveta: runningSaldo,
          registradoPor: jornada.responsable || 'Apertura',
        });

        const depositoApertura = fondosComp.bossContribution + fondosComp.generalCashTransfer;
        if (depositoApertura > 0) {
          runningSaldo += depositoApertura;
          rows.push({
            id: 'apertura-deposito',
            isOpening: true,
            hora: '08:15 AM',
            concepto: 'Depósito a caja chica (Aporte inicial)',
            tipoPago: 'EFECTIVO',
            montoTotalBanco: null,
            reembolsoCajaChica: depositoApertura,
            gastosCajaChica: null,
            saldoGaveta: runningSaldo,
            registradoPor: jornada.responsable || 'Apertura',
          });
        }
      } else if (fondoInicial > 0) {
        runningSaldo = fondoInicial;
        rows.push({
          id: 'apertura-inicial',
          isOpening: true,
          hora: 'Apertura',
          concepto: 'Depósito / Fondo asignado de apertura',
          tipoPago: 'EFECTIVO',
          montoTotalBanco: null,
          reembolsoCajaChica: fondoInicial,
          gastosCajaChica: null,
          saldoGaveta: runningSaldo,
          registradoPor: jornada.responsable || 'Apertura',
        });
      }
    }

    // 2. Transacciones del día ordenadas cronológicamente para calcular el saldo histórico
    const dayGastos = gastos
      .filter((g) => g.fecha_hora.slice(0, 10) === selectedDate)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

    for (const g of dayGastos) {
      const monto = Number(g.monto) || 0;
      const isTransfer = g.metodo_pago === 'TRANSFERENCIA';
      const isFondeo = g.tipo === 'INGRESO_FONDEO';

      let montoTotalBanco: number | null = null;
      let reembolsoCajaChica: number | null = null;
      let gastosCajaChica: number | null = null;

      if (isFondeo) {
        reembolsoCajaChica = monto;
        runningSaldo += monto;
      } else if (isTransfer) {
        montoTotalBanco = monto;
        // La transferencia no altera el efectivo físico en gaveta
      } else {
        gastosCajaChica = monto;
        runningSaldo -= monto;
      }

      const catDef = CATEGORIAS_GASTO.find((c) => c.id === g.categoria) || {
        emoji: '📝',
        label: g.categoria,
        badgeClass: '',
      };

      const horaStr = new Date(g.fecha_hora).toLocaleTimeString('es-NI', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      // Filtros
      let matches = true;
      if (filtroCategoria !== 'TODAS' && g.categoria !== filtroCategoria) matches = false;
      if (filtroMetodo !== 'TODOS' && g.metodo_pago !== filtroMetodo) matches = false;
      if (filtroEstado !== 'TODOS' && g.estado_pago !== filtroEstado) matches = false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const m1 = g.concepto.toLowerCase().includes(term);
        const m2 = g.proveedor?.toLowerCase().includes(term);
        const m3 = g.registrado_por.toLowerCase().includes(term);
        if (!m1 && !m2 && !m3) matches = false;
      }

      if (matches) {
        rows.push({
          id: `gasto-${g.id}`,
          hora: horaStr,
          concepto: g.concepto,
          categoriaEmoji: catDef.emoji,
          categoriaLabel: catDef.label,
          proveedor: g.proveedor || undefined,
          tipoPago: isTransfer ? 'TRANSFERENCIA' : 'EFECTIVO',
          montoTotalBanco,
          reembolsoCajaChica,
          gastosCajaChica,
          saldoGaveta: runningSaldo,
          registradoPor: g.registrado_por,
          referenciaBanco: g.referencia_banco || undefined,
          fotoComprobante: g.foto_comprobante || null,
          rawGasto: g,
        });
      }
    }

    if (!sortChronological) {
      return [...rows].reverse();
    }

    return rows;
  }, [
    selectedDayData,
    selectedDate,
    gastos,
    sortChronological,
    filtroCategoria,
    filtroMetodo,
    filtroEstado,
    searchTerm,
    parseFondosComposition,
  ]);

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

  // Detectar si quedó alguna jornada anterior sin cerrar (de días pasados)
  const jornadaAnteriorAbierta = useMemo(() => {
    return jornadas.find((j) => j.estado === 'ABIERTA' && j.fecha < hoyStr) || null;
  }, [jornadas, hoyStr]);

  // Cerrar administrativamente una jornada de un día anterior que no fue cerrada
  const handleCerrarJornadaAnterior = async (j: JornadaDiaria) => {
    if (!window.confirm(`¿Deseas cerrar formalmente la jornada pendiente del ${j.fecha} (${j.responsable})?`)) return;
    try {
      const { error } = await supabase
        .from('jornadas_diarias')
        .update({
          estado: 'CERRADA',
          fecha_cierre: new Date().toISOString(),
          observaciones: (j.observaciones || '') + ' • Cierre administrativo desde el portal web',
          updated_at: new Date().toISOString(),
        })
        .eq('id', j.id);
      if (error) throw error;
      cargarDatos();
    } catch (err: any) {
      alert('Error cerrando jornada anterior: ' + err.message);
    }
  };

  // Abrir modal de edición de ventas cargando los valores del día
  const handleOpenEditSales = () => {
    const s = selectedDayData.sales;
    setSalesForm({
      salesCash: s.salesCash > 0 ? String(s.salesCash) : '',
      cardsBAC: s.cardsBAC > 0 ? String(s.cardsBAC) : '',
      cardsFicohsa: s.cardsFicohsa > 0 ? String(s.cardsFicohsa) : '',
      cardsBanpro: s.cardsBanpro > 0 ? String(s.cardsBanpro) : '',
      cardsLafise: s.cardsLafise > 0 ? String(s.cardsLafise) : '',
      salesPedidosYa: s.salesPedidosYa > 0 ? String(s.salesPedidosYa) : '',
      tips: s.tips && s.tips > 0 ? String(s.tips) : '',
    });
    setShowModalEditSales(true);
  };

  // Guardar ventas del día ingresadas por el jefe
  const handleGuardarVentas = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingSales(true);
    try {
      const cash = parseFloat(salesForm.salesCash) || 0;
      const bac = parseFloat(salesForm.cardsBAC) || 0;
      const fico = parseFloat(salesForm.cardsFicohsa) || 0;
      const banpro = parseFloat(salesForm.cardsBanpro) || 0;
      const lafise = parseFloat(salesForm.cardsLafise) || 0;
      const totalCards = bac + fico + banpro + lafise;
      const pedidosYa = parseFloat(salesForm.salesPedidosYa) || 0;
      const tips = parseFloat(salesForm.tips) || 0;
      const totalGross = cash + totalCards + pedidosYa;

      const salesDataObj = {
        salesCash: cash,
        cardsBAC: bac,
        cardsFicohsa: fico,
        cardsBanpro: banpro,
        cardsLafise: lafise,
        totalCards,
        salesPedidosYa: pedidosYa,
        totalGrossSales: totalGross,
        tips,
        updatedAt: new Date().toISOString(),
      };

      const summaryText = `[VENTAS_DATA:${JSON.stringify(salesDataObj)}] Cierre Caja: Efectivo C$ ${cash.toFixed(2)} | Tarjetas C$ ${totalCards.toFixed(2)} (BAC: ${bac}, Fico: ${fico}, Banpro: ${banpro}, Laf: ${lafise}) | PedidosYa C$ ${pedidosYa.toFixed(2)} | Ventas Brutas: C$ ${totalGross.toFixed(2)}`;

      const existing = jornadas.find((j) => j.fecha === selectedDate);
      if (existing) {
        const prevObs = existing.observaciones || '';
        const cleanedPrev = prevObs.replace(/\[VENTAS_DATA:\{.*?\}\]\s*/g, '').trim();
        const updatedObs = cleanedPrev ? `${summaryText} • ${cleanedPrev}` : summaryText;

        const { error } = await supabase
          .from('jornadas_diarias')
          .update({
            observaciones: updatedObs,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('jornadas_diarias').insert({
          fecha: selectedDate,
          turno: 'COMPLETO',
          estado: 'CERRADA',
          fondo_inicial: 0,
          responsable: 'Gerencia Web',
          observaciones: summaryText,
          fecha_cierre: new Date().toISOString(),
        });

        if (error) throw error;
      }

      await cargarDatos();
      setShowModalEditSales(false);
    } catch (err: any) {
      alert('Error guardando ventas: ' + (err.message || 'Error desconocido'));
    } finally {
      setSubmittingSales(false);
    }
  };

  // Exportar reporte contable del día a archivo CSV legible en Excel
  const handleExportarReporteCSV = () => {
    try {
      const day = selectedDayData;
      const s = day.sales;
      const lineas: string[] = [];

      lineas.push(`"EL BODEGÓN RESTAURANTE & BAR - REPORTE CONTABLE Y FINANCIERO"`);
      lineas.push(`"Fecha:","${selectedDate}"`);
      lineas.push(`"Responsable:","${day.jornada?.responsable || 'Gerencia'}"`);
      lineas.push(`"Estado Caja:","${day.jornada?.estado || 'CERRADA'}"`);
      lineas.push(``);
      lineas.push(`"1. CONCILIACIÓN DE INGRESOS BRUTOS POR CANAL"`);
      lineas.push(`"Canal / Método","Detalle","Monto C$","% Participación"`);
      const totalGross = s.totalGrossSales || 0;
      const pct = (val: number) => (totalGross > 0 ? ((val / totalGross) * 100).toFixed(1) + '%' : '0%');
      lineas.push(`"Efectivo en Gaveta","Cobro en efectivo","${s.salesCash.toFixed(2)}","${pct(s.salesCash)}"`);
      lineas.push(`"Tarjeta POS BAC","Datáfono BAC","${s.cardsBAC.toFixed(2)}","${pct(s.cardsBAC)}"`);
      lineas.push(`"Tarjeta POS Ficohsa","Datáfono Ficohsa","${s.cardsFicohsa.toFixed(2)}","${pct(s.cardsFicohsa)}"`);
      lineas.push(`"Tarjeta POS Banpro","Datáfono Banpro","${s.cardsBanpro.toFixed(2)}","${pct(s.cardsBanpro)}"`);
      lineas.push(`"Tarjeta POS LAFISE","Datáfono LAFISE","${s.cardsLafise.toFixed(2)}","${pct(s.cardsLafise)}"`);
      lineas.push(`"Subtotal Tarjetas POS","Total Datáfonos","${s.totalCards.toFixed(2)}","${pct(s.totalCards)}"`);
      lineas.push(`"Delivery PedidosYa","App Externa","${s.salesPedidosYa.toFixed(2)}","${pct(s.salesPedidosYa)}"`);
      lineas.push(`"TOTAL VENTAS BRUTAS","Total Ingresos","${totalGross.toFixed(2)}","100%"`);
      lineas.push(``);
      lineas.push(`"2. RENDIMIENTO FINANCIERO Y UTILIDAD"`);
      lineas.push(`"Concepto","Monto C$"`);
      lineas.push(`"(+) Ventas Brutas","${totalGross.toFixed(2)}"`);
      lineas.push(`"(-) Egresos Totales Caja Chica","${day.expensesTotal.toFixed(2)}"`);
      lineas.push(`"(=) GANANCIA NETA","${day.netProfit.toFixed(2)}"`);
      lineas.push(`"Margen Operativo","${day.marginPercent.toFixed(1)}%"`);
      if (s.tips && s.tips > 0) {
        lineas.push(`"Propinas Recaudadas","${s.tips.toFixed(2)}"`);
      }
      lineas.push(``);
      lineas.push(`"3. LIBRO DIARIO DE COMPRAS Y GASTOS (CAJA CHICA)"`);
      lineas.push(`"#","Hora","Concepto","Categoría","Proveedor","Método","Estado","Monto C$"`);

      const dayGastos = gastos.filter((g) => g.fecha_hora.slice(0, 10) === selectedDate);
      dayGastos.forEach((g, idx) => {
        const hora = new Date(g.fecha_hora).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
        lineas.push(
          `"${idx + 1}","${hora}","${(g.concepto || '').replace(/"/g, '""')}","${g.categoria}","${(g.proveedor || '').replace(/"/g, '""')}","${g.metodo_pago}","${g.estado_pago}","${Number(g.monto).toFixed(2)}"`
        );
      });
      lineas.push(``);
      lineas.push(`"Total Egresos Efectivo","${metricasGastosDia.efectivo.toFixed(2)}"`);
      lineas.push(`"Total Egresos Transferencias","${metricasGastosDia.transferencia.toFixed(2)}"`);
      lineas.push(`"Fondo Inicial Caja Chica","${metricasGastosDia.fondoCaja.toFixed(2)}"`);
      lineas.push(`"Saldo Restante en Gaveta","${metricasGastosDia.saldoEfectivoRestante.toFixed(2)}"`);

      const csvContent = '\uFEFF' + lineas.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Bodegon_Control_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert('Error exportando reporte: ' + err.message);
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

              {/* Botón Exportar CSV / Excel */}
              <button
                type="button"
                onClick={handleExportarReporteCSV}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                title="Exportar reporte contable a Excel / CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span className="hidden sm:inline">📥 Exportar Excel</span>
                <span className="sm:hidden">Excel</span>
              </button>

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
          {/* ── BANNER INFORMATIVO: ESTADO DUAL DE CAJAS EN RESTAURANTE (ESTRICTAMENTE SOLO LECTURA) ── */}
          <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-stone-100 rounded-3xl p-4 sm:p-5 shadow-sm border border-stone-800">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Tarjeta 1: Caja General */}
              <div className="flex-1 bg-stone-950/60 border border-stone-800 rounded-2xl p-3.5 flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 border ${
                    todaySummary.isCajaGeneralAbierta
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-stone-800 text-stone-400 border-stone-700'
                  }`}
                >
                  🏛️
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-xs sm:text-sm text-white tracking-tight">
                      Caja General (Restaurante & POS)
                    </h4>
                    {todaySummary.isCajaGeneralAbierta ? (
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ABIERTA HOY
                      </span>
                    ) : (
                      <span className="bg-stone-800 text-stone-400 border border-stone-700 text-[9px] font-bold px-2 py-0.5 rounded-full">
                        CERRADA
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                    {todaySummary.isCajaGeneralAbierta
                      ? `Apertura: C$ ${(todaySummary.opening?.totalOpeningNIO || Number(todaySummary.jornadaHoy?.fondo_inicial) || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })} • Resp: ${todaySummary.jornadaHoy?.responsable || 'Cajero'}`
                      : 'Arqueo de billetes y POS gestionado desde el ejecutable en caja'}
                  </p>
                </div>
              </div>

              {/* Tarjeta 2: Caja Chica */}
              <div className="flex-1 bg-stone-950/60 border border-stone-800 rounded-2xl p-3.5 flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 border ${
                    todaySummary.isCajaChicaAbierta
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-stone-800 text-stone-400 border-stone-700'
                  }`}
                >
                  🛒
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-xs sm:text-sm text-white tracking-tight">
                      Caja Chica (Compras & Gastos)
                    </h4>
                    {todaySummary.isCajaChicaAbierta ? (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        DISPONIBLE
                      </span>
                    ) : (
                      <span className="bg-stone-800 text-stone-400 border border-stone-700 text-[9px] font-bold px-2 py-0.5 rounded-full">
                        SIN FONDO ACTIVO
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                    {todaySummary.isCajaChicaAbierta
                      ? `Fondo Inicial: C$ ${metricasGastosHoy.fondoCajaChica.toLocaleString('es-NI', { minimumFractionDigits: 2 })} • En Gaveta: C$ ${metricasGastosHoy.saldoEfectivoRestante.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
                      : 'Control de compras operativas y pagos de proveedores'}
                  </p>
                </div>
              </div>

              {/* Sello de seguridad: Control exclusivo en PC de caja física */}
              <div className="hidden xl:flex items-center gap-2.5 bg-stone-950/40 border border-stone-800/80 px-3 py-2 rounded-2xl text-[11px] text-stone-400 shrink-0">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="font-bold text-stone-200 block text-[9px] uppercase tracking-wider">
                    Control Exclusivo en PC
                  </span>
                  <span className="text-[9px] text-stone-500">
                    Apertura y Cierre solo en caja física.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Aviso si quedó un turno de un día anterior sin cerrar formalmente */}
          {jornadaAnteriorAbierta && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
              <div className="flex items-center gap-2.5 text-xs">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="font-bold text-amber-300 block">
                    Turno anterior sin cerrar formalmente: {jornadaAnteriorAbierta.fecha}
                  </span>
                  <span className="text-[11px] text-amber-200/80">
                    Responsable: {jornadaAnteriorAbierta.responsable || 'Cajero'}. El restaurante ya pasó a una nueva fecha contable.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCerrarJornadaAnterior(jornadaAnteriorAbierta)}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer active:scale-95 shadow-xs shrink-0"
              >
                Cerrar Turno Anterior
              </button>
            </div>
          )}

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
                <span>🏛️ Caja General & Ventas</span>
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
                <span>🛒 Caja Chica & Compras ({gastosFiltrados.length})</span>
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
                <span>📊 Tabla Consolidada</span>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenEditSales}
                    className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 px-3 py-1.5 rounded-xl transition cursor-pointer active:scale-95"
                    title="Ajuste administrativo de ventas del día"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                    <span>Ajuste Ventas</span>
                  </button>

                  <button
                    onClick={handleExportarReporteCSV}
                    className="hidden md:flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-xl shadow-2xs transition cursor-pointer"
                    title="Exportar reporte contable a Excel / CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>📥 Exportar Excel</span>
                  </button>

                  <button
                    onClick={() => setShowModalPrint(true)}
                    className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-stone-700 hover:text-stone-950 bg-white border border-stone-300 hover:bg-stone-50 px-3.5 py-2 rounded-xl shadow-2xs transition cursor-pointer"
                    title="Imprimir Acta Oficial en Blanco y Negro"
                  >
                    <Printer className="w-4 h-4 text-stone-700" />
                    <span>🖨️ Imprimir Acta (B/N)</span>
                  </button>
                </div>
              </div>

              {/* ── CARD AUDITORÍA & ARQUEO DE CAJA GENERAL (APERTURA Y CIERRE) ── */}
              {selectedDayData.closingAudit ? (
                <div className="bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 text-white rounded-3xl p-5 border border-stone-800 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-black text-sm text-white">
                            Arqueo & Cierre Oficial de Caja General
                          </h3>
                          <span
                            className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                              selectedDayData.closingAudit.auditStatus === 'SQUARED'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : selectedDayData.closingAudit.auditStatus === 'SURPLUS'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            {selectedDayData.closingAudit.auditStatus === 'SQUARED' && '✅ CUADRADO EXACTO'}
                            {selectedDayData.closingAudit.auditStatus === 'SURPLUS' &&
                              `🔵 SOBRANTE (+C$ ${selectedDayData.closingAudit.differenceNIO.toLocaleString('es-NI', { minimumFractionDigits: 2 })})`}
                            {selectedDayData.closingAudit.auditStatus === 'SHORTAGE' &&
                              `🔴 FALTANTE (-C$ ${Math.abs(selectedDayData.closingAudit.differenceNIO).toLocaleString('es-NI', { minimumFractionDigits: 2 })})`}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          Turno cerrado por: <strong className="text-stone-200">{selectedDayData.closingAudit.closedBy || selectedDayData.jornada?.responsable || 'Cajero'}</strong>
                          {selectedDayData.closingAudit.closedAt && ` a las ${selectedDayData.closingAudit.closedAt}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right text-[11px] text-stone-400">
                      Tasa de Cambio Oficial: <strong className="text-white font-mono">1 USD = C$ {(selectedDayData.opening?.exchangeRate || 36.0).toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-stone-900/90 p-3.5 rounded-2xl border border-stone-800">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Fondo Apertura</span>
                      <span className="font-mono font-black text-sm text-stone-100 block mt-1">
                        C$ {(selectedDayData.opening?.totalOpeningNIO || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                      {(selectedDayData.opening?.totalOpeningUSD || 0) > 0 && (
                        <span className="text-[10px] text-amber-400 font-mono">
                          + ${(selectedDayData.opening?.totalOpeningUSD || 0).toFixed(2)} USD
                        </span>
                      )}
                    </div>

                    <div className="bg-stone-900/90 p-3.5 rounded-2xl border border-stone-800">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Físico Contado Gaveta</span>
                      <span className="font-mono font-black text-sm text-emerald-400 block mt-1">
                        C$ {selectedDayData.closingAudit.actualCashNIO.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="bg-stone-900/90 p-3.5 rounded-2xl border border-stone-800">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Efectivo Teórico Esperado</span>
                      <span className="font-mono font-black text-sm text-stone-200 block mt-1">
                        C$ {selectedDayData.closingAudit.expectedCashNIO.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-stone-500">
                        (Apertura + Ventas Efectivo)
                      </span>
                    </div>

                    <div className="bg-stone-900/90 p-3.5 rounded-2xl border border-stone-800">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Propinas Recaudadas</span>
                      <span className="font-mono font-black text-sm text-amber-300 block mt-1">
                        C$ {(selectedDayData.sales.tips || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              ) : selectedDayData.jornada?.estado === 'ABIERTA' ? (
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-3xl p-4.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-stone-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                      <Clock className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs sm:text-sm text-emerald-300">
                          Turno de Caja General en Curso (Abierto en Restaurante)
                        </span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        Fondo Inicial: <strong className="text-white font-mono">C$ {(selectedDayData.opening?.totalOpeningNIO || Number(selectedDayData.jornada?.fondo_inicial) || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong>
                        {selectedDayData.opening?.totalOpeningUSD ? ` (+ $${selectedDayData.opening.totalOpeningUSD} USD)` : ''} • Aperturado por: <strong className="text-white">{selectedDayData.jornada?.responsable || 'Cajero'}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-emerald-300/80 shrink-0 bg-emerald-900/30 px-3 py-1.5 rounded-xl border border-emerald-700/40">
                    <span>Efectivo Gaveta Teórico: </span>
                    <strong className="text-white font-mono">C$ {((selectedDayData.opening?.totalOpeningNIO || Number(selectedDayData.jornada?.fondo_inicial) || 0) + selectedDayData.sales.salesCash).toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              ) : null}

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
          {/* ── TAB 2: LIBRO DIARIO DE CAJA CHICA & CONTROL DE GASTOS (EXCEL) ─ */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'GASTOS' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* 1. Tarjetas KPI Desglosadas con Regla Estricta de Gaveta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Tarjeta 1: Fondo Asignado */}
                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 text-stone-500 text-xs font-bold uppercase tracking-wider">
                    <span>1. Fondo Asignado (Apertura)</span>
                    <Wallet className="w-4 h-4 text-stone-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-stone-900">
                      C$ {metricasGastosDia.fondoCaja.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">
                    {metricasGastosDia.fondosComp.previousDayRemaining > 0
                      ? `Ayer: C$ ${metricasGastosDia.fondosComp.previousDayRemaining.toLocaleString('es-NI')} + Depósito: C$ ${(metricasGastosDia.fondosComp.bossContribution + metricasGastosDia.fondosComp.generalCashTransfer).toLocaleString('es-NI')}`
                      : 'Fondo total de apertura de jornada'}
                  </p>
                </div>

                {/* Tarjeta 2: Egresos en Efectivo */}
                <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs bg-rose-50/20">
                  <div className="flex items-center justify-between gap-2 text-rose-800 text-xs font-black uppercase tracking-wider">
                    <span>2. Egresos en Efectivo (🔴 Gaveta)</span>
                    <Banknote className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-rose-700">
                      -C$ {metricasGastosDia.efectivo.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-600 mt-1 font-bold">
                    Salidas físicas reales de la gaveta de compras
                  </p>
                </div>

                {/* Tarjeta 3: Pagos por Transferencia */}
                <div className="bg-white border border-sky-200 rounded-2xl p-4 shadow-2xs bg-sky-50/20">
                  <div className="flex items-center justify-between gap-2 text-sky-800 text-xs font-black uppercase tracking-wider">
                    <span>3. Pagos por Transferencia (🏦 Banco)</span>
                    <Send className="w-4 h-4 text-sky-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-sky-700">
                      C$ {metricasGastosDia.transferencia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-700 mt-1 font-bold">
                    Cuenta bancaria • <span className="underline">NO resta dinero de la gaveta</span>
                  </p>
                </div>

                {/* Tarjeta 4: Efectivo Físico en Gaveta */}
                <div className="bg-white border-2 border-emerald-400 rounded-2xl p-4 shadow-sm bg-emerald-50/40">
                  <div className="flex items-center justify-between gap-2 text-emerald-900 text-xs font-black uppercase tracking-wider">
                    <span>4. Efectivo Físico en Gaveta (✅ En Mano)</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-emerald-800">
                      C$ {metricasGastosDia.saldoEfectivoRestante.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1 font-bold">
                    Dinero real en billetes y monedas en mano
                  </p>
                </div>
              </div>

              {/* Barra Informativa de Compras Consolidadas */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-stone-700 font-bold">
                  <span>🛒</span>
                  <span>Compras Totales de la Empresa:</span>
                  <span className="font-mono font-black text-stone-900 text-sm">
                    C$ {metricasGastosDia.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-stone-500 font-normal">
                    (C$ {metricasGastosDia.efectivo.toLocaleString('es-NI')} en efectivo + C$ {metricasGastosDia.transferencia.toLocaleString('es-NI')} por banco)
                  </span>
                </div>
                {metricasGastosDia.pendientesCount > 0 && (
                  <div className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                    ⚠️ {metricasGastosDia.pendientesCount} transferencia(s) pendiente(s) por emitir (C$ {metricasGastosDia.pendientesMonto.toLocaleString('es-NI')})
                  </div>
                )}
              </div>

              {/* Filtros y Opciones */}
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
                      <option value="EFECTIVO">💵 Solo Efectivo (Gaveta)</option>
                      <option value="TRANSFERENCIA">🏦 Solo Transferencias (Banco)</option>
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
                      <option value="PAGADO">✓ Pagado</option>
                      <option value="PENDIENTE_TRANSFERENCIA">⚠️ Falta Transferir</option>
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
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-900 font-medium"
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

              {/* ══════════════════════════════════════════════════════════════════ */}
              {/* ── LIBRO DIARIO CONTABLE ESTILO EXCEL (IDÉNTICO A HOJA DE CÁLCULO) */}
              {/* ══════════════════════════════════════════════════════════════════ */}
              <div className="bg-white border-2 border-stone-300 rounded-2xl shadow-sm overflow-hidden font-sans">
                {/* Cabecera superior del Libro Diario estilo Hoja de Cálculo */}
                <div className="bg-stone-800 text-white px-5 py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b-2 border-stone-700">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📊</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm md:text-base font-black uppercase tracking-wider text-amber-400">
                          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-NI', { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' }).toUpperCase()}
                        </h3>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-700 text-stone-200 border border-stone-600">
                          LIBRO DIARIO DE CAJA CHICA
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-300 mt-0.5">
                        Arqueo y control continuo de gastos físicos en gaveta vs pagos bancarios
                      </p>
                    </div>
                  </div>

                  {/* Switch de orden cronológico y botón de registrar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSortChronological(!sortChronological)}
                      className="px-3 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-bold flex items-center gap-1.5 transition border border-stone-600 cursor-pointer"
                      title="Cambiar orden de las filas"
                    >
                      <span>{sortChronological ? '⏱️ Mañana ➔ Noche (Excel)' : '🔻 Más reciente primero'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowModalGasto(true)}
                      className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs px-3.5 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>+ Registrar Compra</span>
                    </button>
                  </div>
                </div>

                {/* Tabla de Excel con bordes nítidos de celdas */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-100 border-b-2 border-stone-300 text-stone-800 font-black uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3 border-r border-stone-300 text-center w-14"># / Hora</th>
                        <th className="py-2.5 px-4 border-r border-stone-300 min-w-[240px]">Concepto</th>
                        <th className="py-2.5 px-3 border-r border-stone-300 text-center min-w-[130px]">TIPO DE PAGO</th>
                        <th className="py-2.5 px-3 border-r border-stone-300 text-right min-w-[125px] bg-sky-50/60">MONTO TOTAL</th>
                        <th className="py-2.5 px-3 border-r border-stone-300 text-right min-w-[130px] bg-emerald-50/60">Reemb. A Caja Chica</th>
                        <th className="py-2.5 px-3 border-r border-stone-300 text-right min-w-[125px] bg-rose-50/60">Gastos Caja Ch.</th>
                        <th className="py-2.5 px-4 border-r border-stone-300 text-right min-w-[135px] bg-amber-50/70 font-black text-stone-900">Saldo</th>
                        <th className="py-2.5 px-3 text-center w-20">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 text-stone-800 font-sans">
                      {ledgerItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-stone-400">
                            <span className="text-4xl block mb-2">📋</span>
                            <p className="font-black text-stone-700 text-sm">
                              No hay movimientos registrados para el {selectedDate}.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        ledgerItems.map((item, idx) => {
                          const isOpening = item.isOpening;
                          const isTransfer = item.tipoPago === 'TRANSFERENCIA';

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors border-b border-stone-200 ${
                                isOpening
                                  ? 'bg-amber-50/40 font-semibold'
                                  : isTransfer
                                  ? 'bg-sky-50/20 hover:bg-sky-50/40'
                                  : 'hover:bg-stone-50'
                              }`}
                            >
                              {/* # / Hora */}
                              <td className="py-2.5 px-3 border-r border-stone-200 font-mono text-center text-[11px] text-stone-500">
                                {isOpening ? '🏁' : item.hora}
                              </td>

                              {/* Concepto */}
                              <td className="py-2.5 px-4 border-r border-stone-200 font-bold text-stone-900">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {item.categoriaEmoji && <span>{item.categoriaEmoji}</span>}
                                  <span>{item.concepto}</span>
                                </div>
                                {item.proveedor && (
                                  <div className="text-[10px] text-stone-500 font-normal mt-0.5">
                                    Proveedor: <span className="font-semibold text-stone-700">{item.proveedor}</span>
                                    {item.referenciaBanco && (
                                      <span className="ml-2 font-mono text-stone-400">Ref: {item.referenciaBanco}</span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* TIPO DE PAGO */}
                              <td className="py-2.5 px-3 border-r border-stone-200 text-center font-bold text-[11px]">
                                {isTransfer ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 border border-sky-300">
                                    <span>🏦</span>
                                    <span>Transferencia</span>
                                  </span>
                                ) : item.tipoPago === 'EFECTIVO' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 font-mono">
                                    <span>💵</span>
                                    <span>Efectivo</span>
                                  </span>
                                ) : (
                                  <span className="text-stone-300">-</span>
                                )}
                              </td>

                              {/* MONTO TOTAL (Banco) */}
                              <td className="py-2.5 px-3 border-r border-stone-200 text-right font-mono font-bold text-[12px] bg-sky-50/20 text-sky-900">
                                {item.montoTotalBanco !== null ? (
                                  `C$ ${item.montoTotalBanco.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
                                ) : (
                                  <span className="text-stone-300 font-normal">-</span>
                                )}
                              </td>

                              {/* Reemb. A Caja Chica (Entradas / Depósitos) */}
                              <td className="py-2.5 px-3 border-r border-stone-200 text-right font-mono font-bold text-[12px] bg-emerald-50/20 text-emerald-800">
                                {item.reembolsoCajaChica !== null ? (
                                  `C$ ${item.reembolsoCajaChica.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
                                ) : (
                                  <span className="text-stone-300 font-normal">-</span>
                                )}
                              </td>

                              {/* Gastos Caja Ch. (Salidas de Gaveta) */}
                              <td className="py-2.5 px-3 border-r border-stone-200 text-right font-mono font-bold text-[12px] bg-rose-50/20 text-rose-800">
                                {item.gastosCajaChica !== null ? (
                                  `C$ ${item.gastosCajaChica.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
                                ) : (
                                  <span className="text-stone-300 font-normal">-</span>
                                )}
                              </td>

                              {/* Saldo (Running Balance de Gaveta) */}
                              <td className="py-2.5 px-4 border-r border-stone-200 text-right font-mono font-black text-sm bg-amber-50/30 text-stone-900">
                                C$ {item.saldoGaveta.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                              </td>

                              {/* Acciones */}
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {item.fotoComprobante && (
                                    <button
                                      onClick={() => setFotoModalUrl(item.fotoComprobante!)}
                                      className="p-1 rounded hover:bg-stone-200 text-amber-700 cursor-pointer"
                                      title="Ver Comprobante / Recibo"
                                    >
                                      <Camera className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {item.rawGasto && (
                                    <button
                                      onClick={() => handleEliminarGasto(item.rawGasto!)}
                                      className="p-1 rounded hover:bg-rose-100 text-stone-400 hover:text-rose-600 cursor-pointer"
                                      title="Eliminar este gasto"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {isOpening && <span className="text-[10px] text-stone-400 font-mono">Fijo</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {/* Fila de Totales estilo Balance de Excel */}
                    <tfoot>
                      <tr className="bg-stone-100 border-t-2 border-stone-400 text-stone-900 font-black text-xs">
                        <td colSpan={3} className="py-3 px-4 border-r border-stone-300 text-right uppercase tracking-wider">
                          TOTALES DEL DÍA:
                        </td>
                        <td className="py-3 px-3 border-r border-stone-300 text-right font-mono text-[13px] bg-sky-100/70 text-sky-950 font-black">
                          C$ {metricasGastosDia.transferencia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 border-r border-stone-300 text-right font-mono text-[13px] bg-emerald-100/70 text-emerald-950 font-black">
                          C$ {metricasGastosDia.totalEntradas.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 border-r border-stone-300 text-right font-mono text-[13px] bg-rose-100/70 text-rose-950 font-black">
                          C$ {metricasGastosDia.efectivo.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 border-r border-stone-300 text-right font-mono text-base bg-emerald-200/90 text-emerald-950 font-black ring-2 ring-emerald-500/50">
                          C$ {metricasGastosDia.saldoEfectivoRestante.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center bg-stone-100 text-[10px] text-stone-500 font-bold">
                          Arqueo
                        </td>
                      </tr>
                    </tfoot>
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
        {/* ── MODAL: CARGAR / EDITAR VENTAS DEL DÍA (CONTROL GERENCIA) ─── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {showModalEditSales && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150 my-8">
              <div className="flex items-center justify-between pb-4 border-b border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-900 border border-amber-200">
                    <Edit3 className="w-5 h-5 text-amber-800" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-stone-900">
                      Cargar / Editar Ventas
                    </h3>
                    <p className="text-xs text-stone-500 font-medium">
                      Fecha:{' '}
                      <strong className="text-stone-800">
                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-NI', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModalEditSales(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleGuardarVentas} className="mt-5 space-y-4">
                {/* 1. Efectivo */}
                <div>
                  <label className="block text-xs font-black uppercase text-emerald-800 mb-1 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>1. Efectivo en Caja (C$)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={salesForm.salesCash}
                    onChange={(e) => setSalesForm({ ...salesForm, salesCash: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-base font-mono font-bold text-stone-900 bg-emerald-50/20"
                  />
                </div>

                {/* 2. Tarjetas POS desglosadas por Banco */}
                <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <span>2. Tarjetas POS por Banco (C$)</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-indigo-700">
                      Subtotal: C${' '}
                      {(
                        (parseFloat(salesForm.cardsBAC) || 0) +
                        (parseFloat(salesForm.cardsFicohsa) || 0) +
                        (parseFloat(salesForm.cardsBanpro) || 0) +
                        (parseFloat(salesForm.cardsLafise) || 0)
                      ).toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="block text-[10px] font-extrabold text-rose-800 mb-0.5">BAC Credomatic</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={salesForm.cardsBAC}
                        onChange={(e) => setSalesForm({ ...salesForm, cardsBAC: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-rose-200 bg-white font-mono text-sm font-bold text-stone-900 outline-none focus:border-rose-400"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-extrabold text-sky-800 mb-0.5">Banco Ficohsa</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={salesForm.cardsFicohsa}
                        onChange={(e) => setSalesForm({ ...salesForm, cardsFicohsa: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-sky-200 bg-white font-mono text-sm font-bold text-stone-900 outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-extrabold text-emerald-800 mb-0.5">Banpro Promerica</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={salesForm.cardsBanpro}
                        onChange={(e) => setSalesForm({ ...salesForm, cardsBanpro: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-emerald-200 bg-white font-mono text-sm font-bold text-stone-900 outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-extrabold text-amber-800 mb-0.5">Banco LAFISE</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={salesForm.cardsLafise}
                        onChange={(e) => setSalesForm({ ...salesForm, cardsLafise: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-amber-200 bg-white font-mono text-sm font-bold text-stone-900 outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Delivery PedidosYa */}
                <div>
                  <label className="block text-xs font-black uppercase text-amber-900 mb-1 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-amber-600" />
                    <span>3. Delivery / PedidosYa (C$)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={salesForm.salesPedidosYa}
                    onChange={(e) => setSalesForm({ ...salesForm, salesPedidosYa: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-100 outline-none text-base font-mono font-bold text-stone-900 bg-amber-50/20"
                  />
                </div>

                {/* 4. Propinas Recaudadas */}
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">
                    Propinas Recaudadas (Opcional C$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={salesForm.tips}
                    onChange={(e) => setSalesForm({ ...salesForm, tips: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-stone-300 focus:border-stone-500 outline-none text-sm font-mono text-stone-900"
                  />
                </div>

                {/* Resumen Total Bruto Calculado */}
                <div className="bg-stone-900 text-white p-4 rounded-2xl flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-stone-300">
                    Total Ventas Brutas Calculadas:
                  </span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    C${' '}
                    {(
                      (parseFloat(salesForm.salesCash) || 0) +
                      (parseFloat(salesForm.cardsBAC) || 0) +
                      (parseFloat(salesForm.cardsFicohsa) || 0) +
                      (parseFloat(salesForm.cardsBanpro) || 0) +
                      (parseFloat(salesForm.cardsLafise) || 0) +
                      (parseFloat(salesForm.salesPedidosYa) || 0)
                    ).toFixed(2)}
                  </span>
                </div>

                {/* Botones de acción */}
                <div className="pt-3 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowModalEditSales(false)}
                    className="px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingSales}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs shadow-md transition cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{submittingSales ? 'Guardando...' : 'Guardar Ventas'}</span>
                  </button>
                </div>
              </form>
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
