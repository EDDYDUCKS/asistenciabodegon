import { supabase } from './supabaseClient';
import { CompraGasto, JornadaDiaria } from './compras-types';

export interface ParsedSalesData {
  salesCash: number;
  cardsBAC: number;
  cardsFicohsa: number;
  cardsBanpro: number;
  cardsLafise: number;
  totalCards: number;
  salesPedidosYa: number;
  salesBankTransfers: number;
  otherIncome: number;
  totalGrossSales: number;
  tips: number;
  source: 'JSON' | 'REGEX' | 'DEFAULT';
}

export interface ParsedOpeningData {
  totalOpeningNIO: number;
  totalOpeningUSD: number;
  exchangeRate: number;
  totalOpeningEquivNIO: number;
  openingNotes?: string;
  openedBy?: string;
}

export interface ParsedClosingAudit {
  actualCashNIO: number;
  expectedCashNIO: number;
  differenceNIO: number;
  auditStatus: 'SQUARED' | 'SURPLUS' | 'SHORTAGE';
  dailyNetProfit: number;
  closedBy?: string;
  closedAt?: string;
}

export interface ParsedPettyClosing {
  actualCashCounted: number;
  expectedBalance: number;
  difference: number;
  auditStatus: 'SQUARED' | 'SURPLUS' | 'SHORTAGE';
  closedBy?: string;
  closedAt?: string;
}

export interface DailySummaryItem {
  date: string;
  dayLabel: string;
  status: 'OPEN' | 'CLOSED';
  cashSales: number;
  cardsBAC: number;
  cardsFicohsa: number;
  cardsBanpro: number;
  cardsLafise: number;
  totalCards: number;
  salesPedidosYa: number;
  salesBankTransfers: number;
  otherIncome: number;
  totalGrossSales: number;
  pettyCashExpenses: number;
  transfersPaid: number;
  totalExpenses: number;
  netEarnings: number;
  tipsCollected: number;
  responsible: string;
  isVoid?: boolean;
  voidReason?: string;
  opening?: ParsedOpeningData;
  closing?: ParsedClosingAudit;
  pettyClosing?: ParsedPettyClosing;
}

export interface ExpenseAnalyticsData {
  totalAmount: number;
  cashAmount: number;
  cashPercent: number;
  transferAmount: number;
  transferPercent: number;
  byCategory: Array<{
    category: string;
    label: string;
    total: number;
    count: number;
    percent: number;
  }>;
  byVendor: Array<{
    vendor: string;
    total: number;
    count: number;
    percent: number;
    mainCategory: string;
  }>;
  totalTransactionsCount: number;
}

/**
 * Detecta si una transacción de compras_gastos es un fondeo/ingreso a caja
 */
export function isFondeoTransaction(g: any): boolean {
  if (!g) return false;
  if (g.tipo === 'INGRESO_FONDEO' || g.tipo === 'INFLOW') return true;
  if (g.categoria === 'FONDEO') return true;
  if (g.observaciones && /\[TIPO:FONDEO\]|\[TYPE:INFLOW\]/i.test(g.observaciones)) return true;
  const texto = `${g.concepto || ''} ${g.proveedor || ''}`.toLowerCase();
  if (
    texto.includes('deposito') ||
    texto.includes('depósito') ||
    texto.includes('depositado') ||
    texto.includes('fondeo') ||
    texto.includes('traslado a caja chica') ||
    texto.includes('traspaso a caja chica') ||
    texto.includes('aporte jefe') ||
    texto.includes('aporte de jefe') ||
    texto.includes('reembolso') ||
    texto.includes('inflow') ||
    texto.includes('correcion de saldo') ||
    texto.includes('correccion de saldo')
  ) {
    return true;
  }
  return false;
}

/**
 * Parser de ventas desde observaciones de la jornada
 */
