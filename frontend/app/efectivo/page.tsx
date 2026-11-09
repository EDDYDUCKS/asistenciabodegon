'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Banknote, CheckCircle2, ChevronDown, Lock, Receipt, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import PinSecurityGate from '@/components/PinSecurityGate';
import { TegaPie } from '@/components/TegaFirma';
import { fetchEfectivoJefe, EfectivoDia, EfectivoGasto, EfectivoJefe } from '@/lib/api-client';
import { CATEGORIAS_GASTO } from '@/lib/compras-types';

/**
 * Caja del Bodegón (vista de solo lectura para el jefe).
 * Arriba se elige el día. Turno abierto: efectivo de caja chica ahora y la tabla de gastos.
 * Turno cerrado: ganancia del día, gastos a detalle y lo que quedó en gaveta después de la propina.
 * Los números salen del servidor con la misma fórmula de Bodegón Control.
 */

const cs = (n: number | null | undefined, dec = 0) =>
  `C$ ${(n || 0).toLocaleString('es-NI', { minimumFractionDigits: dec, maximumFractionDigits: 2 })}`;
const usd = (n: number | null | undefined) =>
  `US$ ${(n || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`;
const abs = Math.abs;

function nombreDia(fecha: string, largo = true) {
  const [y, m, d] = fecha.split('-').map(Number);
  const txt = new Date(y, m - 1, d, 12).toLocaleDateString('es-NI', {
    weekday: 'long',
    day: 'numeric',
    month: largo ? 'long' : 'short',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function diaCorto(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(y, m - 1, d, 12);
  const sem = f.toLocaleDateString('es-NI', { weekday: 'short' }).replace('.', '');
  return { sem: sem.charAt(0).toUpperCase() + sem.slice(1), num: d };
}

const PERIODOS = [
  { dias: 14, label: '14 días' },
  { dias: 30, label: '30 días' },
  { dias: 61, label: '2 meses' },
];

function nombreMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  const txt = new Date(y, m - 1, 15).toLocaleDateString('es-NI', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function hora(ms?: number | string | null) {
  if (!ms) return '';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-NI', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Managua' });
}

function hora12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const NOMBRE_CATEGORIA = new Map(CATEGORIAS_GASTO.map((c) => [c.id, c.label]));
function categoria(id: string) {
  const conocida = NOMBRE_CATEGORIA.get(id);
  if (conocida) return conocida;
  if (id === 'PROPINAS') return 'Propinas';
  const txt = id.replace(/_/g, ' ').replace(/\//g, ' / ').toLowerCase();
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

const METODO: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', PENDIENTE: 'Pendiente' };

function Fila({ label, valor, tono = 'normal', sub }: { label: string; valor: string; tono?: 'normal' | 'menos' | 'mas' | 'total' | 'suave'; sub?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${tono === 'total' ? 'border-t border-stone-200 mt-1 pt-3' : ''}`}>
      <div className="min-w-0">
        <div className={`text-sm ${tono === 'total' ? 'font-bold text-tinta' : 'text-stone-600'}`}>{label}</div>
        {sub && <div className="text-[11px] text-stone-500 mt-0.5">{sub}</div>}
      </div>
      <div
        className={`font-mono tabular-nums text-right shrink-0 ${
          tono === 'total'
            ? 'font-black text-bodegon text-base'
            : tono === 'menos'
              ? 'font-semibold text-barro'
              : tono === 'mas'
                ? 'font-semibold text-bodegon'
                : tono === 'suave'
                  ? 'text-stone-500 text-sm'
                  : 'font-semibold text-tinta'
        }`}
      >
        {valor}
      </div>
    </div>
  );
}

function Tarjeta({ titulo, icono, children, extra }: { titulo: string; icono?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          {icono}
          {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Aviso({ tono, children }: { tono: 'ok' | 'alerta'; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-snug mt-3 ${
        tono === 'ok' ? 'bg-bodegon/5 text-bodegon-noche border border-bodegon/15' : 'bg-barro/5 text-barro border border-barro/25'
      }`}
    >
      {tono === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

function VerMas({ abierto, onClick, children }: { abierto: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full flex items-center justify-center gap-1 text-[13px] font-semibold text-bodegon hover:text-bodegon-noche py-2 rounded-xl hover:bg-bodegon/5 cursor-pointer"
    >
      {children}
      <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
    </button>
  );
}

/** Tabla de pagos y compras del día (lo que se anota en caja chica). */
function TablaGastos({ gastos }: { gastos: EfectivoGasto[] }) {
  const [todos, setTodos] = useState(false);
  if (!gastos.length) return <p className="text-[13px] text-stone-500 py-2">No hay pagos ni compras anotados este día.</p>;
  const visibles = todos ? gastos : gastos.slice(0, 8);
  return (
    <>
      <ul className="divide-y divide-stone-100 -mx-1">
        {visibles.map((g, i) => {
          const entra = g.tipo === 'deposito' || g.tipo === 'traslado';
          return (
            <li key={`${g.hora}-${i}`} className="px-1 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-tinta leading-snug">{g.concepto || categoria(g.categoria)}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  {hora12(g.hora)}
                  {g.proveedor && g.proveedor !== g.concepto ? ` · ${g.proveedor}` : ''}
                  {' · '}
                  {g.tipo === 'gasto' ? categoria(g.categoria) : g.tipo === 'fuera' ? 'Retiro de socios o préstamo (no es gasto)' : g.tipo === 'traslado' ? 'Traslado de la gaveta al abrir' : 'Depósito a caja chica'}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-mono tabular-nums text-sm font-semibold ${entra ? 'text-bodegon' : g.tipo === 'fuera' ? 'text-stone-500' : 'text-tinta'}`}>
                  {entra ? '+ ' : ''}
                  {cs(g.monto, 2)}
                </div>
                <div className={`text-[11px] ${g.metodo === 'EFECTIVO' ? 'text-stone-500' : 'text-dorado-tinta font-semibold'}`}>{METODO[g.metodo] || g.metodo}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {gastos.length > 8 && (
        <VerMas abierto={todos} onClick={() => setTodos((v) => !v)}>
          {todos ? 'Ver menos' : `Ver los ${gastos.length} movimientos`}
        </VerMas>
      )}
    </>
  );
}

function GastosPorCategoria({ dia }: { dia: EfectivoDia }) {
  const lista = dia.gastos_por_categoria || [];
  const total = lista.reduce((s, c) => s + c.monto, 0);
  if (!lista.length) return null;
  return (
    <div className="space-y-2 mb-3">
      {lista.map((c) => (
        <div key={c.categoria}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-stone-700">{categoria(c.categoria)}</span>
            <span className="font-mono tabular-nums font-semibold text-tinta">{cs(c.monto, 2)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-100 mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-bodegon/70" style={{ width: `${total ? Math.max(2, (c.monto / total) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CajaChica({ dia, ahora }: { dia: EfectivoDia; ahora: boolean }) {
  const c = dia.caja_chica;
  const cerrada = c.cerrada && c.contado !== null;
  return (
    <Tarjeta titulo={ahora ? 'Caja chica ahora' : 'Caja chica del día'} icono={<Wallet className="w-3.5 h-3.5" />}>
      <div className="text-[13px] text-stone-600">{cerrada ? 'Contado al cerrar' : ahora ? 'Debería haber en caja chica' : 'Debió quedar en caja chica'}</div>
      <div className="font-display text-4xl font-bold text-bodegon tabular-nums mt-0.5">{cs(cerrada ? c.contado : c.esperado)}</div>
      <div className="mt-2">
        <Fila label="Empezó el día con" valor={cs(c.inicial, 2)} />
        {c.depositos > 0 && <Fila label="Depósitos que entraron" valor={`+ ${cs(c.depositos, 2)}`} tono="mas" />}
        <Fila
          label="Pagado en efectivo"
          valor={`− ${cs(c.gastos_efectivo, 2)}`}
          tono="menos"
          sub={c.propinas_pagadas > 0 ? `Incluye ${cs(c.propinas_pagadas)} de propinas a meseros` : undefined}
        />
        <Fila label="Saldo según lo anotado" valor={cs(c.esperado, 2)} tono="total" />
      </div>
      {cerrada && c.diferencia !== null && abs(c.diferencia) >= 1 && (
        <Aviso tono="alerta">
          Al contar hubo {c.diferencia < 0 ? 'faltante' : 'sobrante'} de {cs(abs(c.diferencia), 2)}.
        </Aviso>
      )}
    </Tarjeta>
  );
}

function VistaEfectivo() {
  const [datos, setDatos] = useState<EfectivoJefe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [periodo, setPeriodo] = useState<number>(14);
  const [verVentas, setVerVentas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchEfectivoJefe(periodo);
      setDatos(r);
      setError(null);
      setActualizado(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.');
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    const primera = setTimeout(cargar, 0);
    const t = setInterval(cargar, 60_000);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
    };
  }, [cargar]);

  const dias = useMemo(() => datos?.dias || [], [datos]);
  const cierres = useMemo(() => dias.filter((d) => d.cierre), [dias]);
  const porMes = useMemo(() => {
    const grupos: { mes: string; dias: EfectivoDia[]; ganancia: number }[] = [];
    for (const d of cierres) {
      const mes = d.fecha.slice(0, 7);
      let g = grupos[grupos.length - 1];
      if (!g || g.mes !== mes) {
        g = { mes, dias: [], ganancia: 0 };
        grupos.push(g);
      }
      g.dias.push(d);
      g.ganancia += d.resultado?.ganancia || 0;
    }
    return grupos;
  }, [cierres]);

  // Por defecto: el turno abierto de hoy si lo hay; si no, el último cierre
  const dia: EfectivoDia | undefined = useMemo(() => dias.find((d) => d.fecha === fechaSel) || dias[0], [dias, fechaSel]);
  const abierto = Boolean(dia && !dia.cierre);
  const esHoy = dia?.fecha === datos?.hoy;
  const vivo = datos?.en_vivo;

  const elegir = (fecha: string) => {
    setFechaSel(fecha);
    setVerVentas(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-crema text-tinta flex flex-col">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-stone-200 bg-bodegon shrink-0">
              <Image src="/logo.png" alt="El Bodegón" width={36} height={36} className="w-full h-full object-cover" priority />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold leading-none text-bodegon-noche truncate">Caja del Bodegón</h1>
              <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                {actualizado ? `Actualizado ${actualizado.toLocaleTimeString('es-NI', { hour: 'numeric', minute: '2-digit' })}` : 'Cargando…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={cargar} title="Actualizar" className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer">
              <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('bodegon_efectivo_pin_verified');
                window.location.reload();
              }}
              title="Bloquear"
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
            <Link href="/control" title="Control completo" className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* ── Elegir el día: hoy y los turnos anteriores, siempre a la mano */}
        {dias.length > 0 && (
          <div className="max-w-3xl mx-auto px-4 pb-2.5">
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist" aria-label="Día">
              {dias.map((d) => {
                const activo = d.fecha === dia?.fecha;
                const enCurso = !d.cierre;
                const { sem, num } = diaCorto(d.fecha);
                return (
                  <button
                    key={d.fecha}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => elegir(d.fecha)}
                    className={`shrink-0 min-w-[56px] rounded-xl px-2.5 py-1.5 text-center border cursor-pointer ${
                      activo ? 'bg-bodegon text-white border-bodegon' : 'bg-white text-stone-700 border-stone-200 hover:border-bodegon/40'
                    }`}
                  >
                    <div className={`text-[10px] font-bold uppercase tracking-wide ${activo ? 'text-white/80' : 'text-stone-500'}`}>
                      {enCurso && d.fecha === datos?.hoy ? 'Hoy' : sem}
                    </div>
                    <div className="text-base font-bold leading-tight tabular-nums">{num}</div>
                    {enCurso && <div className={`text-[9px] font-bold uppercase ${activo ? 'text-white' : 'text-bodegon'}`}>abierto</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4 space-y-3.5">
        {error && <Aviso tono="alerta">No se pudo cargar: {error}</Aviso>}
        {!datos && !error && <div className="text-center text-stone-500 py-16 text-sm">Cargando la caja…</div>}
        {datos && !dia && <div className="text-center text-stone-500 py-16 text-sm">Todavía no hay turnos en este periodo.</div>}

        {dia && (
          <div className="px-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{abierto ? 'Turno abierto' : 'Turno cerrado'}</div>
            <div className="font-display text-2xl font-bold text-bodegon-noche leading-tight">{nombreDia(dia.fecha)}</div>
            <div className="text-[12px] text-stone-500">
              {dia.abrio ? `Abrió ${dia.abrio}` : 'Caja aún sin abrir en Control'}
              {dia.cierre?.cerro ? ` · cerró ${dia.cierre.cerro}${dia.cierre.hora ? ` a las ${hora(dia.cierre.hora)}` : ''}` : ''}
            </div>
          </div>
        )}

        {/* ══════════ TURNO ABIERTO ══════════ */}
        {dia && abierto && (
          <>
            <CajaChica dia={dia} ahora={esHoy} />

            <Tarjeta
              titulo={esHoy ? 'Pagos y compras de hoy' : 'Pagos y compras del día'}
              icono={<Receipt className="w-3.5 h-3.5" />}
              extra={<span className="text-[11px] text-stone-500">{dia.gastos.length} anotados</span>}
            >
              <TablaGastos gastos={dia.gastos} />
            </Tarjeta>

            {esHoy && vivo && (
              <Tarjeta
                titulo="Gaveta del turno"
                icono={<span className="w-2 h-2 rounded-full bg-bodegon animate-pulse" />}
                extra={<span className="text-[11px] text-stone-500">según TEGA · abrió {hora(vivo.abierto)}</span>}
              >
                <div className="text-[13px] text-stone-600">Si se entregara la propina ahora quedarían</div>
                <div className="font-display text-3xl font-bold text-tinta tabular-nums mt-0.5">{cs(vivo.queda_si_entrega_propina_cs)}</div>
                {vivo.esperado_usd > 0 && <div className="font-mono text-lg font-semibold text-tinta">+ {usd(vivo.esperado_usd)}</div>}
                <div className="mt-2">
                  <Fila label="Ventas del turno hasta ahora" valor={cs(vivo.ventas, 2)} />
                  <Fila label="Córdobas en gaveta" valor={cs(vivo.esperado_cs, 2)} sub={`Incluye el fondo de ${cs(vivo.fondo)}`} />
                  <Fila label="Propina acumulada (por entregar)" valor={`− ${cs(vivo.propinas, 2)}`} tono="menos" />
                </div>
              </Tarjeta>
            )}
          </>
        )}

        {/* ══════════ TURNO CERRADO ══════════ */}
        {dia && dia.cierre && dia.resultado && (
          <>
            <Tarjeta titulo="Ganancia del día" icono={<TrendingUp className="w-3.5 h-3.5" />}>
              <div className={`font-display text-4xl font-bold tabular-nums ${dia.resultado.ganancia < 0 ? 'text-barro' : 'text-bodegon'}`}>{cs(dia.resultado.ganancia)}</div>
              <div className="mt-2">
                <Fila label="Se vendió" valor={cs(dia.resultado.ventas, 2)} />
                <Fila label="Se gastó" valor={`− ${cs(dia.resultado.gastos, 2)}`} tono="menos" />
                <Fila label="Propina entregada al personal" valor={`− ${cs(dia.resultado.propina, 2)}`} tono="menos" />
                <Fila label="Ganancia" valor={cs(dia.resultado.ganancia, 2)} tono="total" />
              </div>
              <VerMas abierto={verVentas} onClick={() => setVerVentas((v) => !v)}>
                {verVentas ? 'Ocultar de dónde salen las ventas' : 'Ver de dónde salen las ventas'}
              </VerMas>
              {verVentas && (
                <div className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-1 mt-1">
                  <Fila label="Efectivo" valor={cs(dia.resultado.efectivo_real, 2)} sub="Contado en gaveta" />
                  <Fila label="Tarjetas" valor={cs(dia.resultado.tarjetas, 2)} />
                  <Fila label="PedidosYa" valor={cs(dia.resultado.pedidos_ya, 2)} />
                  {dia.resultado.transferencias > 0 && <Fila label="Transferencias" valor={cs(dia.resultado.transferencias, 2)} />}
                  {dia.resultado.otros_ingresos > 0 && <Fila label="Otros ingresos" valor={cs(dia.resultado.otros_ingresos, 2)} />}
                  <p className="text-[11px] text-stone-500 py-1.5">Misma fórmula que Bodegón Control.</p>
                </div>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="Gastos del día"
              icono={<Receipt className="w-3.5 h-3.5" />}
              extra={<span className="text-[12px] font-mono font-semibold text-barro">{cs(dia.resultado.gastos, 2)}</span>}
            >
              <GastosPorCategoria dia={dia} />
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 pt-2 border-t border-stone-100">Cada pago y compra</div>
              <TablaGastos gastos={dia.gastos} />
            </Tarjeta>

            {/* ── Efectivo al cierre: lo que quedó después de la propina */}
            <Tarjeta titulo="Efectivo al cerrar" icono={<Banknote className="w-3.5 h-3.5" />}>
              <div className="text-[13px] text-stone-600">Después de entregar la propina quedó en gaveta</div>
              <div className="flex flex-wrap items-baseline gap-x-3 mt-0.5">
                <span className="font-display text-3xl font-bold text-tinta tabular-nums">{cs(dia.cierre.queda_cs)}</span>
                {dia.cierre.queda_usd > 0 && <span className="font-mono text-xl font-bold text-tinta">+ {usd(dia.cierre.queda_usd)}</span>}
              </div>
              <div className="mt-2">
                <Fila label="Contado al cerrar" valor={cs(dia.cierre.contado_cs, 2)} sub={dia.cierre.contado_usd > 0 ? `y ${usd(dia.cierre.contado_usd)} en dólares` : undefined} />
                <Fila
                  label="Propina entregada"
                  valor={`− ${cs(dia.cierre.propina_entregada, 2)}`}
                  tono="menos"
                  sub={dia.cierre.propina_pagada ? `Se recaudaron ${cs(dia.cierre.propina_recaudada, 2)}` : `Se recaudaron ${cs(dia.cierre.propina_recaudada, 2)}, pero no se entregó esa noche`}
                />
                <Fila label="Córdobas que quedan" valor={cs(dia.cierre.queda_cs, 2)} tono="total" />
              </div>

              {dia.cierre.motivo_propina && (
                <Aviso tono="alerta">
                  Propina no entregada esa noche. Motivo: <b>{dia.cierre.motivo_propina}</b>
                </Aviso>
              )}
              {dia.cierre.notas && (
                <div className="mt-2 text-[12.5px] text-stone-600">
                  <span className="font-semibold text-stone-700">Notas del cierre:</span> {dia.cierre.notas}
                </div>
              )}
              {dia.tega && dia.tega.contado_cs !== null && (
                <div className="mt-2 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-[12.5px] text-stone-600">
                  <span className="font-semibold text-stone-700">TEGA</span> esperaba {cs(dia.tega.esperado_cs, 2)}
                  {dia.tega.esperado_usd > 0 ? ` y ${usd(dia.tega.esperado_usd)}` : ''}.{' '}
                  {dia.tega.descuadre_cs !== null && abs(dia.tega.descuadre_cs) >= 1 ? (
                    <span className={dia.tega.descuadre_cs < 0 ? 'text-barro font-semibold' : 'text-dorado-tinta font-semibold'}>
                      {dia.tega.descuadre_cs < 0 ? 'Faltante' : 'Sobrante'} de {cs(abs(dia.tega.descuadre_cs), 2)} al contar.
                    </span>
                  ) : (
                    <span className="text-bodegon font-semibold">Cuadró.</span>
                  )}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-dashed border-stone-200">
                <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">A la mañana siguiente</div>
                {dia.destino ? (
                  <>
                    {dia.destino.usd_a_snyder > 0 && <Fila label="Dólares al sobre de Snyder" valor={usd(dia.destino.usd_a_snyder)} />}
                    <Fila label="Pasó a caja chica" valor={cs(dia.destino.a_caja_chica, 2)} />
                    <Fila label="Quedó de fondo en la gaveta" valor={cs(dia.destino.fondo_gaveta_cs, 2)} />
                    {abs(dia.destino.diferencia_cs) >= 1 ? (
                      <Aviso tono="alerta">
                        Al abrir se contaron {cs(dia.destino.contado_al_abrir_cs, 2)}: {dia.destino.diferencia_cs < 0 ? 'faltan' : 'sobran'}{' '}
                        <b>{cs(abs(dia.destino.diferencia_cs), 2)}</b> contra lo que quedó al cierre
                        {dia.destino.motivo ? (
                          <>
                            . Motivo: <b>{dia.destino.motivo}</b>
                          </>
                        ) : (
                          ', sin anotar.'
                        )}
                      </Aviso>
                    ) : (
                      <Aviso tono="ok">Lo contado al abrir coincide con lo que quedó al cierre.</Aviso>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-stone-500 py-1">Todavía no se abre la caja del día siguiente.</p>
                )}
              </div>
            </Tarjeta>

            <CajaChica dia={dia} ahora={false} />
          </>
        )}

        {/* ── Historial de cierres */}
        {datos && (
          <Tarjeta titulo="Turnos anteriores">
            <div className="grid grid-cols-3 gap-1 bg-stone-100 rounded-xl p-1 mb-3" role="tablist" aria-label="Periodo">
              {PERIODOS.map((p) => (
                <button
                  key={p.dias}
                  type="button"
                  role="tab"
                  aria-selected={periodo === p.dias}
                  onClick={() => setPeriodo(p.dias)}
                  className={`rounded-lg py-1.5 text-[13px] font-semibold cursor-pointer ${periodo === p.dias ? 'bg-white text-bodegon-noche shadow-2xs' : 'text-stone-500 hover:text-stone-700'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {porMes.length === 0 && <p className="text-[13px] text-stone-500 py-2">No hay cierres en este periodo.</p>}
            {porMes.map((g) => (
              <div key={g.mes} className="mb-2 last:mb-0">
                <div className="flex items-baseline justify-between px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  <span>
                    {nombreMes(g.mes)} · {g.dias.length} {g.dias.length === 1 ? 'cierre' : 'cierres'}
                  </span>
                  <span className="normal-case font-semibold tracking-normal">Ganancia {cs(g.ganancia)}</span>
                </div>
                <ul className="divide-y divide-stone-100 -mx-1">
                  {g.dias.map((d) => {
                    const alerta = d.destino && abs(d.destino.diferencia_cs) >= 1;
                    const activo = d.fecha === dia?.fecha;
                    return (
                      <li key={d.fecha}>
                        <button
                          type="button"
                          onClick={() => elegir(d.fecha)}
                          className={`w-full text-left px-2 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer ${activo ? 'bg-bodegon/5' : 'hover:bg-stone-50'}`}
                        >
                          <div className="min-w-0">
                            <div className={`text-sm ${activo ? 'font-bold text-bodegon-noche' : 'font-medium text-tinta'}`}>{nombreDia(d.fecha, false)}</div>
                            <div className="text-[11px] text-stone-500">
                              Vendió {cs(d.resultado?.ventas)} · gastó {cs(d.resultado?.gastos)}
                              {alerta && (
                                <>
                                  {' · '}
                                  <span className="text-barro font-semibold">
                                    {d.destino!.motivo ? 'diferencia' : 'sin anotar'} {cs(abs(d.destino!.diferencia_cs))}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-mono font-bold tabular-nums text-sm ${(d.resultado?.ganancia || 0) < 0 ? 'text-barro' : 'text-bodegon'}`}>{cs(d.resultado?.ganancia)}</div>
                            <div className="text-[11px] text-stone-500">ganancia</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </Tarjeta>
        )}

        {datos && !datos.tega_conectado && <p className="text-[11px] text-stone-500 text-center">TEGA no respondió: se muestra solo lo de Bodegón Control.</p>}
      </main>
      <TegaPie producto="Bodegón Pass · Caja" />
    </div>
  );
}

export default function EfectivoPage() {
  return (
    <PinSecurityGate title="Caja del Bodegón" subtitle="Ventas, gastos y efectivo del día." sessionKey="bodegon_efectivo_pin_verified">
      <VistaEfectivo />
    </PinSecurityGate>
  );
}
