"""
Regresiones de la revisión de errores del 24/10/2026: sincronización offline del kiosco,
reglas de la Bolsa de Horas al recalcular y validación del pago de horas extra.
"""
import datetime
import os
from unittest import mock

from django.test import Client

from asistencia import views
from asistencia.models import AutorizacionHorasExtra, RegistroAsistencia
from asistencia.tests.base import LUNES, NominaTestCase, local_dt

OCT_30 = datetime.date(2026, 10, 30)  # viernes
NOV_2 = datetime.date(2026, 11, 2)    # lunes


@mock.patch.object(views, 'SYNC_OFFLINE_DESDE', local_dt(LUNES, 0))
class SincronizacionOfflineTests(NominaTestCase):
    def sync(self, *horas):
        items = [
            {'qr_code_token': self.empleado.qr_code_token, 'tipo_evento': 'AUTODETECT',
             'fecha_hora': local_dt(LUNES, h, m).isoformat()}
            for h, m in horas
        ]
        # El kiosco no inicia sesión
        return Client().post('/api/asistencia/sync-batch/', items, content_type='application/json')

    def tipos(self):
        return list(RegistroAsistencia.objects.order_by('fecha_hora').values_list('tipo_evento', flat=True))

    def test_kiosco_sin_sesion_puede_sincronizar(self):
        res = self.sync((9, 0), (17, 0))
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.tipos(), ['ENTRADA', 'SALIDA_DEFINITIVA'])

    def test_reenvio_del_lote_no_duplica(self):
        self.sync((9, 0), (17, 0))
        self.assertEqual(self.sync((9, 0), (17, 0)).status_code, 200)
        self.assertEqual(self.tipos(), ['ENTRADA', 'SALIDA_DEFINITIVA'])

    def test_doble_escaneo_offline_se_ignora(self):
        self.sync((9, 0), (9, 1))
        self.assertEqual(self.tipos(), ['ENTRADA'])
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)

    def test_marcas_anteriores_a_la_reparacion_se_descartan(self):
        with mock.patch.object(views, 'SYNC_OFFLINE_DESDE', local_dt(LUNES, 12)):
            res = self.sync((9, 0))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['sincronizados'][0]['status'], 'descartado')
        self.assertEqual(self.tipos(), [])

    def test_marca_offline_vieja_no_mira_marcas_posteriores(self):
        self.registrar('ENTRADA', LUNES, 12, 0)
        self.sync((9, 0))
        self.assertEqual(RegistroAsistencia.objects.order_by('fecha_hora').first().tipo_evento, 'ENTRADA')


class BolsaDeHorasTests(NominaTestCase):
    def test_recalculo_respeta_tolerancia_de_10_minutos(self):
        self.marcar(LUNES, 9, 0)
        self.marcar(LUNES, 16, 55)
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)
        views._recalcular_horas_pendientes_empleado(self.empleado, LUNES)
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)

    def test_recalculo_ignora_marcaje_tecnico(self):
        self.registrar('ENTRADA', LUNES, 9, 0)
        self.registrar('SALIDA_DEFINITIVA', LUNES, 9, 6)
        views._recalcular_horas_pendientes_empleado(self.empleado, LUNES)
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)

    def test_deuda_se_reinicia_al_cambiar_de_mes(self):
        self.marcar(OCT_30, 9, 0)
        self.marcar(OCT_30, 12, 0)
        self.assertEqual(float(self.recargar().horas_pendientes), 5.0)
        self.marcar(NOV_2, 9, 0)
        self.marcar(NOV_2, 12, 0)
        emp = self.recargar()
        self.assertEqual(float(emp.horas_pendientes), 5.0)
        self.assertEqual(emp.periodo_horas_pendientes, datetime.date(2026, 11, 1))
        # El recálculo da lo mismo que el kiosco
        views._recalcular_horas_pendientes_empleado(self.empleado, NOV_2)
        self.assertEqual(float(self.recargar().horas_pendientes), 5.0)

    def test_corregir_marca_de_mes_cerrado_no_toca_el_mes_vigente(self):
        self.marcar(OCT_30, 9, 0)
        self.marcar(OCT_30, 12, 0)
        self.marcar(NOV_2, 9, 0)
        self.marcar(NOV_2, 12, 0)
        views._recalcular_horas_pendientes_empleado(self.empleado, OCT_30)
        emp = self.recargar()
        self.assertEqual(float(emp.horas_pendientes), 5.0)
        self.assertEqual(emp.periodo_horas_pendientes, datetime.date(2026, 11, 1))


@mock.patch.dict(os.environ, {'ADMIN_PAYROLL_PIN': '554433'})
class PagoHorasExtraTests(NominaTestCase):
    def setUp(self):
        super().setUp()
        self.empleado.tarifa_hora = 60
        self.empleado.save()

    def pagar(self, *autorizaciones):
        return self.client.post('/api/pagos-horas-extra/', {
            'pin': '554433', 'empleado': self.empleado.id,
            'horas_extra_ids': [a.id for a in autorizaciones],
            'total_horas_pagadas': '2', 'tarifa_hora_aplicada': '50', 'monto_total': '100',
        }, content_type='application/json')

    def autorizacion(self, dia, estado='APROBADO'):
        return AutorizacionHorasExtra.objects.create(
            empleado=self.empleado, fecha=dia, horas_extra_solicitadas=2,
            horas_extra_autorizadas=2, estado=estado,
        )

    def test_no_se_paga_dos_veces(self):
        he = self.autorizacion(LUNES)
        self.assertEqual(self.pagar(he).status_code, 201)
        self.assertEqual(self.pagar(he).status_code, 400)

    def test_no_se_pagan_horas_sin_aprobar(self):
        he = self.autorizacion(LUNES, estado='PENDIENTE')
        self.assertEqual(self.pagar(he).status_code, 400)

    def test_servidor_calcula_monto_al_doble_de_la_tarifa(self):
        he = self.autorizacion(LUNES)
        res = self.pagar(he)  # la pantalla manda tarifa 50 y monto 100; se ignoran
        self.assertEqual(res.status_code, 201)
        self.assertEqual(float(res.json()['tarifa_hora_aplicada']), 120.0)
        self.assertEqual(float(res.json()['monto_total']), 240.0)
        self.assertEqual(float(res.json()['total_horas_pagadas']), 2.0)

    def test_sin_tarifa_no_se_paga(self):
        self.empleado.tarifa_hora = 0
        self.empleado.save()
        self.assertEqual(self.pagar(self.autorizacion(LUNES)).status_code, 400)
