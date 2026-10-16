'use client';

import React, { useMemo } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Building2,
  Banknote,
  CreditCard,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { CompraGasto, JornadaDiaria } from '@/lib/compras-types';
import {
  parseVentasFromObservaciones,
  parseOpeningFromObservaciones,
  parseClosingFromObservaciones,
  isFondeoTransaction,
} from '@/lib/control-service';

interface Props {
  jornadaActiva: JornadaDiaria | null;
  jornadas: JornadaDiaria[];
  gastos: CompraGasto[];
  selectedDate: string;
}

export default function ExecutiveSummaryBanner({
  jornadaActiva,
  jornadas,
  gastos,
  selectedDate,
}: Props) {
  // Buscar la jornada del día seleccionado
  const jornadaDia = useMemo(() => {
    return jornadas.find((j) => j.fecha === selectedDate) || null;
  }, [jornadas, selectedDate]);

  // Ventas parseadas
  const sales = useMemo(() => {
    return parseVentasFromObservaciones(jornadaDia?.observaciones);
  }, [jornadaDia]);

  // Apertura
  const opening = useMemo(() => {
    return parseOpeningFromObservaciones(jornadaDia?.observaciones, jornadaDia?.fondo_inicial || 0);
  }, [jornadaDia]);

  // Cierre auditado si está cerrado
  const closing = useMemo(() => {
    return parseClosingFromObservaciones(jornadaDia?.observaciones);
  }, [jornadaDia]);

  // Gastos de compras_gastos del día seleccionado
  const gastosDia = useMemo(() => {
    return gastos.filter(
      (g) => !isFondeoTransaction(g) && (g.fecha_hora || '').slice(0, 10) === selectedDate
    );
  }, [gastos, selectedDate]);

  const gastosEfectivo = useMemo(() => {
    return gastosDia
      .filter((g) => g.metodo_pago === 'EFECTIVO')
      .reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
  }, [gastosDia]);

  const gastosBanco = useMemo(() => {
    return gastosDia
      .filter((g) => g.metodo_pago === 'TRANSFERENCIA' || g.metodo_pago === 'TARJETA')
      .reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
  }, [gastosDia]);

  const gastosTotal = gastosEfectivo + gastosBanco;

  // Dinero Físico en Custodia (en gaveta ahora mismo)
  // Fórmula: Fondo Inicial Apertura NIO + Ventas Efectivo - Gastos Efectivo
  const efectivoEnCustodia = Math.max(
    0,
    opening.totalOpeningNIO + sales.salesCash - gastosEfectivo
  );

  // Ganancia Neta
  const gananciaNeta =
    closing?.dailyNetProfit !== undefined
      ? closing.dailyNetProfit
      : sales.totalGrossSales - gastosTotal - sales.tips;

  const margenPercent =
    sales.totalGrossSales > 0 ? (gananciaNeta / sales.totalGrossSales) * 100 : 0;

  const isClosed = jornadaDia?.estado === 'CERRADA';
  const isOpen = jornadaDia?.estado === 'ABIERTA';

  return (
    <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-stone-800 space-y-6">
      {/* Barra Superior de Estado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                Command Center Financiero Ejecutivo
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                {selectedDate}
              </span>
            </div>
            <p className="text-xs text-stone-400 font-medium">
              Supervisión de caja, arqueos y movimientos sin necesidad de estar físicamente en el restaurante
            </p>
          </div>
        </div>

        {/* Semáforo del Estado de Arqueo */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {closing ? (
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 ${
                closing.auditStatus === 'SQUARED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : closing.auditStatus === 'SURPLUS'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {closing.auditStatus === 'SQUARED' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Arqueo Cuadrado (C$ 0.00 dif.)</span>
                </>
              ) : closing.auditStatus === 'SURPLUS' ? (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Sobrante: +C$ {closing.differenceNIO.toFixed(2)}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Faltante en Caja: -C$ {Math.abs(closing.differenceNIO).toFixed(2)}</span>
                </>
              )}
            </div>
          ) : isOpen ? (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black flex items-center gap-1.5 animate-pulse">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Turno Abierto en Curso</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-stone-800 text-stone-400 border border-stone-700 text-xs font-bold">
              <span>Sin Turno Abierto</span>
            </div>
          )}
        </div>
      </div>

      {/* Los 4 Pilares Fundamentales del Negocio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pilar 1: Ingresos Totales */}
        <div className="bg-stone-800/60 rounded-2xl p-4 border border-stone-700/70 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              1. Ingresos Totales de Hoy
            </span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            C$ {sales.totalGrossSales.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="space-y-1 pt-1.5 border-t border-stone-700/60 text-[11px] font-mono text-stone-300">
            <div className="flex justify-between">
              <span className="text-stone-400">Efectivo:</span>
              <span className="font-bold text-emerald-300">C$ {sales.salesCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Tarjetas POS:</span>
              <span className="font-bold text-blue-300">C$ {sales.totalCards.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">PedidosYa + Transf:</span>
              <span className="font-bold text-purple-300">
                C$ {(sales.salesPedidosYa + sales.salesBankTransfers).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Pilar 2: Egresos Totales */}
        <div className="bg-stone-800/60 rounded-2xl p-4 border border-stone-700/70 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
              2. Egresos Totales de Hoy
            </span>
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <ArrowDownRight className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-rose-300">
            - C$ {gastosTotal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="space-y-1 pt-1.5 border-t border-stone-700/60 text-[11px] font-mono text-stone-300">
            <div className="flex justify-between">
              <span className="text-stone-400">Caja Chica (Efectivo):</span>
              <span className="font-bold text-rose-300">C$ {gastosEfectivo.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Banco / Transferencias:</span>
              <span className="font-bold text-blue-300">C$ {gastosBanco.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Total Compras:</span>
              <span className="font-bold text-stone-200">{gastosDia.length} facturas</span>
            </div>
          </div>
        </div>

        {/* Pilar 3: Dinero Físico en Custodia (Gaveta AHORA) */}
        <div className="bg-emerald-950/40 rounded-2xl p-4 border border-emerald-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              3. Dinero Físico en Gaveta
            </span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            C$ {efectivoEnCustodia.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="space-y-1 pt-1.5 border-t border-emerald-900/60 text-[11px] font-mono text-emerald-100/80">
            <div className="flex justify-between">
              <span className="text-stone-400">Fondo Apertura NIO:</span>
              <span className="font-bold">C$ {opening.totalOpeningNIO.toFixed(2)}</span>
            </div>
            {opening.totalOpeningUSD > 0 && (
              <div className="flex justify-between text-amber-300">
                <span>Dólares Apertura:</span>
                <span className="font-bold">${opening.totalOpeningUSD} USD</span>
              </div>
            )}
            <div className="flex justify-between text-emerald-400 font-bold">
              <span>Saldo Teórico:</span>
              <span>C$ {efectivoEnCustodia.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Pilar 4: Ganancia Neta Real & Margen */}
        <div className="bg-stone-800/60 rounded-2xl p-4 border border-stone-700/70 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
              4. Utilidad Neta del Día
            </span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">
            C$ {gananciaNeta.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
          </div>
          <div className="space-y-1 pt-1.5 border-t border-stone-700/60 text-[11px] font-mono text-stone-300">
            <div className="flex justify-between">
              <span className="text-stone-400">Margen Operativo:</span>
              <span className="font-bold text-emerald-300 font-mono">{margenPercent.toFixed(1)}%</span>
            </div>
            {sales.tips > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Propinas deducidas:</span>
                <span>- C$ {sales.tips.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-400">
              <span>Responsable:</span>
              <span className="font-bold text-white truncate max-w-[110px]">
                {jornadaDia?.responsable || 'Bodegón'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
