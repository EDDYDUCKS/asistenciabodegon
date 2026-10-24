'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Delete } from 'lucide-react';

interface PinScreenProps {
  /** Etiqueta corta en dorado, sobre el título de la banda verde. */
  eyebrow: string;
  /** Título grande de la banda verde (Big Shoulders, en mayúsculas). */
  title: string;
  /** Una línea que explica qué protege este PIN. */
  subtitle: string;
  pin: string;
  pinError: boolean;
  pinErrorMsg: string;
  verifyingPin: boolean;
  onKey: (num: string) => void;
  onBackspace: () => void;
  onExit: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Pantalla de PIN compartida por el panel admin y Bodegón Control.
 * Banda verde con la máscara a la izquierda (arriba en celular) y teclado a la derecha.
 * La lógica de validación vive en quien la usa; aquí solo se dibuja.
 */
export default function PinScreen({
  eyebrow,
  title,
  subtitle,
  pin,
  pinError,
  pinErrorMsg,
  verifyingPin,
  onKey,
  onBackspace,
  onExit,
}: PinScreenProps) {
  const keyClass =
    'h-16 sm:h-[72px] rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 font-semibold text-2xl text-tinta flex items-center justify-center cursor-pointer touch-manipulation select-none';

  return (
    <div className="min-h-screen bg-crema text-tinta font-sans select-none grid lg:grid-cols-2">
      <section className="relative overflow-hidden bg-bodegon text-crema px-6 py-8 sm:px-12 sm:py-12 flex flex-col justify-between gap-8">
        <Image
          src="/logo-emblem.png"
          alt=""
          aria-hidden
          width={286}
          height={368}
          className="pointer-events-none absolute -right-10 -top-6 w-48 sm:w-64 lg:right-auto lg:left-1/2 lg:top-1/2 lg:w-[340px] lg:-translate-x-1/2 lg:-translate-y-1/2 opacity-[0.12]"
          priority
        />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-crema shrink-0">
            <Image src="/logo.png" alt="Restaurante El Bodegón" width={48} height={48} className="w-full h-full object-cover" priority />
          </div>
          <span className="font-display font-extrabold text-2xl uppercase tracking-wide">Bodegón Pass</span>
        </div>
        <div className="relative space-y-3">
          <span className="block text-xs font-bold uppercase tracking-[0.16em] text-dorado-vivo">{eyebrow}</span>
          <h1 className="font-display font-extrabold text-5xl sm:text-6xl lg:text-7xl leading-[0.9]">{title}</h1>
          <p className="text-sm sm:text-base text-[#CFE3DC] max-w-sm leading-relaxed">{subtitle}</p>
        </div>
        <p className="relative hidden lg:block text-sm text-[#CFE3DC]">
          La sesión se bloquea sola tras 10 minutos sin uso.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[320px] flex flex-col items-center gap-6">
          <div className="text-center space-y-1.5">
            <h2 className="font-display font-extrabold text-4xl uppercase">Ingresá tu PIN</h2>
            <p
              role={pinError ? 'alert' : undefined}
              className={`text-sm min-h-5 ${pinError ? 'text-barro font-semibold' : 'text-stone-500'}`}
            >
              {pinError ? pinErrorMsg : verifyingPin ? 'Verificando PIN…' : 'Son 4 dígitos. También podés usar el teclado.'}
            </p>
          </div>

          <div className="flex gap-4" aria-label={`${pin.length} de 4 dígitos`}>
            {[0, 1, 2, 3].map((idx) => (
              <span
                key={idx}
                className={`w-4.5 h-4.5 rounded-full ${
                  pinError
                    ? 'bg-barro'
                    : idx < pin.length
                    ? 'bg-bodegon'
                    : 'ring-2 ring-inset ring-stone-300'
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            {KEYS.map((num) => (
              <button key={num} type="button" onClick={() => onKey(num)} className={keyClass}>
                {num}
              </button>
            ))}
            <Link
              href="/"
              onClick={onExit}
              className="h-16 sm:h-[72px] rounded-2xl flex items-center justify-center text-sm font-semibold text-stone-600 hover:bg-stone-100"
            >
              Salir
            </Link>
            <button type="button" onClick={() => onKey('0')} className={keyClass}>
              0
            </button>
            <button
              type="button"
              onClick={onBackspace}
              aria-label="Borrar un dígito"
              className="h-16 sm:h-[72px] rounded-2xl flex items-center justify-center text-stone-600 hover:bg-stone-100 cursor-pointer"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
