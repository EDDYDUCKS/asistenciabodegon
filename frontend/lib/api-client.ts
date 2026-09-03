import {
  Empleado,
  RegistroAsistencia,
  BitacoraAccion,
  MarcajeKioscoResponse,
  TipoEventoType,
  DiaFeriado,
  AutorizacionHorasExtra,
  AlertaAsistencia,
  PermisoAusencia,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';

async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errorDetail = `Error ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail = errorJson.detail;
      } else if (typeof errorJson === 'object' && errorJson !== null) {
        // Formatear errores por campo del Backend Django
        errorDetail = Object.entries(errorJson)
          .map(([key, val]) => {
            const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
            const messages = Array.isArray(val) ? val.join(', ') : String(val);
            return `${fieldName}: ${messages}`;
          })
          .join('\n');
      } else {
        errorDetail = JSON.stringify(errorJson);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {} as T;
  }
}

// ── EMPLEADOS ──────────────────────────────────────────────────────────────
export async function fetchEmpleados(): Promise<Empleado[]> {
  const data = await apiRequest<Empleado[] | { results: Empleado[] }>('/empleados/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: Empleado[] }).results)) {
    return (data as { results: Empleado[] }).results;
  }
  return [];
}

export async function createEmpleado(payload: Partial<Empleado>): Promise<Empleado> {
  return apiRequest<Empleado>('/empleados/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateEmpleado(id: number, payload: Partial<Empleado>): Promise<Empleado> {
  return apiRequest<Empleado>(`/empleados/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteEmpleado(id: number): Promise<void> {
  await apiRequest(`/empleados/${id}/`, { method: 'DELETE' });
}

export async function regenerarQrEmpleado(id: number): Promise<{ qr_code_token: string }> {
  return apiRequest<{ qr_code_token: string }>(`/empleados/${id}/regenerar-qr/`, {
    method: 'POST',
  });
}

// ── KIOSCO DE MARCAJE ──────────────────────────────────────────────────────
export async function marcarAsistenciaKiosco(payload: {
  qr_token: string;
  tipo_evento?: TipoEventoType;
  fotoFile: Blob | null;
  fecha_hora?: string;
}): Promise<MarcajeKioscoResponse> {
  const formData = new FormData();
  formData.append('qr_token', payload.qr_token);
  if (payload.tipo_evento) {
    formData.append('tipo_evento', payload.tipo_evento);
  }
  if (payload.fotoFile) {
    formData.append('foto', payload.fotoFile, 'kiosk_face.jpg');
  }
  if (payload.fecha_hora) {
    formData.append('fecha_hora', payload.fecha_hora);
  }

  const url = `${API_BASE_URL}/kiosco/marcar/`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.mensaje || json.detail || 'Error registrando asistencia en Kiosco');
  }
  return json;
}

// ── REGISTROS DE ASISTENCIA ───────────────────────────────────────────────
export async function fetchAsistencias(): Promise<RegistroAsistencia[]> {
  const data = await apiRequest<RegistroAsistencia[] | { results: RegistroAsistencia[] }>('/asistencia/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: RegistroAsistencia[] }).results)) {
    return (data as { results: RegistroAsistencia[] }).results;
  }
  return [];
}

