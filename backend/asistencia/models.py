import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone


class Empleado(models.Model):
    CARGOS_CHOICES = [
        ('JEFE_COCINA', 'Jefe de Cocina'),
        ('COCINERO', 'Cocinero'),
        ('ASISTENTE_COCINA', 'Asistente de Cocina'),
        ('ATENCION_CLIENTE', 'Atención al Cliente'),
        ('BARRA', 'Barra'),
        ('LIMPIEZA', 'Limpieza'),
        ('LAVANDERIA', 'Lavandería'),
        ('ADMINISTRACION', 'Administración'),
        ('ASISTENTE_ADMON', 'Asistente de Administración'),
    ]

    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    cargo = models.CharField(max_length=50, choices=CARGOS_CHOICES, default='ATENCION_CLIENTE')
    TURNO_CHOICES = [
        ('CORRIDO', 'Horario Corrido'),
        ('QUEBRADO', 'Horario Quebrado'),
    ]
    tipo_turno = models.CharField(max_length=20, choices=TURNO_CHOICES, default='CORRIDO')
    cedula_carnet = models.CharField(max_length=50, blank=True, null=True)
    telefono = models.CharField(max_length=20, blank=True, null=True)
    tarifa_hora = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Tarifa en Córdobas/USD por hora trabajada")
    qr_code_token = models.CharField(max_length=150, unique=True, blank=True)
    activo = models.BooleanField(default=True)
    # Saldo de horas pendientes (deuda acumulada del período mensual actual)
    horas_pendientes = models.DecimalField(
        max_digits=8, decimal_places=2, default=0.00,
        help_text="Horas debidas acumuladas del período mensual vigente"
    )
    periodo_horas_pendientes = models.DateField(
        null=True, blank=True,
        help_text="Primer día del mes al que corresponde horas_pendientes (se reinicia al cambiar de mes)"
    )
    # Vacaciones acumuladas conforme a Art. 76 Código del Trabajo de Nicaragua (2.5 días / 30 días = 0.0833... días/día)
    dias_vacaciones_acumuladas = models.DecimalField(
        max_digits=8, decimal_places=2, default=0.00,
        help_text="Total días de vacaciones acumulados por ley (+2.5 días/mes o acumulado diario continuo)"
    )
    ultimo_corte_vacaciones = models.DateField(
        null=True, blank=True,
        help_text="Fecha hasta la cual se han acreditado las vacaciones (corte diario/mensual)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nombre', 'apellido']

    def __str__(self):
        return f"{self.nombre} {self.apellido} ({self.get_cargo_display()})"

    def save(self, *args, **kwargs):
        if not self.qr_code_token:
            self.qr_code_token = str(uuid.uuid4())
        
        token_str = str(self.qr_code_token)
        if '.' not in token_str:
            import hmac
            import hashlib
            signature = hmac.new(
                settings.SECRET_KEY.encode('utf-8'),
                token_str.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()[:16]
            self.qr_code_token = f"{token_str}.{signature}"
            
        super().save(*args, **kwargs)


class RegistroAsistencia(models.Model):
    TIPO_EVENTO_CHOICES = [
        ('ENTRADA', '🟢 Entrada (Inicio de Jornada)'),
        ('SALIDA_QUEBRADA', '🟡 Salida a Horario Quebrado (Pausa)'),
        ('ENTRADA_QUEBRADA', '🔵 Entrada de Horario Quebrado (Retorno)'),
        ('SALIDA_DEFINITIVA', '🔴 Salida Definitiva (Fin de Jornada)'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='registros_asistencia')
    tipo_evento = models.CharField(max_length=30, choices=TIPO_EVENTO_CHOICES)
    fecha_hora = models.DateTimeField(default=timezone.now)
    foto_verificacion = models.ImageField(upload_to='asistencia_fotos/', blank=True, null=True)
    foto_base64 = models.TextField(blank=True, null=True, help_text="Fotografía en Base64 persistente en Supabase")
    observacion = models.TextField(blank=True, null=True)
    ip_address = models.CharField(max_length=45, blank=True, null=True)

    class Meta:
        ordering = ['-fecha_hora', '-id']

    def __str__(self):
        nicaragua_tz = timezone.get_current_timezone()
        local_dt = self.fecha_hora.astimezone(nicaragua_tz)
        return f"[{local_dt.strftime('%d/%m/%Y %H:%M')}] {self.empleado.nombre} - {self.get_tipo_evento_display()}"


class BitacoraAccion(models.Model):
    ACCIONES = [
        ('CREAR_EMPLEADO', 'Crear Empleado'),
        ('EDITAR_EMPLEADO', 'Editar Empleado'),
        ('ELIMINAR_EMPLEADO', 'Eliminar Empleado'),
        ('REGISTRO_MANUAL', 'Registro Manual de Asistencia'),
        ('EXPORTAR_NOMINA', 'Exportar Nómina / Reporte Excel'),
        ('SANCION_DISCIPLINARIA', 'Sanción Disciplinaria'),
        ('LIQUIDAR_FERIADO', 'Liquidación de Feriado'),
        ('PAGO_VACACIONES', 'Pago de Vacaciones en Dinero'),
        ('PAGO_HORAS_EXTRA', 'Pago de Horas Extra'),
        ('ACREDITAR_FERIADO_VACACIONES', 'Acreditación de Feriado a Vacaciones'),
        ('ACREDITAR_SEPTIMO_DIA_VACACIONES', 'Acreditación de Día Libre a Vacaciones'),
    ]

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    accion = models.CharField(max_length=50, choices=ACCIONES)
    descripcion = models.TextField()
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    fecha_hora = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_hora']

    def __str__(self):
        user_str = self.usuario.username if self.usuario else 'Sistema / Kiosco'
        return f"[{self.fecha_hora.strftime('%d/%m/%Y %H:%M')}] {user_str} - {self.get_accion_display()}"


class DiaFeriado(models.Model):
    fecha = models.DateField(unique=True)
    descripcion = models.CharField(max_length=150)

    class Meta:
        ordering = ['-fecha']

    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - {self.descripcion}"


class AutorizacionHorasExtra(models.Model):
    ESTADOS = [
        ('PENDIENTE', 'Pendiente'),
        ('APROBADO', 'Aprobado'),
        ('RECHAZADO', 'Rechazado'),
    ]
    ESTADOS_PAGO = [
        ('PENDIENTE', 'Pendiente de Pago'),
        ('PAGADO', 'Pagado'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='autorizaciones_horas_extra')
    fecha = models.DateField()
    horas_extra_solicitadas = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    horas_extra_autorizadas = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='PENDIENTE')
    comentario = models.TextField(blank=True, null=True)

    # Control de Liquidación y Pago de Horas Extra Aprobadas
    estado_pago = models.CharField(max_length=20, choices=ESTADOS_PAGO, default='PENDIENTE')
    fecha_pago = models.DateField(null=True, blank=True)
    monto_pagado = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    metodo_pago = models.CharField(max_length=50, blank=True, default='')
    numero_recibo_pago = models.CharField(max_length=50, blank=True, default='')
    pago_horas_extra = models.ForeignKey('PagoHorasExtra', on_delete=models.SET_NULL, null=True, blank=True, related_name='horas_extra_asociadas')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fecha', 'empleado']
        unique_together = ('empleado', 'fecha')

    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - {self.empleado.nombre}: {self.horas_extra_autorizadas}h ({self.get_estado_display()})"

class AlertaAsistencia(models.Model):
    TIPOS = [
        ('TARDANZA', 'Tardanza'),
        ('SALIDA_ANTICIPADA', 'Salida Anticipada'),
        ('MARCACION_SOSPECHOSA', 'Marcación Sospechosa'),
        ('SEGUNDA_AUSENCIA', 'Segunda Ausencia en la Semana'),
        ('REGISTRO_INCOMPLETO', 'Registro Incompleto — Falta Salida'),
        ('MANTENIMIENTO', 'Recordatorio de Mantenimiento Semestral'),
        ('COMPENSACION_HORAS', 'Compensación de Horas (Bolsa de Horas)'),
        ('SANCION_DISCIPLINARIA', 'Sanción y Amonestación Disciplinaria'),
    ]
    tipo = models.CharField(max_length=30, choices=TIPOS)
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='alertas', null=True, blank=True)
    titulo = models.CharField(max_length=150)
    mensaje = models.TextField()
    leida = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.tipo}] {self.titulo} - {'Leída' if self.leida else 'Pendiente'}"


