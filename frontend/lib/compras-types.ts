export type MetodoPagoType = 'EFECTIVO' | 'TRANSFERENCIA' | 'PENDIENTE';
export type EstadoPagoType = 'PAGADO' | 'PENDIENTE_TRANSFERENCIA';
export type TurnoJornadaType = 'ALMUERZO' | 'CENA' | 'COMPLETO';
export type EstadoJornadaType = 'ABIERTA' | 'CERRADA';

export type CategoriaGastoType =
  | 'CARNES'
  | 'VERDURAS'
  | 'LACTEOS'
  | 'ABARROTES'
  | 'BEBIDAS'
  | 'DESECHABLES'
  | 'LIMPIEZA'
  | 'MANTENIMIENTO'
  | 'SERVICIOS'
  | 'OTROS';

export interface CategoriaConfig {
  id: CategoriaGastoType;
  label: string;
  emoji: string;
  color: string;
  badgeClass: string;
}

export const CATEGORIAS_GASTO: CategoriaConfig[] = [
  { id: 'CARNES', label: 'Carnes & Pollo', emoji: '🥩', color: '#e11d48', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'VERDURAS', label: 'Verduras & Frutas', emoji: '🥦', color: '#16a34a', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'LACTEOS', label: 'Lácteos & Huevos', emoji: '🧀', color: '#ca8a04', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'ABARROTES', label: 'Abarrotes & Especias', emoji: '🌾', color: '#d97706', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'BEBIDAS', label: 'Bebidas & Licores', emoji: '🥤', color: '#0284c7', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'DESECHABLES', label: 'Desechables & Empaques', emoji: '📦', color: '#475569', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'LIMPIEZA', label: 'Limpieza & Químicos', emoji: '🧼', color: '#0d9488', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'MANTENIMIENTO', label: 'Gas & Mantenimiento', emoji: '🔧', color: '#4f46e5', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'SERVICIOS', label: 'Transporte / Fletes', emoji: '🚚', color: '#9333ea', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'OTROS', label: 'Otros / Varios', emoji: '📝', color: '#57534e', badgeClass: 'bg-stone-100 text-stone-700 border-stone-200' },
];

export interface CompraGasto {
  id: number;
  jornada_id?: number | null;
  fecha_hora: string;
  concepto: string;
  categoria: CategoriaGastoType;
  proveedor?: string | null;
  monto: number;
  metodo_pago: MetodoPagoType;
  estado_pago: EstadoPagoType;
  foto_comprobante?: string | null;
  referencia_banco?: string | null;
  registrado_por: string;
  observaciones?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JornadaDiaria {
  id: number;
  fecha: string;
  turno: TurnoJornadaType;
  estado: EstadoJornadaType;
  fondo_inicial: number;
  total_gastos_efectivo: number;
  total_gastos_transferencia: number;
  responsable: string;
  observaciones?: string | null;
  fecha_cierre?: string | null;
  created_at: string;
  updated_at: string;
}
