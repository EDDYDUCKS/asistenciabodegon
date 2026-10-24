"""
El código QR se valida completo (uuid.firma), tal como está guardado e impreso en
el carnet. Un UUID con firma inventada o ausente no autentica, y cambiar
SECRET_KEY no invalida los carnets ya impresos.
"""
import json

from django.test import Client, override_settings

from asistencia.models import Empleado, RegistroAsistencia

from .base import MIERCOLES, SIMULATION_HEADER, NominaTestCase, local_dt


class ValidacionQrTests(NominaTestCase):
    def marcar_con(self, token):
        return Client().post(
            '/api/kiosco/marcar/',
            {'qr_token': token, 'fecha_hora': local_dt(MIERCOLES, 12).isoformat()},
            **SIMULATION_HEADER,
        )

    def consultar_con(self, token):
        return Client().post('/api/kiosco/consultar/', {'qr_token': token}, content_type='application/json')

    def sync_con(self, token):
        res = Client().post(
            '/api/asistencia/sync-batch/',
            json.dumps([{
                'qr_code_token': token,
                'tipo_evento': 'ENTRADA',
                'fecha_hora': local_dt(MIERCOLES, 12).isoformat(),
            }]),
            content_type='application/json',
        )
        return res.json()['sincronizados'][0]

    def test_token_guardado_formato_uuid_punto_firma(self):
        uuid_, firma = self.empleado.qr_code_token.split('.')
        self.assertEqual(len(uuid_), 36)
        self.assertEqual(len(firma), 16)

    def test_carnet_impreso_con_su_token_completo_funciona(self):
        self.assertEqual(self.marcar_con(self.empleado.qr_code_token).status_code, 200)
        self.assertEqual(self.consultar_con(self.empleado.qr_code_token).status_code, 200)

    def test_uuid_con_firma_inventada_se_rechaza(self):
        uuid_ = self.empleado.qr_code_token.split('.')[0]
        for falso in (f'{uuid_}.0000000000000000', uuid_, f'{uuid_}.'):
            self.assertEqual(self.marcar_con(falso).status_code, 400, falso)
            self.assertEqual(self.consultar_con(falso).status_code, 404, falso)
            self.assertEqual(self.sync_con(falso)['status'], 'error', falso)
        self.assertFalse(RegistroAsistencia.objects.filter(empleado=self.empleado).exists())

    def test_cambiar_secret_key_no_rompe_carnets_existentes(self):
        token = self.empleado.qr_code_token
        with override_settings(SECRET_KEY='otra-clave-distinta-para-la-prueba'):
            self.assertEqual(self.marcar_con(token).status_code, 200)
            self.assertEqual(self.consultar_con(token).status_code, 200)

    def test_empleado_inactivo_no_marca(self):
        Empleado.objects.filter(pk=self.empleado.pk).update(activo=False)
        self.assertEqual(self.marcar_con(self.empleado.qr_code_token).status_code, 400)
