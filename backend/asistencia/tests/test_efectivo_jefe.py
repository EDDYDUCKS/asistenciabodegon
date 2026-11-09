"""
Vista del efectivo para el jefe (/efectivo). Datos reales del 7 y 8 de noviembre de 2026
(cierres de Bodegón Control) para que las cifras coincidan con Control y con TEGA.
"""
from django.contrib.auth import get_user_model
from django.test import Client, SimpleTestCase, TestCase

from asistencia.efectivo import calcular_efectivo, es_fondeo

OBS_7NOV = (
    '[OPENING_DATA:{"totalOpeningNIO":882,"totalOpeningUSD":0,"exchangeRate":36,"openingNotes":"[Auditoría Apertura: Pagos/Salidas Loyverse (C$ 7500.00)] • [Dólares apartados en sobre para Snyder: $140.00 USD]","openedBy":"Eddy","totalOpeningEquivNIO":882,"openingNIO":{"1":62,"500":7},"openingUSD":{"20":7},"openingCashCountedNIO":5682,"openingTransferToPettyCash":4800}] '
    '[FONDOS_COMPOSITION:{"previousDayRemaining":527,"generalCashTransfer":4800,"bossContribution":0,"initialBalance":5327,"openedBy":"Eddy"}] '
    '[VENTAS_DATA:{"salesCash":21712,"cardsBAC":40979,"cardsFicohsa":0,"cardsBanpro":25678.5,"cardsLafise":11494.5,"totalCards":78152,"salesPedidosYa":6890,"salesBankTransfers":1060,"otherIncome":0,"totalGrossSales":95968,"tips":8292}] '
    '[CLOSING_AUDIT:{"actualCashNIO":9866,"expectedCashNIO":9866,"differenceNIO":0,"auditStatus":"SQUARED","dailyNetProfit":48644.98,"closedBy":"Eddy","closedAt":"2026-11-08T06:12:08.477+00:00","totalClosingEquivNIO":9866,"totalClosingNIO":8426,"totalClosingUSD":40,"closingNIO":{"500":6},"closingUSD":{"20":2},"netCashAfterTipsNIO":9866,"tipPaid":false,"totalTipCollected":8292,"tipDistributedTotal":0,"loyversePaidOut":0,"formulaVersion":2}] '
    '[PETTY_CLOSING:{"actualCashCounted":35,"expectedBalance":30.23,"difference":4.77,"auditStatus":"SURPLUS","closedBy":"Xiomara"}]'
)
OBS_8NOV = (
    '[OPENING_DATA:{"totalOpeningNIO":846,"totalOpeningUSD":0,"exchangeRate":36,"openingNotes":"[Dólares apartados en sobre para Snyder: $40.00 USD]","openedBy":"Xiomara","totalOpeningEquivNIO":846,"openingNIO":{"1":61},"openingUSD":{"20":2},"openingCashCountedNIO":846}] '
    '[FONDOS_COMPOSITION:{"previousDayRemaining":35,"generalCashTransfer":0,"bossContribution":0,"initialBalance":35,"openedBy":"Xiomara"}] '
    '[VENTAS_DATA:{"salesCash":31071,"cardsBAC":16049,"cardsFicohsa":0,"cardsBanpro":23742,"cardsLafise":1672.48,"totalCards":41463.48,"salesPedidosYa":8690,"salesBankTransfers":0,"otherIncome":0,"totalGrossSales":90974.48,"tips":7932}] '
    '[CLOSING_AUDIT:{"actualCashNIO":40821,"expectedCashNIO":32921,"differenceNIO":0,"auditStatus":"SQUARED","dailyNetProfit":66606.99,"closedBy":"Xiomara","closedAt":"2026-11-09T05:10:09.003Z","totalClosingEquivNIO":32921,"totalClosingNIO":31461,"totalClosingUSD":260,"closingNIO":{"500":37},"closingUSD":{"100":1},"netCashAfterTipsNIO":32921,"tipPaid":true,"totalTipCollected":7932,"tipDistributedTotal":7900,"loyversePaidOut":0,"formulaVersion":2}]'
)
JORNADAS = [
    {'fecha': '2026-11-07', 'turno': 'COMPLETO', 'estado': 'CERRADA', 'fondo_inicial': 5327, 'observaciones': OBS_7NOV},
    {'fecha': '2026-11-08', 'turno': 'COMPLETO', 'estado': 'CERRADA', 'fondo_inicial': 35, 'observaciones': OBS_8NOV},
    {'fecha': '2026-01-01', 'turno': 'CONFIG', 'estado': '', 'fondo_inicial': 0, 'observaciones': '[SYSTEM_CATALOGS:{}]'},
]


