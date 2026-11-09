'use client';

import { useEffect, useState } from 'react';
import { fetchEfectivoJefe, EfectivoDia, EfectivoJefe } from './api-client';

/**
 * Cifras oficiales de cada cierre, calculadas en el servidor con la misma fórmula de Bodegón Control
 * (backend/asistencia/efectivo.py). Las pantallas de /control las usan en lugar de sus propias sumas,
 * para que el online y Control (.exe) den siempre lo mismo.
 *
 *   efectivo  = efectivo real del cierre (contado − fondo desde v1.0.68 + pagos y salidas)
 *   ventas    = efectivo + tarjetas + transferencias + PedidosYa + otros ingresos
 *   gastos    = gastos de operación del día (sin retiro de socios ni préstamos)
 *   propina   = propina ENTREGADA (no la recaudada)
 *   ganancia  = ventas − gastos − propina
 */
export interface CifraOficial {
  efectivo: number;
  ventas: number;
  gastos: number;
  propina: number;
  ganancia: number;
  transferencias: number;
  otrosIngresos: number;
}

export type CifrasOficiales = Map<string, CifraOficial>;

export interface DatosOficiales {
  cifras: CifrasOficiales;
  dias: Map<string, EfectivoDia>;
  enVivo: EfectivoJefe['en_vivo'];
  hoy: string;
}

export function aCifra(d: EfectivoDia): CifraOficial | null {
  if (!d.resultado) return null;
  return {
    efectivo: d.resultado.efectivo_real,
    ventas: d.resultado.ventas,
    gastos: d.resultado.gastos,
    propina: d.resultado.propina,
    ganancia: d.resultado.ganancia,
    transferencias: d.resultado.transferencias,
    otrosIngresos: d.resultado.otros_ingresos,
  };
}

/** Lee los últimos 2 meses del servidor y los vuelve a leer cuando cambia `version` (datos en vivo). */
export function useCifrasOficiales(version: unknown): DatosOficiales {
  const [datos, setDatos] = useState<DatosOficiales>(() => ({ cifras: new Map(), dias: new Map(), enVivo: null, hoy: '' }));
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetchEfectivoJefe(62);
        if (!vivo) return;
        const cifras: CifrasOficiales = new Map();
        const dias = new Map<string, EfectivoDia>();
        for (const d of r.dias) {
          dias.set(d.fecha, d);
          const c = aCifra(d);
          if (c) cifras.set(d.fecha, c);
        }
        setDatos({ cifras, dias, enVivo: r.en_vivo, hoy: r.hoy });
      } catch {
        // Sin servidor se quedan las sumas locales de antes
      }
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [version]);
  return datos;
}
