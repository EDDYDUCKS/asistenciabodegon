"""
Clases de autenticación y permisos del panel (sin importar vistas de DRF,
para poder usarse desde settings.REST_FRAMEWORK sin importaciones circulares).
"""
import os

from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework import permissions
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

TOKEN_SALT = 'bodegon.panel-admin'
TOKEN_MAX_AGE = int(os.getenv('ADMIN_TOKEN_HOURS', '12')) * 3600


class PanelTokenAuthentication(BaseAuthentication):
    """Lee `Authorization: Bearer <token>` emitido por /api/auth/login/."""
    keyword = 'Bearer'

    def authenticate(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None
        try:
            data = signing.loads(parts[1], salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
        except signing.SignatureExpired:
            raise AuthenticationFailed('La sesión expiró. Vuelve a ingresar el PIN.')
        except signing.BadSignature:
            raise AuthenticationFailed('Token inválido.')
        User = get_user_model()
        user = User.objects.filter(pk=data.get('uid'), is_active=True).first()
        if not user:
            raise AuthenticationFailed('Usuario no encontrado.')
        return (user, parts[1])

    def authenticate_header(self, request):
        return self.keyword


class IsPanelAdmin(permissions.BasePermission):
    """Solo personal administrativo autenticado (token del panel o usuario staff)."""
    message = 'Se requiere iniciar sesión en el panel administrativo.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)