def gasto(fecha_hora, monto, categoria='MERCADO', metodo='EFECTIVO', concepto='Compra', proveedor='Proveedor', obs=''):
    return {'fecha_hora': fecha_hora, 'monto': monto, 'categoria': categoria, 'metodo_pago': metodo,
            'concepto': concepto, 'proveedor': proveedor, 'observaciones': obs}


GASTOS = [
    # 7-nov (totales reales del día): traslado de apertura 4,800, depósitos 22,024.99, gastos en efectivo 27,321.76
    gasto('2026-11-07T15:47:38+00:00', 4800, 'FONDEO', concepto='Traspaso inicial', proveedor='Traslado desde Caja General',
          obs='[OPENING_TRANSFER:TRUE] [TIPO:FONDEO]'),
    gasto('2026-11-07T18:22:38+00:00', 22024.99, 'FONDEO', concepto='Depositado en efectivo', obs='[TIPO:FONDEO]'),
    gasto('2026-11-07T16:00:00+00:00', 27321.76),
    gasto('2026-11-07T18:35:00+00:00', 19995.26, 'BEBIDAS_ALCOHOLICAS', 'TRANSFERENCIA'),
    # 8-nov: depósito 10,000, gastos en efectivo 7,766.25 (880 son propinas a meseros), tarjeta 8,701.24
    gasto('2026-11-08T17:35:43+00:00', 10000, 'FONDEO', concepto='Depositado en efectivo', obs='[TIPO:FONDEO]'),
    gasto('2026-11-08T17:46:58+00:00', 6886.25),
    gasto('2026-11-08T22:52:21+00:00', 880, 'PROPINAS'),
    gasto('2026-11-08T18:19:54+00:00', 8701.24, 'SUPERMERCADO', 'TARJETA'),
    # Un retiro de socios sale de caja chica pero no es gasto del negocio
    gasto('2026-11-08T20:00:00+00:00', 500, 'RETIRO_SOCIOS'),
]


