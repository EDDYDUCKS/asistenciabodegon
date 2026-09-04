'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Empleado, CargoType } from '@/lib/types';
import {
  fetchEmpleados,
  createEmpleado,
  updateEmpleado,
  deleteEmpleado,
  regenerarQrEmpleado,
} from '@/lib/api-client';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users,
  Plus,
  QrCode,
  Edit,
  Trash2,
  Printer,
  X,
  Utensils,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

const CARGOS_OPCIONES: { value: CargoType; label: string }[] = [
  { value: 'JEFE_COCINA', label: 'Jefe de Cocina' },
  { value: 'COCINERO', label: 'Cocinero' },
  { value: 'ASISTENTE_COCINA', label: 'Asistente de Cocina' },
  { value: 'ATENCION_CLIENTE', label: 'Atención al Cliente' },
  { value: 'BARRA', label: 'Barra' },
  { value: 'LIMPIEZA', label: 'Limpieza' },
  { value: 'LAVANDERIA', label: 'Lavandería' },
  { value: 'ADMINISTRACION', label: 'Administración' },
  { value: 'ASISTENTE_ADMON', label: 'Asistente de Administración' },
];

function CarnetCardItem({ emp }: { emp: Empleado }) {
  return (
    <div className="print-card-cr80 flex border-[1.5pt] border-[#1c6856] rounded-[4.5mm] p-[3mm] bg-[#fdfbf7] text-[#1c1917] w-[85.6mm] h-[54mm] box-border relative text-left font-sans select-none items-center justify-between shadow-xs">
      {/* Lado Izquierdo: QR con alto contraste */}
      <div className="w-[37mm] h-[37mm] bg-white p-[1.5mm] rounded-[3mm] border border-stone-200 flex flex-col items-center justify-center shrink-0 shadow-inner">
        <QRCodeSVG
          value={emp.qr_code_token}
          size={116}
          level="M"
          includeMargin={false}
        />
      </div>

      {/* Lado Derecho: Datos y Marca */}
      <div className="flex flex-col justify-between h-full w-[41mm] pl-[3mm] py-[0.5mm]">
        <div>
          {/* Header Marca */}
          <div className="flex items-center gap-1.5 border-b border-[#1c6856]/20 pb-1 mb-1">
            <div className="w-4 h-4 rounded-md bg-[#1c6856] flex items-center justify-center text-white shrink-0">
              <Utensils className="w-2.5 h-2.5 text-white" />
            </div>
            <div className="leading-tight">
              <span className="font-black text-[10.5px] tracking-tight text-[#1c6856] block leading-none">
                BodegónPass
              </span>
              <span className="text-[6.5px] font-bold text-stone-400 uppercase tracking-widest block leading-none mt-0.5">
                Restaurante El Bodegón
              </span>
            </div>
          </div>

          {/* Nombre Completo */}
          <div className="mt-1">
            <h3 className="font-black text-[12px] text-stone-900 leading-tight uppercase truncate">
              {emp.nombre}
            </h3>
            <h4 className="font-black text-[12px] text-stone-900 leading-tight uppercase truncate">
              {emp.apellido}
            </h4>
          </div>

          {/* Cargo Badge */}
          <div className="mt-1.5 inline-block bg-[#1c6856]/10 border border-[#1c6856]/20 rounded-md px-2 py-0.5">
            <span className="text-[8px] font-black text-[#1c6856] uppercase tracking-wide block leading-none">
              {emp.cargo_display}
            </span>
          </div>
        </div>

        {/* Footer Código */}
        <div className="border-t border-stone-200/80 pt-1 flex justify-between items-center text-[7px] font-mono text-stone-400">
          <span>ID: {emp.qr_code_token.slice(0, 14)}</span>
          <span className="font-sans font-bold text-[#1c6856] text-[6.5px] uppercase">Oficial</span>
        </div>
      </div>
    </div>
  );
}

