"""
Horas extra, bolsa de horas (deuda) y redondeo oficial.
"""
import datetime

from asistencia.models import AlertaAsistencia, AutorizacionHorasExtra, CompensacionHoras
from asistencia.views import (_calcular_horas_extra_redondeadas, _procesar_compensacion_y_horas_extra,
                              _recalcular_horas_pendientes_empleado)

from .base import DOMINGO, LUNES, MIERCOLES, NominaTestCase


class RedondeoHorasExtraTests(NominaTestCase):
    def test_tabla_de_redondeo(self):
        casos = [
            (0, 0.0), (29, 0.0),          # menos de 30 min no es hora extra
            (30, 0.5), (59, 0.5),         # de 30 a 59 min queda en media hora
            (60, 1.0), (79, 1.0),         # 1h a 1h19m
            (80, 1.5), (107, 1.5),        # 1h20m a 1h47m
            (108, 2.0),                   # 1h48m sube a la siguiente hora
            (228, 4.0),                   # 3h48m (caso Doña Nelly)
        ]
        for minutos, esperado in casos:
            with self.subTest(minutos=minutos):
                self.assertEqual(_calcular_horas_extra_redondeadas(minutos / 60), esperado)

    def test_valores_no_positivos(self):
        self.assertEqual(_calcular_horas_extra_redondeadas(0), 0.0)
        self.assertEqual(_calcular_horas_extra_redondeadas(-1.5), 0.0)
        self.assertEqual(_calcular_horas_extra_redondeadas(None), 0.0)


class HorasExtraKioscoTests(NominaTestCase):
    def test_jornada_larga_genera_solicitud_pendiente(self):
        self.marcar(MIERCOLES, 12)
        salida = self.marcar(MIERCOLES, 21, 30)  # 9.5 h

        self.assertEqual(salida['compensacion']['horas_extra_solicitadas'], 1.5)
        solicitud = AutorizacionHorasExtra.objects.get(empleado=self.empleado, fecha=MIERCOLES)
        self.assertEqual(solicitud.estado, 'PENDIENTE')
        self.assertEqual(float(solicitud.horas_extra_solicitadas), 1.5)

    def test_excedente_menor_a_media_hora_no_genera_solicitud(self):
        self.marcar(MIERCOLES, 12)
        self.marcar(MIERCOLES, 20, 25, tipo_evento='SALIDA_DEFINITIVA')  # 8h25m
        self.assertFalse(AutorizacionHorasExtra.objects.filter(empleado=self.empleado).exists())

    def test_excedente_amortiza_deuda_antes_de_solicitar_extra(self):
        self.empleado.horas_pendientes = 1.0
        self.empleado.save()

        self.marcar(MIERCOLES, 12)
        salida = self.marcar(MIERCOLES, 21, 30)  # +1.5 h

        self.assertEqual(salida['compensacion']['horas_amortizadas'], 1.0)
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)
        comp = CompensacionHoras.objects.get(empleado=self.empleado)
        self.assertEqual(float(comp.horas_deducidas), 1.0)
        solicitud = AutorizacionHorasExtra.objects.get(empleado=self.empleado, fecha=MIERCOLES)
        self.assertEqual(float(solicitud.horas_extra_solicitadas), 0.5)

    def test_excedente_menor_que_deuda_no_genera_solicitud(self):
        self.empleado.horas_pendientes = 3.0
        self.empleado.save()

        self.marcar(MIERCOLES, 12)
        self.marcar(MIERCOLES, 21, 30)

        self.assertEqual(float(self.recargar().horas_pendientes), 1.5)
        self.assertFalse(AutorizacionHorasExtra.objects.filter(empleado=self.empleado).exists())


class DeudaJornadaCortaTests(NominaTestCase):
    def test_jornada_corta_acumula_deuda_y_alerta(self):
        self.marcar(MIERCOLES, 12)
        salida = self.marcar(MIERCOLES, 18, 30, tipo_evento='SALIDA_DEFINITIVA')  # 6.5 h

        self.assertEqual(salida['compensacion']['deficit_dia'], 1.5)
        self.assertEqual(float(self.recargar().horas_pendientes), 1.5)
        self.assertTrue(AlertaAsistencia.objects.filter(empleado=self.empleado, tipo='DEFICIT_JORNADA').exists())

    def test_tolerancia_de_diez_minutos(self):
        self.marcar(MIERCOLES, 12)
        self.marcar(MIERCOLES, 19, 50, tipo_evento='SALIDA_DEFINITIVA')  # 7h50m
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)

    def test_once_minutos_menos_si_genera_deuda(self):
        self.marcar(MIERCOLES, 12)
        self.marcar(MIERCOLES, 19, 49, tipo_evento='SALIDA_DEFINITIVA')  # 7h49m
        self.assertEqual(float(self.recargar().horas_pendientes), 0.2)

    def test_domingo_salida_temprana_genera_deuda(self):
        # El domingo cuenta igual que cualquier día si no se queda al cierre
        self.marcar(DOMINGO, 12)
        self.marcar(DOMINGO, 18, 30, tipo_evento='SALIDA_DEFINITIVA')
        self.assertEqual(float(self.recargar().horas_pendientes), 1.5)

    def test_domingo_cierre_1030_cumple_con_siete_y_media(self):
        self.marcar(DOMINGO, 15)
        self.marcar(DOMINGO, 22, 30)
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)

    def test_domingo_cierre_con_menos_de_siete_y_media_debe_la_diferencia(self):
        self.marcar(DOMINGO, 15, 30)
        self.marcar(DOMINGO, 22, 30)
        self.assertEqual(float(self.recargar().horas_pendientes), 0.5)

    def test_recalculo_respeta_regla_del_domingo(self):
        self.registrar('ENTRADA', DOMINGO, 12)
        self.registrar('SALIDA_DEFINITIVA', DOMINGO, 18, 30)
        _recalcular_horas_pendientes_empleado(self.empleado, DOMINGO)
        self.assertEqual(float(self.recargar().horas_pendientes), 1.5)

    def test_antes_del_corte_10_octubre_no_genera_deuda(self):
        dia = datetime.date(2026, 10, 7)
        self.marcar(dia, 12)
        self.marcar(dia, 18, 30, tipo_evento='SALIDA_DEFINITIVA')
        self.assertEqual(float(self.recargar().horas_pendientes), 0.0)


class SeptimoDiaTests(NominaTestCase):
    def test_septimo_dia_todas_las_horas_son_extra(self):
        for i in range(6):  # lunes a sábado
            self.registrar('ENTRADA', LUNES + datetime.timedelta(days=i), 12)

        res = _procesar_compensacion_y_horas_extra(self.empleado, DOMINGO, 5.0)

        self.assertTrue(res['es_septimo_dia'])
        self.assertEqual(res['horas_extra_solicitadas'], 5.0)
        solicitud = AutorizacionHorasExtra.objects.get(empleado=self.empleado, fecha=DOMINGO)
        self.assertIn('[7mo Día Trabajado]', solicitud.comentario)

    def test_cinco_dias_previos_no_es_septimo(self):
        for i in range(5):
            self.registrar('ENTRADA', LUNES + datetime.timedelta(days=i), 12)
        res = _procesar_compensacion_y_horas_extra(self.empleado, LUNES + datetime.timedelta(days=5), 8.0)
        self.assertNotIn('es_septimo_dia', res)
