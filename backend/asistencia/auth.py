"""
Autenticación del panel administrativo de El Bodegón Pass.

- El PIN de gerencia (ADMIN_SUPERVISOR_PIN) se valida SOLO en el servidor y,
  si es correcto, se entrega un token firmado con vencimiento.
- El panel envía el token en `Authorization: Bearer <token>` en cada petición.
- El PIN de nómina (ADMIN_PAYROLL_PIN) también se valida solo aquí.
- Los intentos fallidos se limitan por IP para evitar adivinar PINs de 4 dígitos.

Los PINs NO tienen valor por defecto: deben configurarse como variables de entorno.
"""
import hmac
import os

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response

from .authentication import TOKEN_SALT, TOKEN_MAX_AGE

PANEL_USERNAME = 'panel-gerencia'

FOTO_SALT = 'bodegon.foto-marcaje'
FOTO_MAX_AGE = 24 * 3600

MAX_INTENTOS = 5
BLOQUEO_SEGUNDOS = 15 * 60


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


def _pin_coincide(pin, env_var):
    expected = os.getenv(env_var, '').strip()
    if not expected:
        return False
    return hmac.compare_digest(str(pin or '').strip().encode(), expected.encode())


def _clave_intentos(request, tipo):
    return f'pin-fallos:{tipo}:{_client_ip(request)}'


def _esta_bloqueado(request, tipo):
    return cache.get(_clave_intentos(request, tipo), 0) >= MAX_INTENTOS


def _registrar_fallo(request, tipo):
    clave = _clave_intentos(request, tipo)
    cache.set(clave, cache.get(clave, 0) + 1, BLOQUEO_SEGUNDOS)


def _limpiar_fallos(request, tipo):
    cache.delete(_clave_intentos(request, tipo))


def verificar_pin_nomina(request, pin):
    """True si el PIN de nómina es correcto. Cuenta los fallos por IP."""
    if _esta_bloqueado(request, 'nomina'):
        return False
    if _pin_coincide(pin, 'ADMIN_PAYROLL_PIN'):
        _limpiar_fallos(request, 'nomina')
        return True
    _registrar_fallo(request, 'nomina')
    return False


def _panel_user():
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=PANEL_USERNAME,
        defaults={'is_staff': True, 'first_name': 'Gerencia', 'last_name': 'Panel'},
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=['password'])
    return user


def emitir_token(user):
    return signing.dumps({'uid': user.pk}, salt=TOKEN_SALT, compress=True)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def login_panel(request):
    """Valida el PIN de gerencia en el servidor y devuelve un token del panel."""
    if _esta_bloqueado(request, 'gerencia'):
        return Response(
            {'detail': 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    if not os.getenv('ADMIN_SUPERVISOR_PIN', '').strip():
        return Response(
            {'detail': 'El servidor no tiene configurado ADMIN_SUPERVISOR_PIN.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if not _pin_coincide(request.data.get('pin'), 'ADMIN_SUPERVISOR_PIN'):
        _registrar_fallo(request, 'gerencia')
        return Response({'detail': 'PIN incorrecto.'}, status=status.HTTP_401_UNAUTHORIZED)

    _limpiar_fallos(request, 'gerencia')
    user = _panel_user()
    return Response({'token': emitir_token(user), 'expires_in': TOKEN_MAX_AGE})


@api_view(['POST'])
def verificar_pin_nomina_view(request):
    """Confirma el PIN de nómina sin ejecutar ninguna acción (para los modales)."""
    if _esta_bloqueado(request, 'nomina'):
        return Response(
            {'valido': False, 'detail': 'Demasiados intentos fallidos. Espera 15 minutos.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    if verificar_pin_nomina(request, request.data.get('pin')):
        return Response({'valido': True})
    return Response({'valido': False, 'detail': 'PIN de nómina incorrecto.'}, status=status.HTTP_403_FORBIDDEN)


# ── URLs firmadas para fotos de marcaje (las etiquetas <img> no envían el token) ──
def firmar_foto(registro_id):
    return signing.dumps(int(registro_id), salt=FOTO_SALT)


def foto_firma_valida(registro_id, firma):
    try:
        return signing.loads(firma or '', salt=FOTO_SALT, max_age=FOTO_MAX_AGE) == int(registro_id)
    except (signing.BadSignature, ValueError, TypeError):
        return False
