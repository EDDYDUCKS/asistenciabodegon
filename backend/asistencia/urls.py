from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import auth

router = DefaultRouter()
router.register(r'empleados', views.EmpleadoViewSet)
router.register(r'asistencia', views.RegistroAsistenciaViewSet)
router.register(r'bitacora', views.BitacoraViewSet)
router.register(r'feriados', views.DiaFeriadoViewSet, basename='feriados')
router.register(r'horas-extra', views.AutorizacionHorasExtraViewSet, basename='horas-extra')
router.register(r'alertas', views.AlertaAsistenciaViewSet, basename='alertas')
router.register(r'permisos', views.PermisoAusenciaViewSet, basename='permisos')
router.register(r'compensaciones', views.CompensacionHorasViewSet, basename='compensaciones')
router.register(r'compensaciones-feriados', views.CompensacionFeriadoViewSet, basename='compensaciones-feriados')
router.register(r'pagos-vacaciones', views.PagoVacacionesViewSet, basename='pagos-vacaciones')
router.register(r'pagos-horas-extra', views.PagoHorasExtraViewSet, basename='pagos-horas-extra')

urlpatterns = [
    # Router CRUD
    path('', include(router.urls)),

    # Autenticación del panel administrativo (PINs validados solo en servidor)
    path('auth/login/', auth.login_panel, name='auth_login'),
    path('auth/verificar-pin-nomina/', auth.verificar_pin_nomina_view, name='auth_verificar_pin_nomina'),

    # Kiosco Marcaje QR (público, sin login)
    path('kiosco/empleados/', views.empleados_kiosco, name='kiosco_empleados'),
    path('kiosco/marcar/', views.marcar_asistencia_kiosco, name='kiosco_marcar'),
    path('kiosco/consultar/', views.consultar_horas_kiosco, name='kiosco_consultar'),

    # Sincronización Offline Batch
    path('asistencia/sync-batch/', views.sync_batch_asistencia, name='asistencia_sync_batch'),

    # Reportes Excel
    path('reportes/nomina-excel/', views.exportar_reporte_nomina_excel, name='nomina_excel'),
    path('reportes/vacaciones-excel/', views.exportar_reporte_vacaciones_excel, name='vacaciones_excel'),
    path('reportes/inasistencias-excel/', views.exportar_reporte_inasistencias_excel, name='inasistencias_excel'),

    # Respaldo de Base de Datos
    path('admin/respaldo-datos/', views.exportar_respaldo_base_datos, name='admin_respaldo_datos'),
]
