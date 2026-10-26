'use client';

import React, { useEffect, useState } from 'react';
import { MarcajeKioscoResponse } from '@/lib/types';

/*
 * Tarjeta de resultado del kiosco con una animación propia por cada marcaje.
 * Todo es CSS y SVG en línea (clases kz-* en globals.css): no pesa nada extra,
 * funciona sin internet y solo anima transform, opacity y stroke, que las
 * tablets viejas mueven sin trabarse. Con "reducir movimiento" queda quieta.
 */

type Tono = 'verde' | 'dorado' | 'azul' | 'cafe' | 'barro';

const TONOS: Record<Tono, { fuerte: string; suave: string }> = {
  verde: { fuerte: '#135e4a', suave: '#e6f0eb' },
  dorado: { fuerte: '#8a6418', suave: '#faf1dc' },
  azul: { fuerte: '#24577f', suave: '#e5edf4' },
  cafe: { fuerte: '#5a4210', suave: '#f4ecdd' },
  barro: { fuerte: '#a8432e', suave: '#f8e8e3' },
};

const JORNADA_H = 8;

function prefiereQuieto() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Cuenta de 0 al valor en `ms`, con frenado suave al final. */
function useCuenta(valor: number, ms = 900, retraso = 0) {
  const [actual, setActual] = useState(() => (prefiereQuieto() ? valor : 0));
  useEffect(() => {
    if (prefiereQuieto()) return;
    let raf = 0;
    let inicio = 0;
    const paso = (t: number) => {
      if (!inicio) inicio = t;
      const p = Math.min(1, Math.max(0, (t - inicio - retraso) / ms));
      setActual(valor * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms, retraso]);
  return actual;
}

// ── Emblemas: un dibujo animado por tipo de marcaje ───────────────────────

/** Entrada: el aro se cierra, se dibuja el check y sale una onda. */
function EmblemaEntrada() {
  return (
    <div className="kz-emblema">
      <span className="kz-onda" style={{ '--d': '0.75s' } as React.CSSProperties} />
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="40" className="kz-fondo" />
        <circle cx="44" cy="44" r="40" pathLength={1} className="kz-trazo kz-aro" style={{ '--d': '0.05s' } as React.CSSProperties} />
        <path d="M28 45 l11 11 l22 -24" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.5s' } as React.CSSProperties} />
      </svg>
    </div>
  );
}

/** Salida a pausa: se dibuja la taza y el vapor sube despacio. */
function EmblemaPausa() {
  return (
    <div className="kz-emblema">
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="40" className="kz-fondo" />
        <path d="M26 42 h30 v10 a14 14 0 0 1 -14 14 h-2 a14 14 0 0 1 -14 -14 z" pathLength={1} className="kz-trazo" style={{ '--d': '0.05s' } as React.CSSProperties} />
        <path d="M56 46 h3 a6 6 0 0 1 0 12 h-4" pathLength={1} className="kz-trazo" style={{ '--d': '0.35s' } as React.CSSProperties} />
        <path d="M24 71 h36" pathLength={1} className="kz-trazo" style={{ '--d': '0.5s' } as React.CSSProperties} />
        <g className="kz-vapores">
          <path d="M34 36 c-3 -4 3 -6 0 -11" className="kz-vapor" style={{ '--d': '0.7s' } as React.CSSProperties} />
          <path d="M41 36 c-3 -4 3 -6 0 -11" className="kz-vapor" style={{ '--d': '1.1s' } as React.CSSProperties} />
          <path d="M48 36 c-3 -4 3 -6 0 -11" className="kz-vapor" style={{ '--d': '0.9s' } as React.CSSProperties} />
        </g>
      </svg>
    </div>
  );
}

/** Retorno de pausa: la flecha da la vuelta completa y se asienta. */
function EmblemaRetorno() {
  return (
    <div className="kz-emblema">
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="40" className="kz-fondo" />
        <g className="kz-giro">
          <path d="M62 44 a18 18 0 1 1 -5.3 -12.7" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.05s' } as React.CSSProperties} />
          <path d="M58 22 v10 h-10" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.55s' } as React.CSSProperties} />
        </g>
      </svg>
    </div>
  );
}

/** Salida definitiva: el aro se llena con las horas del día y caen chispas doradas. */
function EmblemaCierre({ horas }: { horas: number }) {
  const lleno = Math.min(1, horas / JORNADA_H);
  const cuenta = useCuenta(horas, 1100, 150);
  return (
    <div className="kz-emblema kz-emblema-grande">
      <span className="kz-chispas" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <i key={i} style={{ '--a': `${i * 45}deg` } as React.CSSProperties} />
        ))}
      </span>
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="38" className="kz-fondo" />
        <circle cx="44" cy="44" r="38" className="kz-riel" />
        <circle
          cx="44"
          cy="44"
          r="38"
          pathLength={1}
          className="kz-trazo kz-llenado"
          style={{ '--d': '0.15s', '--lleno': lleno } as React.CSSProperties}
          transform="rotate(-90 44 44)"
        />
      </svg>
      <span className="kz-cifra">
        <strong>{cuenta.toFixed(1)}</strong>
        <small>horas</small>
      </span>
    </div>
  );
}

