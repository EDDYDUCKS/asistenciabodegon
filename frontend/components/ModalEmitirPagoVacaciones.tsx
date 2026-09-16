'use client';

import React, { useState } from 'react';
import { Empleado, PagoVacaciones, PermisoAusencia } from '@/lib/types';
import { crearPagoVacaciones } from '@/lib/api-client';
import { X, Banknote, AlertCircle, Calendar, User, FileText, CheckCircle2 } from 'lucide-react';

interface ModalEmitirPagoVacacionesProps {
  isOpen: boolean;
  onClose: () => void;
  empleados: Empleado[];
  permisos: PermisoAusencia[];
  onPagoCompletado: (pago: PagoVacaciones) => void;
  empleadoPreseleccionado?: Empleado | null;
}

export default function ModalEmitirPagoVacaciones({
  isOpen,
  onClose,
  empleados,
  permisos,
  onPagoCompletado,
  empleadoPreseleccionado,
}: ModalEmitirPagoVacacionesProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>(
    empleadoPreseleccionado?.id || ''
  );
  const [diasPagar, setDiasPagar] = useState<string>('2');
  const [montoPagar, setMontoPagar] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [motivo, setMotivo] = useState<string>(
    'Pago de vacaciones en dinero'
  );
  const [observaciones, setObservaciones] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentEmp = empleados.find((e) => e.id === Number(selectedEmpId));

  // Calcular saldo disponible del colaborador seleccionado
  let saldoAcumulado = 0;
  let saldoTomado = 0;
  let saldoDisponible = 0;

  if (currentEmp) {
    saldoAcumulado = parseFloat(String(currentEmp.dias_vacaciones_acumuladas || 0));
    const permisosEmp = permisos.filter(
      (p) =>
        p.empleado === currentEmp.id &&
        (p.tipo === 'VACACIONES' ||
          p.tipo === 'VACACIONES_PAGADAS' ||
          (p.tipo === 'PERMISO_AUTORIZADO' && (p.motivo || '').toLowerCase().includes('vacaciones')))
    );
    saldoTomado = permisosEmp.reduce((acc, p) => acc + (p.total_dias || 0), 0);
    saldoDisponible = Number((saldoAcumulado - saldoTomado).toFixed(1));
  }

  const numDias = parseFloat(diasPagar) || 0;
  const numMonto = parseFloat(montoPagar) || 0;
  const saldoRestante = Number((saldoDisponible - numDias).toFixed(1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedEmpId) {
      setErrorMsg('Debe seleccionar un colaborador.');
      return;
    }

    if (numDias <= 0) {
      setErrorMsg('La cantidad de días a pagar debe ser mayor a 0.');
      return;
    }

    if (numDias > saldoDisponible) {
      setErrorMsg(`El colaborador solo cuenta con ${saldoDisponible} días de vacaciones disponibles.`);
      return;
    }

    setLoading(true);
    try {
      const nuevoPago = await crearPagoVacaciones({
        empleado: Number(selectedEmpId),
        dias_pagados: numDias,
        monto_pagado: numMonto,
        motivo: motivo.trim() || 'Pago de vacaciones en dinero',
        observaciones: observaciones.trim(),
        fecha_pago: fechaPago,
      });

      onPagoCompletado(nuevoPago);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar el pago de vacaciones.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header institucional */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1c6856] text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10">
              <Banknote className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                Emitir Pago de Vacaciones en Dinero
              </h2>
              <p className="text-[11px] text-white/80 font-medium">
                Genera la boleta oficial y deduce los días del saldo disponible
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selección de Colaborador */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#1c6856]" />
              <span>Colaborador</span>
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-900 text-xs sm:text-sm font-semibold bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1c6856]/30 focus:border-[#1c6856]"
              required
            >
              <option value="">Seleccione un colaborador...</option>
              {empleados
                .filter((e) => e.activo)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre} {emp.apellido} ({emp.cargo_display})
                  </option>
                ))}
            </select>
          </div>

          {/* Tarjeta de Saldo Disponible en Vivo */}
          {currentEmp && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Acumuladas</span>
                <span className="font-bold text-stone-700 font-mono text-xs">{saldoAcumulado} d</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Tomadas/Pagadas</span>
                <span className="font-bold text-stone-700 font-mono text-xs">{saldoTomado} d</span>
              </div>
              <div className="border-l border-emerald-200">
                <span className="text-[10px] uppercase font-black text-emerald-800 block">Disponible</span>
                <span className="font-black text-emerald-800 font-mono text-sm">{saldoDisponible} d</span>
              </div>
            </div>
          )}

          {/* Campos numéricos: Días a pagar y Monto manual en Córdobas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Días de Vacaciones a Pagar
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max={saldoDisponible > 0 ? saldoDisponible : undefined}
                value={diasPagar}
                onChange={(e) => setDiasPagar(e.target.value)}
                placeholder="Ej. 2"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-900 text-xs sm:text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#1c6856]/30 focus:border-[#1c6856]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Monto en Córdobas (C$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={montoPagar}
                onChange={(e) => setMontoPagar(e.target.value)}
                placeholder="Monto acordado manual"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-900 text-xs sm:text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#1c6856]/30 focus:border-[#1c6856]"
              />
              <span className="text-[10px] text-stone-400 block mt-1">
                El admin define el monto libremente
              </span>
            </div>
          </div>

          {/* Fecha y Motivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                <span>Fecha de Pago</span>
              </label>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1c6856]/30 focus:border-[#1c6856]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-stone-400" />
                <span>Concepto / Motivo</span>
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Liquidación de feriados laborados"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1c6856]/30 focus:border-[#1c6856]"
              />
            </div>
          </div>

          {/* Observaciones opcionales */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
              Observaciones o Notas (Opcional)
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas administrativas adicionales para la boleta..."
              className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-stone-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1c6856]/30 focus:border-[#1c6856]"
            />
          </div>

          {/* Previsualización del Impacto en Saldo */}
          {currentEmp && numDias > 0 && (
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-600">Saldo restante tras el pago:</span>
              <span className={`font-mono font-black ${saldoRestante < 0 ? 'text-rose-600' : 'text-emerald-800'}`}>
                {saldoRestante} días disponibles
              </span>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedEmpId || numDias <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1c6856] hover:bg-[#154f41] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Emitiendo Boleta...' : 'Procesar y Emitir Boleta'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
