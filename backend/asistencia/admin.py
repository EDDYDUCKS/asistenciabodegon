from django.contrib import admin
from .models import (
    Empleado, RegistroAsistencia, BitacoraAccion, DiaFeriado,
    AutorizacionHorasExtra, AlertaAsistencia, PermisoAusencia,
    CompensacionHoras, CompensacionFeriado, PagoVacaciones, PagoHorasExtra
)

admin.site.register(Empleado)
admin.site.register(RegistroAsistencia)
admin.site.register(BitacoraAccion)
admin.site.register(DiaFeriado)
admin.site.register(AutorizacionHorasExtra)
admin.site.register(AlertaAsistencia)
admin.site.register(PermisoAusencia)
admin.site.register(CompensacionHoras)
admin.site.register(CompensacionFeriado)
admin.site.register(PagoVacaciones)
admin.site.register(PagoHorasExtra)

