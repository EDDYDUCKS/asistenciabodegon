'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Empleado, AutorizacionHorasExtra, CompensacionHoras } from '@/lib/types';
import { canjearHorasPorSalidaAnticipada } from '@/lib/api-client';
import { X, Clock, User, AlertCircle, ShieldCheck, KeyRound, Calendar, FileCheck } from 'lucide-react';

interface ModalCanjearSalidaAnticipadaProps {
  isOpen: boolean;
  onClose: () => void;
  empleados: Empleado[];
  horasExtraAprobadas: AutorizacionHorasExtra[];
  empleadoPreseleccionado?: Empleado | null;
  horasExtraPreseleccionadas?: AutorizacionHorasExtra[] | null;
  onCanjeCompletado: (compensacion: CompensacionHoras) => void;
}

export default function ModalCanjearSalidaAnticipada({
  isOpen,
  onClose,
  empleados,
  horasExtraAprobadas,
  empleadoPreseleccionado,
  horasExtraPreseleccionadas,
  onCanjeCompletado,
}: ModalCanjearSalidaAnticipadaProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  const [selectedExtraIds, setSelectedExtraIds] = useState<number[]>([]);
  const [fechaSalida, setFechaSalida] = useState<string>(new Date().toISOString().slice(0, 10));
  const [horasSalida, setHorasSalida] = useState<string>('1.5');
  const [motivo, setMotivo] = useState<string>('Compensación de jornada por horas extraordinarias acumuladas');
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
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Lista de horas extra aprobadas y pendientes de liquidar con ID válido
  const extrasPendientes = useMemo(() => {
    return horasExtraAprobadas.filter(
      (h): h is AutorizacionHorasExtra & { id: number } =>
        typeof h.id === 'number' &&
        h.estado === 'APROBADO' &&
        h.estado_pago !== 'PAGADO' &&
        Number(h.horas_extra_autorizadas) > 0
    );
  }, [horasExtraAprobadas]);

  // Empleados que tienen al menos una hora extra aprobada y pendiente
  const empleadosConExtras = useMemo(() => {
    const ids = new Set(
      extrasPendientes.map((h) => (typeof h.empleado === 'number' ? h.empleado : (h.empleado_detalle?.id || 0)))
    );
    return empleados.filter((e) => ids.has(e.id));
  }, [extrasPendientes, empleados]);

  // Inicialización al abrir o cambiar preselección
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setPin('');
    setPinError(false);

    if (empleadoPreseleccionado) {
      setSelectedEmpId(empleadoPreseleccionado.id);
    } else if (empleadosConExtras.length > 0 && selectedEmpId === '') {
      setSelectedEmpId(empleadosConExtras[0].id);
    }

    if (horasExtraPreseleccionadas && horasExtraPreseleccionadas.length > 0) {
      const validIds = horasExtraPreseleccionadas
        .map((h) => h.id)
        .filter((id): id is number => typeof id === 'number');
      setSelectedExtraIds(validIds);
      const totalHrs = horasExtraPreseleccionadas.reduce(
        (sum, h) => sum + Number(h.horas_extra_autorizadas || 0),
        0
      );
      setHorasSalida(totalHrs.toFixed(1));
    }
  }, [isOpen, empleadoPreseleccionado, horasExtraPreseleccionadas, empleadosConExtras]);

  // Horas del empleado seleccionado
  const extrasDelEmpleado = useMemo(() => {
    if (!selectedEmpId) return [];
    return extrasPendientes.filter(
      (h) => (typeof h.empleado === 'number' ? h.empleado : h.empleado_detalle?.id) === selectedEmpId
    );
  }, [extrasPendientes, selectedEmpId]);

  // Si cambia el empleado sin preselección explícita de registros, seleccionar todos los suyos por defecto
  useEffect(() => {
    if (!isOpen || !selectedEmpId) return;
    if (!horasExtraPreseleccionadas || horasExtraPreseleccionadas.length === 0) {
      const ids = extrasDelEmpleado.map((h) => h.id);
      setSelectedExtraIds(ids);
      const totalHrs = extrasDelEmpleado.reduce((sum, h) => sum + Number(h.horas_extra_autorizadas || 0), 0);
      setHorasSalida(totalHrs > 0 ? totalHrs.toFixed(1) : '1.5');
    }
  }, [selectedEmpId, extrasDelEmpleado, isOpen, horasExtraPreseleccionadas]);

  // Total de horas seleccionadas disponibles
  const totalHorasDisponibles = useMemo(() => {
    return extrasDelEmpleado
      .filter((h) => selectedExtraIds.includes(h.id))
      .reduce((sum, h) => sum + Number(h.horas_extra_autorizadas || 0), 0);
  }, [extrasDelEmpleado, selectedExtraIds]);

  const toggleSelectExtra = (id: number) => {
    setSelectedExtraIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const sum = extrasDelEmpleado
        .filter((h) => next.includes(h.id))
        .reduce((s, h) => s + Number(h.horas_extra_autorizadas || 0), 0);
      if (sum > 0) {
        setHorasSalida(sum.toFixed(1));
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const ids = extrasDelEmpleado.map((h) => h.id);
    setSelectedExtraIds(ids);
    const sum = extrasDelEmpleado.reduce((s, h) => s + Number(h.horas_extra_autorizadas || 0), 0);
    setHorasSalida(sum.toFixed(1));
  };

  const handleDeselectAll = () => {
    setSelectedExtraIds([]);
    setHorasSalida('0.0');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedEmpId) {
      setErrorMsg('Selecciona un colaborador.');
      return;
    }
    if (selectedExtraIds.length === 0) {
      setErrorMsg('Selecciona al menos una fecha de horas extra para compensar.');
      return;
    }
    const hrsSalidaNum = parseFloat(horasSalida);
    if (isNaN(hrsSalidaNum) || hrsSalidaNum <= 0) {
      setErrorMsg('Ingresa una cantidad válida de horas a compensar por salida anticipada.');
      return;
    }
    if (hrsSalidaNum > totalHorasDisponibles) {
      setErrorMsg(
        `Las horas a compensar (${hrsSalidaNum.toFixed(1)} hrs) no pueden superar las horas extra acumuladas seleccionadas (${totalHorasDisponibles.toFixed(1)} hrs).`
      );
      return;
    }
    if (!pin || pin.length < 4) {
      setPinError(true);
      setErrorMsg('Ingresa el PIN de administración de 4 dígitos.');
      return;
    }

    try {
      setLoading(true);
      const res = await canjearHorasPorSalidaAnticipada({
        empleado_id: Number(selectedEmpId),
        horas_extra_ids: selectedExtraIds,
        fecha_salida: fechaSalida,
        horas_salida: hrsSalidaNum,
        motivo,
        pin,
      });

      if (res && res.success && res.compensacion) {
        onCanjeCompletado(res.compensacion);
        onClose();
      } else {
        setErrorMsg(res?.mensaje || 'No se pudo registrar la compensación.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Error al procesar el canje de horas por salida anticipada.';
      setErrorMsg(msg);
      if (msg.toLowerCase().includes('pin')) {
        setPinError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Cabecera */}
        <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white leading-tight">
                  Salida Anticipada por Compensación de Horas
                </h2>
                <span className="bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                  Tiempo x Tiempo
                </span>
              </div>
              <p className="text-xs text-stone-300 font-normal mt-0.5">
                Bolsa de horas: canjea horas extra acumuladas por salida temprana sin tocar dinero ni caja.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-stone-800">
          
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-medium">{errorMsg}</div>
            </div>
          )}

          {/* 1. Selección de Colaborador */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-stone-500" />
              1. Colaborador con Horas Extra Aprobadas
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : '';
                setSelectedEmpId(val);
                setSelectedExtraIds([]);
              }}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-bold focus:bg-white focus:outline-none focus:ring-1 focus:ring-bodegon transition-all"
            >
              <option value="">-- Seleccionar Colaborador --</option>
              {empleadosConExtras.map((emp) => {
                const extras = extrasPendientes.filter(
                  (h) => (typeof h.empleado === 'number' ? h.empleado : h.empleado_detalle?.id) === emp.id
                );
                const hrsTotal = extras.reduce((sum, h) => sum + Number(h.horas_extra_autorizadas || 0), 0);
                return (
                  <option key={`emp-opt-${emp.id}`} value={emp.id}>
                    {emp.nombre} {emp.apellido} ({emp.cargo_display || 'Colaborador'}) — {hrsTotal.toFixed(1)} hrs disponibles
                  </option>
                );
              })}
            </select>
          </div>

          {/* 2. Fechas de Horas Extra a Deducir */}
          {selectedEmpId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-stone-500" />
                  2. Horas Extra Acumuladas a Canjear
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-bodegon hover:underline font-bold cursor-pointer"
                  >
                    Marcar todas
                  </button>
                  <span className="text-stone-300">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-stone-500 hover:underline cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {extrasDelEmpleado.length === 0 ? (
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-center text-xs text-stone-400">
                  No hay horas extra aprobadas disponibles para este colaborador.
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100 max-h-48 overflow-y-auto">
                  {extrasDelEmpleado.map((it) => {
                    const isChecked = selectedExtraIds.includes(it.id);
                    const [y, m, d] = it.fecha.split('-').map(Number);
                    const dt = new Date(y, m - 1, d);
                    const fechaDisplay = dt.toLocaleDateString('es-NI', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });
                    const hrs = Number(it.horas_extra_autorizadas || 0);

                    return (
                      <label
                        key={`check-he-${it.id}`}
                        className={`p-3 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-amber-50/60' : 'bg-white hover:bg-stone-50/70'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectExtra(it.id)}
                            className="rounded border-stone-300 text-bodegon focus:ring-bodegon cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-stone-900 capitalize font-mono block">
                              {fechaDisplay}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {it.comentario || 'Jornada extendida autorizada'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="inline-block bg-bodegon/10 border border-bodegon/30 text-bodegon font-mono font-bold px-2 py-0.5 rounded-md text-xs">
                            +{hrs.toFixed(1)} hrs
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Resumen de bolsa seleccionada */}
              <div className="mt-2 flex items-center justify-between text-xs px-2 py-1.5 bg-stone-100/70 rounded-lg text-stone-600 font-medium">
                <span>Horas extra seleccionadas en bolsa:</span>
                <strong className="font-mono text-bodegon font-bold">
                  {totalHorasDisponibles.toFixed(1)} hrs
                </strong>
              </div>
            </div>
          )}

          {/* 3. Datos de la Salida Anticipada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                Fecha de la Salida Temprana
              </label>
              <input
                type="date"
                value={fechaSalida}
                onChange={(e) => setFechaSalida(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono font-bold focus:bg-white focus:outline-none focus:ring-1 focus:ring-bodegon"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                Horas a Compensar (Salida Anticipada)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max={totalHorasDisponibles || 12}
                  value={horasSalida}
                  onChange={(e) => setHorasSalida(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono font-black focus:bg-white focus:outline-none focus:ring-1 focus:ring-bodegon"
                  placeholder="ej. 1.5"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
                  horas
                </span>
              </div>
            </div>
          </div>

          {/* Motivo / Observación */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
              Motivo / Observación de Salida
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ej. Permiso personal compensado con horas extra de la quincena"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-bodegon"
            />
          </div>

          {/* 4. Autorización con PIN */}
          <div className="pt-2 border-t border-stone-200">
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Autorización de Gerencia</h4>
                  <p className="text-[11px] text-stone-500">
                    Ingresa tu PIN de administración para generar el Acta Oficial con firmas.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      setPinError(false);
                    }}
                    placeholder="PIN"
                    className={`w-28 text-center font-mono font-black tracking-widest text-sm bg-white border rounded-xl py-2 px-3 focus:outline-none focus:ring-1 ${
                      pinError
                        ? 'border-rose-400 focus:ring-rose-500 text-rose-700 bg-rose-50'
                        : 'border-stone-300 focus:ring-bodegon text-stone-900'
                    }`}
                  />
                  <KeyRound className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || selectedExtraIds.length === 0}
              className="bg-bodegon hover:bg-bodegon-noche disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileCheck className="w-4 h-4" />
              <span>{loading ? 'Generando Acta...' : 'Emitir Boleta de Salida Anticipada'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  );
}
