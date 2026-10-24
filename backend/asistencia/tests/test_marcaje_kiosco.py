"""
Secuencias de marcaje en el kiosco (antes test_auto_scan.py) y cálculo de
horas netas del día.
"""
from asistencia.models import RegistroAsistencia
from asistencia.views import _calcular_horas_netas_dia

from .base import MIERCOLES, NominaTestCase


class AutodeteccionKioscoTests(NominaTestCase):
    def test_turno_quebrado_cuatro_escaneos(self):
        tipos = [
            self.marcar(MIERCOLES, h)['registro']['tipo_evento']
            for h in (12, 15, 18, 23)
        ]
        self.assertEqual(tipos, ['ENTRADA', 'SALIDA_QUEBRADA', 'ENTRADA_QUEBRADA', 'SALIDA_DEFINITIVA'])

    def test_turno_corrido_dos_escaneos(self):
        self.marcar(MIERCOLES, 12)
        salida = self.marcar(MIERCOLES, 20)
        self.assertEqual(salida['registro']['tipo_evento'], 'SALIDA_DEFINITIVA')
        self.assertEqual(salida['horas_trabajadas_hoy'], 8.0)
        self.assertTrue(salida['cumplio_meta_8h'])

    def test_rebote_menor_a_cinco_minutos_no_duplica(self):
        self.marcar(MIERCOLES, 12)
        rebote = self.marcar(MIERCOLES, 12, 3)
        self.assertEqual(rebote['status'], 'cooldown')
        self.assertEqual(RegistroAsistencia.objects.filter(empleado=self.empleado).count(), 1)

    def test_cierre_trasnoche_cuenta_para_el_dia_anterior(self):
        self.marcar(MIERCOLES, 15)
        salida = self.marcar(MIERCOLES.replace(day=15), 0, 30)
        self.assertEqual(salida['registro']['tipo_evento'], 'SALIDA_DEFINITIVA')
        self.assertEqual(salida['horas_trabajadas_hoy'], 9.5)


class HorasNetasDiaTests(NominaTestCase):
    def horas(self, *marcajes):
        regs = [self.registrar(tipo, MIERCOLES, h, m) for tipo, h, m in marcajes]
        return _calcular_horas_netas_dia(regs)

    def test_corrido_completo(self):
        self.assertAlmostEqual(self.horas(('ENTRADA', 12, 0), ('SALIDA_DEFINITIVA', 20, 0)), 8.0)

    def test_llegada_temprana_cuenta_desde_hora_oficial(self):
        # 11:40 para el turno de 12:00 PM: la jornada arranca a las 12:00.
        self.assertAlmostEqual(self.horas(('ENTRADA', 11, 40), ('SALIDA_DEFINITIVA', 20, 0)), 8.0)

    def test_quebrado_completo(self):
        horas = self.horas(
            ('ENTRADA', 12, 0), ('SALIDA_QUEBRADA', 15, 0),
            ('ENTRADA_QUEBRADA', 18, 0), ('SALIDA_DEFINITIVA', 23, 0),
        )
        self.assertAlmostEqual(horas, 8.0)

    def test_retorno_temprano_de_pausa_cuenta_desde_hora_oficial(self):
        horas = self.horas(
            ('ENTRADA', 12, 0), ('SALIDA_QUEBRADA', 15, 0),
            ('ENTRADA_QUEBRADA', 17, 45), ('SALIDA_DEFINITIVA', 23, 0),
        )
        self.assertAlmostEqual(horas, 8.0)

    def test_llegada_tarde_resta_horas(self):
        self.assertAlmostEqual(self.horas(('ENTRADA', 13, 0), ('SALIDA_DEFINITIVA', 20, 0)), 7.0)

    def test_entrada_sin_salida_no_suma(self):
        self.assertEqual(self.horas(('ENTRADA', 12, 0)), 0.0)