/** Tardanza: el minutero se pasa de la hora y frena en seco. Serio, sin dramatismo. */
function EmblemaReloj({ girar = false }: { girar?: boolean }) {
  return (
    <div className="kz-emblema">
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="40" className="kz-fondo" />
        <circle cx="44" cy="44" r="24" pathLength={1} className="kz-trazo" style={{ '--d': '0.05s' } as React.CSSProperties} />
        <path d="M44 44 l-8 -5" className="kz-aguja kz-aguja-corta" />
        <path d="M44 44 v-16" className={`kz-aguja ${girar ? 'kz-aguja-vuelta' : 'kz-aguja-golpe'}`} />
        <circle cx="44" cy="44" r="2.4" className="kz-centro" />
      </svg>
    </div>
  );
}

/** Aviso (falta el retorno): se dibuja el triángulo y aparece el signo. */
function EmblemaAviso() {
  return (
    <div className="kz-emblema">
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="40" className="kz-fondo" />
        <path d="M44 22 L67 62 H21 Z" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.05s' } as React.CSSProperties} />
        <path d="M44 37 v11" className="kz-trazo kz-grueso kz-pop" style={{ '--d': '0.55s' } as React.CSSProperties} />
        <circle cx="44" cy="55" r="2.6" className="kz-centro kz-pop" style={{ '--d': '0.65s' } as React.CSSProperties} />
      </svg>
    </div>
  );
}

/** Sin conexión: la marca baja a la tablet y queda guardada. */
function EmblemaGuardado() {
  return (
    <div className="kz-emblema">
      <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
        <circle cx="44" cy="44" r="40" className="kz-fondo" />
        <rect x="28" y="24" width="32" height="42" rx="5" pathLength={1} className="kz-trazo" style={{ '--d': '0.05s' } as React.CSSProperties} />
        <path d="M44 30 v18 m-7 -7 l7 7 l7 -7" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.45s' } as React.CSSProperties} />
        <path d="M37 58 h14" pathLength={1} className="kz-trazo" style={{ '--d': '0.8s' } as React.CSSProperties} />
      </svg>
    </div>
  );
}

// ── Piezas comunes ────────────────────────────────────────────────────────

/** Barra de la jornada (0 a 8 h) que se llena hasta las horas del día. */
function BarraJornada({ horas, etiqueta, retraso = 0.7 }: { horas: number; etiqueta: string; retraso?: number }) {
  const lleno = Math.min(1, Math.max(0, horas / JORNADA_H));
  return (
    <div className="kz-in w-full text-left" style={{ '--d': `${retraso - 0.1}s` } as React.CSSProperties}>
      <div className="flex items-baseline justify-between text-[11px] font-semibold text-stone-500 mb-1">
        <span>{etiqueta}</span>
        <span className="tabular-nums">
          <strong className="text-tinta">{horas.toFixed(1)} h</strong> de {JORNADA_H} h
        </span>
      </div>
      <div className="kz-barra">
        <span style={{ '--lleno': lleno, '--d': `${retraso}s` } as React.CSSProperties} />
      </div>
    </div>
  );
}

