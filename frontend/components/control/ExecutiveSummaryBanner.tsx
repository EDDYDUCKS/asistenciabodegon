'use client';

import React, { useMemo } from 'react';
import BrandBand from '@/components/BrandBand';
import {
  TrendingUp,
  AlertTriangle,
  Wallet,
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

  const fechaLarga = (() => {
    const d = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return selectedDate;
    const t = d.toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  const pill = 'h-10 px-3.5 rounded-xl text-sm font-bold flex items-center gap-2';
  const estado = closing ? (
    closing.auditStatus === 'SQUARED' ? (
      <span className={`${pill} bg-crema text-bodegon`}>
        <CheckCircle2 className="w-4 h-4" />
        Arqueo cuadrado
      </span>
    ) : closing.auditStatus === 'SURPLUS' ? (
      <span className={`${pill} bg-dorado-vivo text-tinta`}>
        <Sparkles className="w-4 h-4" />
        Sobrante: +C$ {closing.differenceNIO.toFixed(2)}
      </span>
    ) : (
      <span className={`${pill} bg-barro text-white`}>
        <AlertTriangle className="w-4 h-4" />
        Faltante: -C$ {Math.abs(closing.differenceNIO).toFixed(2)}
      </span>
    )
  ) : isOpen ? (
    <span className={`${pill} bg-crema text-bodegon`}>
      <span className="w-2 h-2 rounded-full bg-bodegon" />
      Turno abierto
    </span>
  ) : (
    <span className={`${pill} border border-white/35 text-crema`}>
      <Clock className="w-4 h-4" />
      {isClosed ? 'Turno cerrado' : 'Sin turno abierto'}
    </span>
  );

  const money = (n: number) => n.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <BrandBand eyebrow={fechaLarga} title="Caja del día" actions={estado}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Pilar featured icon={<ArrowUpRight className="w-4 h-4" />} label="Ingresos" value={`C$ ${money(sales.totalGrossSales)}`}>
          <Linea label="Efectivo" value={`C$ ${money(sales.salesCash)}`} />
          <Linea label="Tarjetas POS" value={`C$ ${money(sales.totalCards)}`} />
          <Linea label="PedidosYa y transferencias" value={`C$ ${money(sales.salesPedidosYa + sales.salesBankTransfers)}`} />
        </Pilar>

        <Pilar icon={<ArrowDownRight className="w-4 h-4" />} label="Egresos" value={`- C$ ${money(gastosTotal)}`}>
          <Linea label="Caja chica (efectivo)" value={`C$ ${money(gastosEfectivo)}`} />
          <Linea label="Banco y transferencias" value={`C$ ${money(gastosBanco)}`} />
          <Linea label="Compras" value={`${gastosDia.length} facturas`} />
        </Pilar>

        <Pilar icon={<Wallet className="w-4 h-4" />} label="Efectivo en gaveta" value={`C$ ${money(efectivoEnCustodia)}`}>
          <Linea label="Fondo de apertura" value={`C$ ${money(opening.totalOpeningNIO)}`} />
          {opening.totalOpeningUSD > 0 && <Linea label="Dólares de apertura" value={`$${opening.totalOpeningUSD} USD`} />}
          <Linea label="Saldo teórico" value={`C$ ${money(efectivoEnCustodia)}`} />
        </Pilar>

        <Pilar icon={<TrendingUp className="w-4 h-4" />} label="Utilidad neta" value={`C$ ${money(gananciaNeta)}`}>
          <Linea label="Margen operativo" value={`${margenPercent.toFixed(1)}%`} />
          {sales.tips > 0 && <Linea label="Propinas deducidas" value={`- C$ ${money(sales.tips)}`} />}
          <Linea label="Responsable" value={jornadaDia?.responsable || 'Bodegón'} />
        </Pilar>
      </div>
    </BrandBand>
  );
}

/** Contexto para que las líneas de desglose tomen el tono de su tarjeta. */
const PilarTono = React.createContext(false);

function Pilar({
  featured = false,
  icon,
  label,
  value,
  children,
}: {
  featured?: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl p-4 flex flex-col gap-2 min-w-0 ${
        featured ? 'col-span-2 sm:col-span-1 bg-crema text-tinta' : 'bg-white/[0.08] border border-white/[0.18] text-crema'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${featured ? 'uppercase tracking-[0.08em] text-dorado-tinta' : 'text-[#CFE3DC]'}`}>
          {label}
        </span>
        <span className={featured ? 'text-bodegon' : 'text-[#CFE3DC]'}>{icon}</span>
      </div>
      <div className={`font-display font-bold leading-none tabular-nums truncate ${featured ? 'text-3xl' : 'text-2xl sm:text-3xl'}`}>{value}</div>
      {/* En celular solo la tarjeta principal muestra el desglose, para que la banda no se alargue. */}
      <div className={`mt-1 pt-2 space-y-1 text-xs border-t ${featured ? 'border-stone-200' : 'hidden sm:block border-white/15'}`}>
        <PilarTono.Provider value={featured}>{children}</PilarTono.Provider>
      </div>
    </div>
  );
}

function Linea({ label, value }: { label: string; value: string }) {
  const featured = React.useContext(PilarTono);
  return (
    <div className="flex justify-between gap-3">
      <span className={featured ? 'text-stone-500' : 'text-[#CFE3DC]'}>{label}</span>
      <span className="font-semibold tabular-nums truncate">{value}</span>
    </div>
  );
}
