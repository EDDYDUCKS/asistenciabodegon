"""
Django settings for sgp_asistencia project.
"""

from pathlib import Path
import os

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 'yes')


def _required_env(name, dev_default):
    """Lee una variable obligatoria. En producción (DEBUG=False) el servidor no arranca si falta;
    en desarrollo local (DEBUG=True) usa un valor de prueba que nunca debe llegar a producción."""
    value = os.getenv(name, '').strip()
    if value:
        return value
    if DEBUG:
        return dev_default
    raise ImproperlyConfigured(
        f"Falta la variable de entorno {name}. Configúrala en Render (Environment) "
        f"o en tu .env local antes de iniciar el servidor."
    )


SECRET_KEY = _required_env('SECRET_KEY', 'django-insecure-solo-desarrollo-local')

# Clave para descargar el respaldo total de la base de datos (cabecera X-Admin-Backup-Key)
BACKUP_ADMIN_KEY = _required_env('BACKUP_ADMIN_KEY', 'solo-desarrollo-local-backup')

ALLOWED_HOSTS = ['asistenciabodegon-api.onrender.com', '.onrender.com', 'localhost', '127.0.0.1', '*']

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'asistencia',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # Cargar estáticos en producción
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'sgp_asistencia.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'sgp_asistencia.wsgi.application'

import dj_database_url

DATABASES = {
    'default': dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Zona Horaria Oficial para Nicaragua (UTC-6)
LANGUAGE_CODE = 'es-ni'
TIME_ZONE = 'America/Managua'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'asistencia.authentication.PanelTokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    # Todo requiere login del panel salvo lo que se marque explícitamente como público (kiosco)
    'DEFAULT_PERMISSION_CLASSES': [
        'asistencia.authentication.IsPanelAdmin',
    ],
}

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    'https://asistenciabodegon.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.vercel\.app$",
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-admin-backup-key',
    'x-kiosk-api-key',
]

CSRF_TRUSTED_ORIGINS = [
    'https://*.onrender.com',
    'https://*.vercel.app',
    'https://asistenciabodegon.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]

