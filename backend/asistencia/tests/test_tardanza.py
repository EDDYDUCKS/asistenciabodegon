"""
Tardanza (tolerancia de 10 min, grave desde 11 min) y salidas anticipadas
(antes test_extreme_late.py y test_shifts.py).
"""
from asistencia.models import AlertaAsistencia
from asistencia.views import _evaluar_alertas_asistencia

from .base import DOMINGO, MIERCOLES, NominaTestCase


class TardanzaEntradaTests(NominaTestCase):
    def evaluar_entrada(self, hora, minuto, observacion=None):
        reg = self.registrar('ENTRADA', MIERCOLES, hora, minuto, observacion=observacion)
        return _evaluar_alertas_asistencia(reg, self.empleado, [reg], 0.0)

    def test_diez_minutos_es_tolerancia(self):
        info = self.evaluar_entrada(12, 10)
        self.assertFalse(info['es_tardanza'])
        self.assertFalse(AlertaAsistencia.objects.filter(tipo='TARDANZA').exists())

    def test_once_minutos_es_tardanza(self):
        info = self.evaluar_entrada(12, 11)
        self.assertTrue(info['es_tardanza'])
        self.assertEqual(info['minutos_tardanza'], 11)
        self.assertEqual(info['turno_esperado'], '12:00 PM')
        self.assertEqual(AlertaAsistencia.objects.filter(tipo='TARDANZA').count(), 1)

    def test_ventanas_de_turno(self):
        casos = [
            ((9, 15), '9:00 AM', 15),
            ((10, 20), '10:00 AM', 20),
            ((13, 29), '12:00 PM', 89),
            ((15, 30), '3:00 PM', 30),
            ((17, 20), '5:00 PM', 20),
            ((18, 15), '6:00 PM', 15),
        ]
        for (h, m), turno, minutos in casos:
            with self.subTest(hora=f'{h}:{m:02d}'):
                info = self.evaluar_entrada(h, m)
                self.assertEqual(info['turno_esperado'], turno)
                self.assertEqual(info['minutos_tardanza'], minutos)

    def test_turno_declarado_por_administracion(self):
        # Sin turno manual 10:20 cae en la ventana de 10:00 AM (20 min); con [TURNO:9:00 AM] son 80.
        info = self.evaluar_entrada(10, 20, observacion='[TURNO:9:00 AM]')
        self.assertEqual(info['turno_esperado'], '9:00 AM')
        self.assertEqual(info['minutos_tardanza'], 80)

    def test_kiosco_avisa_tardanza(self):
        res = self.marcar(MIERCOLES, 13, 0)
        self.assertTrue(res['es_tardanza'])
        self.assertEqual(res['minutos_tardanza'], 60)
        self.assertIn('TARDANZA', res['mensaje'])


class TardanzaRetornoPausaTests(NominaTestCase):
    def evaluar_retorno(self, entrada, pausa, retorno):
        regs = [
            self.registrar('ENTRADA', MIERCOLES, *entrada),
            self.registrar('SALIDA_QUEBRADA', MIERCOLES, *pausa),
            self.registrar('ENTRADA_QUEBRADA', MIERCOLES, *retorno),
        ]
        return _evaluar_alertas_asistencia(regs[-1], self.empleado, regs, 0.0)

    def test_retorno_6pm_con_tolerancia(self):
        self.assertFalse(self.evaluar_retorno((12, 0), (15, 0), (18, 10))['es_tardanza'])

    def test_retorno_6pm_tarde(self):
        info = self.evaluar_retorno((12, 0), (15, 0), (18, 11))
        self.assertTrue(info['es_tardanza'])
        self.assertEqual(info['turno_esperado'], '6:00 PM')

    def test_turno_11am_regresa_a_las_7pm(self):
        self.assertFalse(self.evaluar_retorno((11, 0), (15, 0), (19, 5))['es_tardanza'])
        info = self.evaluar_retorno((11, 0), (15, 0), (19, 15))
        self.assertEqual(info['turno_esperado'], '7:00 PM')
        self.assertEqual(info['minutos_tardanza'], 15)


class SalidaAnticipadaTests(NominaTestCase):
    def test_salida_temprana_genera_alerta(self):
        self.marcar(MIERCOLES, 12)
        self.marcar(MIERCOLES, 18, 30, tipo_evento='SALIDA_DEFINITIVA')
        self.assertTrue(AlertaAsistencia.objects.filter(empleado=self.empleado, tipo='SALIDA_ANTICIPADA').exists())

    def test_domingo_no_alerta_salida_temprana(self):
        self.marcar(DOMINGO, 12)
        self.marcar(DOMINGO, 18, 30, tipo_evento='SALIDA_DEFINITIVA')
        self.assertFalse(AlertaAsistencia.objects.filter(empleado=self.empleado, tipo='SALIDA_ANTICIPADA').exists())

    def test_turno_5pm_solo_exige_seis_horas(self):
        self.marcar(MIERCOLES, 17)
        self.marcar(MIERCOLES, 23)
        self.assertFalse(AlertaAsistencia.objects.filter(empleado=self.empleado, tipo='SALIDA_ANTICIPADA').exists())

    def test_falta_entrada_de_quiebre(self):
        self.marcar(MIERCOLES, 12)
        self.marcar(MIERCOLES, 15)  # pausa
        res = self.marcar(MIERCOLES, 23)  # salida sin retorno
        self.assertTrue(res['advertencia_quiebre'])
        self.assertTrue(AlertaAsistencia.objects.filter(empleado=self.empleado, tipo='REGISTRO_INCOMPLETO').exists())
