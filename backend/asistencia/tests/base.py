"""
Utilidades compartidas por las pruebas de nómina.

Todas las fechas se expresan en hora de Nicaragua (America/Managua). La semana
de referencia es del lunes 12 al domingo 18 de octubre de 2026, posterior al
corte de déficit del 10/10/2026 que aplica views._acumular_horas_pendientes.
"""
import datetime

from django.test import Client, TestCase
from django.utils import timezone

from asistencia.models import Empleado, RegistroAsistencia

SIMULATION_HEADER = {'HTTP_X_TEST_SIMULATION_KEY': 'bodegon-simulation-test-mode'}

LUNES = datetime.date(2026, 10, 12)
MIERCOLES = datetime.date(2026, 10, 14)
DOMINGO = datetime.date(2026, 10, 18)


def local_dt(fecha, hora, minuto=0):
    """Datetime consciente de zona horaria en hora de Nicaragua."""
    return timezone.make_aware(
        datetime.datetime.combine(fecha, datetime.time(hora, minuto)),
        timezone.get_current_timezone(),
    )


class NominaTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.empleado = Empleado.objects.create(
            nombre='Eddy', apellido='Prueba', cargo='ATENCION_CLIENTE', tipo_turno='CORRIDO',
        )

    def registrar(self, tipo_evento, fecha, hora, minuto=0, empleado=None, observacion=None):
        """Crea un marcaje directamente en BD, sin pasar por el kiosco."""
        return RegistroAsistencia.objects.create(
            empleado=empleado or self.empleado,
            tipo_evento=tipo_evento,
            fecha_hora=local_dt(fecha, hora, minuto),
            observacion=observacion,
        )

    def marcar(self, fecha, hora, minuto=0, tipo_evento=None, empleado=None):
        """Marca en el kiosco con hora simulada y devuelve el JSON de respuesta."""
        emp = empleado or self.empleado
        data = {'qr_token': emp.qr_code_token, 'fecha_hora': local_dt(fecha, hora, minuto).isoformat()}
        if tipo_evento:
            data['tipo_evento'] = tipo_evento
        response = self.client.post('/api/kiosco/marcar/', data, **SIMULATION_HEADER)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def recargar(self):
        self.empleado.refresh_from_db()
        return self.empleado
