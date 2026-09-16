'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PagoVacaciones } from '@/lib/types';
import { Printer, X } from 'lucide-react';

interface BoletaPagoVacacionesModalProps {
  pago: PagoVacaciones | null;
  onClose: () => void;
}

export default function BoletaPagoVacacionesModal({
  pago,
  onClose,
}: BoletaPagoVacacionesModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!pago || !mounted) return null;

  const handlePrint = () => {
    window.print();
  };

  const emp = pago.empleado_detalle;
  const nombreColaborador = emp ? `${emp.nombre} ${emp.apellido || ''}`.trim() : 'Colaborador';
  const cargoColaborador = emp?.cargo_display || 'Colaborador';
  const idCarnet = emp?.cedula_carnet || (emp?.qr_code_token ? emp.qr_code_token.slice(0, 14) : `EMP-${pago.empleado}`);

  const fechaPagoStr = new Date(pago.fecha_pago + 'T00:00:00').toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const fechaEmision = new Date(pago.created_at || new Date()).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const montoNum = parseFloat(String(pago.monto_pagado || 0));

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex justify-center items-start p-3 sm:p-6 overflow-y-auto print-pago-vacaciones-backdrop">
      {/* Estilos estrictos de impresión: AISLAMIENTO TOTAL EN 1 SOLA PÁGINA */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 10mm 14mm 10mm 14mm;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }

          .print-hide, header, nav, aside, footer, table:not(.print-table), button, a {
            display: none !important;
          }

          .print-pago-vacaciones-backdrop {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }

          .print-pago-modal-container {
            border: 1.5px solid #1c6856 !important;
            box-shadow: none !important;
            padding: 24px !important;
            margin: 0 !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }

          .print-border {
            border-color: #000 !important;
          }
        }
        `,
        }}
      />

      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden print-pago-modal-container my-auto">
        {/* Barra superior de acciones (Oculta al imprimir) */}
        <div className="print-hide flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
              Boleta Oficial de Pago de Vacaciones
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1c6856] hover:bg-[#154f41] text-white text-xs font-bold transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Boleta</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── CUERPO DEL COMPROBANTE IMPRIMIBLE ── */}
        <div className="p-6 sm:p-8 space-y-6 text-stone-900">
          {/* Encabezado Institucional */}
          <div className="flex items-start justify-between border-b-2 border-[#1c6856]/30 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-[#1c6856]">
                  RESTAURANTE EL BODEGÓN
                </span>
              </div>
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mt-0.5">
                Sistema Integral de Gestión de Asistencia y Personal
              </p>
              <p className="text-[10px] text-stone-400">
                Nicaragua • Comprobante Oficial de Administración
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-black tracking-wide uppercase">
                {pago.numero_recibo}
              </span>
              <p className="text-[10px] text-stone-400 font-mono mt-1">
                Fecha: {fechaPagoStr}
              </p>
            </div>
          </div>

          {/* Título de la Boleta */}
          <div className="text-center py-1">
            <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-stone-900">
              Comprobante de Liquidación de Vacaciones en Dinero
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Conforme a las Políticas Internas de El Bodegón y Legislación Laboral Vigente
            </p>
          </div>

          {/* Ficha del Colaborador */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                Colaborador
              </span>
              <span className="font-bold text-stone-900 text-sm">{nombreColaborador}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                Cargo / Área
              </span>
              <span className="font-semibold text-stone-800">{cargoColaborador}</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                Cédula / Identificación
              </span>
              <span className="font-mono font-semibold text-stone-800">{idCarnet}</span>
            </div>
          </div>

          {/* Cuadro de Desglose de Vacaciones y Monto */}
          <div className="rounded-2xl border-2 border-[#1c6856]/40 overflow-hidden">
            <div className="bg-[#1c6856]/10 px-4 py-2 border-b border-[#1c6856]/30 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#1c6856]">
                Detalle de Liquidación
              </span>
              <span className="text-[11px] font-bold text-stone-600 font-mono">
                Art. 76 Código del Trabajo
              </span>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center divide-x divide-stone-200">
              <div className="px-2">
                <span className="text-[10px] uppercase font-bold text-stone-500 block">
                  Días Pagados
                </span>
                <span className="text-xl font-black text-emerald-800 font-mono mt-0.5 block">
                  {pago.dias_pagados} {Number(pago.dias_pagados) === 1 ? 'día' : 'días'}
                </span>
              </div>
              <div className="px-2">
                <span className="text-[10px] uppercase font-bold text-stone-500 block">
                  Monto Pagado
                </span>
                <span className="text-xl font-black text-[#1c6856] font-mono mt-0.5 block">
                  {montoNum > 0 ? `C$ ${montoNum.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Acordado'}
                </span>
              </div>
              <div className="px-2">
                <span className="text-[10px] uppercase font-bold text-stone-500 block">
                  Saldo Previo
                </span>
                <span className="text-base font-bold text-stone-600 font-mono mt-1 block">
                  {pago.dias_saldo_anterior} d
                </span>
              </div>
              <div className="px-2">
                <span className="text-[10px] uppercase font-bold text-stone-500 block">
                  Saldo Restante
                </span>
                <span className="text-base font-black text-stone-900 font-mono mt-1 block">
                  {pago.dias_saldo_nuevo} d
                </span>
              </div>
            </div>
          </div>

          {/* Motivo y Observaciones */}
          <div className="space-y-2 text-xs bg-stone-50/70 p-3.5 rounded-xl border border-stone-200">
            <div className="flex items-start gap-2">
              <span className="font-bold text-stone-700 min-w-16">Motivo:</span>
              <span className="text-stone-800 font-medium">
                {pago.motivo || 'Pago y liquidación en dinero de vacaciones acumuladas.'}
              </span>
            </div>
            {pago.observaciones && (
              <div className="flex items-start gap-2">
                <span className="font-bold text-stone-700 min-w-16">Notas:</span>
                <span className="text-stone-600 italic">{pago.observaciones}</span>
              </div>
            )}
          </div>

          {/* Constancia Legal */}
          <p className="text-[10px] text-stone-500 leading-relaxed text-justify border-l-2 border-[#1c6856] pl-3 py-0.5">
            Por medio de la presente, el colaborador manifiesta haber recibido a su entera satisfacción el pago
            correspondiente a los días de vacaciones descritos en este comprobante, deduciéndose formalmente de su saldo
            activo de vacaciones disponibles en los registros de asistencia y nómina de El Bodegón.
          </p>

          {/* Firmas Formales */}
          <div className="pt-10 grid grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider">{nombreColaborador}</p>
              <p className="text-[10px] text-stone-500">Colaborador(a)</p>
              <p className="text-[10px] text-stone-400 font-mono">Cédula: {idCarnet}</p>
            </div>
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider">Administración</p>
              <p className="text-[10px] text-stone-500">Restaurante El Bodegón</p>
              <p className="text-[10px] text-stone-400">Firma y Sello Autorizado</p>
            </div>
          </div>

          {/* Pie de página con sello y fecha de auditoría */}
          <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-[9px] text-stone-400">
            <span>BodegónPass • Documento Oficial de Nómina y Vacaciones</span>
            <span>Emitido el {fechaEmision} por {pago.registrado_por_nombre || 'Administración'}</span>
          </div>
        </div>

        {/* Footer del Modal con Acciones Rápidas (Oculto al Imprimir) */}
        <div className="print-hide bg-stone-100 px-6 py-4 border-t border-stone-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-200/80 font-bold text-xs transition-colors cursor-pointer"
          >
            Cerrar Vista
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-[#1c6856] hover:bg-[#154f42] text-white font-bold text-xs transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Boleta Oficial / Guardar PDF</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
