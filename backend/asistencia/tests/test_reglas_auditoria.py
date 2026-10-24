"""
Errores de reglas de negocio encontrados en la auditoría del 24/10/2026.
Cada prueba reproduce el caso concreto que fallaba.
"""
import datetime
from decimal import Decimal
from unittest import mock

from asistencia import views
from asistencia.models import (AlertaAsistencia, AutorizacionHorasExtra, BitacoraAccion,
                               CompensacionFeriado, DiaFeriado, PermisoAusencia)

from .base import LUNES, MIERCOLES, NominaTestCase, local_dt

JUEVES = MIERCOLES + datetime.timedelta(days=1)
VIERNES = MIERCOLES + datetime.timedelta(days=2)


def ahora_en(fecha, hora, minuto=0):
    return mock.patch('django.utils.timezone.now', return_value=local_dt(fecha, hora, minuto))


class RutinasUnicasTests(NominaTestCase):
    def test_borrar_bitacora_no_reinicia_la_deuda(self):
        e = self.empleado
        e.horas_pendientes = Decimal('6.0')
        e.periodo_horas_pendientes = datetime.date(2026, 10, 1)
        e.save()
        BitacoraAccion.objects.all().delete()  # lo mismo que hace depurar-historial
        self.client.get('/api/empleados/')
        self.assertEqual(float(self.recargar().horas_pendientes), 6.0)

    def test_enlaces_de_borron_ya_no_existen(self):
        for ruta in ('resetear-deficit-general', 'ajustar-casos-lucero-uriel', 'corregir-vacaciones-no-laboradas'):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(f'/api/empleados/{ruta}/').status_code, 404)