class PermisoAusencia(models.Model):
    TIPOS = [
        ('VACACIONES', 'Vacaciones'),
        ('VACACIONES_PAGADAS', 'Vacaciones Pagadas'),
        ('INCAPACIDAD_MEDICA', 'Incapacidad Médica'),
        ('PERMISO_AUTORIZADO', 'Permiso Autorizado'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='permisos')
    tipo = models.CharField(max_length=30, choices=TIPOS, default='VACACIONES')
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    motivo = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_inicio']

    def __str__(self):
        return f"{self.empleado.nombre} {self.empleado.apellido} - {self.get_tipo_display()} ({self.fecha_inicio} a {self.fecha_fin})"

    @property
    def total_dias(self):
        if self.fecha_inicio and self.fecha_fin:
            return (self.fecha_fin - self.fecha_inicio).days + 1
        return 0


class CompensacionHoras(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='compensaciones_horas')
    fecha_compensacion = models.DateField(help_text="Fecha en que el trabajador generó las horas extra")
    horas_trabajadas_hoy = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Total horas trabajadas en el día de la compensación")
    horas_extra_generadas = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Exceso sobre 8h")
    horas_deducidas = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Total horas extra usadas para saldar deuda")
    deuda_previa = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    saldo_restante = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    remanente_extra = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Horas extra enviadas a aprobación tras saldar deuda")
    desglose = models.JSONField(default=list, blank=True, help_text="Detalle individualizado de cada día adeudado")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_compensacion', '-created_at']

    def __str__(self):
        return f"Compensación {self.empleado.nombre} {self.empleado.apellido} - {self.fecha_compensacion} (-{self.horas_deducidas} hrs)"


class CompensacionFeriado(models.Model):
    MODALIDADES = [
        ('PENDIENTE', 'Pendiente de Liquidar'),
        ('DINERO', 'Pagado en Dinero'),
        ('VACACIONES', 'Acreditado a Vacaciones'),
        ('MIXTO', 'Pago Mixto (Dinero y Vacaciones)'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='compensaciones_feriados')
    fecha_feriado = models.DateField(help_text="Fecha del día feriado laborado")
    nombre_feriado = models.CharField(max_length=150, blank=True, default='')
    horas_trabajadas = models.DecimalField(max_digits=5, decimal_places=2, default=8.00)
    dias_compensatorios_totales = models.DecimalField(max_digits=4, decimal_places=1, default=2.0)

    # Liquidación
    estado = models.CharField(max_length=20, choices=MODALIDADES, default='PENDIENTE')
    dias_pagados_dinero = models.DecimalField(max_digits=4, decimal_places=1, default=0.0)
    dias_acreditados_vacaciones = models.DecimalField(max_digits=4, decimal_places=1, default=0.0)
    fecha_liquidacion = models.DateTimeField(null=True, blank=True)
    observaciones = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_feriado', '-created_at']
        unique_together = ['empleado', 'fecha_feriado']

    def __str__(self):
        return f"Compensación Feriado {self.empleado.nombre} {self.empleado.apellido} - {self.fecha_feriado} ({self.get_estado_display()})"


class PagoVacaciones(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='pagos_vacaciones')
    fecha_pago = models.DateField(default=timezone.localdate, help_text="Fecha de emisión del pago")
    dias_pagados = models.DecimalField(max_digits=5, decimal_places=1, help_text="Cantidad de días de vacaciones liquidados en dinero")
    monto_pagado = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Monto en Córdobas acordado/pagado manualmente por Administración")
    dias_saldo_anterior = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    dias_saldo_nuevo = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    motivo = models.CharField(max_length=255, blank=True, default='Pago de Vacaciones en Dinero')
    observaciones = models.TextField(blank=True, default='')
    numero_recibo = models.CharField(max_length=50, unique=True, help_text="Número correlativo de boleta oficial (ej. BVP-2026-0001)")
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_pago', '-created_at']

    def __str__(self):
        return f"Pago Vacaciones {self.numero_recibo} - {self.empleado.nombre} {self.empleado.apellido} ({self.dias_pagados}d - C$ {self.monto_pagado})"


class PagoHorasExtra(models.Model):
    METODOS_PAGO = [
        ('EFECTIVO', 'Efectivo'),
        ('TRANSFERENCIA', 'Transferencia Bancaria'),
        ('NOMINA_QUINCENAL', 'En Nómina Quincenal'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='pagos_horas_extra')
    fecha_pago = models.DateField(default=timezone.localdate, help_text="Fecha de emisión del pago")
    total_horas_pagadas = models.DecimalField(max_digits=6, decimal_places=2, help_text="Horas extra efectivas liquidadas")
    tarifa_hora_aplicada = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Tarifa por hora extra (C$) aplicada")
    monto_total = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Monto total pagado en Córdobas (C$)")
    metodo_pago = models.CharField(max_length=30, choices=METODOS_PAGO, default='EFECTIVO')
    numero_recibo = models.CharField(max_length=50, unique=True, help_text="Número correlativo de boleta oficial (ej. RPHE-2026-0001)")
    observaciones = models.TextField(blank=True, default='')
    detalles_fechas = models.JSONField(default=list, blank=True, help_text="Detalle de fechas y horas pagadas en este recibo")
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_pago', '-created_at']

    def __str__(self):
        return f"Pago HE {self.numero_recibo} - {self.empleado.nombre} {self.empleado.apellido} ({self.total_horas_pagadas}h - C$ {self.monto_total})"