function Etiqueta({ children, d = 0.3 }: { children: React.ReactNode; d?: number }) {
  return (
    <span className="kz-in kz-pill" style={{ '--d': `${d}s` } as React.CSSProperties}>
      {children}
    </span>
  );
}

function Titulo({ children, d = 0.4 }: { children: React.ReactNode; d?: number }) {
  return (
    <h2 className="kz-in text-2xl sm:text-3xl font-display font-extrabold text-tinta leading-tight" style={{ '--d': `${d}s` } as React.CSSProperties}>
      {children}
    </h2>
  );
}

function Linea({ children, d = 0.5 }: { children: React.ReactNode; d?: number }) {
  return (
    <p className="kz-in text-sm text-stone-600" style={{ '--d': `${d}s` } as React.CSSProperties}>
      {children}
    </p>
  );
}

function Nota({ children, d = 0.6 }: { children: React.ReactNode; d?: number }) {
  return (
    <div className="kz-in kz-nota" style={{ '--d': `${d}s` } as React.CSSProperties}>
      {children}
    </div>
  );
}

function Chip({ children, d = 0.8, fuerte = false }: { children: React.ReactNode; d?: number; fuerte?: boolean }) {
  return (
    <span className={`kz-in kz-chip ${fuerte ? 'kz-chip-fuerte' : ''}`} style={{ '--d': `${d}s` } as React.CSSProperties}>
      {children}
    </span>
  );
}

// ── Tarjeta ───────────────────────────────────────────────────────────────

interface Props {
  feedback: MarcajeKioscoResponse;
  /** Segundos que dura la tarjeta; la barra inferior se vacía en ese tiempo. */
  duracion: number;
  segundos: number;
  onCerrar: () => void;
}

