'use client';

import React, { useState, useEffect } from 'react';
import { Empleado, AlertaAsistencia } from '@/lib/types';
import { createAlerta } from '@/lib/api-client';
import {
  Gavel,
  X,
  AlertTriangle,
  User,
  Calendar,
  Printer,
} from 'lucide-react';

interface ModalAplicarSancionProps {
  isOpen: boolean;
  onClose: () => void;
  empleados: Empleado[];
  empleadoInicialId?: number | null;
  fechaInicial?: string;
  infraccionInicial?: string;
  onSancionAplicada: (nuevaAlerta: AlertaAsistencia) => void;
}

const INFRACCIONES_PREDEFINIDAS = [
  {
    id: 'OMISION_SALIDA',
    titulo: 'Omisión de Marcaje de Salida',
    hechosDefault: (empNombre: string, fecha: string) =>
      `En fecha ${fecha}, el colaborador ${empNombre} ingresó a su jornada laboral y omitió registrar su marcaje de salida definitiva en el Kiosco, dejando el turno abierto sin constancia fehaciente de su hora real de retiro.`,
    sancionSugerida:
      'Amonestación formal por escrito con copia a su expediente laboral y exclusión del beneficio de propinas de la jornada correspondiente.',
  },
  {
    id: 'TARDANZA_SEVERA',
    titulo: 'Llegada Tardía Severa / Reincidente',
    hechosDefault: (empNombre: string, fecha: string) =>
      `En fecha ${fecha}, el colaborador ${empNombre} se presentó a su turno con retraso considerable respecto a su horario programado sin previa notificación ni justificación de fuerza mayor.`,
    sancionSugerida:
      'Llamado de atención escrito con constancia a expediente y compensación obligatoria del tiempo en jornada posterior.',
  },
  {
    id: 'RETIRO_ANTICIPADO',
    titulo: 'Retiro Anticipado No Autorizado',
    hechosDefault: (empNombre: string, fecha: string) =>
      `En fecha ${fecha}, el colaborador ${empNombre} abandonó su puesto de trabajo antes de cumplir con las horas oficiales asignadas sin contar con autorización expresa de la administración.`,
    sancionSugerida:
      'Amonestación escrita y deducción del déficit de horas generado contra su balance de horas ordinarias.',
  },
  {
    id: 'INCUMPLIMIENTO_DIRECTRICES',
    titulo: 'Incumplimiento de Normas Operativas',
    hechosDefault: (empNombre: string, fecha: string) =>
      `En fecha ${fecha}, se constató incumplimiento de los protocolos operativos y normas de convivencia laboral del restaurante por parte del colaborador ${empNombre}.`,
    sancionSugerida:
      'Amonestación formal por escrito conforme al Reglamento Interno del Restaurante.',
  },
];

const SANCIONES_RAPIDAS = [
  'Amonestación formal por escrito con copia a expediente laboral.',
  'Pérdida del derecho al reparto de propinas de la jornada correspondiente.',
  'Amonestación escrita + Exclusión de propinas del día por turno omitido.',
  'Cómputo a jornada estándar ordinaria sin derecho a reconocimiento de horas extra.',
  'Suspensión disciplinaria de 1 día de labores sin goce de salario.',
];

