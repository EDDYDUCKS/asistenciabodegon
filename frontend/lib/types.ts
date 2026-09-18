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
  tipo_turno?: 'CORRIDO' | 'QUEBRADO';
  tipo_turno_display?: string;
  cedula_carnet?: string | null;
  telefono?: string | null;
  tarifa_hora: number | string;
  qr_code_token: string;
  activo: boolean;
  horas_pendientes?: number | string;
  periodo_horas_pendientes?: string | null;
  dias_vacaciones_acumuladas?: number | string;
  ultimo_corte_vacaciones?: string | null;
  dias_vacaciones_tomadas?: number;
  dias_vacaciones_disponibles?: number;
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
  advertencia_quiebre?: boolean;
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
  estado_pago?: 'PENDIENTE' | 'PAGADO';
  estado_pago_display?: string;
  fecha_pago?: string | null;
  monto_pagado?: number | string;
  metodo_pago?: string;
  numero_recibo_pago?: string;
  pago_horas_extra?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AlertaAsistencia {
  id?: number;
  tipo: 'TARDANZA' | 'SALIDA_ANTICIPADA' | 'MARCACION_SOSPECHOSA' | 'SEGUNDA_AUSENCIA' | 'REGISTRO_INCOMPLETO' | 'MANTENIMIENTO' | 'COMPENSACION_HORAS' | 'SANCION_DISCIPLINARIA';
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
  fecha_display?: string;
  horas_trabajadas?: number;
  horas_faltaron?: number;
  deficit_original?: number;
  horas_extra_origen?: number;
  horas_aplicadas?: number;
  horas_compensadas?: number;
  saldo_dia?: number;
  saldo_post?: number;
  tipo?: string;
  estado?: string;
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

export interface CompensacionFeriado {
  id: number;
  empleado: number;
  empleado_detalle?: Empleado;
  fecha_feriado: string;
  nombre_feriado: string;
  horas_trabajadas: number;
  dias_compensatorios_totales: number;
  estado: 'PENDIENTE' | 'DINERO' | 'VACACIONES' | 'MIXTO';
  estado_display: string;
  dias_pagados_dinero: number;
  dias_acreditados_vacaciones: number;
  fecha_liquidacion?: string | null;
  observaciones?: string;
  created_at?: string;
}

export interface PagoVacaciones {
  id: number;
  empleado: number;
  empleado_detalle?: Empleado;
  fecha_pago: string;
  dias_pagados: number;
  monto_pagado: number;
  dias_saldo_anterior: number;
  dias_saldo_nuevo: number;
  motivo: string;
  observaciones?: string;
  numero_recibo: string;
  registrado_por?: number | null;
  registrado_por_nombre?: string;
  created_at: string;
}

export interface DetalleFechaPagoHE {
  id: number;
  fecha: string;
  horas_solicitadas: number;
  horas_autorizadas: number;
  comentario?: string;
}

export interface PagoHorasExtra {
  id: number;
  empleado: number;
  empleado_detalle?: Empleado;
  fecha_pago: string;
  total_horas_pagadas: number;
  tarifa_hora_aplicada: number;
  monto_total: number;
  metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'NOMINA_QUINCENAL';
  metodo_pago_display: string;
  numero_recibo: string;
  observaciones?: string;
  detalles_fechas: DetalleFechaPagoHE[];
  registrado_por?: number | null;
  registrado_por_nombre?: string;
  created_at: string;
}