export function parseVentasFromObservaciones(obs?: string | null): ParsedSalesData {
  if (!obs) {
    return {
      salesCash: 0,
      cardsBAC: 0,
      cardsFicohsa: 0,
      cardsBanpro: 0,
      cardsLafise: 0,
      totalCards: 0,
      salesPedidosYa: 0,
      salesBankTransfers: 0,
      otherIncome: 0,
      totalGrossSales: 0,
      tips: 0,
      source: 'DEFAULT',
    };
  }

  // A. Formato JSON estructurado: [VENTAS_DATA:{...}]
  const jsonMatch = obs.match(/\[VENTAS_DATA:(\{.*?\})\]/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const salesCash = Number(parsed.salesCash) || 0;
      const cardsBAC = Number(parsed.cardsBAC) || 0;
      const cardsFicohsa = Number(parsed.cardsFicohsa) || 0;
      const cardsBanpro = Number(parsed.cardsBanpro) || 0;
      const cardsLafise = Number(parsed.cardsLafise) || 0;
      const totalCards = Number(parsed.totalCards) || (cardsBAC + cardsFicohsa + cardsBanpro + cardsLafise);
      const salesPedidosYa = Number(parsed.salesPedidosYa) || 0;
      const salesBankTransfers = Number(parsed.salesBankTransfers) || 0;
      const otherIncome = Number(parsed.otherIncome) || 0;
      const totalGrossSales = Number(parsed.totalGrossSales) || (salesCash + totalCards + salesPedidosYa + salesBankTransfers + otherIncome);
      const tips = Number(parsed.tips) || 0;

      return {
        salesCash,
        cardsBAC,
        cardsFicohsa,
        cardsBanpro,
        cardsLafise,
        totalCards,
        salesPedidosYa,
        salesBankTransfers,
        otherIncome,
        totalGrossSales,
        tips,
        source: 'JSON',
      };
    } catch (e) {
      // Fallback a regex
    }
  }

  // B. Formato texto plano por Regex
  const extractNum = (regex: RegExp) => {
    const match = obs.match(regex);
    if (!match || !match[1]) return 0;
    return parseFloat(match[1].replace(/,/g, '')) || 0;
  };

  const salesCash = extractNum(/Efectivo\s*C\$?\s*([0-9.,]+)/i);
  const cardsBAC = extractNum(/BAC:\s*([0-9.,]+)/i);
  const cardsFicohsa = extractNum(/Fico:\s*([0-9.,]+)/i);
  const cardsBanpro = extractNum(/Banpro:\s*([0-9.,]+)/i);
  const cardsLafise = extractNum(/Laf:\s*([0-9.,]+)/i);
  const totalCardsParsed = extractNum(/Tarjetas\s*C\$?\s*([0-9.,]+)/i);
  const totalCards = totalCardsParsed || (cardsBAC + cardsFicohsa + cardsBanpro + cardsLafise);
  const salesPedidosYa = extractNum(/PedidosYa\s*C\$?\s*([0-9.,]+)/i);
  const salesBankTransfers = extractNum(/Transferencias?\s*C\$?\s*([0-9.,]+)/i);
  const otherIncome = extractNum(/Otros?\s*Ingresos?\s*C\$?\s*([0-9.,]+)/i);
  const totalGrossSalesParsed = extractNum(/Ventas\s*Brutas:\s*C\$?\s*([0-9.,]+)/i);
  const totalGrossSales = totalGrossSalesParsed || (salesCash + totalCards + salesPedidosYa + salesBankTransfers + otherIncome);

  return {
    salesCash,
    cardsBAC,
    cardsFicohsa,
    cardsBanpro,
    cardsLafise,
    totalCards,
    salesPedidosYa,
    salesBankTransfers,
    otherIncome,
    totalGrossSales,
    tips: 0,
    source: 'REGEX',
  };
}

/**
 * Parser de datos de apertura
 */
export function parseOpeningFromObservaciones(obs?: string | null, fallbackFondo: number = 0): ParsedOpeningData {
  if (obs) {
    const match = obs.match(/\[OPENING_DATA:(\{.*?\})\]/);
    if (match && match[1]) {
      try {
        const p = JSON.parse(match[1]);
        const nio = Number(p.totalOpeningNIO) || 0;
        const usd = Number(p.totalOpeningUSD) || 0;
        const rate = Number(p.exchangeRate) || 36.0;
        const equiv = nio > 0 ? nio : (Number(p.totalOpeningEquivNIO) || fallbackFondo);
        return {
          totalOpeningNIO: nio || fallbackFondo,
          totalOpeningUSD: usd,
          exchangeRate: rate,
          totalOpeningEquivNIO: equiv,
          openingNotes: p.openingNotes || '',
          openedBy: p.openedBy || '',
        };
      } catch {}
    }
  }
  return {
    totalOpeningNIO: fallbackFondo,
    totalOpeningUSD: 0,
    exchangeRate: 36.0,
    totalOpeningEquivNIO: fallbackFondo,
  };
}

/**
 * Parser de datos de auditoría de cierre de Caja General
 */
export function parseClosingFromObservaciones(obs?: string | null): ParsedClosingAudit | null {
  if (obs) {
    const match = obs.match(/\[CLOSING_AUDIT:(\{.*?\})\]/);
    if (match && match[1]) {
      try {
        const p = JSON.parse(match[1]);
        return {
          actualCashNIO: Number(p.actualCashNIO) || 0,
          expectedCashNIO: Number(p.expectedCashNIO) || 0,
          differenceNIO: Number(p.differenceNIO) || 0,
          auditStatus: p.auditStatus || 'SQUARED',
          dailyNetProfit: Number(p.dailyNetProfit) || 0,
          closedBy: p.closedBy || '',
          closedAt: p.closedAt || '',
        };
      } catch {}
    }
  }
  return null;
}

