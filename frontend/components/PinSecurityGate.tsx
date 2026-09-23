'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RefreshCw, Lock } from 'lucide-react';
import { playErrorBeep } from '@/lib/sound-feedback';

interface PinSecurityGateProps {
  title?: string;
  subtitle?: string;
  pinRequired?: string;
  sessionKey?: string;
  children: React.ReactNode;
}

export default function PinSecurityGate({
  title = 'Bodegón Control',
  subtitle = 'Módulo de Compras, Gastos & Caja Chica',
  pinRequired = '4512',
  sessionKey = 'bodegon_control_pin_verified',
  children,
}: PinSecurityGateProps) {
  const [pin, setPin] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const handleLogout = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(sessionKey);
    }
    setAuthorized(false);
    setPin('');
    setPinError(false);
  }, [sessionKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem(sessionKey);
      if (isAuth === 'true') {
        setAuthorized(true);
      }
      setCheckingAuth(false);
    }
  }, [sessionKey]);

  // Inactividad auto-bloqueo a los 10 minutos
  useEffect(() => {
    if (!authorized) return;
    const TIMEOUT = 10 * 60 * 1000;
    let timer = setTimeout(handleLogout, TIMEOUT);

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(handleLogout, TIMEOUT);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [authorized, handleLogout]);

  const handleKeyPress = useCallback(
    (num: string) => {
      setPinError(false);
      setPin((prevPin) => {
        if (prevPin.length >= 4) return prevPin;
        const newPin = prevPin + num;
        if (newPin === pinRequired) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(sessionKey, 'true');
          }
          setAuthorized(true);
          return '';
        } else if (newPin.length === 4) {
          setTimeout(() => {
            setPinError(true);
            setPin('');
            playErrorBeep();
          }, 150);
        }
        return newPin;
      });
    },
    [pinRequired, sessionKey]
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
  }, []);

  // Soporte de Teclado Físico
  useEffect(() => {
    if (authorized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPin('');
        setPinError(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authorized, handleKeyPress, handleBackspace]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#fcf9f5] flex items-center justify-center font-sans">
        <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#fcf9f5] flex flex-col justify-between p-6 sm:p-12 font-sans text-stone-850 select-none">
        <div className="max-w-md w-full mx-auto my-auto bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full overflow-hidden mx-auto shadow-lg border-2 border-amber-500/30 bg-amber-500 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Restaurante El Bodegón"
              width={80}
              height={80}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-black uppercase tracking-wider mb-2">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              Acceso Protegido
            </div>
            <h2 className="font-black text-2xl text-stone-900 tracking-tight">{title}</h2>
            <p className="text-xs text-stone-500 font-bold mt-1 uppercase tracking-wide">{subtitle}</p>
          </div>

          {/* Indicador de PIN */}
          <div className="flex justify-center gap-4 py-3">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  pinError
                    ? 'bg-rose-500 border-rose-500 animate-bounce'
                    : idx < pin.length
                    ? 'bg-amber-600 border-amber-600 scale-110'
                    : 'border-stone-300 bg-stone-50'
                }`}
              />
            ))}
          </div>

          {pinError && (
            <p className="text-xs text-rose-600 font-bold animate-pulse">
              PIN incorrecto. Intente de nuevo.
            </p>
          )}

          {/* Teclado Numérico */}
          <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto pt-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                type="button"
                className="w-16 h-16 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 active:bg-stone-100 font-bold text-lg text-stone-800 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95 touch-manipulation select-none"
              >
                {num}
              </button>
            ))}

            {/* Backspace */}
            <button
              onClick={handleBackspace}
              type="button"
              className="w-16 h-16 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 active:bg-stone-100 font-bold text-xs text-stone-600 transition-all flex items-center justify-center uppercase tracking-wide cursor-pointer active:scale-95 touch-manipulation select-none"
            >
              Borrar
            </button>

            <button
              onClick={() => handleKeyPress('0')}
              type="button"
              className="w-16 h-16 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 active:bg-stone-100 font-bold text-lg text-stone-800 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95 touch-manipulation select-none"
            >
              0
            </button>

            {/* Salir al Portal Principal */}
            <Link
              href="/"
              onClick={handleLogout}
              className="w-16 h-16 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all flex items-center justify-center uppercase tracking-wide cursor-pointer active:scale-95 touch-manipulation select-none"
            >
              Salir
            </Link>
          </div>

          <p className="text-[11px] text-stone-400 font-semibold">
            Ingrese el PIN de seguridad asignado (4 dígitos)
          </p>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-stone-400 font-bold uppercase tracking-wide">
          Restaurante El Bodegón © 2026 — Bodegón Control
        </footer>
      </div>
    );
  }

  return <>{children}</>;
}
