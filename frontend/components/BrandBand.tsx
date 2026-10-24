import React from 'react';
import Image from 'next/image';

interface BrandBandProps {
  /** Etiqueta corta en dorado sobre el título (fecha, periodo, contexto). */
  eyebrow?: React.ReactNode;
  title: string;
  /** Contenido a la derecha del título: botones de acción o un reloj. */
  actions?: React.ReactNode;
  /** Fila inferior de la banda, normalmente las cifras clave (BandStat). */
  children?: React.ReactNode;
}

/**
 * Banda verde de marca que abre cada pantalla del panel: la máscara de fondo,
 * el título en Big Shoulders y las cifras del día. Los datos de abajo quedan neutros.
 */
export default function BrandBand({ eyebrow, title, actions, children }: BrandBandProps) {
  return (
    <section className="relative rounded-3xl bg-bodegon text-crema print:hidden">
      {/* La máscara se recorta en su propia capa para que los menús de las acciones puedan salir de la banda. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <Image
          src="/logo-emblem.png"
          alt=""
          width={286}
          height={368}
          className="absolute right-[6%] -top-14 w-44 sm:w-56 opacity-[0.12]"
        />
      </div>
      <div className="relative p-5 sm:p-7 flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="space-y-2 min-w-0">
            {eyebrow && (
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-dorado-vivo">{eyebrow}</div>
            )}
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[0.95]">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

interface BandStatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** La cifra principal va sobre crema para destacarla del resto. */
  featured?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/** Cifra grande dentro de la banda verde. */
export function BandStat({ label, value, hint, featured, onClick, title, className = '' }: BandStatProps) {
  const base = `rounded-2xl px-4 py-3.5 text-left flex flex-col gap-1 min-w-0 ${className}`;
  const tone = featured
    ? 'bg-crema text-tinta'
    : 'bg-white/[0.08] border border-white/[0.18] text-crema';
  const content = (
    <>
      <span className={`text-xs font-semibold ${featured ? 'uppercase tracking-[0.08em] text-dorado-tinta' : 'text-[#CFE3DC]'}`}>
        {label}
      </span>
      <span className="font-display font-bold text-4xl leading-none tabular-nums">{value}</span>
      {hint && <span className={`text-xs ${featured ? 'text-stone-500' : 'text-[#CFE3DC]'}`}>{hint}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={`${base} ${tone} cursor-pointer hover:ring-2 hover:ring-dorado-vivo/70`}>
        {content}
      </button>
    );
  }
  return (
    <div className={`${base} ${tone}`} title={title}>
      {content}
    </div>
  );
}

/** Botones dentro de la banda: el principal en dorado, los demás translúcidos. */
export const bandButtonPrimary =
  'h-11 px-4 rounded-xl bg-dorado-vivo hover:bg-dorado text-tinta text-sm font-bold flex items-center gap-2 cursor-pointer';
export const bandButtonGhost =
  'h-11 px-4 rounded-xl border border-white/35 bg-white/[0.08] hover:bg-white/[0.16] text-crema text-sm font-semibold flex items-center gap-2 cursor-pointer';
