"""
Vacaciones: acreditación por día laborado (Art. 76 CT, 2.5 días/mes),
saldo disponible y boletas de pago en dinero.
"""
import datetime
import unittest
from decimal import Decimal
from unittest import mock

from django.utils import timezone

from asistencia.models import PagoVacaciones, PermisoAusencia
from asistencia.views import _obtener_dias_vacaciones_disponibles, _verificar_acreditacion_vacaciones_empleado

from .base import NominaTestCase, local_dt

AHORA = local_dt(datetime.date(2026, 11, 2), 12)


class PermisoAusenciaTests(NominaTestCase):
    def permiso(self, inicio, fin, descansos=0, tipo='VACACIONES', motivo=''):
        return PermisoAusencia.objects.create(
            empleado=self.empleado, tipo=tipo, fecha_inicio=inicio, fecha_fin=fin,
            dias_descanso_semanal=descansos, motivo=motivo,
        )

    def test_total_dias_descuenta_descansos(self):
        p = self.permiso(datetime.date(2026, 10, 1), datetime.date(2026, 10, 10), descansos=1)
        self.assertEqual(p.dias_calendario, 10)
        self.assertEqual(p.total_dias, 9)

    def test_total_dias_nunca_menor_a_uno(self):
        p = self.permiso(datetime.date(2026, 10, 4), datetime.date(2026, 10, 4), descansos=1)
        self.assertEqual(p.total_dias, 1)

    def test_saldo_disponible(self):
        self.empleado.dias_vacaciones_acumuladas = Decimal('10.00')
        self.empleado.save()
        self.permiso(datetime.date(2026, 10, 1), datetime.date(2026, 10, 3))
        self.permiso(datetime.date(2026, 10, 5), datetime.date(2026, 10, 6), tipo='PERMISO_AUTORIZADO', motivo='A cuenta de Vacaciones')
        self.permiso(datetime.date(2026, 10, 7), datetime.date(2026, 10, 11), tipo='INCAPACIDAD_MEDICA')
        self.assertEqual(_obtener_dias_vacaciones_disponibles(self.empleado), Decimal('5.00'))


@mock.patch('django.utils.timezone.now', return_value=AHORA)
class AcreditacionVacacionesTests(NominaTestCase):
    def setUp(self):
        super().setUp()
        self.empleado.ultimo_corte_vacaciones = datetime.date(2026, 9, 30)
        self.empleado.save()

    def test_solo_acredita_dias_con_asistencia(self, _now):
        for dia in (1, 2, 5):
            self.registrar('ENTRADA', datetime.date(2026, 10, dia), 12)

        self.assertTrue(_verificar_acreditacion_vacaciones_empleado(self.empleado, datetime.date(2026, 10, 7)))

        emp = self.recargar()
        self.assertEqual(emp.dias_vacaciones_acumuladas, Decimal('0.25'))  # 3 × 2.5 / 30
        self.assertEqual(emp.ultimo_corte_vacaciones, datetime.date(2026, 10, 7))

    def test_no_acredita_dos_veces_el_mismo_periodo(self, _now):
        self.registrar('ENTRADA', datetime.date(2026, 10, 1), 12)
        _verificar_acreditacion_vacaciones_empleado(self.empleado, datetime.date(2026, 10, 7))
        self.assertFalse(_verificar_acreditacion_vacaciones_empleado(self.empleado, datetime.date(2026, 10, 7)))

    def test_nunca_evalua_el_dia_en_curso(self, _now):
        hoy = AHORA.astimezone(timezone.get_current_timezone()).date()
        _verificar_acreditacion_vacaciones_empleado(self.empleado, hoy)
        self.assertEqual(self.recargar().ultimo_corte_vacaciones, hoy - datetime.timedelta(days=1))

    def test_empleado_inactivo_no_acredita(self, _now):
        self.empleado.activo = False
        self.empleado.save()
        self.registrar('ENTRADA', datetime.date(2026, 10, 1), 12)
        self.assertFalse(_verificar_acreditacion_vacaciones_empleado(self.empleado, datetime.date(2026, 10, 7)))

    def test_mes_completo_en_un_corte_da_dos_dias_y_medio(self, _now):
        for dia in range(1, 31):
            self.registrar('ENTRADA', datetime.date(2026, 10, dia), 12)
        _verificar_acreditacion_vacaciones_empleado(self.empleado, datetime.date(2026, 10, 30))
        self.assertEqual(self.recargar().dias_vacaciones_acumuladas, Decimal('2.50'))

    @unittest.expectedFailure
    def test_mes_completo_con_cortes_diarios_da_dos_dias_y_medio(self, _now):
        # ERROR CONOCIDO: EmpleadoViewSet.list acredita a diario, y cada corte redondea
        # 2.5/30 = 0.0833 a 0.08. Tras 30 días laborados queda en 2.40 en vez de 2.50.
        for dia in range(1, 31):
            fecha = datetime.date(2026, 10, dia)
            self.registrar('ENTRADA', fecha, 12)
            _verificar_acreditacion_vacaciones_empleado(self.recargar(), fecha)
        self.assertEqual(self.recargar().dias_vacaciones_acumuladas, Decimal('2.50'))


class PagoVacacionesApiTests(NominaTestCase):
    def setUp(self):
        super().setUp()
        self.empleado.dias_vacaciones_acumuladas = Decimal('5.00')
        self.empleado.save()
        PermisoAusencia.objects.create(
            empleado=self.empleado, tipo='VACACIONES',
            fecha_inicio=datetime.date(2026, 10, 1), fecha_fin=datetime.date(2026, 10, 2),
        )

    def pagar(self, dias):
        return self.client.post('/api/pagos-vacaciones/', {
            'empleado': self.empleado.id, 'dias_pagados': dias, 'monto_pagado': '1000.00',
        })

    def test_no_permite_pagar_mas_que_el_saldo(self):
        response = self.pagar('4')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(PagoVacaciones.objects.exists())

    def test_pago_descuenta_saldo_y_emite_boleta(self):
        response = self.pagar('2')
        self.assertEqual(response.status_code, 201, response.content)

        pago = PagoVacaciones.objects.get()
        anio = timezone.localdate().strftime('%Y')
        self.assertEqual(pago.numero_recibo, f'BVP-{anio}-0001')
        self.assertEqual(pago.dias_saldo_anterior, Decimal('3.00'))
        self.assertEqual(pago.dias_saldo_nuevo, Decimal('1.00'))
        self.assertEqual(self.recargar().dias_vacaciones_acumuladas, Decimal('3.00'))

    def test_anular_boleta_reintegra_dias(self):
        self.pagar('2')
        pago = PagoVacaciones.objects.get()
        response = self.client.delete(f'/api/pagos-vacaciones/{pago.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.recargar().dias_vacaciones_acumuladas, Decimal('5.00'))
