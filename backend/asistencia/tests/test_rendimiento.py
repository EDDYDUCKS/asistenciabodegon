"""
Los listados del panel no deben hacer una consulta por cada fila: en Render (1 worker,
0.15 CPU) contra Supabase cada consulta extra suma latencia a toda la pantalla.
"""
import datetime

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from asistencia.models import CompensacionFeriado, DiaFeriado, Empleado, RegistroAsistencia
from asistencia.views import _evaluar_y_autoacreditar_feriados_pendientes

from .base import NominaTestCase, local_dt


class ListadoAsistenciaTests(NominaTestCase):
    def test_consultas_no_crecen_con_los_registros(self):
        ayer = timezone.localdate() - datetime.timedelta(days=1)
        con_foto = self.registrar('ENTRADA', ayer, 8)
        con_foto.foto_base64 = 'aGVsbG8='
        con_foto.save()
        for hora in range(9, 19):
            self.registrar('SALIDA_QUEBRADA', ayer, hora)

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get('/api/asistencia/')

        self.assertEqual(response.status_code, 200)
        self.assertLess(len(ctx.captured_queries), 6)
        urls = {r['id']: r['foto_verificacion_url'] for r in response.json()}
        self.assertIn(f'/api/asistencia/{con_foto.id}/foto/', urls[con_foto.id])
        self.assertEqual(sum(1 for u in urls.values() if u), 1)


class BarridoFeriadosTests(NominaTestCase):
    def setUp(self):
        super().setUp()
        hoy = timezone.localdate()
        self.otros = [
            Empleado.objects.create(nombre=f'Otro{i}', apellido='X', cargo='ATENCION_CLIENTE', tipo_turno='CORRIDO')
            for i in range(4)
        ]
        self.feriado_laborado = hoy - datetime.timedelta(days=3)
        DiaFeriado.objects.create(fecha=self.feriado_laborado, descripcion='Feriado laborado')
        for k in range(1, 6):
            DiaFeriado.objects.create(fecha=hoy - datetime.timedelta(days=30 * k), descripcion=f'Viejo {k}')
        self.registrar('ENTRADA', self.feriado_laborado, 8)
        self.registrar('SALIDA_DEFINITIVA', self.feriado_laborado, 16)

    def test_acredita_feriado_laborado(self):
        _evaluar_y_autoacreditar_feriados_pendientes()

        comp = CompensacionFeriado.objects.get(empleado=self.empleado, fecha_feriado=self.feriado_laborado)
        self.assertEqual(comp.estado, 'VACACIONES')
        self.assertEqual(CompensacionFeriado.objects.count(), 1)

    def test_consultas_no_crecen_con_empleados_y_feriados(self):
        _evaluar_y_autoacreditar_feriados_pendientes()

        with CaptureQueriesContext(connection) as ctx:
            _evaluar_y_autoacreditar_feriados_pendientes()

        self.assertLess(len(ctx.captured_queries), 6)
