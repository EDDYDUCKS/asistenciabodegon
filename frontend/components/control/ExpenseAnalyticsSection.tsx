'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Wallet,
  Landmark,
  RefreshCw,
  Tag,
  Building2,
  Check,
  X,
  Filter,
  CheckCircle2,
  Search,
  Calendar,
  Receipt,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CompraGasto } from '@/lib/compras-types';
import {
  ExpenseAnalyticsData,
  fetchExpensesAnalytics,
  reassignExpenseCategory,
  isFondeoTransaction,
} from '@/lib/control-service';

interface Props {
  gastos: CompraGasto[];
  onRefreshExpenses?: () => void;
}

export default function ExpenseAnalyticsSection({ gastos, onRefreshExpenses }: Props) {
  const [dateFilter, setDateFilter] = useState<'ALL' | 'MONTH' | 'WEEK'>('MONTH');
  const [analyticsData, setAnalyticsData] = useState<ExpenseAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Búsqueda en Rankings
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');

  // Expansión de listas
  const [showAllVendors, setShowAllVendors] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Reclasificación en línea
  const [reclassifyingId, setReclassifyingId] = useState<number | null>(null);
  const [reclassifiedSuccessId, setReclassifiedSuccessId] = useState<number | null>(null);

  // Carga analítica desde Supabase
  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const data = await fetchExpensesAnalytics(dateFilter);
      setAnalyticsData(data);
    } catch (err) {
      console.warn('Error al cargar analítica de gastos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [dateFilter]);

  // Gráfica de Tendencia Diaria (Evolución de compras por día)
  const dailySpendData = useMemo(() => {
    const dayMap = new Map<string, { total: number; count: number }>();
    gastos.forEach((exp) => {
      if (isFondeoTransaction(exp)) return;
      const dayStr = (exp.fecha_hora || '').slice(0, 10);
      if (!dayStr) return;
      const current = dayMap.get(dayStr) || { total: 0, count: 0 };
      dayMap.set(dayStr, {
        total: current.total + (Number(exp.monto) || 0),
        count: current.count + 1,
      });
    });

    return Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, data]) => ({
        date,
        dayLabel: new Date(date + 'T12:00:00').toLocaleDateString('es-NI', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        total: data.total,
        count: data.count,
      }));
  }, [gastos]);

  const maxDailySpend = useMemo(() => {
    return Math.max(...dailySpendData.map((d) => d.total), 1);
  }, [dailySpendData]);

  // Ticket promedio de compra
  const averageTicket = useMemo(() => {
    if (!analyticsData || analyticsData.totalTransactionsCount === 0) return 0;
    return analyticsData.totalAmount / analyticsData.totalTransactionsCount;
  }, [analyticsData]);

  // Categorías filtradas
  const filteredCategories = useMemo(() => {
    let list = analyticsData?.byCategory || [];
    if (categorySearchTerm.trim()) {
      const q = categorySearchTerm.toLowerCase();
      list = list.filter((c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
    }
    return list;
  }, [analyticsData?.byCategory, categorySearchTerm]);

  const displayedCategories = useMemo(() => {
    return showAllCategories ? filteredCategories : filteredCategories.slice(0, 10);
  }, [filteredCategories, showAllCategories]);

  // Proveedores filtrados
  const filteredVendors = useMemo(() => {
    let list = analyticsData?.byVendor || [];
    if (vendorSearchTerm.trim()) {
      const q = vendorSearchTerm.toLowerCase();
      list = list.filter((v) => v.vendor.toLowerCase().includes(q) || v.mainCategory.toLowerCase().includes(q));
    }
    return list;
  }, [analyticsData?.byVendor, vendorSearchTerm]);

  const displayedVendors = useMemo(() => {
    return showAllVendors ? filteredVendors : filteredVendors.slice(0, 10);
  }, [filteredVendors, showAllVendors]);

  // Handler de reclasificación
  const handleReassign = async (id: number, newCat: string) => {
    setReclassifyingId(id);
    const ok = await reassignExpenseCategory(id, newCat);
    setReclassifyingId(null);
    if (ok) {
      setReclassifiedSuccessId(id);
      setTimeout(() => setReclassifiedSuccessId(null), 2500);
      loadAnalytics();
      if (onRefreshExpenses) onRefreshExpenses();
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header con Filtros de Rango Temporal */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80 shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                Analítica de Compras & Egresos
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Auditoría Nube
                </span>
              </h2>
              <p className="text-xs text-stone-500 font-medium">
                Monitorea a dónde va el dinero, proveedores dominantes y evolución de costos
              </p>
            </div>
          </div>
        </div>

        {/* Selector de Período */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
            <button
              onClick={() => setDateFilter('WEEK')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                dateFilter === 'WEEK'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Última Semana
            </button>
            <button
              onClick={() => setDateFilter('MONTH')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                dateFilter === 'MONTH'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Este Mes
            </button>
            <button
              onClick={() => setDateFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                dateFilter === 'ALL'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Todo el Histórico
            </button>
          </div>

          <button
            onClick={loadAnalytics}
            disabled={isLoading}
            className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl transition cursor-pointer"
            title="Refrescar analítica"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#1c6856]' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. KPIs de Compras del Período */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Egresos */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
              Total Invertido en Compras
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {(analyticsData?.totalAmount || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-stone-400">
            {analyticsData?.totalTransactionsCount || 0} compras auditadas
          </div>
        </div>

        {/* Pagado en Efectivo */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              Caja Chica (Efectivo)
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {(analyticsData?.cashAmount || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-bold font-mono">
            {(analyticsData?.cashPercent || 0).toFixed(1)}% del gasto total
          </div>
        </div>

        {/* Pagado por Transferencia / Banco */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
              Banco / Transferencias
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {(analyticsData?.transferAmount || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-blue-700 font-bold font-mono">
            {(analyticsData?.transferPercent || 0).toFixed(1)}% del gasto total
          </div>
        </div>

        {/* Ticket Promedio */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
              Ticket Promedio de Compra
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black font-mono text-stone-900">
            C$ {averageTicket.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-stone-400">
            Costo promedio por cada ticket
          </div>
        </div>
      </div>

      {/* 3. Gráfica de Tendencia y Evolución Diaria de Compras (Últimos 14 días) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
              Evolución Diaria de Compras & Egresos (Últimas 2 Semanas)
            </h3>
          </div>
          <span className="text-xs text-stone-400 font-medium">
            Muestra los picos de gasto día a día
          </span>
        </div>

        {dailySpendData.length === 0 ? (
          <div className="py-12 text-center text-stone-400 text-xs">
            No hay compras registradas en este período
          </div>
        ) : (
          <div className="relative pt-6 pb-2">
            <div className="h-44 flex items-end justify-between gap-2 px-2">
              {dailySpendData.map((d) => {
                const heightPct = (d.total / maxDailySpend) * 100;
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                  >
                    {/* Tooltip hover */}
                    <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900 text-white text-[10px] font-mono p-2 rounded-lg pointer-events-none whitespace-nowrap z-20 shadow-md">
                      <div className="font-bold text-amber-400">{d.dayLabel}</div>
                      <div>C$ {d.total.toFixed(2)} ({d.count} compras)</div>
                    </div>

                    <div
                      style={{ height: `${Math.max(heightPct, 6)}%` }}
                      className="w-full max-w-[36px] bg-rose-500 rounded-t-md hover:bg-rose-600 transition-all shadow-xs"
                    />

                    <div className="text-[10px] font-mono text-stone-400 group-hover:text-stone-900 mt-2">
                      {d.date.slice(8, 10)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Dos Rankings: Top Proveedores & Top Categorías */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Proveedores */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
                Top Proveedores ({analyticsData?.byVendor?.length || 0})
              </h3>
            </div>

            {/* Búsqueda en Proveedores */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar proveedor..."
                value={vendorSearchTerm}
                onChange={(e) => setVendorSearchTerm(e.target.value)}
                className="bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-1 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {displayedVendors.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                No hay proveedores coincidentes
              </div>
            ) : (
              displayedVendors.map((v, i) => (
                <div
                  key={v.vendor}
                  className="p-3 rounded-xl border border-stone-100 hover:border-stone-200 bg-stone-50/60 hover:bg-stone-50 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-stone-200 text-stone-700 flex items-center justify-center font-mono font-bold text-[10px]">
                        {i + 1}
                      </span>
                      <strong className="text-stone-900 truncate max-w-[180px]">{v.vendor}</strong>
                      <span className="text-[10px] text-stone-400 bg-white px-1.5 py-0.5 rounded border border-stone-200">
                        {v.mainCategory}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-stone-900">
                        C$ {v.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-stone-400 block font-mono">
                        {v.percent.toFixed(1)}% ({v.count} ops)
                      </span>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(v.percent, 100)}%` }}
                      className="bg-purple-600 h-full rounded-full"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {filteredVendors.length > 10 && (
            <button
              onClick={() => setShowAllVendors((p) => !p)}
              className="w-full text-center py-2 text-xs font-bold text-[#1c6856] hover:bg-stone-50 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>{showAllVendors ? 'Ver Menos' : `Ver Todos (${filteredVendors.length})`}</span>
              {showAllVendors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Ranking de Categorías */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
                Top Categorías ({analyticsData?.byCategory?.length || 0})
              </h3>
            </div>

            {/* Búsqueda en Categorías */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar categoría..."
                value={categorySearchTerm}
                onChange={(e) => setCategorySearchTerm(e.target.value)}
                className="bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-1 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {displayedCategories.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                No hay categorías coincidentes
              </div>
            ) : (
              displayedCategories.map((c, i) => (
                <div
                  key={c.category}
                  className="p-3 rounded-xl border border-stone-100 hover:border-stone-200 bg-stone-50/60 hover:bg-stone-50 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-stone-200 text-stone-700 flex items-center justify-center font-mono font-bold text-[10px]">
                        {i + 1}
                      </span>
                      <strong className="text-stone-900">{c.label}</strong>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-stone-900">
                        C$ {c.total.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-stone-400 block font-mono">
                        {c.percent.toFixed(1)}% ({c.count} ops)
                      </span>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(c.percent, 100)}%` }}
                      className="bg-[#1c6856] h-full rounded-full"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {filteredCategories.length > 10 && (
            <button
              onClick={() => setShowAllCategories((p) => !p)}
              className="w-full text-center py-2 text-xs font-bold text-[#1c6856] hover:bg-stone-50 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>{showAllCategories ? 'Ver Menos' : `Ver Todas (${filteredCategories.length})`}</span>
              {showAllCategories ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
