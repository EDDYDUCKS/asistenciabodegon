import React from 'react';
import { TEGA } from '@/lib/tega';

interface TegaFirmaProps {
  /** Alto del logo en píxeles. Chico a propósito: el Bodegón da la cara. */
  alto?: number;
  /** Texto antes del logo; vacío para mostrar solo el logo. */
  texto?: string;
  className?: string;
}

/** Firma "un sistema de TEGA": va al pie o en una esquina, nunca arriba. */
export default function TegaFirma({ alto = 12, texto = 'un sistema de', className = '' }: TegaFirmaProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-stone-500 ${className}`}>
      {texto && <span className="text-[11px]">{texto}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tega.svg" alt={TEGA.nombre} style={{ height: alto }} className="w-auto" />
    </span>
  );
}

/** Pie con firma y contacto de soporte, para los paneles. */
export function TegaPie({ producto }: { producto: string }) {
  return (
    <footer className="print:hidden border-t border-stone-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-2">
          <span>{producto}</span>
          <span aria-hidden className="text-stone-300">·</span>
          <TegaFirma alto={11} />
        </span>
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Soporte:</span>
          <a href={TEGA.telefonoHref} className="hover:text-bodegon tabular-nums">{TEGA.telefono}</a>
          <span className="select-all">{TEGA.correo}</span>
        </span>
      </div>
    </footer>
  );
}