/**
 * Parser de datos de auditoría de cierre de Caja Chica
 */
export function parsePettyClosingFromObservaciones(obs?: string | null): ParsedPettyClosing | null {
  if (obs) {
    const match = obs.match(/\[PETTY_CLOSING:(\{.*?\})\]/);
    if (match && match[1]) {
      try {
        const p = JSON.parse(match[1]);
        return {
          actualCashCounted: Number(p.actualCashCounted) || 0,
          expectedBalance: Number(p.expectedBalance) || 0,
          difference: Number(p.difference) || 0,
          auditStatus: p.auditStatus || 'SQUARED',
          closedBy: p.closedBy || '',
          closedAt: p.closedAt || '',
        };
      } catch {}
    }
  }
  return null;
}

/**
 * Consulta Supabase para analítica de gastos sin límites truncados
 */
export async function fetchExpensesAnalytics(
  dateFilter: 'ALL' | 'MONTH' | 'WEEK' = 'ALL'
): Promise<ExpenseAnalyticsData> {
  try {
    let query = supabase
      .from('compras_gastos')
      .select('*')
      .order('fecha_hora', { ascending: false });

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Managua' });

    if (dateFilter === 'MONTH') {
      const monthPrefix = todayStr.slice(0, 7);
      query = query.gte('fecha_hora', `${monthPrefix}-01T00:00:00`);
    } else if (dateFilter === 'WEEK') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const weekAgoStr = d.toISOString().slice(0, 10);
      query = query.gte('fecha_hora', `${weekAgoStr}T00:00:00`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const realExpenses = rows.filter((r) => !isFondeoTransaction(r));

    let totalAmount = 0;
    let cashAmount = 0;
    let transferAmount = 0;

    const catMap = new Map<string, { total: number; count: number }>();
    const vendorMap = new Map<string, { total: number; count: number; catCounts: Map<string, number> }>();

    for (const item of realExpenses) {
      const monto = Number(item.monto) || 0;
      totalAmount += monto;

      if (item.metodo_pago === 'TRANSFERENCIA') {
        transferAmount += monto;
      } else {
        cashAmount += monto;
      }

      // Categoría
      const cat = item.categoria || 'OTROS';
      const curCat = catMap.get(cat) || { total: 0, count: 0 };
      curCat.total += monto;
      curCat.count += 1;
      catMap.set(cat, curCat);

      // Proveedor
      const vendorName = item.proveedor ? item.proveedor.trim() : 'Sin Proveedor';
      const curVendor = vendorMap.get(vendorName) || {
        total: 0,
        count: 0,
        catCounts: new Map<string, number>(),
      };
      curVendor.total += monto;
      curVendor.count += 1;
      curVendor.catCounts.set(cat, (curVendor.catCounts.get(cat) || 0) + 1);
      vendorMap.set(vendorName, curVendor);
    }

    const cashPercent = totalAmount > 0 ? (cashAmount / totalAmount) * 100 : 0;
    const transferPercent = totalAmount > 0 ? (transferAmount / totalAmount) * 100 : 0;

    const byCategory = Array.from(catMap.entries())
      .map(([category, info]) => ({
        category,
        label: category.replace(/_/g, ' '),
        total: info.total,
        count: info.count,
        percent: totalAmount > 0 ? (info.total / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const byVendor = Array.from(vendorMap.entries())
      .map(([vendor, info]) => {
        let topCat = 'OTROS';
        let topCount = -1;
        info.catCounts.forEach((cnt, c) => {
          if (cnt > topCount) {
            topCount = cnt;
            topCat = c;
          }
        });

        return {
          vendor,
          total: info.total,
          count: info.count,
          percent: totalAmount > 0 ? (info.total / totalAmount) * 100 : 0,
          mainCategory: topCat,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      totalAmount,
      cashAmount,
      cashPercent,
      transferAmount,
      transferPercent,
      byCategory,
      byVendor,
      totalTransactionsCount: realExpenses.length,
    };
  } catch (err) {
    console.warn('Error calculando analítica de gastos:', err);
    return {
      totalAmount: 0,
      cashAmount: 0,
      cashPercent: 0,
      transferAmount: 0,
      transferPercent: 0,
      byCategory: [],
      byVendor: [],
      totalTransactionsCount: 0,
    };
  }
}

/**
 * Reasigna la categoría o proveedor de un gasto en Supabase
 */
export async function reassignExpenseCategory(
  id: number,
  newCategory: string,
  newVendor?: string
): Promise<boolean> {
  try {
    const updatePayload: any = { categoria: newCategory };
    if (newVendor) updatePayload.proveedor = newVendor;

    const { error } = await supabase
      .from('compras_gastos')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error al reasignar categoría en Supabase:', err);
    return false;
  }
}
