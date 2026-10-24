'use client';

import { useEffect, useState } from 'react';

const TZ = 'America/Managua';

/** Minutos desde medianoche y día de la semana (0 = domingo) en hora de Nicaragua. */
function managuaNow(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday };
}

/**
 * Fecha, hora en vivo y cuánto falta para el cierre del local.
 * El domingo cierra a las 10:30 p. m.; el resto de días a las 11:00 p. m.
 */
export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!now) return <span>&nbsp;</span>;

  const fecha = new Intl.DateTimeFormat('es-NI', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const hora = new Intl.DateTimeFormat('es-NI', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  const { minutes, weekday } = managuaNow(now);
  const cierre = weekday === 0 ? 22 * 60 + 30 : 23 * 60;
  const falta = cierre - minutes;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-dorado-vivo" aria-hidden />
        En vivo
      </span>
      <span aria-hidden>·</span>
      <span className="first-letter:uppercase">{fecha}</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums normal-case">{hora}</span>
      {falta > 0 && falta < 14 * 60 && (
        <>
          <span aria-hidden>·</span>
          <span className="normal-case">
            cierra en {Math.floor(falta / 60)} h {String(falta % 60).padStart(2, '0')} min
          </span>
        </>
      )}
    </span>
  );
}
