'use client';

import React, { useState, useEffect } from 'react';
import { CompensacionFeriado } from '@/lib/types';
import { liquidarCompensacionFeriado } from '@/lib/api-client';
import {
  Calendar,
  X,
  Coins,
  Palmtree,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface ModalLiquidarFeriadoProps {
  isOpen: boolean;
  onClose: () => void;
  compensacion: CompensacionFeriado | null;
  onLiquidado: (updated: CompensacionFeriado, nuevoSaldoVacaciones?: number) => void;
}

export default function ModalLiquidarFeriado({
  isOpen,
  onClose,
  compensacion,
  onLiquidado,
}: ModalLiquidarFeriadoProps) {
  const [diasDinero, setDiasDinero] = useState<number>(2);
  const [diasVacaciones, setDiasVacaciones] = useState<number>(0);
  const [observaciones, setObservaciones] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const totalDias = compensacion ? Number(compensacion.dias_compensatorios_totales || 2.0) : 2.0;

  useEffect(() => {
    if (compensacion) {
      const tot = Number(compensacion.dias_compensatorios_totales || 2.0);
      if (compensacion.estado !== 'PENDIENTE') {
        setDiasDinero(Number(compensacion.dias_pagados_dinero || 0));
        setDiasVacaciones(Number(compensacion.dias_acreditados_vacaciones || 0));
      } else {
        setDiasDinero(tot);
        setDiasVacaciones(0);
      }
      setObservaciones(compensacion.observaciones || '');
      setErrorMsg('');
    }
  }, [compensacion, isOpen]);

  if (!isOpen || !compensacion) return null;

  const emp = compensacion.empleado_detalle;
  const nombreEmp = emp ? `${emp.nombre} ${emp.apellido}` : `Colaborador #${compensacion.empleado}`;
  const cargoEmp = emp ? emp.cargo_display : '';

  const suma = Number(diasDinero) + Number(diasVacaciones);
  const esValido = Math.abs(suma - totalDias) < 0.05 && diasDinero >= 0 && diasVacaciones >= 0;

  const setPreset = (dinero: number, vac: number) => {
    setDiasDinero(dinero);
    setDiasVacaciones(vac);
    setErrorMsg('');
  };

  const handleGuardar = async () => {
    if (!esValido) {
      setErrorMsg(`La suma de días (${suma}) debe ser exactamente igual al total a liquidar (${totalDias} días).`);
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await liquidarCompensacionFeriado(compensacion.id, {
        dias_dinero: diasDinero,
        dias_vacaciones: diasVacaciones,
        observaciones,
      });

      onLiquidado(res.compensacion, res.empleado_vacaciones_acumuladas);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Error al liquidar compensación de feriado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200/80 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-[#1c6856] to-[#154f42] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-emerald-200 shadow-inner">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight leading-tight">
                Liquidar Feriado Laborado
              </h2>
              <p className="text-[11px] text-emerald-100/90 mt-0.5">
                {compensacion.nombre_feriado || 'Día Feriado Nacional'} • {compensacion.fecha_feriado}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto space-y-5 text-stone-800 text-xs">
          {/* Tarjeta del Colaborador */}
          <div className="bg-stone-50 border border-stone-200/70 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Colaborador
              </span>
              <span className="font-bold text-stone-900 text-sm block">
                {nombreEmp}
              </span>
              {cargoEmp && (
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-[#1c6856]/10 text-[#1c6856] text-[10px] font-bold">
                  {cargoEmp}
                </span>
              )}
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Días Ganados
              </span>
              <span className="font-mono font-black text-[#1c6856] text-lg block">
                +{totalDias.toFixed(1)} días
              </span>
              <span className="text-[10px] text-stone-500">
                (8h ordinarias + recargo)
              </span>
            </div>
          </div>

          {/* Atajos Rápidos */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Modalidad de Liquidación Rápida
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPreset(totalDias, 0)}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                  diasDinero === totalDias && diasVacaciones === 0
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs'
                    : 'border-stone-200 hover:border-emerald-300 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <Coins className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                <span className="block text-[11px]">100% Dinero</span>
                <span className="text-[9px] font-mono text-stone-500">{totalDias}d en nómina</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset(0, totalDias)}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                  diasVacaciones === totalDias && diasDinero === 0
                    ? 'border-purple-600 bg-purple-50 text-purple-800 shadow-xs'
                    : 'border-stone-200 hover:border-purple-300 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <Palmtree className="w-4 h-4 mx-auto mb-1 text-purple-600" />
                <span className="block text-[11px]">100% Vacaciones</span>
                <span className="text-[9px] font-mono text-stone-500">+{totalDias}d a saldo</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset(totalDias / 2, totalDias / 2)}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                  diasDinero > 0 && diasVacaciones > 0
                    ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-xs'
                    : 'border-stone-200 hover:border-blue-300 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Coins className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px]">+</span>
                  <Palmtree className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <span className="block text-[11px]">Mixto (50/50)</span>
                <span className="text-[9px] font-mono text-stone-500">{totalDias / 2}d / {totalDias / 2}d</span>
              </button>
            </div>
          </div>

          {/* Ajuste Numérico Manual */}
          <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-200 space-y-3">
            <span className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider">
              Ajuste Granular de Días
            </span>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-emerald-600" />
                  Días en Dinero:
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max={totalDias}
                  value={diasDinero}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setDiasDinero(val);
                    setDiasVacaciones(Math.max(0, totalDias - val));
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                />
                <span className="text-[9px] text-stone-400 mt-0.5 block">
                  Se paga en nómina como feriado
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1">
                  <Palmtree className="w-3.5 h-3.5 text-purple-600" />
                  Días a Vacaciones:
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max={totalDias}
                  value={diasVacaciones}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setDiasVacaciones(val);
                    setDiasDinero(Math.max(0, totalDias - val));
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                />
                <span className="text-[9px] text-stone-400 mt-0.5 block">
                  Acredita directamente a vacaciones
                </span>
              </div>
            </div>

            {/* Verificación de suma */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
              <span className="text-stone-500 font-medium">Total distribuido:</span>
              <span
                className={`font-mono font-bold ${
                  esValido ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {suma.toFixed(1)} / {totalDias.toFixed(1)} días
              </span>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1 uppercase tracking-wider">
              Observaciones de Administración (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. Liquidado conforme a común acuerdo con el trabajador..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Botones Pie */}
        <div className="p-5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleGuardar}
            disabled={loading || !esValido}
            className="bg-[#1c6856] hover:bg-[#154f42] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Confirmar Liquidación</span>
          </button>
        </div>
      </div>
    </div>
  );
}
