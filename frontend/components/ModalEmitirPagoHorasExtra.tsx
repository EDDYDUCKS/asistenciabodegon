'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Empleado, AutorizacionHorasExtra, CompensacionHoras, PagoHorasExtra } from '@/lib/types';
import { createPagoHorasExtra } from '@/lib/api-client';
import { X, Banknote, Calendar, User, Clock, CheckCircle2, AlertCircle, ShieldCheck, KeyRound, Scale } from 'lucide-react';

interface ModalEmitirPagoHorasExtraProps {
  isOpen: boolean;
  onClose: () => void;
  empleados: Empleado[];
  horasExtraAprobadas: AutorizacionHorasExtra[];
  compensaciones?: CompensacionHoras[];
  empleadoPreseleccionado?: Empleado | null;
  horasExtraPreseleccionadas?: AutorizacionHorasExtra[] | null;
  onPagoCompletado: (pago: PagoHorasExtra) => void;
}

export default function ModalEmitirPagoHorasExtra({
  isOpen,
  onClose,
  empleados,
  horasExtraAprobadas,
  compensaciones = [],
  empleadoPreseleccionado,
  horasExtraPreseleccionadas,
  onPagoCompletado,
}: ModalEmitirPagoHorasExtraProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  const [selectedExtraIds, setSelectedExtraIds] = useState<number[]>([]);
  const [tarifaHora, setTarifaHora] = useState<string>('50.00');
  const [montoTotalManual, setMontoTotalManual] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'NOMINA_QUINCENAL'>('EFECTIVO');
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().slice(0, 10));
  const [observaciones, setObservaciones] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Inicializar colaborador
    const empId = empleadoPreseleccionado?.id || (horasExtraPreseleccionadas && horasExtraPreseleccionadas[0]?.empleado) || '';
    setSelectedEmpId(empId ? Number(empId) : '');

    // Inicializar IDs de horas extra preseleccionadas
    if (horasExtraPreseleccionadas && horasExtraPreseleccionadas.length > 0) {
      setSelectedExtraIds(horasExtraPreseleccionadas.map((h) => h.id!).filter(Boolean));
    } else {
      setSelectedExtraIds([]);
    }

    setFechaPago(new Date().toISOString().slice(0, 10));
    setObservaciones('');
    setPin('');
    setPinError(false);
    setErrorMsg(null);
    setMontoTotalManual('');

    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [isOpen, empleadoPreseleccionado, horasExtraPreseleccionadas]);

  // Colaborador actual
  const currentEmp = useMemo(() => {
    return empleados.find((e) => e.id === Number(selectedEmpId));
  }, [empleados, selectedEmpId]);

  // Horas extra aprobadas pendientes para este colaborador
  const extrasDelColaborador = useMemo(() => {
    if (!selectedEmpId) return [];
    return horasExtraAprobadas.filter((h) => {
      const hEmpId = typeof h.empleado === 'number' ? h.empleado : (h.empleado_detalle?.id || 0);
      return hEmpId === Number(selectedEmpId) && h.estado === 'APROBADO' && h.estado_pago !== 'PAGADO';
    }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [horasExtraAprobadas, selectedEmpId]);

  // Si cambia el colaborador y no había preselección, seleccionar todas sus horas extra pendientes por defecto
  useEffect(() => {
    if (selectedEmpId && (!horasExtraPreseleccionadas || horasExtraPreseleccionadas.length === 0)) {
      setSelectedExtraIds(extrasDelColaborador.map((h) => h.id!).filter(Boolean));
    }
  }, [selectedEmpId, extrasDelColaborador, horasExtraPreseleccionadas]);

  // Calcular tarifa hora extra sugerida
  useEffect(() => {
    if (currentEmp) {
      const baseTarifa = parseFloat(String(currentEmp.tarifa_hora || 0));
      if (baseTarifa > 0) {
        // En Nicaragua hora extra es con 100% de recargo (doble)
        setTarifaHora((baseTarifa * 2).toFixed(2));
      } else {
        setTarifaHora('50.00'); // Tarifa base por defecto estándar de restaurante en Managua
      }
    }
  }, [currentEmp]);

  // Calcular horas efectivas netas a pagar por cada registro (tomando en cuenta deducción por déficit)
  const getHorasNetasRegistro = (h: AutorizacionHorasExtra) => {
    const comp = compensaciones.find((c) => {
      const cEmpId = typeof c.empleado === 'number' ? c.empleado : (c.empleado_detalle?.id || 0);
      return cEmpId === Number(selectedEmpId) && c.fecha_compensacion === h.fecha;
    });
    if (comp && Number(comp.horas_deducidas) > 0) {
      return Number(comp.remanente_extra || 0);
    }
    return parseFloat(String(h.horas_extra_autorizadas || 0));
  };

  // Suma de horas efectivas seleccionadas
  const totalHorasSeleccionadas = useMemo(() => {
    return extrasDelColaborador
      .filter((h) => selectedExtraIds.includes(h.id!))
      .reduce((acc, h) => acc + getHorasNetasRegistro(h), 0);
  }, [extrasDelColaborador, selectedExtraIds]);

  // Monto sugerido en Córdobas
  const numTarifa = parseFloat(tarifaHora) || 0;
  const montoSugerido = Number((totalHorasSeleccionadas * numTarifa).toFixed(2));
  const montoFinal = montoTotalManual !== '' ? (parseFloat(montoTotalManual) || 0) : montoSugerido;

  const toggleSelectAll = () => {
    if (selectedExtraIds.length === extrasDelColaborador.length) {
      setSelectedExtraIds([]);
    } else {
      setSelectedExtraIds(extrasDelColaborador.map((h) => h.id!).filter(Boolean));
    }
  };

  const toggleItem = (id: number) => {
    setSelectedExtraIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setPinError(false);

    if (!selectedEmpId) {
      setErrorMsg('Debe seleccionar un colaborador.');
      return;
    }

    if (selectedExtraIds.length === 0) {
      setErrorMsg('Debe seleccionar al menos una fecha u hora extra para liquidar.');
      return;
    }

    if (totalHorasSeleccionadas <= 0) {
      setErrorMsg('El total de horas netas a liquidar debe ser mayor a 0.0 hrs.');
      return;
    }

    if (montoFinal <= 0) {
      setErrorMsg('El monto a pagar debe ser mayor a C$ 0.00.');
      return;
    }

    if (pin.trim() !== '2322') {
      setPinError(true);
      setErrorMsg('PIN de autorización gerencial incorrecto.');
      return;
    }

    setLoading(true);
    try {
      const nuevoPago = await createPagoHorasExtra({
        empleado: Number(selectedEmpId),
        horas_extra_ids: selectedExtraIds,
        total_horas_pagadas: totalHorasSeleccionadas,
        tarifa_hora_aplicada: numTarifa,
        monto_total: montoFinal,
        metodo_pago: metodoPago,
        fecha_pago: fechaPago,
        observaciones: observaciones.trim() || `Pago de ${totalHorasSeleccionadas.toFixed(1)} hrs extra vía ${metodoPago}`,
      });

      onPagoCompletado(nuevoPago);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar el pago de horas extra.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#1c6856] to-[#154f42] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <Banknote className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Emitir Pago de Horas Extra Aprobadas
              </h3>
              <p className="text-xs text-emerald-100/80">
                Liquidación oficial en Córdobas (Individual o en Lote)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-emerald-100 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selector de Colaborador */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#1c6856]" />
              Colaborador a Liquidar:
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value ? Number(e.target.value) : '')}
              disabled={Boolean(empleadoPreseleccionado)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c6856] disabled:opacity-75 disabled:bg-stone-100"
            >
              <option value="">-- Seleccione un colaborador --</option>
              {empleados
                .filter((e) => e.activo)
                .map((emp) => {
                  const pendientes = horasExtraAprobadas.filter((h) => {
                    const hEmpId = typeof h.empleado === 'number' ? h.empleado : (h.empleado_detalle?.id || 0);
                    return hEmpId === emp.id && h.estado === 'APROBADO' && h.estado_pago !== 'PAGADO';
                  }).length;
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} {emp.apellido || ''} ({emp.cargo_display}) — {pendientes} fecha(s) por pagar
                    </option>
                  );
                })}
            </select>
          </div>

          {/* Listado de Horas Extra Pendientes del Colaborador */}
          {selectedEmpId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#1c6856]" />
                  Jornadas Extraordinarias Aprobadas ({extrasDelColaborador.length}):
                </label>
                {extrasDelColaborador.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-[11px] font-bold text-[#1c6856] hover:underline cursor-pointer"
                  >
                    {selectedExtraIds.length === extrasDelColaborador.length ? 'Deseleccionar todas' : 'Seleccionar todas (Lote)'}
                  </button>
                )}
              </div>

              {extrasDelColaborador.length === 0 ? (
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-center text-xs text-stone-500">
                  Este colaborador no tiene horas extra aprobadas pendientes de pago.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-stone-100 rounded-xl border border-stone-200 bg-stone-50/50">
                  {extrasDelColaborador.map((h) => {
                    const isChecked = selectedExtraIds.includes(h.id!);
                    const netas = getHorasNetasRegistro(h);
                    const comp = compensaciones.find((c) => {
                      const cEmpId = typeof c.empleado === 'number' ? c.empleado : (c.empleado_detalle?.id || 0);
                      return cEmpId === Number(selectedEmpId) && c.fecha_compensacion === h.fecha;
                    });
                    const huboDeduccion = comp && Number(comp.horas_deducidas) > 0;

                    return (
                      <label
                        key={h.id}
                        className={`flex items-center justify-between p-2.5 text-xs hover:bg-emerald-50/60 cursor-pointer transition-colors ${
                          isChecked ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleItem(h.id!)}
                            className="w-4 h-4 rounded text-[#1c6856] focus:ring-[#1c6856] border-stone-300 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-stone-900 block">
                              {new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-NI', {
                                weekday: 'short',
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            <span className="text-[10px] text-stone-500">
                              Autorizadas: +{parseFloat(String(h.horas_extra_autorizadas || 0)).toFixed(1)} hrs
                              {huboDeduccion && (
                                <span className="text-amber-700 font-semibold ml-1">
                                  (-{Number(comp.horas_deducidas).toFixed(1)}h déficit saldado)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <span className="font-black text-emerald-800 text-xs block">
                            +{netas.toFixed(1)} hrs netas
                          </span>
                          <span className="text-[10px] text-stone-400">
                            ≈ C$ {(netas * numTarifa).toFixed(2)}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Cuadro Resumen de Cálculo Económico */}
          {selectedExtraIds.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-50/90 to-emerald-100/50 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-stone-500 block">Fechas a Pagar</span>
                  <strong className="text-stone-900 font-black text-sm">{selectedExtraIds.length}</strong>
                </div>
                <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">Horas Netas Totales</span>
                  <strong className="text-emerald-900 font-mono font-black text-sm">+{totalHorasSeleccionadas.toFixed(1)} hrs</strong>
                </div>
                <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-[#1c6856] block">Monto Total a Pagar</span>
                  <strong className="text-[#1c6856] font-mono font-black text-base">C$ {montoFinal.toFixed(2)}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Tarifa Extra por Hora (C$):
                  </label>
                  <input
                    type="number"
                    step="0.50"
                    value={tarifaHora}
                    onChange={(e) => setTarifaHora(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1c6856]"
                  />
                  <span className="text-[10px] text-stone-500 mt-0.5 block">
                    Calculada automáticamente al 100% de recargo legal
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Monto Final Acordado (C$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={montoSugerido.toFixed(2)}
                    value={montoTotalManual}
                    onChange={(e) => setMontoTotalManual(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-mono font-black text-emerald-800 focus:outline-none focus:ring-2 focus:ring-[#1c6856]"
                  />
                  <span className="text-[10px] text-stone-500 mt-0.5 block">
                    Dejar en blanco para usar el total exacto (C$ {montoSugerido.toFixed(2)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Configuración de Pago: Fecha y Método */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1c6856]" />
                Fecha de Emisión del Pago:
              </label>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1c6856]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-[#1c6856]" />
                Modalidad / Método de Pago:
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as any)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1c6856]"
              >
                <option value="EFECTIVO">Efectivo en Caja</option>
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="NOMINA_QUINCENAL">Liquidado en Nómina Quincenal</option>
              </select>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
              Observaciones o Concepto del Recibo (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ej. Liquidación de horas extra primera quincena de septiembre"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1c6856]"
            />
          </div>

          {/* Validación de Seguridad con PIN 2322 */}
          <div className="bg-stone-50 border border-stone-250 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-stone-900 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-[#1c6856]" />
                <span>Autorización Gerencial</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Ingrese el PIN de administración (2322) para autorizar el desembolso
              </p>
            </div>

            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-stone-400" />
              <input
                type="password"
                maxLength={4}
                placeholder="PIN"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setPinError(false);
                }}
                className={`w-24 text-center font-mono font-black text-sm tracking-widest bg-white border rounded-xl py-2 px-3 focus:outline-none ${
                  pinError ? 'border-rose-400 ring-2 ring-rose-200' : 'border-stone-300 focus:ring-2 focus:ring-[#1c6856]'
                }`}
              />
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || selectedExtraIds.length === 0}
              className="px-6 py-2.5 rounded-xl bg-[#1c6856] hover:bg-[#154f42] text-white font-bold text-xs transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Emitiendo Pago...' : `Confirmar y Emitir Pago (C$ ${montoFinal.toFixed(2)})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
