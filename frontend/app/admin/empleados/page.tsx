'use client';

import React, { useEffect, useState } from 'react';
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
  Phone,
  Utensils,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

const CARGOS_OPCIONES: { value: CargoType; label: string }[] = [
  { value: 'COCINA', label: 'Cocinero / Ayudante de Cocina' },
  { value: 'MESERO', label: 'Mesero / Garzón' },
  { value: 'CAJERO', label: 'Cajero' },
  { value: 'BARMAN', label: 'Barman' },
  { value: 'LIMPIEZA', label: 'Mantenimiento y Limpieza' },
  { value: 'ADMINISTRACION', label: 'Administración / Gerencia' },
];

export default function EmpleadosAdminPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Empleado | null>(null);
  const [showQrBadge, setShowQrBadge] = useState<Empleado | null>(null);
  const [showBulkPrint, setShowBulkPrint] = useState(false);

  // Form State (Tarifa por hora removida)
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [cargo, setCargo] = useState<CargoType>('MESERO');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
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
    setCargo('MESERO');
    setCedula('');
    setTelefono('');
    setActivo(true);
    setShowModal(true);
  };

  const openEditModal = (emp: Empleado) => {
    setEditingEmp(emp);
    setNombre(emp.nombre);
    setApellido(emp.apellido);
    setCargo(emp.cargo);
    setCedula(emp.cedula_carnet || '');
    setTelefono(emp.telefono || '');
    setActivo(emp.activo);
    setShowModal(true);
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
        cedula_carnet: cedula.trim(),
        telefono: telefono.trim(),
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

  return (
    <div className="space-y-6 select-none">
      {/* Estilos CSS Específicos para Impresión */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Ocultar toda la interfaz administrativa normal y contenedores padres */
          body {
            background: white !important;
            color: black !important;
          }
          .print-hide, header, nav, aside, footer, table, button, .fixed:not(.print-modal-wrapper) {
            display: none !important;
          }
          
          /* Modificar el modal fixed para que sea visible y estático en el lienzo de impresión */
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
            z-index: 9999 !important;
            overflow: visible !important;
          }

          /* Asegurar que el modal content ocupe el espacio sin backdrops oscuros */
          .print-modal-content {
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
          }

          /* Ocultar botones de cerrar e imprimir dentro del modal */
          .print-modal-content button, 
          .print-modal-content .print-hide,
          .print-modal-wrapper .print-hide {
            display: none !important;
          }

          /* Carnet individual CR80 exacto */
          .print-card-cr80 {
            display: flex !important;
            width: 85.6mm !important;
            height: 54mm !important;
            border: 1.5px solid #1c6856 !important;
            border-radius: 6mm !important;
            box-sizing: border-box !important;
            padding: 4mm !important;
            background: #fbf9f6 !important;
            color: #1a1a1a !important;
            page-break-inside: avoid !important;
            margin: 10px auto !important;
            font-family: sans-serif !important;
            position: relative !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Cuadrícula para impresión masiva */
          .print-bulk-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 85.6mm) !important;
            gap: 15px !important;
            justify-content: center !important;
            padding: 20px !important;
          }

          .print-bulk-grid .print-card-cr80 {
            margin: 0 !important;
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

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowBulkPrint(true)}
            className="bg-[#1c6856]/10 border border-[#1c6856]/20 hover:bg-[#1c6856]/20 text-[#1c6856] px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Imprimir Todo el Personal
          </button>
          
          <button
            onClick={openCreateModal}
            className="bg-[#1c6856] hover:bg-[#154f42] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Registrar Nuevo Empleado
          </button>
        </div>
      </div>

      {/* Tabla de Empleados */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm print-hide">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#1c6856]/5 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Puesto</th>
                <th className="px-6 py-4">Cédula / Teléfono</th>
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
                  return (
                    <tr key={emp.id} className="hover:bg-stone-50/50 transition-colors">
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
                      <td className="px-6 py-4 text-stone-600 font-normal space-y-0.5 text-xs">
                        <div>{emp.cedula_carnet || 'Sin cédula'}</div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-stone-400" />
                          {emp.telefono || 'Sin teléfono'}
                        </div>
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

      {/* MODAL CREAR / EDITAR */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print-hide">
          <div className="bg-white border border-stone-200 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <h2 className="text-lg font-black text-[#1c6856] flex items-center gap-2">
                <Utensils className="w-5 h-5" />
                {editingEmp ? 'Editar Datos de Empleado' : 'Registrar Nuevo Empleado'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Cédula</label>
                  <input
                    type="text"
                    placeholder="001-XXXXXX-XXXX"
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="8888-8888"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856]"
                  />
                </div>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print-modal-wrapper">
          <div className="bg-white border border-stone-200 w-full max-w-sm rounded-3xl p-5 shadow-2xl text-center relative flex flex-col items-center print-modal-content">
            <button
              onClick={() => setShowQrBadge(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100 transition-colors print-hide"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Carnet Físico Plastificable CR80 */}
            <div
              id="printable-badge"
              className="print-card-cr80 flex border-2 border-[#1c6856] rounded-[6mm] p-[4mm] bg-[#fbf9f6] text-[#1a1a1a] shadow-md w-[85.6mm] h-[54mm] box-border relative text-left font-sans select-none items-center justify-between"
            >
              {/* Lado Izquierdo: QR */}
              <div className="w-[38mm] h-[38mm] bg-white p-[2mm] rounded-[3mm] border border-stone-200/80 flex items-center justify-center shadow-inner">
                <QRCodeSVG
                  value={showQrBadge.qr_code_token}
                  size={120}
                  level="H"
                  includeMargin={false}
                />
              </div>

              {/* Lado Derecho: Datos */}
              <div className="flex flex-col justify-between h-full w-[38mm] pl-[2mm] py-[1mm]">
                <div>
                  <div className="flex items-center gap-1 border-b border-[#1c6856]/20 pb-1.5 mb-2">
                    <Utensils className="w-4 h-4 text-[#1c6856] shrink-0" />
                    <span className="font-black text-sm tracking-tight text-[#1c6856]">
                      El Bodegón
                    </span>
                  </div>
                  
                  <h3 className="font-black text-xs text-stone-900 leading-tight">
                    {showQrBadge.nombre}
                  </h3>
                  <h3 className="font-black text-xs text-stone-900 leading-tight">
                    {showQrBadge.apellido}
                  </h3>
                  
                  <p className="text-[9px] font-bold text-[#1c6856] uppercase tracking-wider mt-1.5 leading-none">
                    {showQrBadge.cargo_display}
                  </p>
                </div>

                <div className="border-t border-[#1c6856]/20 pt-1">
                  <p className="text-[8px] font-mono text-stone-500 leading-none">
                    ID: {showQrBadge.qr_code_token.slice(0, 18)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5 w-full print-hide">
              <button
                onClick={() => setShowQrBadge(null)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-xl text-xs font-bold transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 bg-[#1c6856] hover:bg-[#154f42] text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir Carnet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / DIÁLOGO DE IMPRESIÓN MASIVA DE TODOS LOS CARNETS */}
      {showBulkPrint && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 print-modal-wrapper">
          <div className="bg-white border border-stone-200 w-full max-w-5xl h-[85vh] rounded-3xl p-6 shadow-2xl flex flex-col print-modal-content">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4 print-hide">
              <div>
                <h2 className="text-lg font-black text-[#1c6856] flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Impresión Masiva de Carnets (Tamaño CR80)
                </h2>
                <p className="text-[11px] text-stone-500 font-medium">
                  Se listarán todos los empleados activos formateados en tarjetas estándar de 8.56cm x 5.4cm.
                </p>
              </div>
              <button
                onClick={() => setShowBulkPrint(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenedor del Preview Grid */}
            <div className="flex-1 overflow-y-auto my-4 p-4 bg-stone-100 rounded-2xl print:bg-white print:p-0">
              <div className="print-bulk-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 justify-items-center">
                {empleados
                  .filter((emp) => emp.activo)
                  .map((emp) => (
                    <div
                      key={emp.id}
                      className="print-card-cr80 flex border-2 border-[#1c6856] rounded-[6mm] p-[4mm] bg-[#fbf9f6] text-[#1a1a1a] w-[85.6mm] h-[54mm] box-border relative text-left font-sans select-none items-center justify-between"
                    >
                      {/* Lado Izquierdo: QR */}
                      <div className="w-[38mm] h-[38mm] bg-white p-[2mm] rounded-[3mm] border border-stone-200/80 flex items-center justify-center shadow-inner">
                        <QRCodeSVG
                          value={emp.qr_code_token}
                          size={120}
                          level="H"
                          includeMargin={false}
                        />
                      </div>

                      {/* Lado Derecho: Datos */}
                      <div className="flex flex-col justify-between h-full w-[38mm] pl-[2mm] py-[1mm]">
                        <div>
                          <div className="flex items-center gap-1 border-b border-[#1c6856]/20 pb-1.5 mb-2">
                            <Utensils className="w-4 h-4 text-[#1c6856] shrink-0" />
                            <span className="font-black text-sm tracking-tight text-[#1c6856]">
                              El Bodegón
                            </span>
                          </div>
                          
                          <h3 className="font-black text-xs text-stone-900 leading-tight">
                            {emp.nombre}
                          </h3>
                          <h3 className="font-black text-xs text-stone-900 leading-tight">
                            {emp.apellido}
                          </h3>
                          
                          <p className="text-[9px] font-bold text-[#1c6856] uppercase tracking-wider mt-1.5 leading-none">
                            {emp.cargo_display}
                          </p>
                        </div>

                        <div className="border-t border-[#1c6856]/20 pt-1">
                          <p className="text-[8px] font-mono text-stone-500 leading-none">
                            ID: {emp.qr_code_token.slice(0, 18)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200 print-hide">
              <button
                onClick={() => setShowBulkPrint(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition-colors"
              >
                Cerrar Preview
              </button>
              <button
                onClick={handlePrint}
                className="px-5 py-2 rounded-xl bg-[#1c6856] text-white text-xs font-bold hover:bg-[#154f42] transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir Todos los Carnets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