class MarcajeManualTests(NominaTestCase):
    def test_salida_agregada_a_mano_no_duplica_deuda(self):
        self.registrar('ENTRADA', MIERCOLES, 9)
        r = self.client.post('/api/asistencia/', {
            'empleado': self.empleado.id, 'tipo_evento': 'SALIDA_DEFINITIVA',
            'fecha_hora': local_dt(MIERCOLES, 15).isoformat()}, content_type='application/json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(float(self.recargar().horas_pendientes), 2.0)

    def test_editar_salida_corrige_horas_extra_pendientes(self):
        self.marcar(MIERCOLES, 9)
        salida = self.marcar(MIERCOLES, 19)  # 10 h -> 2 h extra
        self.assertEqual(float(AutorizacionHorasExtra.objects.get(empleado=self.empleado).horas_extra_solicitadas), 2.0)
        self.client.patch(f"/api/asistencia/{salida['registro']['id']}/",
                          {'fecha_hora': local_dt(MIERCOLES, 17).isoformat()}, content_type='application/json')
        self.assertFalse(AutorizacionHorasExtra.objects.filter(empleado=self.empleado).exists())

    def test_borrar_salida_quita_horas_extra_pendientes(self):
        self.marcar(MIERCOLES, 9)
        salida = self.marcar(MIERCOLES, 19)
        self.client.delete(f"/api/asistencia/{salida['registro']['id']}/")
        self.assertFalse(AutorizacionHorasExtra.objects.filter(empleado=self.empleado).exists())

    def test_editar_no_toca_horas_extra_aprobadas(self):
        self.marcar(MIERCOLES, 9)
        salida = self.marcar(MIERCOLES, 19)
        AutorizacionHorasExtra.objects.filter(empleado=self.empleado).update(estado='APROBADO', horas_extra_autorizadas=2)
        self.client.patch(f"/api/asistencia/{salida['registro']['id']}/",
                          {'fecha_hora': local_dt(MIERCOLES, 17).isoformat()}, content_type='application/json')
        self.assertEqual(AutorizacionHorasExtra.objects.get(empleado=self.empleado).estado, 'APROBADO')


class CerrarTurnoTests(NominaTestCase):
    def alerta(self, fecha):
        return AlertaAsistencia.objects.create(
            tipo='REGISTRO_INCOMPLETO', empleado=self.empleado, titulo='Registro incompleto',
            mensaje=f"El día {fecha.strftime('%d/%m/%Y')} el empleado registró Entrada pero nunca completó su Salida.")

    def test_cierre_con_hora_real(self):
        self.registrar('ENTRADA', MIERCOLES, 9)
        r = self.client.post(f'/api/alertas/{self.alerta(MIERCOLES).id}/cerrar-salida-11pm/',
                             {'hora': '17:00'}, content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['horas_computadas'], 8.0)

    def test_cierre_a_las_11_no_inventa_horas_extra(self):
        self.registrar('ENTRADA', MIERCOLES, 9)
        r = self.client.post(f'/api/alertas/{self.alerta(MIERCOLES).id}/cerrar-salida-11pm/')
        self.assertEqual(r.json()['horas_computadas'], 14.0)
        self.assertFalse(AutorizacionHorasExtra.objects.filter(empleado=self.empleado).exists())

    def test_cierre_corto_no_duplica_deuda(self):
        self.registrar('ENTRADA', MIERCOLES, 9)
        self.client.post(f'/api/alertas/{self.alerta(MIERCOLES).id}/cerrar-salida-11pm/',
                         {'hora': '15:00'}, content_type='application/json')
        self.assertEqual(float(self.recargar().horas_pendientes), 2.0)

    def test_hora_invalida(self):
        self.registrar('ENTRADA', MIERCOLES, 9)
        r = self.client.post(f'/api/alertas/{self.alerta(MIERCOLES).id}/cerrar-salida-11pm/',
                             {'hora': '8:00'}, content_type='application/json')
        self.assertEqual(r.status_code, 400)


class InasistenciaTests(NominaTestCase):
    def alerta_falta(self, fechas, creada):
        alerta = AlertaAsistencia.objects.create(
            tipo='INASISTENCIA', empleado=self.empleado, titulo='Inasistencia',
            mensaje=f"El colaborador registró falta sin justificar en fecha(s): {', '.join(f.strftime('%d/%m') for f in fechas)} "
                    f"(adicional a su día libre semanal del 12/10).")
        AlertaAsistencia.objects.filter(id=alerta.id).update(created_at=creada)
        return alerta

    def resolver_vencidas(self, fecha, hora):
        with ahora_en(fecha, hora):
            views.AlertaAsistenciaViewSet()._procesar_resolucion_automatica_inasistencias()

    def test_falta_sin_saldo_no_quita_vacaciones(self):
        e = self.empleado
        e.dias_vacaciones_acumuladas = Decimal('0.50')
        e.save()
        self.alerta_falta([MIERCOLES], local_dt(JUEVES, 8))
        self.resolver_vencidas(VIERNES, 9)
        self.assertEqual(float(self.recargar().horas_pendientes), 8.0)
        self.assertEqual(float(views._obtener_dias_vacaciones_disponibles(self.recargar())), 0.50)

    def test_una_sancion_por_dia_en_su_fecha_real(self):
        e = self.empleado
        e.dias_vacaciones_acumuladas = Decimal('5.00')
        e.save()
        self.alerta_falta([MIERCOLES - datetime.timedelta(days=1), MIERCOLES], local_dt(JUEVES, 8))
        self.resolver_vencidas(VIERNES, 9)
        fechas = sorted(PermisoAusencia.objects.filter(empleado=e).values_list('fecha_inicio', flat=True))
        self.assertEqual(fechas, [MIERCOLES - datetime.timedelta(days=1), MIERCOLES])
        self.assertEqual(float(views._obtener_dias_vacaciones_disponibles(self.recargar())), 3.0)

    def test_deuda_por_falta_sobrevive_al_recalculo(self):
        self.alerta_falta([MIERCOLES], local_dt(JUEVES, 8))
        self.resolver_vencidas(VIERNES, 9)
        self.assertEqual(float(self.recargar().horas_pendientes), 8.0)
        self.registrar('ENTRADA', JUEVES, 9)
        r = self.registrar('SALIDA_DEFINITIVA', JUEVES, 17)
        self.client.patch(f'/api/asistencia/{r.id}/', {'observacion': 'corrección'}, content_type='application/json')
        self.assertEqual(float(self.recargar().horas_pendientes), 8.0)


class FeriadoTests(NominaTestCase):
    def test_liquidar_a_vacaciones_suma_dos_dias_y_no_se_repite(self):
        e = self.empleado
        e.dias_vacaciones_acumuladas = Decimal('5.00')
        e.save()
        comp = CompensacionFeriado.objects.create(empleado=e, fecha_feriado=MIERCOLES, estado='PENDIENTE')
        url = f'/api/compensaciones-feriados/{comp.id}/liquidar/'
        self.client.post(url, {'dias_dinero': 0, 'dias_vacaciones': 2}, content_type='application/json')
        self.assertEqual(float(views._obtener_dias_vacaciones_disponibles(self.recargar())), 7.0)
        self.client.post(url, {'dias_dinero': 0, 'dias_vacaciones': 2}, content_type='application/json')
        self.assertEqual(float(views._obtener_dias_vacaciones_disponibles(self.recargar())), 7.0)
        # cambiar a dinero reintegra los días
        self.client.post(url, {'dias_dinero': 2, 'dias_vacaciones': 0}, content_type='application/json')
        self.assertEqual(float(views._obtener_dias_vacaciones_disponibles(self.recargar())), 5.0)

    def test_no_se_liquidan_mas_dias_que_los_del_feriado(self):
        comp = CompensacionFeriado.objects.create(empleado=self.empleado, fecha_feriado=MIERCOLES, estado='PENDIENTE')
        r = self.client.post(f'/api/compensaciones-feriados/{comp.id}/liquidar/',
                             {'dias_dinero': 1, 'dias_vacaciones': 2}, content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_pasa_a_vacaciones_solo_despues_de_24_horas(self):
        DiaFeriado.objects.create(fecha=MIERCOLES, descripcion='Feriado')
        self.marcar(MIERCOLES, 9)
        self.marcar(MIERCOLES, 17)
        comp = CompensacionFeriado.objects.get(empleado=self.empleado)
        CompensacionFeriado.objects.filter(id=comp.id).update(created_at=local_dt(MIERCOLES, 17))
        with ahora_en(JUEVES, 8):  # 15 h después
            views._evaluar_y_autoacreditar_feriados_pendientes()
        comp.refresh_from_db()
        self.assertEqual(comp.estado, 'PENDIENTE')
        with ahora_en(JUEVES, 17, 30):
            views._evaluar_y_autoacreditar_feriados_pendientes()
        comp.refresh_from_db()
        self.assertEqual(comp.estado, 'VACACIONES')


class LlegadaTempranaTests(NominaTestCase):
    def test_llegar_antes_siempre_cuenta_desde_la_hora_oficial(self):
        for minuto in (39, 41):
            with self.subTest(entrada=f'8:{minuto}'):
                regs = [self.registrar('ENTRADA', LUNES, 8, minuto), self.registrar('SALIDA_DEFINITIVA', LUNES, 17)]
                self.assertEqual(round(views._calcular_horas_netas_dia(regs), 2), 8.0)
                for r in regs:
                    r.delete()
