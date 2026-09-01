from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({
        "status": "ok",
        "host": request.get_host(),
        "is_secure": request.is_secure(),
        "database": settings.DATABASES['default']['ENGINE'],
    })

urlpatterns = [
    path('health/', health_check),
    path('admin/', admin.site.urls),
    path('api/', include('asistencia.urls')),
]

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {
        'document_root': settings.MEDIA_ROOT,
    }),
]