export async function createAsistenciaManual(payload: {
  empleado: number;
  tipo_evento: string;
  fecha_hora: string;
  observacion?: string;
}): Promise<RegistroAsistencia> {
  return apiRequest<RegistroAsistencia>('/asistencia/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAsistencia(id: number): Promise<void> {
  await apiRequest(`/asistencia/${id}/`, { method: 'DELETE' });
}

// ── BITÁCORA ──────────────────────────────────────────────────────────────
export async function fetchBitacora(): Promise<BitacoraAccion[]> {
  const data = await apiRequest<BitacoraAccion[] | { results: BitacoraAccion[] }>('/bitacora/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: BitacoraAccion[] }).results)) {
    return (data as { results: BitacoraAccion[] }).results;
  }
  return [];
}

// ── DESCARGA DE REPORTE EXCEL DE NÓMINA ──────────────────────────────────
export async function downloadNominaExcel(fechaInicio?: string, fechaFin?: string): Promise<void> {
  const params = new URLSearchParams();
  if (fechaInicio) params.append('fecha_inicio', fechaInicio);
  if (fechaFin) params.append('fecha_fin', fechaFin);

  const url = `${API_BASE_URL}/reportes/nomina-excel/?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Error generando el reporte Excel de nómina');
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `Nomina_Bodegon_${fechaInicio || 'inicio'}_${fechaFin || 'hoy'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

// ── FERIADOS DINÁMICOS ──────────────────────────────────────────────────────
export async function fetchFeriados(): Promise<DiaFeriado[]> {
  const data = await apiRequest<DiaFeriado[] | { results: DiaFeriado[] }>('/feriados/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: DiaFeriado[] }).results)) {
    return (data as { results: DiaFeriado[] }).results;
  }
  return [];
}

export async function createFeriado(payload: { fecha: string; descripcion: string }): Promise<DiaFeriado> {
  return apiRequest<DiaFeriado>('/feriados/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteFeriado(id: number): Promise<void> {
  await apiRequest(`/feriados/${id}/`, { method: 'DELETE' });
}

// ── AUTORIZACIONES DE HORAS EXTRA ──────────────────────────────────────────
export async function fetchHorasExtra(): Promise<AutorizacionHorasExtra[]> {
  const data = await apiRequest<AutorizacionHorasExtra[] | { results: AutorizacionHorasExtra[] }>('/horas-extra/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: AutorizacionHorasExtra[] }).results)) {
    return (data as { results: AutorizacionHorasExtra[] }).results;
  }
  return [];
}

export async function updateHoraExtra(id: number, payload: Partial<AutorizacionHorasExtra>): Promise<AutorizacionHorasExtra> {
  return apiRequest<AutorizacionHorasExtra>(`/horas-extra/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── ALERTAS DE ASISTENCIA ──────────────────────────────────────────────────
export async function fetchAlertas(): Promise<AlertaAsistencia[]> {
  const data = await apiRequest<AlertaAsistencia[] | { results: AlertaAsistencia[] }>('/alertas/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: AlertaAsistencia[] }).results)) {
    return (data as { results: AlertaAsistencia[] }).results;
  }
  return [];
}

export async function updateAlerta(id: number, payload: Partial<AlertaAsistencia>): Promise<AlertaAsistencia> {
  return apiRequest<AlertaAsistencia>(`/alertas/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function resolverAlerta(id: number, decision: 'JUSTIFICAR' | 'SUMAR_DEUDA'): Promise<{ status: string; mensaje: string; empleado_horas_pendientes?: number }> {
  return apiRequest<{ status: string; mensaje: string; empleado_horas_pendientes?: number }>(`/alertas/${id}/resolver/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
}

export async function marcarTodasAlertasLeidas(): Promise<void> {
  await apiRequest('/alertas/marcar-todas-leidas/', {
    method: 'POST',
  });
}

export async function ejecutarDepuracionSemestral(meses: number = 6): Promise<{
  status: string;
  mensaje: string;
  fotos_liberadas: number;
  bitacora_eliminada: number;
  alertas_eliminadas: number;
}> {
  return apiRequest('/alertas/depurar-historial/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meses }),
  });
}

// ── BATCH SYNC OFFLINE ─────────────────────────────────────────────────────
export async function syncBatchAsistencias(payload: Array<{
  qr_code_token: string;
  tipo_evento: string;
  fecha_hora: string;
  foto?: string;
}>): Promise<{ status: string; sincronizados: any[] }> {
  return apiRequest<{ status: string; sincronizados: any[] }>('/asistencia/sync-batch/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── PERMISOS Y VACACIONES ──────────────────────────────────────────────────
export async function fetchPermisos(): Promise<PermisoAusencia[]> {
  const data = await apiRequest<PermisoAusencia[] | { results: PermisoAusencia[] }>('/permisos/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results: PermisoAusencia[] }).results)) {
    return (data as { results: PermisoAusencia[] }).results;
  }
  return [];
}

export async function createPermiso(payload: Partial<PermisoAusencia>): Promise<PermisoAusencia> {
  return apiRequest<PermisoAusencia>('/permisos/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deletePermiso(id: number): Promise<void> {
  await apiRequest(`/permisos/${id}/`, { method: 'DELETE' });
}

// ── PURGA OFICIAL DÍA 0 (REINICIO LIMPIO) ──────────────────────────────────
export async function purgarDiaCero(pin: string): Promise<{ status: string; mensaje: string }> {
  return apiRequest<{ status: string; mensaje: string }>('/asistencia/purgar-dia-cero/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
}

