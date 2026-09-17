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
  }, []);

  useEffect(() => {
    if (!pago) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [pago]);

  if (!pago || !mounted) return null;

  const handlePrint = () => {
    window.print();
  };

  const emp = pago.empleado_detalle;
  const nombreColaborador = emp ? `${emp.nombre} ${emp.apellido || ''}`.trim() : 'Colaborador';
  const cargoColaborador = emp?.cargo_display || 'Colaborador';
  const idCarnet = emp?.cedula_carnet
    ? emp.cedula_carnet
    : `Carnet: #BOD-${String(emp?.id || pago.empleado).padStart(3, '0')}`;

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

  const diasPagados = parseFloat(String(pago.dias_pagados || 0));
  const montoNum = parseFloat(String(pago.monto_pagado || 0));
  const saldoAnterior = parseFloat(String(pago.dias_saldo_anterior || 0));
  const saldoNuevo = parseFloat(String(pago.dias_saldo_nuevo || 0));
  const tarifaDiaria = diasPagados > 0 && montoNum > 0 ? montoNum / diasPagados : 0;
  const tarifaHora = tarifaDiaria > 0 ? tarifaDiaria / 8.0 : 0;
  const horasEquivalentes = diasPagados * 8.0;

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex justify-center items-start p-3 sm:p-6 overflow-y-auto print-pago-vacaciones-backdrop">
      {/* Estilos estrictos de impresión: AISLAMIENTO TOTAL EN 1 SOLA PÁGINA */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 6mm 10mm 6mm 10mm;
          }

          /* Ocultar absolutamente TODO lo que esté en el body excepto la boleta modal */
          body > *:not(.print-pago-vacaciones-backdrop) {
            display: none !important;
          }
          main, header, nav, aside, footer, #__next, [role="main"] {
            display: none !important;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          .print-hide, button, a {
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
            overflow: visible !important;
          }

          .print-pago-modal-container {
            border: 1.5px solid #1c6856 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
            max-width: 100% !important;
            border-radius: 6px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
              Boleta Oficial de Pago de Vacaciones en Dinero
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1c6856] hover:bg-[#154f41] text-white text-xs font-bold transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Boleta / PDF</span>
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
        <div className="p-5 sm:p-7 space-y-3.5 text-stone-900 text-xs">
          {/* Encabezado Institucional */}
          <div className="flex items-start justify-between border-b-2 border-[#1c6856] pb-3">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-[#1c6856]/30 bg-[#1c6856]">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="text-xl font-black tracking-tight text-[#1c6856]">
                    RESTAURANTE EL BODEGÓN
                  </span>
                  <p className="text-[11px] font-bold text-stone-600 uppercase tracking-wider mt-0.5">
                    Control de Nómina y Liquidación de Descanso Laboral
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                Nicaragua • Comprobante Oficial de Administración
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-mono font-black tracking-wide uppercase">
                {pago.numero_recibo}
              </span>
              <p className="text-[10px] text-stone-500 font-medium mt-1">
                Fecha de Pago: <strong className="text-stone-800 capitalize">{fechaPagoStr}</strong>
              </p>
              <p className="text-[9px] text-stone-400 font-mono">
                Emitido: {fechaEmision}
              </p>
            </div>
          </div>

          {/* Título de la Boleta */}
          <div className="text-center py-0.5">
            <h1 className="text-sm sm:text-base font-black uppercase tracking-wider text-stone-900">
              Comprobante de Liquidación y Pago de Vacaciones en Dinero
            </h1>
            <p className="text-[11px] text-stone-500 font-medium mt-0.5">
              Conforme a las Políticas Internas de El Bodegón y el Art. 76 del Código del Trabajo de Nicaragua
            </p>
          </div>

          {/* Ficha del Colaborador Enriquecida */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 bg-stone-50/90 rounded-2xl border border-stone-200 text-xs">
            <div>
              <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider block">
                Colaborador
              </span>
              <span className="font-black text-stone-900 text-xs sm:text-sm block truncate">
                {nombreColaborador}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider block">
                Cargo / Área
              </span>
              <span className="font-bold text-stone-800 text-xs block truncate">
                {cargoColaborador}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider block">
                Identificación / Carnet
              </span>
              <span className="font-mono font-bold text-stone-800 text-xs block">
                {idCarnet}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider block">
                Saldo de Vacaciones Previo
              </span>
              <span className="font-mono font-bold text-stone-600 text-xs">
                {saldoAnterior.toFixed(2)} días
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-rose-500 tracking-wider block">
                Días Liquidados (Deducción)
              </span>
              <span className="font-mono font-bold text-rose-700 text-xs">
                -{diasPagados.toFixed(2)} días
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-emerald-800 tracking-wider block">
                Saldo Restante en Cuenta
              </span>
              <span className="font-mono font-black text-emerald-800 text-xs">
                {saldoNuevo.toFixed(2)} días
              </span>
            </div>
          </div>

          {/* ── TABLA DE DETALLE DE LIQUIDACIÓN Y CÁLCULO FINANCIERO ── */}
          <div className="rounded-2xl border-2 border-[#1c6856]/40 overflow-hidden shadow-2xs">
            <div className="bg-[#1c6856]/10 px-4 py-2 border-b border-[#1c6856]/25 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#1c6856]">
                Desglose Financiero de Vacaciones Pagadas
              </span>
              <span className="text-[10px] font-bold text-stone-600 font-mono">
                Art. 76 Código del Trabajo
              </span>
            </div>

            <div className="p-3 bg-white space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                  <span className="text-[9px] uppercase font-bold text-stone-400 block">
                    Días Liquidados
                  </span>
                  <span className="text-lg font-black text-emerald-800 font-mono mt-0.5 block">
                    {diasPagados.toFixed(1)} {diasPagados === 1 ? 'día' : 'días'}
                  </span>
                  <span className="text-[9px] text-stone-500 font-mono">
                    ({horasEquivalentes.toFixed(1)} hrs base 8h)
                  </span>
                </div>

                <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-[9px] uppercase font-bold text-emerald-800 block">
                    Total Pagado
                  </span>
                  <span className="text-lg font-black text-[#1c6856] font-mono mt-0.5 block">
                    {montoNum > 0 ? `C$ ${montoNum.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Acordado'}
                  </span>
                  <span className="text-[9px] text-emerald-700 font-bold">
                    Córdobas Netos
                  </span>
                </div>

                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                  <span className="text-[9px] uppercase font-bold text-stone-400 block">
                    Valor Diario Promedio
                  </span>
                  <span className="text-sm font-black text-stone-800 font-mono mt-0.5 block">
                    {tarifaDiaria > 0 ? `C$ ${tarifaDiaria.toFixed(2)}` : 'Convenio'}
                  </span>
                  <span className="text-[9px] text-stone-500 font-mono">
                    {tarifaHora > 0 ? `(C$ ${tarifaHora.toFixed(2)}/h)` : 'Por día pagado'}
                  </span>
                </div>

                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                  <span className="text-[9px] uppercase font-bold text-stone-400 block">
                    Impacto en Saldo
                  </span>
                  <span className="text-xs font-mono font-bold text-stone-700 mt-1 block">
                    {saldoAnterior.toFixed(1)}d &rarr; <strong className="text-emerald-700 font-black">{saldoNuevo.toFixed(1)}d</strong>
                  </span>
                  <span className="text-[9px] text-rose-600 font-bold">
                    (-{diasPagados.toFixed(1)} días deducidos)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Datos Operativos: Forma de Pago, Motivo y Notas */}
          <div className="space-y-1.5 text-xs bg-stone-50 p-3 rounded-xl border border-stone-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-1.5">
                <span className="font-bold text-stone-700 min-w-28">Modalidad de Pago:</span>
                <span className="text-stone-900 font-bold">Dinero en Efectivo (Caja Administración)</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="font-bold text-stone-700 min-w-20">Motivo:</span>
                <span className="text-stone-800 font-medium">{pago.motivo || 'Pago de vacaciones en dinero'}</span>
              </div>
            </div>
            {pago.observaciones && (
              <div className="flex items-start gap-1.5 pt-1 border-t border-stone-200/60">
                <span className="font-bold text-stone-700 min-w-28">Observaciones:</span>
                <span className="text-stone-700 italic">{pago.observaciones}</span>
              </div>
            )}
          </div>

          {/* Constancia Legal y Recibo Conforme */}
          <p className="text-[10px] text-stone-600 leading-relaxed text-justify border-l-2 border-[#1c6856] pl-3 py-1 bg-stone-50/50 rounded-r-lg">
            Por medio del presente comprobante oficial, el/la colaborador(a) abajo firmante hace constar que ha recibido de
            la Administración de <strong>Restaurante El Bodegón</strong> la cantidad líquida descrita en concepto de pago de sus días
            de vacaciones acumuladas, conforme a lo normado en el Artículo 76 del Código del Trabajo de la República de Nicaragua. Con
            la firma de este documento, el colaborador manifiesta su entera satisfacción y conformidad con el pago entregado y con
            la deducción formal de dichos días de su saldo activo en el sistema, no quedando pendiente reclamo alguno al respecto.
          </p>

          {/* Firmas Formales */}
          <div className="pt-5 pb-1 grid grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider text-xs">{nombreColaborador}</p>
              <p className="text-[10px] text-stone-500">Firma del Colaborador(a) • Recibí Conforme</p>
              <p className="text-[9px] text-stone-400 font-mono">{idCarnet}</p>
            </div>
            <div className="space-y-1">
              <div className="border-t-2 border-stone-800 pt-2 w-48 mx-auto" />
              <p className="font-bold text-stone-900 uppercase tracking-wider text-xs">Administración General</p>
              <p className="text-[10px] text-stone-500">Restaurante El Bodegón</p>
              <p className="text-[9px] text-stone-400">Firma Autorizada y Sello de Caja</p>
            </div>
          </div>

          {/* Pie de página con sello y fecha de auditoría */}
          <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-[9px] text-stone-400 font-mono">
            <span>BodegónPass v2.0 • Registro Oficial de Nómina y Vacaciones</span>
            <span>Comprobante generado el {fechaEmision}</span>
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