export default function ModalAplicarSancion({
  isOpen,
  onClose,
  empleados,
  empleadoInicialId,
  fechaInicial,
  infraccionInicial,
  onSancionAplicada,
}: ModalAplicarSancionProps) {
  const [empleadoId, setEmpleadoId] = useState<number>(0);
  const [fecha, setFecha] = useState<string>('');
  const [tipoInfraccion, setTipoInfraccion] = useState<string>('OMISION_SALIDA');
  const [hechos, setHechos] = useState<string>('');
  const [sancion, setSancion] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const selectedId = empleadoInicialId || (empleados.length > 0 ? empleados[0].id : 0);
      setEmpleadoId(selectedId);

      const f = fechaInicial || new Date().toISOString().slice(0, 10);
      setFecha(f);

      const emp = empleados.find((e) => e.id === selectedId);
      const empNombre = emp ? `${emp.nombre} ${emp.apellido}` : 'el colaborador';

      const defaultInf = INFRACCIONES_PREDEFINIDAS[0];
      setTipoInfraccion(infraccionInicial || defaultInf.id);
      setHechos(defaultInf.hechosDefault(empNombre, f));
      setSancion(defaultInf.sancionSugerida);
      setObservaciones('');
      setErrorMsg('');
    }
  }, [isOpen, empleadoInicialId, fechaInicial, infraccionInicial, empleados]);

  if (!isOpen) return null;

  const empSeleccionado = empleados.find((e) => e.id === Number(empleadoId));
  const empNombre = empSeleccionado
    ? `${empSeleccionado.nombre} ${empSeleccionado.apellido}`
    : 'el colaborador';

  const handleCambioEmpleado = (id: number) => {
    setEmpleadoId(id);
    const emp = empleados.find((e) => e.id === id);
    const n = emp ? `${emp.nombre} ${emp.apellido}` : 'el colaborador';
    const inf = INFRACCIONES_PREDEFINIDAS.find((i) => i.id === tipoInfraccion);
    if (inf) {
      setHechos(inf.hechosDefault(n, fecha));
    }
  };

  const handleCambioInfraccion = (infId: string) => {
    setTipoInfraccion(infId);
    const inf = INFRACCIONES_PREDEFINIDAS.find((i) => i.id === infId);
    if (inf) {
      setHechos(inf.hechosDefault(empNombre, fecha));
      setSancion(inf.sancionSugerida);
    }
  };

  const handleGuardar = async () => {
    if (!empleadoId) {
      setErrorMsg('Por favor seleccione un colaborador.');
      return;
    }
    if (!hechos.trim()) {
      setErrorMsg('Por favor detalle los hechos ocurridos.');
      return;
    }
    if (!sancion.trim()) {
      setErrorMsg('Por favor especifique la sanción o medida aplicada.');
      return;
    }

    setGuardando(true);
    setErrorMsg('');

    const mensajeCompleto =
      `HECHOS: ${hechos.trim()}\n\n` +
      `SANCIÓN IMPUESTA: ${sancion.trim()}` +
      (observaciones.trim() ? `\n\nOBSERVACIONES: ${observaciones.trim()}` : '');

    try {
      let res: AlertaAsistencia;
      try {
        res = await createAlerta({
          tipo: 'SANCION_DISCIPLINARIA',
          empleado: empleadoId,
          titulo: `Sanción Disciplinaria: ${empNombre}`,
          mensaje: mensajeCompleto,
          leida: false,
        });
      } catch (e: any) {
        res = await createAlerta({
          tipo: 'REGISTRO_INCOMPLETO',
          empleado: empleadoId,
          titulo: `[SANCIÓN DISCIPLINARIA] ${empNombre}`,
          mensaje: mensajeCompleto,
          leida: false,
        });
      }

      if (!res.empleado_detalle && empSeleccionado) {
        res.empleado_detalle = empSeleccionado;
      }

      onSancionAplicada(res);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error registrando la sanción en el sistema.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado Modal */}
        <div className="bg-gradient-to-r from-rose-700 via-rose-800 to-stone-900 text-white p-5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 backdrop-blur-sm rounded-2xl text-rose-200">
              <Gavel className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-display font-black text-base sm:text-lg leading-tight">
                Aplicar Sanción / Amonestación
              </h3>
              <p className="text-xs text-rose-200 font-medium">
                Genera constancia formal en sistema y boleta oficial de firma física.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Formulario */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Colaborador y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-stone-700 block mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-stone-400" />
                Colaborador Sancionado
              </label>
              <select
                value={empleadoId}
                onChange={(e) => handleCambioEmpleado(Number(e.target.value))}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-600/30"
              >
                {empleados
                  .filter((e) => e.activo)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} {emp.apellido} ({emp.cargo_display})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                Fecha del Incidente
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-600/30"
              />
            </div>
          </div>

          {/* Selector de Infracción */}
          <div>
            <label className="font-bold text-stone-700 block mb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              Tipo de Infracción Cometida
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {INFRACCIONES_PREDEFINIDAS.map((inf) => (
                <button
                  key={inf.id}
                  type="button"
                  onClick={() => handleCambioInfraccion(inf.id)}
                  className={`p-2.5 rounded-xl text-left font-bold transition-all border ${
                    tipoInfraccion === inf.id
                      ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="block text-[11px] leading-tight">{inf.titulo}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Hechos Constatados */}
          <div>
            <label className="font-bold text-stone-700 block mb-1">
              1. Hechos Constatados (Redacción para la boleta):
            </label>
            <textarea
              rows={3}
              value={hechos}
              onChange={(e) => setHechos(e.target.value)}
              className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3 font-medium text-stone-800 text-xs focus:outline-none focus:ring-2 focus:ring-rose-600/30 leading-relaxed"
              placeholder="Describa con precisión los hechos ocurridos..."
            />
          </div>

          {/* Sanción o Medida Disciplinaria */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-stone-900 block flex items-center gap-1">
                <Gavel className="w-3.5 h-3.5 text-rose-600" />
                2. Medida Disciplinaria / Sanción Aplicada:
              </label>
              <span className="text-[10px] text-stone-400 font-medium">Sugerencias rápidas:</span>
            </div>

            {/* Sugerencias Rápidas de 1 Clic */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SANCIONES_RAPIDAS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSancion(s)}
                  className="bg-stone-100 hover:bg-rose-50 hover:text-rose-800 border border-stone-200 hover:border-rose-200 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-stone-700 transition-colors"
                >
                  {s.slice(0, 38)}...
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={sancion}
              onChange={(e) => setSancion(e.target.value)}
              className="w-full bg-rose-50/40 border border-rose-200 rounded-xl p-3 font-bold text-rose-950 text-xs focus:outline-none focus:ring-2 focus:ring-rose-600/30"
              placeholder="Escriba la sanción acordada..."
            />
          </div>

          {/* Observaciones adicionales */}
          <div>
            <label className="font-bold text-stone-500 block mb-1">
              3. Observaciones del Administrador / Descargo Verbal Previo (Opcional):
            </label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-700 text-xs focus:outline-none focus:ring-2 focus:ring-rose-600/30"
              placeholder="Ej: Colaborador manifestó olvido involuntario por corte de luz."
            />
          </div>
        </div>

        {/* Pie de Modal con Acciones */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando}
            className="bg-rose-700 hover:bg-rose-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {guardando ? (
              <span>Registrando...</span>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>Aplicar Sanción e Imprimir Hoja</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
