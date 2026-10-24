'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Calendar,
  CalendarDays,
  CreditCard,
  Banknote,
  Truck,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Building2,
  Receipt,
  Wallet,
  CheckCircle2,
  Clock,
  BarChart3,
  Edit3,
  X,
  Info,
  Layers,
  ArrowDownRight,
  Percent,
} from 'lucide-react';
import { CompraGasto, JornadaDiaria } from '@/lib/compras-types';
import {
  DailySummaryItem,
  parseVentasFromObservaciones,
  parseOpeningFromObservaciones,
  parseClosingFromObservaciones,
  parsePettyClosingFromObservaciones,
  isFondeoTransaction,
} from '@/lib/control-service';

interface Props {
  jornadas: JornadaDiaria[];
  gastos: CompraGasto[];
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  onOpenEditSales?: () => void;
}

type DetailModalType =
  | 'CASH'
  | 'CARDS'
  | 'DELIVERY'
  | 'BANK_TRANSFERS'
  | 'GROSS'
  | 'NET'
  | 'BAC'
  | 'FICOHSA'
  | 'BANPRO'
  | 'LAFISE'
  | null;

export default function DailyEarningsSection({
  jornadas,
  gastos,
  selectedDate,
  setSelectedDate,
  onOpenEditSales,
}: Props) {
  const [timeFilter, setTimeFilter] = useState<'7days' | '14days' | '30days'>('7days');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<DetailModalType>(null);

  // Fechas de referencia local
  const todayStr = useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' }),
    []
  );

  const yesterdayStr = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [todayStr]);

  // Consolidación de datos históricos día por día
  const dailySummaries = useMemo<DailySummaryItem[]>(() => {
    const map = new Map<string, DailySummaryItem>();

    const formatDayLabel = (dateStr: string) => {
      try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          return d.toLocaleDateString('es-NI', { weekday: 'short', day: 'numeric', month: 'short' });
        }
      } catch (e) {}
      return dateStr;
    };

    // Procesar cada jornada registrada en Supabase
    jornadas.forEach((j) => {
      if (!j || !j.fecha) return;
      const d = j.fecha;
      const parsedSales = parseVentasFromObservaciones(j.observaciones);
      const opening = parseOpeningFromObservaciones(j.observaciones, j.fondo_inicial);
      const closing = parseClosingFromObservaciones(j.observaciones);
      const pettyClosing = parsePettyClosingFromObservaciones(j.observaciones);

      const isVoid = Boolean(
        d === '2026-10-07' || j.observaciones?.includes('Día nulo') || j.observaciones?.includes('DIA_NULO')
      );

      map.set(d, {
        date: d,
        dayLabel: formatDayLabel(d),
        status: isVoid ? 'CLOSED' : j.estado === 'ABIERTA' ? 'OPEN' : 'CLOSED',
        cashSales: isVoid ? 0 : parsedSales.salesCash,
        cardsBAC: isVoid ? 0 : parsedSales.cardsBAC,
        cardsFicohsa: isVoid ? 0 : parsedSales.cardsFicohsa,
        cardsBanpro: isVoid ? 0 : parsedSales.cardsBanpro,
        cardsLafise: isVoid ? 0 : parsedSales.cardsLafise,
        totalCards: isVoid ? 0 : parsedSales.totalCards,
        salesPedidosYa: isVoid ? 0 : parsedSales.salesPedidosYa,
        salesBankTransfers: isVoid ? 0 : parsedSales.salesBankTransfers,
        otherIncome: isVoid ? 0 : parsedSales.otherIncome,
        totalGrossSales: isVoid ? 0 : parsedSales.totalGrossSales,
        pettyCashExpenses: 0,
        transfersPaid: 0,
        totalExpenses: 0,
        netEarnings: 0,
        tipsCollected: isVoid ? 0 : parsedSales.tips,
        responsible: j.responsable || 'Bodegón',
        isVoid,
        voidReason: isVoid ? 'Jornada de prueba o no declarada' : undefined,
        opening,
        closing: closing || undefined,
        pettyClosing: pettyClosing || undefined,
      });
    });

    // Agregar gastos de compras_gastos por fecha
    gastos.forEach((g) => {
      if (isFondeoTransaction(g)) return;
      const txDate = (g.fecha_hora || '').slice(0, 10);
      if (!txDate) return;

      if (!map.has(txDate)) {
        map.set(txDate, {
          date: txDate,
          dayLabel: formatDayLabel(txDate),
          status: 'CLOSED',
          cashSales: 0,
          cardsBAC: 0,
          cardsFicohsa: 0,
          cardsBanpro: 0,
          cardsLafise: 0,
          totalCards: 0,
          salesPedidosYa: 0,
          salesBankTransfers: 0,
          otherIncome: 0,
          totalGrossSales: 0,
          pettyCashExpenses: 0,
          transfersPaid: 0,
          totalExpenses: 0,
          netEarnings: 0,
          tipsCollected: 0,
          responsible: g.registrado_por || 'Bodegón',
        });
      }

      const item = map.get(txDate)!;
      if (item.isVoid) return;

      const monto = Number(g.monto) || 0;
      if (g.metodo_pago === 'TRANSFERENCIA' || g.metodo_pago === 'TARJETA') {
        item.transfersPaid += monto;
      } else {
        item.pettyCashExpenses += monto;
      }
      item.totalExpenses = item.pettyCashExpenses + item.transfersPaid;
    });

    // Calcular ganancia neta para cada día
    map.forEach((item) => {
      if (item.isVoid) {
        item.netEarnings = 0;
        return;
      }
      if (item.closing && item.closing.dailyNetProfit !== undefined) {
        item.netEarnings = item.closing.dailyNetProfit;
      } else {
        item.netEarnings = item.totalGrossSales - item.totalExpenses - item.tipsCollected;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [jornadas, gastos]);

  // Resumen del día actualmente seleccionado
  const activeDaySummary: DailySummaryItem = useMemo(() => {
    const found = dailySummaries.find((d) => d.date === selectedDate);
    if (found) return found;

    return {
      date: selectedDate,
      dayLabel: selectedDate,
      status: 'CLOSED',
      cashSales: 0,
      cardsBAC: 0,
      cardsFicohsa: 0,
      cardsBanpro: 0,
      cardsLafise: 0,
      totalCards: 0,
      salesPedidosYa: 0,
      salesBankTransfers: 0,
      otherIncome: 0,
      totalGrossSales: 0,
      pettyCashExpenses: 0,
      transfersPaid: 0,
      totalExpenses: 0,
      netEarnings: 0,
      tipsCollected: 0,
      responsible: 'Bodegón',
    };
  }, [dailySummaries, selectedDate]);

  // Navegación de días
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // Días para la gráfica de línea de tiempo
  const chartDays = useMemo(() => {
    const count = timeFilter === '7days' ? 7 : timeFilter === '14days' ? 14 : 30;
    return [...dailySummaries]
      .filter((d) => !d.isVoid)
      .slice(0, count)
      .reverse();
  }, [dailySummaries, timeFilter]);

  const maxSales = useMemo(() => {
    let max = 1;
    chartDays.forEach((d) => {
      if (d.totalGrossSales > max) max = d.totalGrossSales;
      if (d.totalExpenses > max) max = d.totalExpenses;
    });
    return max * 1.15;
  }, [chartDays]);

  // Participaciones porcentuales del día activo
  const cashPercent =
    activeDaySummary.totalGrossSales > 0
      ? (activeDaySummary.cashSales / activeDaySummary.totalGrossSales) * 100
      : 0;

  const cardPercent =
    activeDaySummary.totalGrossSales > 0
      ? (activeDaySummary.totalCards / activeDaySummary.totalGrossSales) * 100
      : 0;

  const pedidosYaPercent =
    activeDaySummary.totalGrossSales > 0
      ? (activeDaySummary.salesPedidosYa / activeDaySummary.totalGrossSales) * 100
      : 0;

  const bankTransfersPercent =
    activeDaySummary.totalGrossSales > 0
      ? (activeDaySummary.salesBankTransfers / activeDaySummary.totalGrossSales) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header con Filtros Rápidos, Acciones y Selector de Día */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-bodegon/10 text-bodegon border border-bodegon/20 shadow-2xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                Ganancias & Ventas Diarias
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  En Vivo
                </span>
              </h2>
              <p className="text-xs text-stone-500 font-medium">
                Haz clic en cualquier tarjeta o banco para auditar detalles completos
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Selección de Día */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botones Rápidos de Fecha */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-white text-bodegon shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedDate === yesterdayStr
                  ? 'bg-white text-bodegon shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Ayer
            </button>
          </div>

          {/* Selector de Fecha */}
          <div className="flex items-center gap-1.5 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200">
            <Calendar className="w-4 h-4 text-bodegon" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold font-mono text-stone-800 bg-transparent border-none outline-none cursor-pointer"
            />
          </div>

          {/* Botón Editar Ventas (si tiene permiso) */}
          {onOpenEditSales && (
            <button
              onClick={onOpenEditSales}
              className="flex items-center gap-1.5 bg-bodegon hover:bg-bodegon-noche text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="Registrar o corregir ventas de este día"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Cargar Ventas</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Banner de Información del Día Seleccionado con Navegación ◀ ▶ */}
      <div className="bg-stone-900 rounded-2xl p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">
            <CalendarDays className="w-4 h-4 text-amber-400" />
            <span>Jornada Operativa</span>
            <span>•</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                activeDaySummary.isVoid
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  : activeDaySummary.status === 'OPEN'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-stone-700 text-stone-300 border border-stone-600'
              }`}
            >
              {activeDaySummary.isVoid
                ? 'Día Nulo (Sin declarar)'
                : activeDaySummary.status === 'OPEN'
                ? 'Turno En Curso'
                : 'Turno Cerrado'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevDay}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              title="Ir al día anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-xl sm:text-2xl font-black text-white tracking-tight capitalize">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-NI', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>

            <button
              onClick={handleNextDay}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              title="Ir al día siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-stone-400 mt-1.5 flex flex-wrap items-center gap-2">
            <span>
              Responsable: <strong className="text-white">{activeDaySummary.responsible}</strong>
            </span>
            {activeDaySummary.tipsCollected > 0 && (
              <>
                <span>•</span>
                <span>
                  Propinas Recaudadas:{' '}
                  <strong className="text-amber-400 font-mono font-bold">
                    C$ {activeDaySummary.tipsCollected.toFixed(2)}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Resumen Compacto de Ganancia Neta — Clickable */}
        <button
          onClick={() => setActiveModal('NET')}
          className="flex items-center gap-4 bg-white/10 hover:bg-white/15 px-5 py-3 rounded-2xl border border-white/10 transition text-left cursor-pointer group"
          title="Ver desglose financiero de ganancia neta"
        >
          <div>
            <div className="text-[10px] font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1">
              <span>Ganancia Neta Auditada</span>
              <span className="text-[9px] text-emerald-400 underline font-normal">
                (Ver fórmula)
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400">
              C$ {activeDaySummary.netEarnings.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* 3. Cuadrícula de KPIs Separados por Canal de Ingreso — Todos Clickables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1: Efectivo en Caja */}
        <div
          onClick={() => setActiveModal('CASH')}
          className="bg-white rounded-2xl border border-stone-200 hover:border-emerald-300 p-4 shadow-2xs transition cursor-pointer hover:shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              Efectivo en Caja
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {activeDaySummary.cashSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-stone-400 text-[11px]">Participación:</span>
            <span className="font-bold text-emerald-700 font-mono text-[11px]">
              {cashPercent.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-bodegon font-bold flex items-center justify-between">
            <span>Ver auditoría de caja</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 2: Tarjetas de Crédito / Débito POS */}
        <div
          onClick={() => setActiveModal('CARDS')}
          className="bg-white rounded-2xl border border-stone-200 hover:border-blue-300 p-4 shadow-2xs transition cursor-pointer hover:shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
              Tarjetas POS (Datáfonos)
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {activeDaySummary.totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-stone-400 text-[11px]">Participación:</span>
            <span className="font-bold text-blue-700 font-mono text-[11px]">
              {cardPercent.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-blue-700 font-bold flex items-center justify-between">
            <span>Ver 4 bancos</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 3: PedidosYa Delivery */}
        <div
          onClick={() => setActiveModal('DELIVERY')}
          className="bg-white rounded-2xl border border-stone-200 hover:border-amber-300 p-4 shadow-2xs transition cursor-pointer hover:shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
              PedidosYa Delivery
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {activeDaySummary.salesPedidosYa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-stone-400 text-[11px]">Participación:</span>
            <span className="font-bold text-amber-700 font-mono text-[11px]">
              {pedidosYaPercent.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-amber-700 font-bold flex items-center justify-between">
            <span>Ver entregas app</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 4: Transferencias Bancarias Directas */}
        <div
          onClick={() => setActiveModal('BANK_TRANSFERS')}
          className="bg-white rounded-2xl border border-stone-200 hover:border-purple-300 p-4 shadow-2xs transition cursor-pointer hover:shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
              Transferencias Bancarias
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {activeDaySummary.salesBankTransfers.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-stone-400 text-[11px]">Participación:</span>
            <span className="font-bold text-purple-700 font-mono text-[11px]">
              {bankTransfersPercent.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-purple-700 font-bold flex items-center justify-between">
            <span>Pagos directos a cuenta</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 5: Ventas Totales Brutas */}
        <div
          onClick={() => setActiveModal('GROSS')}
          className="bg-white rounded-2xl border border-stone-200 hover:border-stone-400 p-4 shadow-2xs transition cursor-pointer hover:shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 bg-stone-100 px-2 py-0.5 rounded-lg border border-stone-200">
              Ventas Totales Brutas
            </span>
            <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {activeDaySummary.totalGrossSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-stone-400 text-[11px]">Gastos Insumos:</span>
            <span className="font-bold text-rose-600 font-mono text-[11px]">
              - C$ {activeDaySummary.totalExpenses.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-stone-700 font-bold flex items-center justify-between">
            <span>Ver consolidado completo</span>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
          </div>
        </div>
      </div>

      {/* 4. Desglose Específico de Tarjetas por Banco (BAC, Ficohsa, Banpro, Lafise) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-bodegon" />
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
              Desglose Individual de Tarjetas por Banco
            </h3>
          </div>
          <button
            onClick={() => setActiveModal('CARDS')}
            className="text-xs font-mono font-black text-bodegon bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-xl border border-emerald-200 transition cursor-pointer"
          >
            Total Tarjetas: C$ {activeDaySummary.totalCards.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* BAC */}
          <div
            onClick={() => setActiveModal('BAC')}
            className="p-4 rounded-xl bg-rose-50/50 hover:bg-rose-50 border border-rose-200/80 flex items-center justify-between transition cursor-pointer group"
          >
            <div>
              <div className="text-[10px] font-black text-rose-700 uppercase tracking-wider">
                BAC Credomatic
              </div>
              <div className="text-lg font-black font-mono text-stone-900 group-hover:text-rose-700 transition-colors mt-1">
                C$ {activeDaySummary.cardsBAC.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {activeDaySummary.totalCards > 0
                  ? ((activeDaySummary.cardsBAC / activeDaySummary.totalCards) * 100).toFixed(1)
                  : 0}% del datáfono
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white border border-rose-200 text-rose-600 font-black flex items-center justify-center text-xs shadow-2xs transition-transform">
              BAC
            </div>
          </div>

          {/* FICOHSA */}
          <div
            onClick={() => setActiveModal('FICOHSA')}
            className="p-4 rounded-xl bg-purple-50/50 hover:bg-purple-50 border border-purple-200/80 flex items-center justify-between transition cursor-pointer group"
          >
            <div>
              <div className="text-[10px] font-black text-purple-700 uppercase tracking-wider">
                Banco Ficohsa
              </div>
              <div className="text-lg font-black font-mono text-stone-900 group-hover:text-purple-700 transition-colors mt-1">
                C$ {activeDaySummary.cardsFicohsa.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {activeDaySummary.totalCards > 0
                  ? ((activeDaySummary.cardsFicohsa / activeDaySummary.totalCards) * 100).toFixed(1)
                  : 0}% del datáfono
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white border border-purple-200 text-purple-600 font-black flex items-center justify-center text-xs shadow-2xs transition-transform">
              FICO
            </div>
          </div>

          {/* BANPRO */}
          <div
            onClick={() => setActiveModal('BANPRO')}
            className="p-4 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200/80 flex items-center justify-between transition cursor-pointer group"
          >
            <div>
              <div className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                Banpro Promerica
              </div>
              <div className="text-lg font-black font-mono text-stone-900 group-hover:text-emerald-700 transition-colors mt-1">
                C$ {activeDaySummary.cardsBanpro.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {activeDaySummary.totalCards > 0
                  ? ((activeDaySummary.cardsBanpro / activeDaySummary.totalCards) * 100).toFixed(1)
                  : 0}% del datáfono
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 text-emerald-600 font-black flex items-center justify-center text-xs shadow-2xs transition-transform">
              BAN
            </div>
          </div>

          {/* LAFISE */}
          <div
            onClick={() => setActiveModal('LAFISE')}
            className="p-4 rounded-xl bg-blue-50/50 hover:bg-blue-50 border border-blue-200/80 flex items-center justify-between transition cursor-pointer group"
          >
            <div>
              <div className="text-[10px] font-black text-blue-700 uppercase tracking-wider">
                Banco LAFISE
              </div>
              <div className="text-lg font-black font-mono text-stone-900 group-hover:text-blue-700 transition-colors mt-1">
                C$ {activeDaySummary.cardsLafise.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {activeDaySummary.totalCards > 0
                  ? ((activeDaySummary.cardsLafise / activeDaySummary.totalCards) * 100).toFixed(1)
                  : 0}% del datáfono
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white border border-blue-200 text-blue-600 font-black flex items-center justify-center text-xs shadow-2xs transition-transform">
              LAF
            </div>
          </div>
        </div>
      </div>

      {/* 5. Gráfica Visual de Barras a la Par (Ventas vs Gastos Caja Chica) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-bodegon" />
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
                Línea de Tiempo & Comparativa de Ganancias
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Comparativa día a día: Lo Generado (Ventas) vs Gastos de Caja Chica (barras a la par)
            </p>
          </div>

          {/* Filtro de Rango para la Gráfica */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-bold self-start">
            <button
              onClick={() => setTimeFilter('7days')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                timeFilter === '7days' ? 'bg-white text-bodegon shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              7 Días
            </button>
            <button
              onClick={() => setTimeFilter('14days')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                timeFilter === '14days' ? 'bg-white text-bodegon shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              14 Días
            </button>
            <button
              onClick={() => setTimeFilter('30days')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                timeFilter === '30days' ? 'bg-white text-bodegon shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              30 Días
            </button>
          </div>
        </div>

        {/* Leyenda de la Gráfica */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold mb-4 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block" />
            <span className="text-stone-700">Efectivo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-blue-600 inline-block" />
            <span className="text-stone-700">Tarjetas POS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-amber-500 inline-block" />
            <span className="text-stone-700">PedidosYa</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-purple-500 inline-block" />
            <span className="text-stone-700">Transferencias / Otros</span>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l border-stone-200">
            <span className="w-3 h-3 rounded-md bg-rose-500 inline-block" />
            <span className="text-stone-900 font-black">Gastos Caja Chica (A la par)</span>
          </div>
        </div>

        {/* Contenedor Gráfico Interactivo de Barras */}
        {chartDays.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-sm">
            No hay datos suficientes registrados para mostrar la gráfica
          </div>
        ) : (
          <div className="relative pt-6 pb-2">
            <div className="h-56 flex items-end justify-between gap-2 sm:gap-3 px-2">
              {chartDays.map((d, idx) => {
                const salesTotal = d.totalGrossSales;
                const expensesTotal = d.totalExpenses;
                const isSelected = d.date === selectedDate;
                const isHovered = hoveredBarIndex === idx;

                const salesHeightPct = maxSales > 0 ? (salesTotal / maxSales) * 100 : 0;
                const expensesHeightPct = maxSales > 0 ? (expensesTotal / maxSales) * 100 : 0;

                const cashPctOfSales = salesTotal > 0 ? (d.cashSales / salesTotal) * 100 : 0;
                const cardPctOfSales = salesTotal > 0 ? (d.totalCards / salesTotal) * 100 : 0;
                const pedidosYaPctOfSales = salesTotal > 0 ? (d.salesPedidosYa / salesTotal) * 100 : 0;
                const bankPctOfSales = salesTotal > 0 ? ((d.salesBankTransfers + d.otherIncome) / salesTotal) * 100 : 0;

                return (
                  <div
                    key={d.date}
                    onClick={() => setSelectedDate(d.date)}
                    onMouseEnter={() => setHoveredBarIndex(idx)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                    className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                  >
                    {/* Tooltip Emergente */}
                    {isHovered && (
                      <div className="absolute -top-36 z-30 bg-stone-900/95 text-white p-3 rounded-xl shadow-2xl text-left whitespace-nowrap border border-stone-700 animate-in fade-in zoom-in-95 pointer-events-none">
                        <div className="font-black text-xs text-amber-400 capitalize flex items-center justify-between gap-3">
                          <span>{d.dayLabel}</span>
                          <span className="text-[10px] text-stone-400 font-mono">{d.date}</span>
                        </div>
                        <div className="text-[11px] font-mono mt-2 space-y-1">
                          <div className="text-emerald-300 flex items-center justify-between gap-4">
                            <span>Efectivo:</span>
                            <span className="font-bold">C$ {d.cashSales.toFixed(2)}</span>
                          </div>
                          <div className="text-blue-300 flex items-center justify-between gap-4">
                            <span>Tarjetas:</span>
                            <span className="font-bold">C$ {d.totalCards.toFixed(2)}</span>
                          </div>
                          {d.salesPedidosYa > 0 && (
                            <div className="text-amber-300 flex items-center justify-between gap-4">
                              <span>PedidosYa:</span>
                              <span className="font-bold">C$ {d.salesPedidosYa.toFixed(2)}</span>
                            </div>
                          )}
                          {d.salesBankTransfers > 0 && (
                            <div className="text-purple-300 flex items-center justify-between gap-4">
                              <span>Transferencias:</span>
                              <span className="font-bold">C$ {d.salesBankTransfers.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="text-stone-100 font-black pt-1 border-t border-stone-700 flex items-center justify-between gap-4">
                            <span>Total Generado:</span>
                            <span className="text-white font-black">C$ {salesTotal.toFixed(2)}</span>
                          </div>
                          <div className="text-rose-300 pt-1 border-t border-stone-800 flex items-center justify-between gap-4">
                            <span>Gastos Insumos:</span>
                            <span className="font-bold">- C$ {expensesTotal.toFixed(2)}</span>
                          </div>
                          <div className="text-emerald-400 font-black pt-1 border-t border-stone-700 flex items-center justify-between gap-4">
                            <span>Ganancia Neta:</span>
                            <span>C$ {d.netEarnings.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Badge numérico encima si está seleccionada */}
                    {isSelected && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] font-mono font-black text-bodegon bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded shadow-2xs">
                          C$ {Math.round(salesTotal)}
                        </span>
                      </div>
                    )}

                    {/* Barras A LA PAR (Generado vs Gastos) */}
                    <div
                      className={`w-full max-w-[56px] h-full flex items-end justify-center gap-1 sm:gap-1.5 p-1 rounded-xl transition-all duration-300 ${
                        isSelected
                          ? 'bg-emerald-50/80 ring-2 ring-bodegon ring-offset-2 shadow-sm'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      {/* Barra 1: Lo Generado (Segmentada) */}
                      <div
                        className="w-1/2 rounded-t-md overflow-hidden flex flex-col-reverse justify-start shadow-xs transition-all duration-500 bg-stone-100"
                        style={{ height: `${Math.max(salesHeightPct, 6)}%` }}
                      >
                        {salesTotal === 0 ? (
                          <div className="w-full h-full bg-stone-200" />
                        ) : (
                          <>
                            {cashPctOfSales > 0 && (
                              <div
                                style={{ height: `${cashPctOfSales}%` }}
                                className="w-full bg-emerald-500 transition-all hover:brightness-110"
                                title={`Efectivo: C$ ${d.cashSales.toFixed(2)}`}
                              />
                            )}
                            {cardPctOfSales > 0 && (
                              <div
                                style={{ height: `${cardPctOfSales}%` }}
                                className="w-full bg-blue-600 transition-all hover:brightness-110"
                                title={`Tarjetas: C$ ${d.totalCards.toFixed(2)}`}
                              />
                            )}
                            {pedidosYaPctOfSales > 0 && (
                              <div
                                style={{ height: `${pedidosYaPctOfSales}%` }}
                                className="w-full bg-amber-500 transition-all hover:brightness-110"
                                title={`PedidosYa: C$ ${d.salesPedidosYa.toFixed(2)}`}
                              />
                            )}
                            {bankPctOfSales > 0 && (
                              <div
                                style={{ height: `${bankPctOfSales}%` }}
                                className="w-full bg-purple-500 transition-all hover:brightness-110"
                                title={`Transferencias: C$ ${(d.salesBankTransfers + d.otherIncome).toFixed(2)}`}
                              />
                            )}
                          </>
                        )}
                      </div>

                      {/* Barra 2: Gastos de Caja Chica (Rosa/Rojo a la par) */}
                      <div
                        className="w-1/2 rounded-t-md overflow-hidden bg-rose-500 shadow-xs transition-all duration-500 hover:brightness-110"
                        style={{ height: `${Math.max(expensesHeightPct, 4)}%` }}
                        title={`Gastos de Caja: C$ ${expensesTotal.toFixed(2)}`}
                      />
                    </div>

                    {/* Etiqueta del Día */}
                    <div
                      className={`text-[10px] font-mono mt-2 transition-colors ${
                        isSelected ? 'font-black text-bodegon' : 'text-stone-400 group-hover:text-stone-700'
                      }`}
                    >
                      {d.date.slice(8, 10)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 6. Modales Interactivos de Detalle */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-stone-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-stone-100 text-stone-700">
                  {activeModal === 'CASH' && <Banknote className="w-5 h-5 text-emerald-600" />}
                  {activeModal === 'CARDS' && <CreditCard className="w-5 h-5 text-blue-600" />}
                  {activeModal === 'DELIVERY' && <Truck className="w-5 h-5 text-amber-600" />}
                  {activeModal === 'BANK_TRANSFERS' && <Building2 className="w-5 h-5 text-purple-600" />}
                  {activeModal === 'GROSS' && <ArrowUpRight className="w-5 h-5 text-stone-700" />}
                  {activeModal === 'NET' && <TrendingUp className="w-5 h-5 text-emerald-600" />}
                  {['BAC', 'FICOHSA', 'BANPRO', 'LAFISE'].includes(activeModal) && (
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900">
                    {activeModal === 'CASH' && 'Auditoría de Efectivo en Caja'}
                    {activeModal === 'CARDS' && 'Detalle Consolidado de Tarjetas POS'}
                    {activeModal === 'DELIVERY' && 'Detalle de PedidosYa Delivery'}
                    {activeModal === 'BANK_TRANSFERS' && 'Detalle de Transferencias Bancarias'}
                    {activeModal === 'GROSS' && 'Desglose de Ventas Brutas'}
                    {activeModal === 'NET' && 'Fórmula de Ganancia Neta Real'}
                    {activeModal === 'BAC' && 'BAC Credomatic — Terminal POS'}
                    {activeModal === 'FICOHSA' && 'Banco Ficohsa — Terminal POS'}
                    {activeModal === 'BANPRO' && 'Banpro Promerica — Terminal POS'}
                    {activeModal === 'LAFISE' && 'Banco LAFISE — Terminal POS'}
                  </h3>
                  <span className="text-xs text-stone-400 font-mono">{selectedDate}</span>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-xl hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido según modal */}
            <div className="space-y-3 text-xs">
              {activeModal === 'CASH' && (
                <div className="space-y-2">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <span className="text-stone-600 font-medium">Ventas Reportadas en Efectivo:</span>
                    <div className="text-xl font-black font-mono text-emerald-800">
                      C$ {activeDaySummary.cashSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  {activeDaySummary.opening && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                      <span className="font-bold text-stone-700">Fondo de Apertura Físico:</span>
                      <div className="font-mono text-stone-800">
                        C$ {activeDaySummary.opening.totalOpeningNIO.toLocaleString('es-NI', { minimumFractionDigits: 2 })} NIO
                        {activeDaySummary.opening.totalOpeningUSD > 0 && ` + $${activeDaySummary.opening.totalOpeningUSD} USD`}
                      </div>
                    </div>
                  )}
                  {activeDaySummary.closing && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                      <span className="font-bold text-stone-700">Arqueo de Cierre:</span>
                      <div className="font-mono text-stone-800">
                        Contado: C$ {activeDaySummary.closing.actualCashNIO.toLocaleString('es-NI', { minimumFractionDigits: 2 })} |
                        Diferencia: {activeDaySummary.closing.differenceNIO >= 0 ? '+' : ''}
                        C$ {activeDaySummary.closing.differenceNIO.toFixed(2)} ({activeDaySummary.closing.auditStatus})
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeModal === 'CARDS' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                      <span className="font-bold text-rose-700 text-[11px]">BAC:</span>
                      <div className="text-sm font-black font-mono">C$ {activeDaySummary.cardsBAC.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                      <span className="font-bold text-purple-700 text-[11px]">Ficohsa:</span>
                      <div className="text-sm font-black font-mono">C$ {activeDaySummary.cardsFicohsa.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="font-bold text-emerald-700 text-[11px]">Banpro:</span>
                      <div className="text-sm font-black font-mono">C$ {activeDaySummary.cardsBanpro.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="font-bold text-blue-700 text-[11px]">LAFISE:</span>
                      <div className="text-sm font-black font-mono">C$ {activeDaySummary.cardsLafise.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="p-3 bg-stone-100 rounded-xl flex justify-between font-bold">
                    <span>Total Datáfonos:</span>
                    <span className="font-mono font-black">C$ {activeDaySummary.totalCards.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {activeModal === 'BANK_TRANSFERS' && (
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
                  <span className="font-bold text-purple-900">Transferencias Bancarias de Clientes:</span>
                  <div className="text-2xl font-black font-mono text-purple-800">
                    C$ {activeDaySummary.salesBankTransfers.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-[11px] text-purple-700">
                    Corresponde a pagos directos vía transferencia / banca en línea reportados por los comensales.
                  </p>
                </div>
              )}

              {activeModal === 'NET' && (
                <div className="space-y-2">
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                    <div className="flex justify-between text-stone-700">
                      <span>(+) Ventas Totales Brutas:</span>
                      <span className="font-mono font-bold">C$ {activeDaySummary.totalGrossSales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>(-) Gastos de Compras / Insumos:</span>
                      <span className="font-mono font-bold">- C$ {activeDaySummary.totalExpenses.toFixed(2)}</span>
                    </div>
                    {activeDaySummary.tipsCollected > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>(-) Propinas Recaudadas:</span>
                        <span className="font-mono font-bold">- C$ {activeDaySummary.tipsCollected.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-stone-200 flex justify-between text-emerald-700 font-bold text-sm">
                      <span>(=) Ganancia Neta Real:</span>
                      <span className="font-mono font-black">C$ {activeDaySummary.netEarnings.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {['BAC', 'FICOHSA', 'BANPRO', 'LAFISE'].includes(activeModal) && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                  <span className="font-bold text-blue-900">Monto Procesado en POS:</span>
                  <div className="text-2xl font-black font-mono text-blue-800">
                    C${' '}
                    {(activeModal === 'BAC'
                      ? activeDaySummary.cardsBAC
                      : activeModal === 'FICOHSA'
                      ? activeDaySummary.cardsFicohsa
                      : activeModal === 'BANPRO'
                      ? activeDaySummary.cardsBanpro
                      : activeDaySummary.cardsLafise
                    ).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