class CalculoEfectivoTests(SimpleTestCase):
    def setUp(self):
        self.r = calcular_efectivo(JORNADAS, GASTOS, None, hoy='2026-11-09')
        self.dias = {d['fecha']: d for d in self.r['dias']}

    def test_queda_despues_de_la_propina(self):
        c = self.dias['2026-11-08']['cierre']
        self.assertEqual(c['contado_cs'], 31461)
        self.assertEqual(c['contado_usd'], 260)
        self.assertEqual(c['propina_entregada'], 7900)
        self.assertEqual(c['queda_cs'], 23561)  # la propina sale en córdobas
        self.assertEqual(c['queda_usd'], 260)   # los dólares quedan completos
        self.assertEqual(c['queda_total'], 32921)

    def test_propina_no_pagada_no_se_resta(self):
        c = self.dias['2026-11-07']['cierre']
        self.assertFalse(c['propina_pagada'])
        self.assertEqual(c['propina_entregada'], 0)
        self.assertEqual(c['queda_cs'], 8426)

    def test_destino_a_la_manana_siguiente(self):
        d = self.dias['2026-11-07']['destino']
        self.assertEqual(d['fecha'], '2026-11-08')
        self.assertEqual(d['usd_a_snyder'], 40)
        self.assertEqual(d['contado_al_abrir_cs'], 846)
        self.assertEqual(d['diferencia_cs'], -7580)
        self.assertIsNone(self.dias['2026-11-08']['destino'])  # aún no abre el 9

    def test_motivos_de_control_v1069(self):
        """Los motivos que pide Control (v1.0.69) llegan a la vista del jefe."""
        obs7 = OBS_7NOV.replace('"tipPaid":false,', '"tipPaid":false,"tipNotPaidReason":"Se entrega mañana en la mañana","closingNotes":"Todo en orden",')
        obs8 = OBS_8NOV.replace(
            '"openingNotes":"[Dólares apartados en sobre para Snyder: $40.00 USD]"',
            '"openingNotes":"[Dólares apartados en sobre para Snyder: $40.00 USD] • [Diferencia con el cierre de ayer: -C$ 7,580.00 · la propina se entregó en la mañana]"',
        )
        jornadas = [dict(JORNADAS[0], observaciones=obs7), dict(JORNADAS[1], observaciones=obs8)]
        dias = {d['fecha']: d for d in calcular_efectivo(jornadas, GASTOS, None, hoy='2026-11-09')['dias']}
        self.assertEqual(dias['2026-11-07']['cierre']['motivo_propina'], 'Se entrega mañana en la mañana')
        self.assertEqual(dias['2026-11-07']['cierre']['notas'], 'Todo en orden')
        self.assertEqual(dias['2026-11-07']['destino']['motivo'], 'la propina se entregó en la mañana')
        # El campo propio tiene prioridad sobre la nota
        obs8b = obs8.replace('"openedBy":"Xiomara","totalOpeningEquivNIO"', '"openedBy":"Xiomara","openingDiffReason":"Propina de anoche","totalOpeningEquivNIO"')
        jornadas[1] = dict(JORNADAS[1], observaciones=obs8b)
        dias = {d['fecha']: d for d in calcular_efectivo(jornadas, GASTOS, None, hoy='2026-11-09')['dias']}
        self.assertEqual(dias['2026-11-07']['destino']['motivo'], 'Propina de anoche')
        # Sin motivos: vacío
        self.assertEqual(self.dias['2026-11-07']['destino']['motivo'], '')
        self.assertEqual(self.dias['2026-11-08']['cierre']['motivo_propina'], '')

    def test_caja_chica_igual_que_control(self):
        cc7 = self.dias['2026-11-07']['caja_chica']
        self.assertEqual(cc7['esperado'], 30.23)  # el mismo saldo esperado que guardó Control
        self.assertEqual(cc7['contado'], 35)
        cc8 = self.dias['2026-11-08']['caja_chica']
        self.assertEqual(cc8['esperado'], round(35 + 10000 - 7766.25 - 500, 2))
        self.assertEqual(cc8['propinas_pagadas'], 880)
        self.assertEqual(self.r['caja_chica_actual']['fecha'], '2026-11-08')

    def test_ganancia_igual_que_control(self):
        res = self.dias['2026-11-08']['resultado']
        self.assertEqual(res['ventas'], 90974.48)
        self.assertEqual(res['gastos'], 16467.49)  # sin el retiro de socios
        self.assertEqual(res['ganancia'], 66606.99)  # lo mismo que guardó Control

    def test_orden_y_config(self):
        self.assertEqual([d['fecha'] for d in self.r['dias']], ['2026-11-08', '2026-11-07'])
        self.assertFalse(self.r['tega_conectado'])
        self.assertIsNone(self.r['en_vivo'])

    def test_turno_tega_en_vivo(self):
        tega = {'turnos': [
            {'id': 'a', 'estado': 'cerrado', 'abierto': 1794158897000, 'contado': 31461, 'contadoUsd': 260,
             'esperado': 31595.5, 'esperadoUsd': 260, 'propinas': 7932, 'ventas': 83000, 'salidasCS': 0},
            {'id': 'b', 'estado': 'abierto', 'abierto': 1794245000000, 'fondo': 900, 'esperado': 15400,
             'esperadoUsd': 35, 'propinas': 2100, 'ventas': 40000, 'salidasCS': 500},
        ]}
        r = calcular_efectivo(JORNADAS, GASTOS, tega, hoy='2026-11-09')
        self.assertEqual(r['en_vivo']['esperado_cs'], 15400)
        self.assertEqual(r['en_vivo']['queda_si_entrega_propina_cs'], 13300)
        t = {d['fecha']: d for d in r['dias']}['2026-11-08']['tega']
        self.assertEqual(t['descuadre_cs'], -134.5)

    def test_fondeo_por_palabras(self):
        self.assertTrue(es_fondeo({'concepto': 'Depósito a caja chica'}))
        self.assertFalse(es_fondeo({'concepto': 'Compra de tomates', 'categoria': 'MERCADO'}))


class EfectivoEndpointTests(TestCase):
    def test_pide_sesion_del_panel(self):
        r = Client().get('/api/control/efectivo/')
        self.assertIn(r.status_code, (401, 403))

    def test_sin_supabase_avisa(self):
        user = get_user_model().objects.create_user('gerente', is_staff=True)
        c = Client()
        c.force_login(user)
        r = c.get('/api/control/efectivo/')
        self.assertEqual(r.status_code, 503)
