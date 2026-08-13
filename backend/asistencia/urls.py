from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'empleados', views.EmpleadoViewSet)
router.register(r'asistencia', views.RegistroAsistenciaViewSet)
router.register(r'bitacora', views.BitacoraViewSet)
router.register(r'feriados', views.DiaFeriadoViewSet, basename='feriados')
router.register(r'horas-extra', views.AutorizacionHorasExtraViewSet, basename='horas-extra')
router.register(r'alertas', views.AlertaAsistenciaViewSet, basename='alertas')

urlpatterns = [
    # Router CRUD
    path('', include(router.urls)),

    # Kiosco Marcaje QR
    path('kiosco/marcar/', views.marcar_asistencia_kiosco, name='kiosco_marcar'),

    # Sincronización Offline Batch
    path('asistencia/sync-batch/', views.sync_batch_asistencia, name='asistencia_sync_batch'),

    # Reporte Excel Nómina
    path('reportes/nomina-excel/', views.exportar_reporte_nomina_excel, name='nomina_excel'),
]
