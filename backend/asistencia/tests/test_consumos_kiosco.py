"""
Consumos del personal en el kiosco: cada colaborador ve solo los suyos (el servidor los busca por el empleado
del carnet), con detalle y totales por quincena. Los anulados se ven pero no suman.
"""
from datetime import datetime, timezone as dt_timezone
from unittest import mock

from django.test import Client
from django.utils import timezone

from asistencia.consumos_tega import armar_consumos

from .base import NominaTestCase


def ms(y, m, d, h=12):
    tz = timezone.get_current_timezone()
    return int(datetime(y, m, d, h, tzinfo=tz).timestamp() * 1000)


def pago(t, total, credito=True, anulado=False, numero=1):
    d = {'t': t, 'numero': numero, 'tipo': 'personal', 'subtotal': round(total / 0.9, 2), 'descInterno': round(total / 9, 2),
         'total': total, 'cobradoPor': 'Xiomara', 'consumo': {'nombre': 'Crédito personal'},
         'lineas': [{'cant': 1, 'nombre': 'Victoria clásica', 'precio': round(total / 0.9, 2)}],
         'partes': [{'metodo': 'personal', 'monto': total}] if credito else [{'metodo': 'efectivo', 'monto': total}]}
    if anulado:
        d.update({'anulado': True, 'motivoAnulacion': 'Duplicado'})
    return d


class ArmarConsumosTests(NominaTestCase):
    def test_totales_por_quincena_y_anulados(self):
        ahora = datetime.fromtimestamp(ms(2026, 11, 10) / 1000, dt_timezone.utc)
        filas = [
            ('a', pago(ms(2026, 11, 8), 63, numero=91)),
            ('b', pago(ms(2026, 11, 9), 135, credito=False, numero=92)),
            ('c', pago(ms(2026, 11, 9), 108, anulado=True, numero=93)),
            ('d', pago(ms(2026, 10, 20), 90, numero=40)),
            # 2 a. m. del 1-nov cuenta todavía como día 31-oct (el día empieza a las 5 a. m.)
            ('e', pago(ms(2026, 11, 1, 2), 45, numero=50)),
        ]
        r = armar_consumos(filas, ahora=ahora)
        self.assertEqual(r['quincena']['cuentas'], 2)
        self.assertEqual(r['quincena']['a_cuenta'], 63)
        self.assertEqual(r['quincena']['pagado'], 135)
        self.assertEqual(r['quincena_pasada']['a_cuenta'], 135)
        self.assertEqual([t['numero'] for t in r['tickets']], [92, 93, 91, 50, 40])
        anulado = next(t for t in r['tickets'] if t['numero'] == 93)
        self.assertTrue(anulado['anulado'])
        self.assertEqual(anulado['motivo_anulacion'], 'Duplicado')
        self.assertEqual(r['tickets'][0]['lineas'][0]['nombre'], 'Victoria clásica')


class ConsultaKioscoTests(NominaTestCase):
    def test_busca_solo_los_del_empleado_del_carnet(self):
        with mock.patch('asistencia.views.consumos_de_empleado', return_value={'tickets': []}) as m:
            res = Client().post('/api/kiosco/consultar/', {'qr_token': self.empleado.qr_code_token, 'empleado_id': 999},
                                content_type='application/json')
        self.assertEqual(res.status_code, 200)
        m.assert_called_once_with(self.empleado.id)
        self.assertEqual(res.json()['consumos'], {'tickets': []})

    def test_sin_tega_no_rompe(self):
        res = Client().post('/api/kiosco/consultar/', {'qr_token': self.empleado.qr_code_token}, content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json()['consumos'])
