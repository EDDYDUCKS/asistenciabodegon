"""
Consumos del personal en TEGA, para que cada colaborador vea los suyos en el kiosco con su carnet.

El colaborador escanea su carnet en "Consultar mis horas"; el servidor identifica al empleado por el código
completo del QR y solo entonces busca en TEGA las cuentas de consumo cargadas a ESE empleado (personal.passId).
El navegador nunca manda un id de empleado ni toca la base: no hay forma de pedir las cuentas de otro.
Es solo lectura: aquí no se cambia, anula ni borra nada.

TEGA vive en el mismo Postgres (esquema tega). Si no está (pruebas con SQLite, o TEGA caído), se devuelve None
y el kiosco simplemente no muestra la sección.
"""
import json
from datetime import datetime, timedelta, timezone as dt_timezone

from django.db import connection
from django.utils import timezone

DIAS_ATRAS = 62          # dos quincenas largas y algo más
MAX_TICKETS = 120
HORA_DIA = 5             # el día del restaurante empieza a las 5 a. m. (igual que TEGA)


def _num(v):
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _dia_rest(ms, tz):
    """Fecha del restaurante de un momento en milisegundos (antes de las 5 a. m. cuenta al día anterior)."""
    local = datetime.fromtimestamp(ms / 1000, dt_timezone.utc).astimezone(tz)
    return (local - timedelta(hours=HORA_DIA)).date()


def _quincena(d):
    return (d.year, d.month, 1 if d.day <= 15 else 2)


def _quincena_anterior(q):
    y, m, n = q
    if n == 2:
        return (y, m, 1)
    return (y - 1, 12, 2) if m == 1 else (y, m - 1, 2)


MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def _nombre_quincena(q):
    y, m, n = q
    return f"{'1 al 15' if n == 1 else '16 al fin'} de {MESES[m - 1]}"


def armar_consumos(filas, ahora=None, tz=None):
    """
    filas: [(id, data)] de tega.docs (pagos del empleado). Devuelve lo que muestra el kiosco: totales de esta
    quincena y de la pasada, y cada ticket con su detalle. Los anulados se muestran pero no suman.
    """
    tz = tz or timezone.get_current_timezone()
    ahora = ahora or timezone.now()
    q_actual = _quincena((ahora.astimezone(tz) - timedelta(hours=HORA_DIA)).date())
    q_pasada = _quincena_anterior(q_actual)
    totales = {q_actual: {'cuentas': 0, 'a_cuenta': 0.0, 'pagado': 0.0}, q_pasada: {'cuentas': 0, 'a_cuenta': 0.0, 'pagado': 0.0}}
    tickets = []
    for pid, data in filas:
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, dict) or not data.get('t'):
            continue
        partes = data.get('partes') if isinstance(data.get('partes'), list) else []
        a_cuenta = round(sum(_num(p.get('monto')) for p in partes if isinstance(p, dict) and p.get('metodo') == 'personal'), 2)
        total = _num(data.get('total'))
        pagado = round(max(0.0, total - a_cuenta), 2)
        descuento = round(_num(data.get('descInterno')) + _num(data.get('descuento')) + _num(data.get('descPromo')), 2)
        anulado = bool(data.get('anulado'))
        local = datetime.fromtimestamp(int(data['t']) / 1000, dt_timezone.utc).astimezone(tz)
        lineas = []
        for l in data.get('lineas') or []:
            if not isinstance(l, dict):
                continue
            cant = l.get('cant') or 1
            lineas.append({'cant': cant, 'nombre': str(l.get('nombre') or ''), 'precio': _num(l.get('precio')), 'importe': round(_num(l.get('precio')) * float(cant), 2)})
        tickets.append({
            'id': pid,
            'numero': data.get('numero'),
            'fecha': local.strftime('%d/%m/%Y'),
            'hora': local.strftime('%I:%M %p').lstrip('0'),
            't': int(data['t']),
            'tipo': str((data.get('consumo') or {}).get('nombre') or 'Consumo interno'),
            'lineas': lineas,
            'subtotal': _num(data.get('subtotal')),
            'descuento': descuento,
            'total': total,
            'a_cuenta': a_cuenta,
            'pagado': pagado,
            'cobrado_por': str(data.get('cobradoPor') or ''),
            'anulado': anulado,
            'motivo_anulacion': str(data.get('motivoAnulacion') or '') if anulado else '',
        })
        q = _quincena(_dia_rest(int(data['t']), tz))
        if not anulado and q in totales:
            totales[q]['cuentas'] += 1
            totales[q]['a_cuenta'] = round(totales[q]['a_cuenta'] + a_cuenta, 2)
            totales[q]['pagado'] = round(totales[q]['pagado'] + pagado, 2)
    tickets.sort(key=lambda x: x['t'], reverse=True)
    return {
        'quincena': {'nombre': _nombre_quincena(q_actual), **totales[q_actual]},
        'quincena_pasada': {'nombre': _nombre_quincena(q_pasada), **totales[q_pasada]},
        'tickets': tickets[:MAX_TICKETS],
    }


def consumos_de_empleado(empleado_id):
    """Las cuentas de consumo de UN empleado (por su id de Pass). None si TEGA no está disponible."""
    if connection.vendor != 'postgresql':
        return None
    desde = int((timezone.now() - timedelta(days=DIAS_ATRAS)).timestamp() * 1000)
    try:
        with connection.cursor() as cur:
            cur.execute(
                "select d.id, d.data from tega.docs d "
                "where d.ruta = 'restaurantes/' || (select rid from tega.pass_vinculo limit 1) || '/pagos' "
                "and (d.data->'personal'->>'passId' = %s or d.data->'personal'->>'uid' = %s) "
                "and (d.data->>'t')::bigint >= %s "
                "order by (d.data->>'t')::bigint desc limit %s",
                [str(empleado_id), f'pass:{empleado_id}', desde, MAX_TICKETS],
            )
            filas = cur.fetchall()
    except Exception:  # TEGA es opcional: sin él el kiosco sigue igual
        return None
    return armar_consumos(filas)