export default function EmpleadosAdminPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Empleado | null>(null);
  const [showQrBadge, setShowQrBadge] = useState<Empleado | null>(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set());

  // Form State (Simplificado: Nombre, Apellido y Cargo)
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [cargo, setCargo] = useState<CargoType>('ATENCION_CLIENTE');
  const [activo, setActivo] = useState(true);
  const [regeneratingToken, setRegeneratingToken] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await fetchEmpleados();
      setEmpleados(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingEmp(null);
    setNombre('');
    setApellido('');
    setCargo('ATENCION_CLIENTE');
    setActivo(true);
    setShowModal(true);
  };

  const openEditModal = (emp: Empleado) => {
    setEditingEmp(emp);
    setNombre(emp.nombre);
    setApellido(emp.apellido);
    setCargo(emp.cargo);
    setActivo(emp.activo);
    setShowModal(true);
  };

  const toggleSelectEmp = (id: number) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const activeEmps = empleados.filter((e) => e.activo);
    if (selectedEmpIds.size === activeEmps.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(activeEmps.map((e) => e.id)));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreClean = nombre.trim();
    const apellidoClean = apellido.trim();
    if (!nombreClean || !apellidoClean) {
      alert('Por favor ingrese un nombre y apellido válidos.');
      return;
    }
    try {
      const payload = {
        nombre: nombreClean,
        apellido: apellidoClean,
        cargo,
        cedula_carnet: '',
        telefono: '',
        activo,
      };

      if (editingEmp) {
        await updateEmpleado(editingEmp.id, payload);
      } else {
        await createEmpleado(payload);
      }

      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const handleRegenerateQr = async () => {
    if (!editingEmp) return;
    if (
      !confirm(
        '¿Seguro que deseas regenerar el código QR? El código físico actual de este empleado dejará de funcionar inmediatamente.'
      )
    ) {
      return;
    }

    setRegeneratingToken(true);
    try {
      const res = await regenerarQrEmpleado(editingEmp.id);
      setEditingEmp({
        ...editingEmp,
        qr_code_token: res.qr_code_token,
      });
      alert('¡Código QR regenerado con éxito! Recuerda imprimir su nuevo carnet.');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al regenerar QR');
    } finally {
      setRegeneratingToken(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Seguro que deseas eliminar permanentemente a este empleado? Su historial de asistencia no se borrará, pero el empleado no aparecerá en nóminas activas.')) return;
    try {
      await deleteEmpleado(id);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Bloquear el scroll de fondo cuando un modal esté activo
  useEffect(() => {
    if (showModal || showQrBadge) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal, showQrBadge]);

  const renderTarjetaEmpleadoMobile = (emp: Empleado) => {
    const deuda = parseFloat(String(emp.horas_pendientes || 0));
    const isSelected = selectedEmpIds.has(emp.id);
    const iniciales = `${emp.nombre?.[0] || ''}${emp.apellido?.[0] || ''}`.toUpperCase();

    return (
      <div
        key={emp.id}
        className={`bg-white border rounded-2xl p-4 space-y-3 transition-all ${
          isSelected
            ? 'border-[#1c6856] bg-emerald-50/40 shadow-xs ring-1 ring-[#1c6856]'
            : 'border-stone-200/90 shadow-2xs'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Checkbox de selección de carnet */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectEmp(emp.id)}
              className="w-5 h-5 rounded text-[#1c6856] focus:ring-[#1c6856] border-stone-300 cursor-pointer accent-[#1c6856] shrink-0"
              title="Seleccionar para imprimir"
            />

            {/* Avatar con iniciales */}
            <div className="w-10 h-10 rounded-xl bg-[#1c6856]/10 text-[#1c6856] border border-[#1c6856]/20 flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
              {iniciales || 'ID'}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-xs sm:text-sm text-stone-900 truncate">
                  {emp.nombre} {emp.apellido}
                </h4>
                <span className="text-[10px] text-stone-400 font-mono">#{emp.id}</span>
              </div>
              <span className="text-[10.5px] font-bold text-[#1c6856] block truncate mt-0.5">
                {emp.cargo_display}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            {emp.activo ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-250 text-emerald-700 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                Activo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold">
                Inactivo
              </span>
            )}
          </div>
        </div>

        {/* Indicador de Horas Pendientes */}
        <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-xs">
          <span className="text-[11px] text-stone-500 font-medium">Deuda de horas:</span>
          {deuda > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold font-mono">
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              Debe {deuda.toFixed(2)} hrs ⚠️
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
              <CheckCircle className="w-3 h-3" />
              Al día (0.00h)
            </span>
          )}
        </div>

        {/* Botones de acción táctiles en móvil */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-stone-100 text-xs">
          <button
            onClick={() => setShowQrBadge(emp)}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-[#1c6856]/10 hover:bg-[#1c6856]/20 text-[#1c6856] font-bold text-[11px] transition-colors border border-[#1c6856]/20 active:scale-95 cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Ver QR</span>
          </button>

          <button
            onClick={() => openEditModal(emp)}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition-colors active:scale-95 cursor-pointer"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Editar</span>
          </button>

          <button
            onClick={() => handleDelete(emp.id)}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] transition-colors border border-rose-200 active:scale-95 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Borrar</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 select-none">
      {/* Estilos CSS Específicos para Impresión Paginada CR80 */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 10mm 15mm 10mm 15mm;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Ocultar elementos de la interfaz administrativa */
          .print-hide, header, nav, aside, footer, table, button, input, .fixed:not(.print-modal-wrapper) {
            display: none !important;
          }

          /* Contenedor Modal de Impresión */
          .print-modal-wrapper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            display: block !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            z-index: 9999 !important;
          }

          .print-modal-content {
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          .print-scroll-container {
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          /* Hoja física individual de impresión */
          .print-sheet-page {
            page-break-after: always !important;
            break-after: page !important;
            width: 100% !important;
            min-height: 248mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 2mm 0 8mm 0 !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
          }

          .print-sheet-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .print-sheet-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            font-size: 7.5pt !important;
            color: #78716c !important;
            border-bottom: 0.5pt dashed #d6d3d1 !important;
            padding-bottom: 2mm !important;
            margin-bottom: 5mm !important;
            font-family: sans-serif !important;
          }

          .print-sheet-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 85.6mm) !important;
            grid-auto-rows: 54mm !important;
            gap: 5mm 8mm !important;
            justify-content: center !important;
            align-content: start !important;
          }

          .print-card-cr80 {
            display: flex !important;
            width: 85.6mm !important;
            height: 54mm !important;
            border: 1.5pt solid #1c6856 !important;
            border-radius: 4mm !important;
            box-sizing: border-box !important;
            padding: 3mm !important;
            background: #fdfbf7 !important;
            color: #1c1917 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: hidden !important;
          }

          .print-cut-wrapper {
            border: 1px dashed #94a3b8 !important;
            padding: 1.2mm !important;
            border-radius: 5mm !important;
            background: white !important;
          }
        }
      `}} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5 print-hide">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-[#1c6856]" />
            Gestión de Empleados
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Administre el personal e imprima credenciales físicas ID-1/CR80.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedEmpIds.size > 0 ? (
            <>
              <Link
                href={`/admin/empleados/imprimir?ids=${Array.from(selectedEmpIds).join(',')}`}
                className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm animate-in fade-in active:scale-95"
              >
                <Printer className="w-4 h-4" />
                Imprimir Seleccionados ({selectedEmpIds.size})
              </Link>
              <button
                onClick={() => setSelectedEmpIds(new Set())}
                className="bg-stone-100 hover:bg-stone-200 text-stone-600 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors"
              >
                Limpiar Selección
              </button>
            </>
          ) : (
            <Link
              href="/admin/empleados/imprimir"
              className="bg-[#1c6856]/10 border border-[#1c6856]/20 hover:bg-[#1c6856]/20 text-[#1c6856] px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Imprimir Todo el Personal
            </Link>
          )}
          
          <button
            onClick={openCreateModal}
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Registrar Nuevo Empleado
          </button>
        </div>
      </div>

      {/* Vista Móvil (Tarjetas de Colaborador Táctiles - Cero scroll horizontal) */}
      <div className="block sm:hidden space-y-3 print-hide">
        {loading ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-400 text-xs shadow-2xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#1c6856] mb-2" />
            Cargando lista de empleados...
          </div>
        ) : empleados.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-400 text-xs shadow-2xs">
            No hay empleados registrados. Presione "Registrar Nuevo Empleado".
          </div>
        ) : (
          <div className="space-y-2.5">
            {empleados.map((emp) => renderTarjetaEmpleadoMobile(emp))}
          </div>
        )}
      </div>

      {/* Tabla de Empleados (Escritorio / Tablet >= sm) */}
      <div className="hidden sm:block bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm print-hide">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#1c6856]/5 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={empleados.filter(e => e.activo).length > 0 && selectedEmpIds.size === empleados.filter(e => e.activo).length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-[#1c6856] focus:ring-[#1c6856] border-stone-300 cursor-pointer accent-[#1c6856]"
                    title="Seleccionar / Desmarcar todos"
                  />
                </th>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Puesto</th>
                <th className="px-6 py-4 text-center">Horas Pendientes (Mes)</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Credencial QR</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-stone-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-stone-400">
                    Cargando lista de empleados...
                  </td>
                </tr>
              ) : empleados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-stone-400 font-normal">
                    No hay empleados registrados. Presione "Registrar Nuevo Empleado".
                  </td>
                </tr>
              ) : (
                empleados.map((emp) => {
                  const deuda = parseFloat(String(emp.horas_pendientes || 0));
                  const isSelected = selectedEmpIds.has(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/60 hover:bg-emerald-50/80 border-l-4 border-l-[#1c6856]'
                          : 'hover:bg-stone-50/50'
                      }`}
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectEmp(emp.id)}
                          className="w-4 h-4 rounded text-[#1c6856] focus:ring-[#1c6856] border-stone-300 cursor-pointer accent-[#1c6856]"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-stone-900">
                          {emp.nombre} {emp.apellido}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono mt-0.5">ID #{emp.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#1c6856]/5 border border-[#1c6856]/15 text-[11px] font-bold text-[#1c6856]">
                          {emp.cargo_display}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {deuda > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold font-mono">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            {deuda.toFixed(2)}h
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400 font-mono">0.00h</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            emp.activo
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-stone-150 border-stone-300 text-stone-500'
                          }`}
                        >
                          {emp.activo ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setShowQrBadge(emp)}
                          className="bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#1c6856]" />
                          Ver Tarjeta
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl text-stone-600 transition-colors inline-flex"
                          title="Editar Empleado"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-rose-600 transition-colors inline-flex"
                          title="Eliminar Empleado"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barra Flotante de Selección Múltiple */}
      {selectedEmpIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-stone-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom duration-200 border border-stone-800">
          <span className="text-xs font-bold">
            <strong className="text-emerald-400 font-mono text-sm mr-1">{selectedEmpIds.size}</strong>
            empleado{selectedEmpIds.size !== 1 ? 's' : ''} seleccionado{selectedEmpIds.size !== 1 ? 's' : ''}
          </span>
          <div className="h-4 w-[1px] bg-stone-700" />
          <Link
            href={`/admin/empleados/imprimir?ids=${Array.from(selectedEmpIds).join(',')}`}
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Carnets ({selectedEmpIds.size})
          </Link>
          <button
            onClick={() => setSelectedEmpIds(new Set())}
            className="text-stone-400 hover:text-white text-xs font-semibold cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* MODAL CREAR / EDITAR */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 print-hide cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-stone-200 w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto cursor-default animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h2 className="text-base sm:text-lg font-black text-[#1c6856] flex items-center gap-2">
                <Utensils className="w-5 h-5" />
                {editingEmp ? 'Editar Datos de Empleado' : 'Registrar Nuevo Empleado'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Apellido</label>
                  <input
                    type="text"
                    required
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Cargo / Puesto</label>
                <select
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value as CargoType)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                >
                  {CARGOS_OPCIONES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>



              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">Estado</label>
                <select
                  value={activo ? 'true' : 'false'}
                  onChange={(e) => setActivo(e.target.value === 'true')}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                >
                  <option value="true">Activo (Marcaje habilitado)</option>
                  <option value="false">Inactivo (Marcaje suspendido)</option>
                </select>
              </div>

              {/* Botón para regenerar código QR si se está editando */}
              {editingEmp && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col gap-2">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-950">Acción de Seguridad</h4>
                      <p className="text-[10px] text-amber-800 mt-0.5 leading-relaxed font-medium">
                        Si el empleado perdió su carnet impreso, puede regenerar el token QR. El código anterior dejará de funcionar.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateQr}
                    disabled={regeneratingToken}
                    className="mt-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-2 px-4 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {regeneratingToken ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Regenerar Nuevo Código QR'
                    )}
                  </button>
                </div>
              )}

              <div className="pt-4 border-t border-stone-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#1c6856] text-white text-xs font-bold hover:bg-[#154f42] transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPRESIÓN CARNET QR INDIVIDUAL */}
      {showQrBadge && (
        <div
          onClick={() => setShowQrBadge(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 print-modal-wrapper cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-stone-200 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl text-center relative flex flex-col items-center print-modal-content cursor-default animate-in zoom-in-95 duration-150"
          >
            <button
              onClick={() => setShowQrBadge(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors print-hide cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-4 print-hide">
              <h3 className="font-display font-black text-base text-stone-900">
                Carnet de Empleado (CR80)
              </h3>
              <p className="text-[11px] text-stone-500 font-medium">
                Tamaño estándar oficial (8.56cm x 5.4cm) con guía de corte.
              </p>
            </div>

            {/* Carnet Físico Plastificable CR80 */}
            <div className="print-cut-wrapper p-[1.5mm] border border-dashed border-stone-300 rounded-[5.5mm] bg-white inline-block shadow-xs">
              <CarnetCardItem emp={showQrBadge} />
            </div>

            <div className="flex gap-2.5 mt-6 w-full print-hide">
              <button
                onClick={() => setShowQrBadge(null)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-xl text-xs font-bold transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 bg-[#1c6856] hover:bg-[#154f42] text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <Printer className="w-4 h-4" />
                Imprimir Carnet
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
