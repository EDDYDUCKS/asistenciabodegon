'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KeyRound, AlertTriangle, Scale, Loader2, CheckCircle2 } from 'lucide-react';
import { CompensacionHoras } from '@/lib/types';
import { playSuccessBeep, playErrorBeep } from '@/lib/sound-feedback';

export interface PendingExtraAction {
  id: number;
  empId: number;
  decision: 'APROBADO' | 'RECHAZADO';
  horas: number;
  comentario: string;
  empNombre?: string;
  deudaActual?: number;
  totalPendienteColaborador?: number;
  compDia?: CompensacionHoras;
}

interface ModalPinAutorizacionHorasExtraProps {
  isOpen: boolean;
  action: PendingExtraAction | null;
  onClose: () => void;
  onConfirm: (action: PendingExtraAction) => Promise<void>;
}

export default function ModalPinAutorizacionHorasExtra({
  isOpen,
  action,
  onClose,
  onConfirm,
}: ModalPinAutorizacionHorasExtraProps) {
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const isSubmittingRef = useRef(false);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setPinError(false);
      setIsSubmitting(false);
      setIsSuccess(false);
      isSubmittingRef.current = false;
    }
  }, [isOpen, action]);

  const handleDigit = useCallback(
    async (num: string) => {
      if (isSubmittingRef.current || !action) return;
      setPinError(false);

      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const nextPin = prev + num;

        if (nextPin === '2322') {
          isSubmittingRef.current = true;
          setIsSubmitting(true);
          setIsSuccess(true);
          playSuccessBeep();

          // Execute confirmation asynchronously without blocking UI render
          setTimeout(async () => {
            try {
              await onConfirm(action);
            } catch (err: unknown) {
              isSubmittingRef.current = false;
              setIsSubmitting(false);
              setIsSuccess(false);
              setPin('');
              setPinError(true);
              playErrorBeep();
            }
          }, 120);

          return nextPin;
        } else if (nextPin.length === 4) {
          setTimeout(() => {
            setPinError(true);
            setPin('');
            playErrorBeep();
          }, 150);
        }

        return nextPin;
      });
    },
    [action, onConfirm]
  );

  const handleBackspace = useCallback(() => {
    if (isSubmittingRef.current) return;
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
  }, []);

  // Keyboard support scoped strictly to when this modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmittingRef.current) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleDigit, handleBackspace, onClose]);

  if (!isOpen || !action) return null;

  return (
    <div
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200 select-none cursor-default"
      >
        <div
          className={`w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto shadow-md transition-colors ${
            isSuccess
              ? 'bg-emerald-500 border-emerald-600 text-white'
              : action.decision === 'APROBADO'
              ? 'bg-emerald-100 border-emerald-300 text-[#1c6856]'
              : 'bg-rose-100 border-rose-300 text-rose-700'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="w-7 h-7 animate-in zoom-in-50 duration-200" />
          ) : (
            <KeyRound className="w-7 h-7" />
          )}
        </div>

        <div>
          <h3 className="font-display font-black text-xl text-stone-900 tracking-tight">
            {isSuccess
              ? action.decision === 'APROBADO'
                ? '¡Autorización Aprobada!'
                : '¡Solicitud Rechazada!'
              : action.decision === 'APROBADO'
              ? 'Autorizar Horas Extra'
              : 'Rechazar Horas Extra'}
          </h3>
          <p className="text-xs text-stone-500 font-medium mt-1">
            {isSubmitting
              ? 'Procesando cambios en el servidor...'
              : action.decision === 'APROBADO'
              ? 'Ingrese el PIN de Gerencia para autorizar el pago de horas extra en nómina.'
              : 'Ingrese el PIN de Gerencia para confirmar el rechazo de esta solicitud.'}
          </p>
        </div>

        {/* Ficha Resumen de la Solicitud */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 text-left space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-stone-500 font-bold">Colaborador:</span>
            <span className="font-black text-stone-900">{action.empNombre}</span>
          </div>
          {action.totalPendienteColaborador !== undefined && action.totalPendienteColaborador > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-stone-500 font-bold">Suma Total por Aprobar:</span>
              <span className="font-mono font-black text-[#1c6856] bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                +{action.totalPendienteColaborador.toFixed(1)} hrs
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-stone-500 font-bold">Decisión para este Día:</span>
            {action.decision === 'APROBADO' ? (
              <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                Aprobar +{action.horas.toFixed(1)} hrs
              </span>
            ) : (
              <span className="font-mono font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                Rechazar Solicitud (0.0 hrs)
              </span>
            )}
          </div>
        </div>

        {/* Aviso de Compensación Automática previa aplicada al marcar salida */}
        {action.compDia && Number(action.compDia.horas_deducidas) > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 text-left space-y-1.5 text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-bold text-amber-900">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <Scale className="w-4 h-4 text-amber-700 shrink-0" />
                Amortización de Deuda Aplicada
              </span>
              <span className="bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-mono">
                Bolsa de Horas
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-white/90 p-2 rounded-lg border border-amber-200 text-center font-mono text-[11px]">
              <div>
                <span className="text-[9px] text-stone-500 uppercase block font-sans font-bold">Extra Bruto</span>
                <strong className="text-stone-900">+{Number(action.compDia.horas_extra_generadas).toFixed(1)}h</strong>
              </div>
              <div>
                <span className="text-[9px] text-amber-700 uppercase block font-sans font-bold">Deducido</span>
                <strong className="text-amber-700">-{Number(action.compDia.horas_deducidas).toFixed(1)}h</strong>
              </div>
              <div>
                <span className="text-[9px] text-emerald-700 uppercase block font-sans font-bold">Por Pagar</span>
                <strong className="text-emerald-800">+{Number(action.compDia.remanente_extra).toFixed(1)}h</strong>
              </div>
            </div>

            {/* Fechas específicas saldadas */}
            {action.compDia.desglose && Array.isArray(action.compDia.desglose) && action.compDia.desglose.length > 0 && (
              <div className="bg-white/95 rounded-lg border border-amber-200 p-2 space-y-1 text-[11px]">
                <span className="text-[9px] font-bold uppercase text-amber-900 block tracking-wide">
                  Fechas y turnos saldados con estas horas:
                </span>
                <div className="space-y-0.5">
                  {action.compDia.desglose.map((d, i) => {
                    const fFormat = d.fecha ? new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-NI', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    }) : d.fecha;
                    const hComp = d.horas_compensadas || d.horas_aplicadas || d.deficit_original || 0;
                    return (
                      <div key={i} className="flex justify-between items-center text-stone-800 py-0.5 border-b border-amber-50 last:border-0">
                        <span className="capitalize font-semibold text-stone-700">• {fFormat}:</span>
                        <span className="font-mono font-bold text-amber-800">-{Number(hComp).toFixed(1)} hrs</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-[10px] text-amber-900 leading-tight">
              Generó {Number(action.compDia.horas_extra_generadas).toFixed(1)} hrs hoy. Se amortizaron {Number(action.compDia.horas_deducidas).toFixed(1)} hrs para saldar salidas tempranas pasadas. Estás autorizando el remanente limpio ({Number(action.compDia.remanente_extra).toFixed(1)} hrs) para pago de nómina.
            </p>
          </div>
        )}

        {/* Advertencia de Amortización Automática si tiene Deuda Acumulada */}
        {action.decision === 'APROBADO' &&
          action.deudaActual !== undefined &&
          action.deudaActual > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left space-y-1.5 text-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Amortización Automática de Deuda
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
                El colaborador adeuda actualmente <strong>{action.deudaActual.toFixed(1)} hrs</strong>. Al ingresar su PIN, se deducirán automáticamente{' '}
                <strong>{Math.min(action.horas, action.deudaActual).toFixed(1)} hrs</strong> para abonar a su saldo deudor (Bolsa de Horas).
                {action.horas > action.deudaActual ? (
                  <> El remanente de <strong>{(action.horas - action.deudaActual).toFixed(1)} hrs</strong> pasará limpio a pago de nómina.</>
                ) : (
                  <> La deuda restante quedará en <strong>{(action.deudaActual - action.horas).toFixed(1)} hrs</strong>.</>
                )}
              </p>
            </div>
          )}

        {/* Indicador de 4 Puntos PIN */}
        <div className="flex justify-center gap-4 py-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                pinError
                  ? 'bg-rose-500 border-rose-500 animate-bounce'
                  : isSuccess
                  ? 'bg-emerald-500 border-emerald-500 scale-125 shadow-sm shadow-emerald-400'
                  : idx < pin.length
                  ? 'bg-[#1c6856] border-[#1c6856] scale-110'
                  : 'border-stone-300 bg-stone-50'
              }`}
            />
          ))}
        </div>

        {pinError && (
          <p className="text-xs text-rose-600 font-bold animate-pulse">
            PIN de Aprobación incorrecto. Intente de nuevo.
          </p>
        )}

        {isSubmitting && (
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#1c6856] animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Guardando cambios...</span>
          </div>
        )}

        {/* Teclado Numérico */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDigit(num)}
              className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 disabled:opacity-50 font-bold text-lg text-stone-800 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95 touch-manipulation select-none"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleBackspace}
            className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 disabled:opacity-50 font-bold text-xs text-stone-600 transition-all flex items-center justify-center uppercase cursor-pointer active:scale-95 touch-manipulation select-none"
          >
            Borrar
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDigit('0')}
            className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 disabled:opacity-50 font-bold text-lg text-stone-800 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95 touch-manipulation select-none"
          >
            0
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-14 h-14 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 font-bold text-xs transition-all flex items-center justify-center uppercase cursor-pointer active:scale-95 touch-manipulation select-none"
          >
            Cancelar
          </button>
        </div>

        <p className="text-[11px] text-stone-400 font-medium hidden sm:block pt-1">
          💡 Puedes ingresar el PIN con el teclado numérico de tu PC (0-9)
        </p>
      </div>
    </div>
  );
}