export default function ResultadoMarcaje({ feedback, duracion, segundos, onCerrar }: Props) {
  const tipo = feedback.registro?.tipo_evento;
  const nombre = feedback.registro?.empleado_detalle
    ? `${feedback.registro.empleado_detalle.nombre} ${feedback.registro.empleado_detalle.apellido}`
    : 'Colaborador';
  const hora = feedback.registro?.fecha_hora
    ? new Date(feedback.registro.fecha_hora).toLocaleTimeString('es-NI', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Managua',
      })
    : '';
  const horasHoy = feedback.horas_trabajadas_hoy || 0;

  let tono: Tono = 'verde';
  let sacude = false;
  let emblema: React.ReactNode;
  let cuerpo: React.ReactNode;

  if (feedback.status === 'cooldown') {
    tono = 'dorado';
    emblema = <EmblemaReloj girar />;
    cuerpo = (
      <>
        <Etiqueta>Marcaje previo guardado</Etiqueta>
        {feedback.registro?.empleado_detalle && <Titulo>{nombre}</Titulo>}
        <Linea>{feedback.mensaje}</Linea>
        {feedback.horas_trabajadas_hoy !== undefined && <BarraJornada horas={horasHoy} etiqueta="Horas de hoy" />}
      </>
    );
  } else if (!feedback.registro) {
    // Marca guardada en la tablet sin internet: todavía no sabemos de qué tipo es
    tono = 'cafe';
    emblema = <EmblemaGuardado />;
    cuerpo = (
      <>
        <Etiqueta>Guardado sin conexión</Etiqueta>
        <Titulo>Marcaje guardado en el kiosco</Titulo>
        <Linea>{feedback.mensaje}</Linea>
      </>
    );
  } else if ((tipo === 'ENTRADA' || tipo === 'ENTRADA_QUEBRADA') && feedback.es_tardanza) {
    tono = 'barro';
    sacude = true;
    emblema = <EmblemaReloj />;
    cuerpo = (
      <>
        <Etiqueta>
          {tipo === 'ENTRADA' ? 'Tardanza registrada' : 'Retorno tardío de pausa'} · +{feedback.minutos_tardanza} min
        </Etiqueta>
        <Titulo>Atención, {nombre}</Titulo>
        <Linea>
          {tipo === 'ENTRADA' ? 'Marcaje' : 'Retorno'}: <strong>{hora}</strong> · {tipo === 'ENTRADA' ? 'Turno' : 'Horario esperado'}:{' '}
          <strong>{feedback.turno_esperado}</strong>
        </Linea>
        <Nota>
          <strong>Tolerancia de 11 minutos superada.</strong> {feedback.mensaje}
        </Nota>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip fuerte>+{feedback.minutos_tardanza} min tarde</Chip>
          <Chip d={0.9}>Notificado a Administración</Chip>
        </div>
      </>
    );
  } else if (tipo === 'ENTRADA') {
    tono = 'verde';
    emblema = <EmblemaEntrada />;
    cuerpo = (
      <>
        <Etiqueta>Entrada al turno</Etiqueta>
        <Titulo>Bienvenido/a, {nombre}</Titulo>
        <Linea>
          Marcaje registrado a las <strong>{hora}</strong>
        </Linea>
        <Linea d={0.6}>Que tengas una buena jornada y un excelente servicio en El Bodegón.</Linea>
        <Chip>Meta diaria: {JORNADA_H}.0 horas</Chip>
      </>
    );
  } else if (tipo === 'SALIDA_QUEBRADA') {
    tono = 'dorado';
    // Regla de retorno del Bodegón según lo trabajado en el primer bloque
    const horaRet = horasHoy >= 3.8 ? '7:00 PM' : horasHoy >= 3.2 ? '6:30 PM' : '6:00 PM';
    const faltan = Math.max(0, JORNADA_H - horasHoy);
    emblema = <EmblemaPausa />;
    cuerpo = (
      <>
        <Etiqueta>Salida a pausa · turno quebrado</Etiqueta>
        <Titulo>Buen descanso, {nombre}</Titulo>
        <Linea>
          Salida a pausa: <strong>{hora}</strong>
        </Linea>
        <BarraJornada horas={horasHoy} etiqueta="Primer bloque" />
        <Nota d={0.9}>
          <span className="flex items-center justify-between gap-3">
            <span>Regresá a más tardar a las</span>
            <strong className="kz-hora">{horaRet}</strong>
          </span>
          <span className="block mt-1 text-[11px]">
            Para completar tus {faltan.toFixed(1)} h restantes antes del cierre.
          </span>
        </Nota>
      </>
    );
  } else if (tipo === 'ENTRADA_QUEBRADA') {
    tono = 'azul';
    emblema = <EmblemaRetorno />;
    cuerpo = (
      <>
        <Etiqueta>Retorno de pausa · segundo bloque</Etiqueta>
        <Titulo>De vuelta al turno, {nombre}</Titulo>
        <Linea>
          Retorno registrado a las <strong>{hora}</strong>
        </Linea>
        <BarraJornada horas={horasHoy} etiqueta="Llevás acumulado" />
        <Chip d={0.95}>
          Te faltan {feedback.horas_restantes_hoy !== undefined ? `${feedback.horas_restantes_hoy.toFixed(1)} h` : '--'} para las {JORNADA_H} h
        </Chip>
      </>
    );
  } else if (feedback.advertencia_quiebre) {
    tono = 'dorado';
    emblema = <EmblemaAviso />;
    cuerpo = (
      <>
        <Etiqueta>Falta la entrada de retorno</Etiqueta>
        <Titulo>Ojo, {nombre}</Titulo>
        <Linea>
          Salida registrada a las <strong>{hora}</strong>
        </Linea>
        <Nota>
          <strong>No marcaste tu regreso de descanso.</strong> Se registró tu salida de cierre y ya se avisó a
          Administración para que registre tu hora de regreso.
        </Nota>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip>Primer bloque: {horasHoy.toFixed(1)} h</Chip>
          <Chip d={0.9} fuerte>
            Avisar al administrador
          </Chip>
        </div>
      </>
    );
  } else {
    // SALIDA_DEFINITIVA
    tono = 'cafe';
    emblema = <EmblemaCierre horas={horasHoy} />;
    cuerpo = (
      <>
        <Etiqueta d={0.5}>Salida definitiva · fin de jornada</Etiqueta>
        <Titulo d={0.6}>Misión cumplida, {nombre}</Titulo>
        <Linea d={0.7}>
          Salida registrada a las <strong>{hora}</strong>
        </Linea>
        <div className="flex flex-wrap justify-center gap-2">
          {feedback.cumplio_meta_8h && (
            <span className="kz-sello" style={{ '--d': '1.15s' } as React.CSSProperties}>
              Jornada cumplida
            </span>
          )}
          {horasHoy > JORNADA_H && (
            <Chip d={1.35} fuerte>
              +{(horasHoy - JORNADA_H).toFixed(1)} h extra registradas
            </Chip>
          )}
        </div>
      </>
    );
  }

  const colores = TONOS[tono];

  return (
    <div className="absolute inset-0 z-30 kz-velo flex flex-col items-center justify-center p-4 sm:p-6 text-center" role="status" aria-live="polite">
      <div
        key={tipo || feedback.status}
        className={`kz-tarjeta ${sacude ? 'kz-sacude' : ''}`}
        style={{ '--tono': colores.fuerte, '--tono-suave': colores.suave } as React.CSSProperties}
      >
        {emblema}
        <div className="flex flex-col items-center gap-2 w-full">{cuerpo}</div>

        {/* La barra se vacía en el tiempo que dura la tarjeta */}
        <div className="w-full pt-2 flex items-center gap-3">
          <div className="kz-cuenta">
            <span style={{ animationDuration: `${duracion}s` }} />
          </div>
          <button
            onClick={onCerrar}
            className="text-xs font-semibold text-stone-600 hover:text-tinta bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-lg cursor-pointer shrink-0 tabular-nums"
          >
            Listo ({segundos}s)
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mientras se toma la foto: franja clara abajo para que el rostro siga a la vista. */
export function CapturandoFoto({ nombre, ms }: { nombre?: string; ms: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 p-3 sm:p-4 pointer-events-none">
      <div className="kz-franja">
        <span className="kz-obturador" aria-hidden />
        <div className="min-w-0 text-left">
          <p className="font-display font-extrabold text-xl text-tinta leading-tight truncate">
            {nombre ? `Hola, ${nombre}` : 'Carnet reconocido'}
          </p>
          <p className="text-xs text-stone-600">Mirá de frente a la pantalla para tu foto</p>
        </div>
        <div className="kz-cuenta kz-cuenta-foto">
          <span style={{ animationDuration: `${ms}ms` }} />
        </div>
      </div>
    </div>
  );
}

/** Escaneo no válido: la X se dibuja y la tarjeta hace un "no" corto. */
export function ErrorMarcaje({ mensaje }: { mensaje: string }) {
  return (
    <div className="absolute inset-0 z-30 kz-velo flex items-center justify-center p-4 sm:p-6 text-center" role="alert">
      <div className="kz-tarjeta kz-sacude" style={{ '--tono': TONOS.barro.fuerte, '--tono-suave': TONOS.barro.suave } as React.CSSProperties}>
        <div className="kz-emblema">
          <svg viewBox="0 0 88 88" className="kz-svg" aria-hidden>
            <circle cx="44" cy="44" r="40" className="kz-fondo" />
            <path d="M32 32 L56 56" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.1s' } as React.CSSProperties} />
            <path d="M56 32 L32 56" pathLength={1} className="kz-trazo kz-grueso" style={{ '--d': '0.3s' } as React.CSSProperties} />
          </svg>
        </div>
        <Titulo d={0.2}>Escaneo no válido</Titulo>
        <Linea d={0.3}>{mensaje}</Linea>
      </div>
    </div>
  );
}
