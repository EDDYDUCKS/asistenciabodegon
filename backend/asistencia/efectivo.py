"""
Efectivo del Bodegón para el jefe (vista de solo lectura en Bodegón Pass → /efectivo).

Junta tres fuentes que viven en la misma base de Supabase:
  - jornadas_diarias: apertura, cierre y caja chica que guarda Bodegón Control (BodEconomy).
  - compras_gastos: gastos y depósitos de caja chica (también de Control).
  - TEGA (punto de venta): turno abierto en vivo y testigo de cada cierre, leído con la misma
    función de solo lectura que usa Control desde la v1.0.68 (public.tega_para_control, migración 26).

Las cuentas siguen las reglas de Ezequiel y la fórmula única de Control (src/utils/cashMath.ts):
  - Lo que queda en gaveta después de la propina = conteo del cierre (C$ + US$ a la tasa) − propina entregada.
    La propina se entrega en córdobas, así que los dólares quedan completos (van al sobre de Snyder).
  - Ventas = efectivo real + tarjetas + transferencias + PedidosYa + otros ingresos.
    Efectivo real = contado − fondo de apertura (solo desde formulaVersion 3) + pagos y salidas.
  - Ganancia = ventas − gastos de operación − propina entregada. Retiro de socios y préstamos no son gasto.
  - Caja chica = saldo inicial + depósitos − gastos pagados en efectivo.

Nada de aquí escribe en la base.
"""
import json
import re
from datetime import date, datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

MANAGUA = ZoneInfo('America/Managua')
TASA_POR_DEFECTO = 36.0
CATEGORIAS_FUERA_OPERACION = ('RETIRO_SOCIOS', 'PRESTAMOS')

_PALABRAS_FONDEO = (
    'deposito', 'depósito', 'depositado', 'fondeo', 'traslado a caja chica', 'traspaso a caja chica',
    'aporte jefe', 'aporte de jefe', 'reembolso', 'inflow', 'correcion de saldo', 'correccion de saldo',
)
_RE_SNYDER = re.compile(r'sobre para Snyder:\s*\$\s*([0-9][0-9.,]*)', re.I)


