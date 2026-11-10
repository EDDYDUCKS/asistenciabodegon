'use client';

/**
 * "Mis consumos" en la ficha del colaborador del kiosco.
 * Muestra las cuentas de consumo del personal que TEGA cargó a ESTE colaborador (el servidor las busca por su
 * carnet). Solo lectura: no hay botones para cambiar, anular ni borrar nada.
 */
import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import type { ConsumosColaborador, TicketConsumo } from '@/lib/api-client';

const cs = (n: number) =>
  'C$ ' + Number(n || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tarjeta corta dentro de la ficha: total de la quincena y botón para ver el detalle. */
export function ResumenConsumos({ consumos, onVer }: { consumos: ConsumosColaborador; onVer: () => void }) {
  const q = consumos.quincena;
  const n = consumos.tickets.length;
  return (
    <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-bodegon shrink-0">
          <Receipt className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 block leading-tight">
            Mis consumos · {q.nombre}
          </span>
          <span className="text-base font-black font-mono text-stone-900 block leading-tight">
            {cs(q.a_cuenta)}
            <span className="text-[10px] font-semibold text-stone-500 font-sans ml-1.5">
              a mi cuenta · {q.cuentas} cuenta{q.cuentas === 1 ? '' : 's'}
            </span>
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onVer}
        disabled={n === 0}
        className="px-4 py-2.5 rounded-xl bg-white border border-stone-300 hover:border-bodegon text-stone-800 font-bold text-xs transition-all disabled:opacity-50 shrink-0"
      >
        {n === 0 ? 'Sin consumos' : 'Ver detalle'}
      </button>
    </div>
  );
}

function Ticket({ t, abierto, onToggle }: { t: TicketConsumo; abierto: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-2xl border ${t.anulado ? 'bg-stone-50 border-stone-200' : 'bg-white border-stone-200'} overflow-hidden`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <span className="text-xs font-bold text-stone-900 block">
            {t.fecha} · {t.hora}
            {t.numero != null && <span className="text-stone-400 font-mono ml-1.5">#{t.numero}</span>}
          </span>
          <span className="text-[11px] text-stone-500 block truncate">
            {t.lineas.map((l) => `${l.cant}× ${l.nombre}`).join(', ')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <span className={`text-sm font-black font-mono block ${t.anulado ? 'line-through text-stone-400' : 'text-stone-900'}`}>
              {cs(t.a_cuenta > 0 ? t.a_cuenta : t.total)}
            </span>
            <span
              className={`text-[9.5px] font-bold uppercase tracking-wider ${
                t.anulado ? 'text-rose-700' : t.a_cuenta > 0 ? 'text-amber-800' : 'text-emerald-700'
              }`}
            >
              {t.anulado ? 'Anulada' : t.a_cuenta > 0 ? 'A mi cuenta' : 'Pagada'}
            </span>
          </div>
          {abierto ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
        </div>
      </button>
      {abierto && (
        <div className="px-3 pb-3 pt-1 border-t border-dashed border-stone-200 text-xs space-y-1.5">
          {t.lineas.map((l, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-stone-700">
                <b>{l.cant}×</b> {l.nombre} <span className="text-stone-400">({cs(l.precio)} c/u)</span>
              </span>
              <span className="font-mono text-stone-800">{cs(l.importe)}</span>
            </div>
          ))}
          <div className="border-t border-stone-100 pt-1.5 space-y-1">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span className="font-mono">{cs(t.subtotal)}</span>
            </div>
            {t.descuento > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Descuento {t.tipo}</span>
                <span className="font-mono">− {cs(t.descuento)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-stone-900">
              <span>Total</span>
              <span className="font-mono">{cs(t.total)}</span>
            </div>
            {t.a_cuenta > 0 && (
              <div className="flex justify-between text-amber-900 font-bold">
                <span>Cargado a mi cuenta</span>
                <span className="font-mono">{cs(t.a_cuenta)}</span>
              </div>
            )}
            {t.pagado > 0 && (
              <div className="flex justify-between text-emerald-800 font-bold">
                <span>Pagado en el momento</span>
                <span className="font-mono">{cs(t.pagado)}</span>
              </div>
            )}
          </div>
          <p className="text-[10.5px] text-stone-500">
            {t.tipo}
            {t.cobrado_por ? ` · registró ${t.cobrado_por}` : ''}
          </p>
          {t.anulado && (
            <p className="text-[10.5px] text-rose-700 font-semibold">
              Cuenta anulada{t.motivo_anulacion ? `: ${t.motivo_anulacion}` : ''}. No se cobra.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Lista completa: totales de esta quincena y la pasada, y cada cuenta con su ticket. */
export function DetalleConsumos({
  consumos,
  nombre,
  onVolver,
  onActividad,
}: {
  consumos: ConsumosColaborador;
  nombre: string;
  onVolver: () => void;
  onActividad: () => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const caja = (q: ConsumosColaborador['quincena'], fuerte: boolean) => (
    <div className={`p-3 rounded-2xl border text-center ${fuerte ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 block">{q.nombre}</span>
      <span className="text-xl font-black font-mono text-stone-900 block my-0.5">{cs(q.a_cuenta)}</span>
      <span className="text-[9.5px] font-semibold text-stone-500">
        a mi cuenta · {q.cuentas} cuenta{q.cuentas === 1 ? '' : 's'}
        {q.pagado > 0 ? ` · pagué ${cs(q.pagado)}` : ''}
      </span>
    </div>
  );
  return (
    <div className="space-y-4" onPointerDown={onActividad}>
      <div className="flex items-center gap-3 border-b border-stone-100 pb-3">
        <button
          type="button"
          onClick={onVolver}
          className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center"
          title="Volver a mis horas"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="font-display font-black text-stone-900 text-lg leading-tight">Mis consumos</h3>
          <span className="text-[11px] text-stone-500">{nombre} · solo consulta</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {caja(consumos.quincena, true)}
        {caja(consumos.quincena_pasada, false)}
      </div>
      <div className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
        {consumos.tickets.map((t) => (
          <Ticket key={t.id} t={t} abierto={abierto === t.id} onToggle={() => setAbierto(abierto === t.id ? null : t.id)} />
        ))}
      </div>
      <p className="text-[10.5px] text-stone-500 leading-snug">
        Son las cuentas que caja registró a tu nombre en los últimos 2 meses. Si algo no cuadra, habla con caja o con
        la gerencia: ellos ven el mismo ticket y lo pueden reimprimir.
      </p>
    </div>
  );
}
