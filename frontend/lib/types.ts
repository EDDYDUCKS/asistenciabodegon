export type CargoType =
  | 'JEFE_COCINA'
  | 'COCINERO'
  | 'ASISTENTE_COCINA'
  | 'ATENCION_CLIENTE'
  | 'BARRA'
  | 'LIMPIEZA'
  | 'LAVANDERIA'
  | 'ADMINISTRACION'
  | 'ASISTENTE_ADMON';

export interface Empleado {
  id: number;
  nombre: string;
  apellido: string;
  cargo: CargoType;
  cargo_display: string;
  cedula_carnet?: string | null;
  telefono?: string | null;
  tarifa_hora: number | string;
  qr_code_token: string;
  activo: boolean;
  horas_pendientes?: number | string;
  periodo_horas_pendientes?: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoEventoType =
  | 'ENTRADA'
  | 'SALIDA_QUEBRADA'
  | 'ENTRADA_QUEBRADA'
  | 'SALIDA_DEFINITIVA';

export interface RegistroAsistencia {
  id: number;
  empleado: number;
  empleado_detalle: Empleado;
  tipo_evento: TipoEventoType;
  tipo_evento_display: string;
  fecha_hora: string;
  foto_verificacion?: string | null;
  foto_verificacion_url?: string | null;
  observacion?: string | null;
  ip_address?: string | null;
}

export interface BitacoraAccion {
  id: number;
  usuario?: number | null;
  usuario_nombre: string;
  accion: string;
  accion_display: string;
  descripcion: string;
  ip_address?: string | null;
  fecha_hora: string;
}

export interface MarcajeKioscoResponse {
  status: 'ok' | 'error' | 'cooldown';
  mensaje: string;
  registro?: RegistroAsistencia;
  horas_trabajadas_hoy?: number;
  horas_restantes_hoy?: number;
  cumplio_meta_8h?: boolean;
  detail?: string;
}

export interface DiaFeriado {
  id?: number;
  fecha: string;
  descripcion: string;
}

export interface AutorizacionHorasExtra {
  id?: number;
  empleado: number;
  empleado_detalle?: Empleado;
  fecha: string;
  horas_extra_solicitadas: number | string;
  horas_extra_autorizadas: number | string;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  comentario?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AlertaAsistencia {
  id?: number;
  tipo: 'TARDANZA' | 'SALIDA_ANTICIPADA' | 'MARCACION_SOSPECHOSA' | 'SEGUNDA_AUSENCIA' | 'REGISTRO_INCOMPLETO' | 'MANTENIMIENTO' | 'COMPENSACION_HORAS';
  empleado?: number | null;
  empleado_detalle?: Empleado | null;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at?: string;
}

export type TipoPermisoType =
  | 'VACACIONES'
  | 'VACACIONES_PAGADAS'
  | 'INCAPACIDAD_MEDICA'
  | 'PERMISO_AUTORIZADO';

export interface PermisoAusencia {
  id: number;
  empleado: number;
  empleado_detalle?: Empleado;
  tipo: TipoPermisoType;
  tipo_display: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo?: string;
  total_dias: number;
  created_at?: string;
}

export interface ItemDesgloseCompensacion {
  fecha: string;
  fecha_display: string;
  horas_trabajadas: number;
  horas_faltaron: number;
  horas_aplicadas: number;
  saldo_dia: number;
  estado: string;
}

export interface CompensacionHoras {
  id: number;
  empleado: number;
  empleado_detalle?: Empleado;
  fecha_compensacion: string;
  horas_trabajadas_hoy: number;
  horas_extra_generadas: number;
  horas_deducidas: number;
  deuda_previa: number;
  saldo_restante: number;
  remanente_extra: number;
  desglose: ItemDesgloseCompensacion[];
  created_at: string;
}