def _n(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _r2(v):
    return round(_n(v) + 1e-9, 2)


def _etiqueta(obs, nombre):
    """Lee un bloque [NOMBRE:{...}] de las observaciones (mismo formato que Control)."""
    m = re.search(r'\[' + nombre + r':(\{.*?\})\]', obs or '')
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def es_fondeo(g):
    """Igual que isFondeoTransaction de Control: depósito o traslado a caja chica, no gasto."""
    if (g.get('categoria') or '') == 'FONDEO':
        return True
    obs = g.get('observaciones') or ''
    if re.search(r'\[TIPO:FONDEO\]|\[TYPE:INFLOW\]', obs, re.I):
        return True
    texto = f"{g.get('concepto') or ''} {g.get('proveedor') or ''}".lower()
    return any(p in texto for p in _PALABRAS_FONDEO)


def es_traslado_apertura(g):
    return 'OPENING_TRANSFER' in (g.get('observaciones') or '')


def fecha_local(valor):
    """Fecha (YYYY-MM-DD) en hora de Managua de un timestamp de la base o de milisegundos de TEGA."""
    if valor is None or valor == '':
        return ''
    if isinstance(valor, (int, float)):
        return datetime.fromtimestamp(valor / 1000, tz=dt_timezone.utc).astimezone(MANAGUA).date().isoformat()
    if isinstance(valor, datetime):
        dt = valor if valor.tzinfo else valor.replace(tzinfo=dt_timezone.utc)
        return dt.astimezone(MANAGUA).date().isoformat()
    texto = str(valor)
    try:
        dt = datetime.fromisoformat(texto.replace('Z', '+00:00'))
    except ValueError:
        return texto[:10]
    if dt.tzinfo is None:
        return texto[:10]
    return dt.astimezone(MANAGUA).date().isoformat()


def _gastos_por_dia(gastos):
    dias = {}
    for g in gastos or []:
        d = fecha_local(g.get('fecha_hora'))
        if not d:
            continue
        x = dias.setdefault(d, {
            'depositos': 0.0, 'traslado_apertura': 0.0, 'gastos_efectivo': 0.0,
            'gastos_operacion': 0.0, 'gastos_transferencia': 0.0, 'gastos_tarjeta': 0.0,
            'fuera_operacion': 0.0, 'propinas_caja_chica': 0.0,
        })
        monto = _n(g.get('monto'))
        if es_fondeo(g):
            if es_traslado_apertura(g):
                x['traslado_apertura'] += monto
            else:
                x['depositos'] += monto
            continue
        metodo = (g.get('metodo_pago') or 'EFECTIVO').upper()
        if metodo == 'EFECTIVO':
            x['gastos_efectivo'] += monto
        if (g.get('categoria') or '') == 'PROPINAS':
            x['propinas_caja_chica'] += monto
        if (g.get('categoria') or '') in CATEGORIAS_FUERA_OPERACION:
            x['fuera_operacion'] += monto
            continue
        x['gastos_operacion'] += monto
        if metodo == 'TRANSFERENCIA':
            x['gastos_transferencia'] += monto
        elif metodo == 'TARJETA':
            x['gastos_tarjeta'] += monto
    return dias


def _turnos_tega_por_dia(tega):
    """Turno de TEGA de cada día (por la hora en que se abrió). Si hay dos, gana el último."""
    por_dia = {}
    for t in (tega or {}).get('turnos') or []:
        d = fecha_local(_n(t.get('abierto')))
        if d:
            por_dia[d] = t
    return por_dia


def _testigo_tega(t):
    if not t:
        return None
    cerrado = t.get('estado') == 'cerrado'
    contado = t.get('contado')
    contado_usd = t.get('contadoUsd')
    esperado = _n(t.get('esperado'))
    esperado_usd = _n(t.get('esperadoUsd'))
    return {
        'estado': 'cerrado' if cerrado else 'abierto',
        'abierto': t.get('abierto'),
        'cerrado': t.get('cerrado'),
        'fondo': _r2(t.get('fondo')),
        'esperado_cs': _r2(esperado),
        'esperado_usd': _r2(esperado_usd),
        'contado_cs': _r2(contado) if contado is not None else None,
        'contado_usd': _r2(contado_usd) if contado_usd is not None else None,
        'descuadre_cs': _r2(_n(contado) - esperado) if cerrado and contado is not None else None,
        'descuadre_usd': _r2(_n(contado_usd) - esperado_usd) if cerrado and contado_usd is not None else None,
        'propinas': _r2(t.get('propinas')),
        'ventas': _r2(t.get('ventas')),
        'salidas_cs': _r2(t.get('salidasCS')),
        'salidas_usd': _r2(t.get('salidasUSD')),
    }


_RE_MOTIVO_APERTURA = re.compile(r'\[Diferencia con el cierre de ayer:[^·\]]*·\s*([^\]]+)\]')


def _motivo_apertura(apertura):
    """Motivo que se escribió en Control (v1.0.69+) cuando la apertura no cuadró con el cierre anterior."""
    motivo = (apertura.get('openingDiffReason') or '').strip()
    if motivo:
        return motivo
    m = _RE_MOTIVO_APERTURA.search(apertura.get('openingNotes') or '')
    return m.group(1).strip() if m else ''


def calcular_efectivo(jornadas, gastos, tega=None, hoy=None, dias=14):
    """
    jornadas: filas de jornadas_diarias (dicts con fecha, estado, turno, fondo_inicial, observaciones).
    gastos:   filas de compras_gastos (dicts).
    tega:     respuesta de public.tega_para_control, o None si no se pudo leer.
    Devuelve el resumen para la pantalla del jefe, del día más reciente al más viejo.
    """
    hoy = hoy or datetime.now(MANAGUA).date().isoformat()

    obs_por_fecha = {}
    estado_por_fecha = {}
    fondo_por_fecha = {}
    for j in jornadas or []:
        if (j.get('turno') or '') == 'CONFIG':
            continue
        f = str(j.get('fecha'))[:10]
        obs_por_fecha[f] = (obs_por_fecha.get(f, '') + ' ' + (j.get('observaciones') or '')).strip()
        if j.get('estado') == 'ABIERTA' or f not in estado_por_fecha:
            estado_por_fecha[f] = j.get('estado') or ''
        fondo_por_fecha[f] = max(fondo_por_fecha.get(f, 0.0), _n(j.get('fondo_inicial')))

    gastos_dia = _gastos_por_dia(gastos)
    tega_dia = _turnos_tega_por_dia(tega)
    fechas = sorted(obs_por_fecha.keys())

    resultado = []
    for i, f in enumerate(fechas):
        obs = obs_por_fecha[f]
        apertura = _etiqueta(obs, 'OPENING_DATA') or {}
        fondos = _etiqueta(obs, 'FONDOS_COMPOSITION') or {}
        ventas = _etiqueta(obs, 'VENTAS_DATA') or {}
        audit = _etiqueta(obs, 'CLOSING_AUDIT')
        chica = _etiqueta(obs, 'PETTY_CLOSING')
        g = gastos_dia.get(f, {})
        tasa = _n(apertura.get('exchangeRate')) or TASA_POR_DEFECTO

        dia = {
            'fecha': f,
            'estado': 'CERRADO' if audit else ('ABIERTO' if apertura else 'SIN_ABRIR'),
            'abrio': apertura.get('openedBy') or fondos.get('openedBy') or '',
            'tasa': tasa,
        }

        # ── Apertura de la mañana (de dónde salió el fondo y a dónde fue lo del cierre anterior)
        if apertura:
            m = _RE_SNYDER.search(apertura.get('openingNotes') or '')
            dia['apertura'] = {
                'contado_cs': _r2(apertura.get('openingCashCountedNIO') if apertura.get('openingCashCountedNIO') is not None else apertura.get('totalOpeningNIO')),
                'a_caja_chica': _r2(apertura.get('openingTransferToPettyCash') if apertura.get('openingTransferToPettyCash') is not None else fondos.get('generalCashTransfer')),
                'fondo_gaveta_cs': _r2(apertura.get('totalOpeningNIO')),
                'usd_a_snyder': _r2(m.group(1).replace(',', '')) if m else 0.0,
                'motivo_diferencia': _motivo_apertura(apertura),
            }
        else:
            dia['apertura'] = None

        # ── Cierre: lo que queda después de entregar la propina
        if audit:
            contado_cs = _n(audit.get('totalClosingNIO'))
            contado_usd = _n(audit.get('totalClosingUSD'))
            contado_total = _n(audit.get('actualCashNIO')) or _r2(contado_cs + contado_usd * tasa)
            propina_recaudada = _n(audit.get('totalTipCollected') if audit.get('totalTipCollected') is not None else ventas.get('tips'))
            propina_pagada = bool(audit.get('tipPaid'))
            propina_entregada = _n(audit.get('tipDistributedTotal')) if propina_pagada else 0.0
            queda_total = audit.get('netCashAfterTipsNIO')
            queda_total = _n(queda_total) if queda_total is not None else max(0.0, contado_total - propina_entregada)
            queda_cs = queda_total - contado_usd * tasa
            dia['cierre'] = {
                'cerro': audit.get('closedBy') or '',
                'hora': audit.get('closedAt') or '',
                'contado_cs': _r2(contado_cs),
                'contado_usd': _r2(contado_usd),
                'contado_total': _r2(contado_total),
                'propina_recaudada': _r2(propina_recaudada),
                'propina_entregada': _r2(propina_entregada),
                'propina_pagada': propina_pagada,
                'queda_cs': _r2(queda_cs),
                'queda_usd': _r2(contado_usd),
                'queda_total': _r2(queda_total),
                'motivo_propina': (audit.get('tipNotPaidReason') or '').strip(),
                'notas': (audit.get('closingNotes') or '').strip(),
            }

            # Ventas y ganancia con la fórmula de Control (calculateShiftProfit)
            version = int(_n(audit.get('formulaVersion')))
            fondo_ap = _n(apertura.get('totalOpeningEquivNIO')) if version >= 3 else 0.0
            efectivo_real = contado_total - fondo_ap + _n(audit.get('loyversePaidOut'))
            tarjetas = _n(ventas.get('totalCards')) or sum(_n(ventas.get(k)) for k in ('cardsBAC', 'cardsFicohsa', 'cardsBanpro', 'cardsLafise'))
            total_ventas = efectivo_real + tarjetas + _n(ventas.get('salesBankTransfers')) + _n(ventas.get('salesPedidosYa')) + _n(ventas.get('otherIncome'))
            gastos_op = _n(g.get('gastos_operacion'))
            ganancia = total_ventas - gastos_op - propina_entregada
            dia['resultado'] = {
                'efectivo_real': _r2(efectivo_real),
                'tarjetas': _r2(tarjetas),
                'transferencias': _r2(ventas.get('salesBankTransfers')),
                'pedidos_ya': _r2(ventas.get('salesPedidosYa')),
                'otros_ingresos': _r2(ventas.get('otherIncome')),
                'ventas': _r2(total_ventas),
                'gastos': _r2(gastos_op),
                'propina': _r2(propina_entregada),
                'ganancia': _r2(ganancia),
                'formula': version,
            }
        else:
            dia['cierre'] = None
            dia['resultado'] = None

        # ── Caja chica del día
        inicial = _n(fondos.get('initialBalance')) if fondos else fondo_por_fecha.get(f, 0.0)
        esperado = inicial + _n(g.get('depositos')) - _n(g.get('gastos_efectivo'))
        dia['caja_chica'] = {
            'inicial': _r2(inicial),
            'depositos': _r2(g.get('depositos')),
            'gastos_efectivo': _r2(g.get('gastos_efectivo')),
            'propinas_pagadas': _r2(g.get('propinas_caja_chica')),
            'esperado': _r2(esperado),
            'contado': _r2(chica.get('actualCashCounted')) if chica else None,
            'diferencia': _r2(chica.get('difference')) if chica else None,
            'cerrada': bool(chica),
        }

        dia['tega'] = _testigo_tega(tega_dia.get(f))
        resultado.append(dia)

    # ── Qué pasó con lo del cierre a la mañana siguiente
    for i, dia in enumerate(resultado):
        siguiente = resultado[i + 1] if i + 1 < len(resultado) else None
        cierre = dia.get('cierre')
        if not cierre or not siguiente or not siguiente.get('apertura'):
            dia['destino'] = None
            continue
        ap = siguiente['apertura']
        dia['destino'] = {
            'fecha': siguiente['fecha'],
            'contado_al_abrir_cs': ap['contado_cs'],
            'a_caja_chica': ap['a_caja_chica'],
            'fondo_gaveta_cs': ap['fondo_gaveta_cs'],
            'usd_a_snyder': ap['usd_a_snyder'],
            'diferencia_cs': _r2(ap['contado_cs'] - cierre['queda_cs']),
            'motivo': ap.get('motivo_diferencia') or '',
        }

    # ── En vivo: turno de TEGA abierto ahora
    en_vivo = None
    for t in (tega or {}).get('turnos') or []:
        if t.get('estado') != 'cerrado':
            testigo = _testigo_tega(t)
            testigo['queda_si_entrega_propina_cs'] = _r2(testigo['esperado_cs'] - testigo['propinas'])
            en_vivo = testigo
    ultimo_chica = None
    for dia in reversed(resultado):
        if dia['apertura'] or dia['caja_chica']['cerrada']:
            ultimo_chica = {'fecha': dia['fecha'], **dia['caja_chica']}
            break

    try:
        limite = (date.fromisoformat(hoy) - timedelta(days=dias)).isoformat()
    except ValueError:
        limite = ''
    recientes = [d for d in resultado if d['fecha'] > limite]
    recientes.reverse()
    return {
        'hoy': hoy,
        'tega_conectado': tega is not None,
        'en_vivo': en_vivo,
        'caja_chica_actual': ultimo_chica,
        'dias': recientes,
    }


# ─────────────────────────────── Lectura de la base ───────────────────────────────

def leer_datos(desde):
    """Lee jornadas, gastos y TEGA desde Postgres. Solo funciona con la base de Supabase."""
    from django.db import connection

    with connection.cursor() as cur:
        cur.execute(
            "select fecha, turno, estado, fondo_inicial, observaciones from public.jornadas_diarias "
            "where fecha >= %s order by fecha, id",
            [desde],
        )
        cols = [c[0] for c in cur.description]
        jornadas = [dict(zip(cols, r)) for r in cur.fetchall()]
        for j in jornadas:
            j['fecha'] = str(j['fecha'])

        cur.execute(
            "select fecha_hora, concepto, categoria, proveedor, monto, metodo_pago, observaciones "
            "from public.compras_gastos where fecha_hora >= (%s::date - interval '1 day') order by fecha_hora",
            [desde],
        )
        cols = [c[0] for c in cur.description]
        gastos = [dict(zip(cols, r)) for r in cur.fetchall()]

    tega = None
    try:
        with connection.cursor() as cur:
            # Misma función de solo lectura que usa Control (migración 26 de TEGA). La llave la lee el
            # servidor de la base; nunca sale al navegador.
            cur.execute(
                "select public.tega_para_control((select clave from tega.control_llave order by creada desc limit 1), %s)",
                [int((datetime.now(dt_timezone.utc) - timedelta(days=3)).timestamp() * 1000)],
            )
            fila = cur.fetchone()
            valor = fila[0] if fila else None
            tega = json.loads(valor) if isinstance(valor, str) else valor
    except Exception:  # TEGA es opcional: sin él se muestra lo de Control
        tega = None
    return jornadas, gastos, tega
