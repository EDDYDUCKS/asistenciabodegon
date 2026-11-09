'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Banknote, CheckCircle2, Lock, RefreshCw, Wallet } from 'lucide-react';
import PinSecurityGate from '@/components/PinSecurityGate';
import { TegaPie } from '@/components/TegaFirma';
import { fetchEfectivoJefe, EfectivoDia, EfectivoJefe } from '@/lib/api-client';

/**
 * Efectivo del Bodegón (vista de solo lectura para el jefe).
 * Lo que queda en gaveta después de entregar la propina, a dónde va a la mañana siguiente,
 * caja chica y el turno de TEGA en vivo. Los números salen del servidor con la misma fórmula de Control.
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

function hora(ms?: number | string | null) {
  if (!ms) return '';
  const d = typeof ms === 'number' ? new Date(ms) : new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-NI', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Managua' });
}

function Fila({ label, valor, tono = 'normal', sub }: { label: string; valor: string; tono?: 'normal' | 'menos' | 'total' | 'suave'; sub?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${tono === 'total' ? 'border-t border-stone-200 mt-1 pt-3' : ''}`}>
      <div className="min-w-0">
        <div className={`text-sm ${tono === 'total' ? 'font-bold text-tinta' : 'text-stone-600'}`}>{label}</div>
        {sub && <div className="text-[11px] text-stone-500 mt-0.5">{sub}</div>}
      </div>
      <div
        className={`font-mono tabular-nums text-right shrink-0 ${
          tono === 'total' ? 'font-black text-bodegon text-base' : tono === 'menos' ? 'font-semibold text-barro' : tono === 'suave' ? 'text-stone-500 text-sm' : 'font-semibold text-tinta'
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

function VistaEfectivo() {
  const [datos, setDatos] = useState<EfectivoJefe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchEfectivoJefe(14);
      setDatos(r);
      setError(null);
      setActualizado(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const primera = setTimeout(cargar, 0);
    const t = setInterval(cargar, 60_000);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
    };
  }, [cargar]);

  const cierres = useMemo(() => (datos?.dias || []).filter((d) => d.cierre), [datos]);
  const dia: EfectivoDia | undefined = useMemo(
    () => cierres.find((d) => d.fecha === fechaSel) || cierres[0],
    [cierres, fechaSel]
  );

  const vivo = datos?.en_vivo;
  const chica = datos?.caja_chica_actual;

  return (
    <div className="min-h-screen bg-crema text-tinta flex flex-col">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-stone-200 bg-bodegon shrink-0">
              <Image src="/logo.png" alt="El Bodegón" width={36} height={36} className="w-full h-full object-cover" priority />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold leading-none text-bodegon-noche truncate">Efectivo del Bodegón</h1>
              <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                {actualizado ? `Actualizado ${actualizado.toLocaleTimeString('es-NI', { hour: 'numeric', minute: '2-digit' })}` : 'Cargando…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={cargar}
              title="Actualizar"
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
            >
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
            <Link href="/control" title="Bodegón Control" className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4 space-y-3.5">
        {error && <Aviso tono="alerta">No se pudo cargar: {error}</Aviso>}
        {!datos && !error && <div className="text-center text-stone-500 py-16 text-sm">Cargando el efectivo…</div>}

        {/* ── Turno abierto ahora (TEGA) */}
        {vivo && (
          <Tarjeta
            titulo="Turno abierto ahora"
            icono={<span className="w-2 h-2 rounded-full bg-bodegon animate-pulse" />}
            extra={<span className="text-[11px] text-stone-500">según TEGA · abrió {hora(vivo.abierto)}</span>}
          >
            <div className="text-[13px] text-stone-600">Si se entregara la propina ahora quedarían</div>
            <div className="font-display text-4xl font-bold text-bodegon tabular-nums mt-0.5">{cs(vivo.queda_si_entrega_propina_cs)}</div>
            {vivo.esperado_usd > 0 && <div className="font-mono text-lg font-semibold text-tinta">+ {usd(vivo.esperado_usd)}</div>}
            <div className="mt-2">
              <Fila label="Córdobas en gaveta" valor={cs(vivo.esperado_cs, 2)} sub={`Incluye el fondo de ${cs(vivo.fondo)}`} />
              <Fila label="Propina acumulada (por entregar)" valor={`− ${cs(vivo.propinas, 2)}`} tono="menos" />
              {vivo.salidas_cs > 0 && <Fila label="Pagos y salidas del turno (ya restados)" valor={cs(vivo.salidas_cs, 2)} tono="suave" />}
              <Fila label="Ventas del turno hasta ahora" valor={cs(vivo.ventas, 2)} tono="suave" />
            </div>
          </Tarjeta>
        )}

        {/* ── Último cierre: lo que quedó después de la propina */}
        {dia && dia.cierre && (
          <Tarjeta titulo={`Cierre del ${nombreDia(dia.fecha)}`} icono={<Banknote className="w-3.5 h-3.5" />}>
            <div className="text-[13px] text-stone-600">Después de entregar la propina quedó en gaveta</div>
            <div className="flex flex-wrap items-baseline gap-x-3 mt-0.5">
              <span className="font-display text-4xl font-bold text-bodegon tabular-nums">{cs(dia.cierre.queda_cs)}</span>
              {dia.cierre.queda_usd > 0 && <span className="font-mono text-xl font-bold text-tinta">+ {usd(dia.cierre.queda_usd)}</span>}
            </div>
            <div className="text-[12px] text-stone-500">
              Equivale a {cs(dia.cierre.queda_total, 2)} a tasa {dia.tasa} · cerró {dia.cierre.cerro || '—'}
              {dia.cierre.hora ? ` a las ${hora(dia.cierre.hora)}` : ''}
            </div>

            <div className="mt-3">
              <Fila
                label="Contado al cerrar"
                valor={cs(dia.cierre.contado_cs, 2)}
                sub={dia.cierre.contado_usd > 0 ? `y ${usd(dia.cierre.contado_usd)} en dólares` : undefined}
              />
              <Fila
                label="Propina entregada al personal"
                valor={`− ${cs(dia.cierre.propina_entregada, 2)}`}
                tono="menos"
                sub={
                  dia.cierre.propina_pagada
                    ? `Se recaudaron ${cs(dia.cierre.propina_recaudada, 2)}`
                    : `Se recaudaron ${cs(dia.cierre.propina_recaudada, 2)}, pero el cierre dice que no se entregó`
                }
              />
              <Fila label="Córdobas que quedan" valor={cs(dia.cierre.queda_cs, 2)} tono="total" />
            </div>

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

            {/* ── A dónde fue a la mañana siguiente */}
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
                      <b>{cs(abs(dia.destino.diferencia_cs), 2)}</b> contra lo que quedó al cierre, sin anotar.
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
        )}

        {/* ── Caja chica */}
        {chica && (
          <Tarjeta titulo="Caja chica" icono={<Wallet className="w-3.5 h-3.5" />} extra={<span className="text-[11px] text-stone-500">{nombreDia(chica.fecha, false)}</span>}>
            <div className="text-[13px] text-stone-600">{chica.cerrada ? 'Contado al cerrar' : 'Debería haber ahora'}</div>
            <div className="font-display text-3xl font-bold text-tinta tabular-nums">{cs(chica.cerrada && chica.contado !== null ? chica.contado : chica.esperado, 2)}</div>
            <div className="mt-2">
              <Fila label="Empezó el día con" valor={cs(chica.inicial, 2)} />
              <Fila label="Depósitos" valor={`+ ${cs(chica.depositos, 2)}`} />
              <Fila label="Pagos en efectivo" valor={`− ${cs(chica.gastos_efectivo, 2)}`} tono="menos" sub={chica.propinas_pagadas > 0 ? `Incluye ${cs(chica.propinas_pagadas)} de propinas a meseros` : undefined} />
              <Fila label="Saldo según lo anotado" valor={cs(chica.esperado, 2)} tono="total" />
            </div>
            {chica.cerrada && chica.diferencia !== null && abs(chica.diferencia) >= 1 && (
              <Aviso tono="alerta">
                Al contar hubo {chica.diferencia < 0 ? 'faltante' : 'sobrante'} de {cs(abs(chica.diferencia), 2)}.
              </Aviso>
            )}
          </Tarjeta>
        )}

        {/* ── Resultado del día seleccionado */}
        {dia && dia.resultado && (
          <Tarjeta titulo={`Resultado del ${nombreDia(dia.fecha, false)}`}>
            <Fila label="Ventas" valor={cs(dia.resultado.ventas, 2)} sub={`Efectivo ${cs(dia.resultado.efectivo_real)} · Tarjetas ${cs(dia.resultado.tarjetas)} · PedidosYa ${cs(dia.resultado.pedidos_ya)}${dia.resultado.transferencias ? ` · Transf. ${cs(dia.resultado.transferencias)}` : ''}`} />
            <Fila label="Gastos" valor={`− ${cs(dia.resultado.gastos, 2)}`} tono="menos" />
            <Fila label="Propina entregada" valor={`− ${cs(dia.resultado.propina, 2)}`} tono="menos" />
            <Fila label="Ganancia" valor={cs(dia.resultado.ganancia, 2)} tono="total" />
            <p className="text-[11px] text-stone-500 mt-1">Misma fórmula que Bodegón Control.</p>
          </Tarjeta>
        )}

        {/* ── Días anteriores */}
        {cierres.length > 0 && (
          <Tarjeta titulo="Últimos cierres">
            <ul className="divide-y divide-stone-100 -mx-1">
              {cierres.map((d) => {
                const alerta = d.destino && abs(d.destino.diferencia_cs) >= 1;
                const activo = d.fecha === dia?.fecha;
                return (
                  <li key={d.fecha}>
                    <button
                      type="button"
                      onClick={() => {
                        setFechaSel(d.fecha);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-full text-left px-2 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer ${activo ? 'bg-bodegon/5' : 'hover:bg-stone-50'}`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm ${activo ? 'font-bold text-bodegon-noche' : 'font-medium text-tinta'}`}>{nombreDia(d.fecha, false)}</div>
                        <div className="text-[11px] text-stone-500">Propina {cs(d.cierre?.propina_entregada)}{alerta ? ' · ' : ''}{alerta && <span className="text-barro font-semibold">sin anotar {cs(abs(d.destino!.diferencia_cs))}</span>}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold tabular-nums text-sm">{cs(d.cierre?.queda_cs)}</div>
                        {(d.cierre?.queda_usd || 0) > 0 && <div className="font-mono text-[11px] text-stone-600">+ {usd(d.cierre?.queda_usd)}</div>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        )}

        {datos && !datos.tega_conectado && (
          <p className="text-[11px] text-stone-500 text-center">TEGA no respondió: se muestra solo lo de Bodegón Control.</p>
        )}
      </main>
      <TegaPie producto="Bodegón Pass · Efectivo" />
    </div>
  );
}

export default function EfectivoPage() {
  return (
    <PinSecurityGate title="Efectivo del Bodegón" subtitle="Cuánto queda después de la propina." sessionKey="bodegon_efectivo_pin_verified">
      <VistaEfectivo />
    </PinSecurityGate>
  );
}
