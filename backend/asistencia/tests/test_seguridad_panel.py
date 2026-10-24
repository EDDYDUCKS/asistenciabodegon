from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from asistencia.models import Empleado, RegistroAsistencia


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class SeguridadPanelTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        import os
        self._old_env = {k: os.environ.get(k) for k in ('ADMIN_SUPERVISOR_PIN', 'ADMIN_PAYROLL_PIN')}
        os.environ['ADMIN_SUPERVISOR_PIN'] = '908172'
        os.environ['ADMIN_PAYROLL_PIN'] = '554433'

    def tearDown(self):
        import os
        for k, v in self._old_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def _login(self):
        res = self.client.post('/api/auth/login/', {'pin': '908172'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['token']}")

    def test_endpoints_admin_exigen_login(self):
        for url in ['/api/empleados/', '/api/asistencia/', '/api/bitacora/', '/api/horas-extra/',
                    '/api/pagos-horas-extra/', '/api/reportes/nomina-excel/']:
            self.assertIn(self.client.get(url).status_code, (401, 403), url)

    def test_login_con_pin_correcto_da_acceso(self):
        self._login()
        self.assertEqual(self.client.get('/api/empleados/').status_code, 200)

    def test_pin_incorrecto_y_bloqueo(self):
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/login/', {'pin': '0000'}, format='json').status_code, 401)
        # Bloqueado incluso con el PIN correcto
        self.assertEqual(self.client.post('/api/auth/login/', {'pin': '908172'}, format='json').status_code, 429)

    def test_sin_pin_configurado_no_hay_login(self):
        import os
        os.environ.pop('ADMIN_SUPERVISOR_PIN')
        self.assertEqual(self.client.post('/api/auth/login/', {'pin': ''}, format='json').status_code, 503)

    def test_token_falso_rechazado(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer inventado')
        self.assertEqual(self.client.get('/api/empleados/').status_code, 401)

    def test_pin_nomina_se_valida_en_servidor(self):
        self._login()
        self.assertEqual(self.client.post('/api/auth/verificar-pin-nomina/', {'pin': '2322'}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/auth/verificar-pin-nomina/', {'pin': '554433'}, format='json').status_code, 200)

    def test_verificar_pin_nomina_exige_login(self):
        self.assertEqual(self.client.post('/api/auth/verificar-pin-nomina/', {'pin': '554433'}, format='json').status_code, 401)

    def test_kiosco_sigue_abierto_y_no_expone_tokens(self):
        emp = Empleado.objects.create(nombre='Ana', apellido='López')
        res = self.client.get('/api/kiosco/empleados/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data[0]['nombre'], 'Ana')
        self.assertNotIn('qr_code_token', res.data[0])
        self.assertNotIn(emp.qr_code_token.split('.')[0], str(res.data))
        res = self.client.post('/api/kiosco/consultar/', {'qr_token': emp.qr_code_token}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_kiosco_ignora_token_vencido(self):
        emp = Empleado.objects.create(nombre='Ana', apellido='López')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer vencido')
        res = self.client.post('/api/kiosco/consultar/', {'qr_token': emp.qr_code_token}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_foto_requiere_firma(self):
        emp = Empleado.objects.create(nombre='Ana', apellido='López')
        reg = RegistroAsistencia.objects.create(empleado=emp, tipo_evento='ENTRADA', foto_base64='aGVsbG8=')
        self.assertEqual(self.client.get(f'/api/asistencia/{reg.id}/foto/').status_code, 403)
        self._login()
        url = self.client.get(f'/api/asistencia/{reg.id}/').data['foto_verificacion_url']
        self.client.credentials()
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_respaldo_sin_clave_por_defecto(self):
        res = self.client.get('/api/admin/respaldo-datos/', HTTP_X_ADMIN_BACKUP_KEY='bodegon-admin-backup-key-2026-auth')
        self.assertEqual(res.status_code, 403)
