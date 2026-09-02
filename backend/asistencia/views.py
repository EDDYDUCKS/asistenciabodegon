import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from django.db import transaction
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes, renderer_classes
from rest_framework.response import Response
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Empleado, RegistroAsistencia, BitacoraAccion, DiaFeriado, AutorizacionHorasExtra, AlertaAsistencia
from .serializers import EmpleadoSerializer, RegistroAsistenciaSerializer, BitacoraAccionSerializer, DiaFeriadoSerializer, AutorizacionHorasExtraSerializer, AlertaAsistenciaSerializer


class ExcelBinaryRenderer(BaseRenderer):
    media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    format = 'xlsx'
    charset = None
    render_style = 'binary'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


def _get_clean_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', '')
    return ip[:45]


class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.all()
    serializer_class = EmpleadoSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        emp = serializer.save()
        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='CREAR_EMPLEADO',
            descripcion=f"Empleado '{emp.nombre} {emp.apellido}' ({emp.get_cargo_display()}) creado.",
            ip_address=_get_clean_ip(self.request)
        )

    def perform_update(self, serializer):
        emp = serializer.save()
        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='EDITAR_EMPLEADO',
            descripcion=f"Empleado #{emp.id} '{emp.nombre} {emp.apellido}' actualizado.",
            ip_address=_get_clean_ip(self.request)
        )

    def perform_destroy(self, instance):
        nombre = f"{instance.nombre} {instance.apellido}"
        instance.delete()
        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='ELIMINAR_EMPLEADO',
            descripcion=f"Empleado '{nombre}' eliminado del sistema.",
            ip_address=_get_clean_ip(self.request)
        )

    @action(detail=True, methods=['post'], url_path='regenerar-qr')
    def regenerar_qr(self, request, pk=None):
        import uuid
        empleado = self.get_object()
        empleado.qr_code_token = uuid.uuid4()
        empleado.save()
        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='EDITAR_EMPLEADO',
            descripcion=f"Código QR del empleado #{empleado.id} '{empleado.nombre} {empleado.apellido}' regenerado.",
            ip_address=_get_clean_ip(self.request)
        )
        return Response({'status': 'ok', 'qr_code_token': str(empleado.qr_code_token)})


class RegistroAsistenciaViewSet(viewsets.ModelViewSet):
    queryset = RegistroAsistencia.objects.all().select_related('empleado')
    serializer_class = RegistroAsistenciaSerializer
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]


class BitacoraViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BitacoraAccion.objects.all()
    serializer_class = BitacoraAccionSerializer
    permission_classes = [permissions.AllowAny]


class DiaFeriadoViewSet(viewsets.ModelViewSet):
    queryset = DiaFeriado.objects.all()
    serializer_class = DiaFeriadoSerializer
    permission_classes = [permissions.AllowAny]


class AutorizacionHorasExtraViewSet(viewsets.ModelViewSet):
    queryset = AutorizacionHorasExtra.objects.all().select_related('empleado')
    serializer_class = AutorizacionHorasExtraSerializer
    permission_classes = [permissions.AllowAny]


class AlertaAsistenciaViewSet(viewsets.ModelViewSet):
    queryset = AlertaAsistencia.objects.all().select_related('empleado')
    serializer_class = AlertaAsistenciaSerializer
    permission_classes = [permissions.AllowAny]

    def list(self, request, *args, **kwargs):
        # Al listar alertas, verificar ausencias de la semana y mantenimiento semestral
        self._verificar_ausencias_semanales()
        self._verificar_mantenimiento_semestral()
        return super().list(request, *args, **kwargs)

    def _verificar_mantenimiento_semestral(self):
        """
        Verifica si existen registros de asistencia o fotos de hace más de 180 días (6 meses).
        Si existen, genera un recordatorio al administrador para ejecutar la depuración semestral.
        """
        import datetime
        limite = timezone.now() - datetime.timedelta(days=180)
        hay_antiguos = RegistroAsistencia.objects.filter(fecha_hora__lt=limite).exists()
        if hay_antiguos:
            ya_notificado = AlertaAsistencia.objects.filter(
                tipo='MANTENIMIENTO',
                leida=False
            ).exists()
            if not ya_notificado:
                AlertaAsistencia.objects.create(
                    tipo='MANTENIMIENTO',
                    empleado=None,
                    titulo="Mantenimiento Semestral Sugerido",
                    mensaje=(
                        "Existen registros de asistencia y fotografías con más de 6 meses de antigüedad. "
                        "Puede ejecutar la Depuración Semestral desde el Panel para mantener optimizado el almacenamiento gratuito."
                    ),
                    leida=False
                )

    def _verificar_ausencias_semanales(self):
        """
        Revisa la semana en curso (Lunes a hoy). Si un empleado tiene 2 o más días sin marcaje
        y no es feriado, genera la alerta de SEGUNDA_AUSENCIA para que el admin tome una decisión.
        """
        import datetime
        hoy = timezone.localdate()
        inicio_semana = hoy - datetime.timedelta(days=hoy.weekday())
        
        # Obtener feriados de la semana
        feriados = set(DiaFeriado.objects.filter(
            fecha__gte=inicio_semana,
            fecha__lte=hoy
        ).values_list('fecha', flat=True))

        empleados = Empleado.objects.filter(activo=True)
        for emp in empleados:
            # Obtener días con marcajes en la semana
            dias_con_marcaje = set(RegistroAsistencia.objects.filter(
                empleado=emp,
                fecha_hora__date__gte=inicio_semana,
                fecha_hora__date__lte=hoy
            ).dates('fecha_hora', 'day'))

            dias_sin_marcaje = []
            curr = inicio_semana
            # Revisar hasta ayer (hoy aún puede marcar durante su turno)
            while curr < hoy:
                if curr not in feriados and curr not in dias_con_marcaje:
                    dias_sin_marcaje.append(curr)
                curr += datetime.timedelta(days=1)

            # Si tiene 2 o más días sin marcar en la semana
            if len(dias_sin_marcaje) >= 2:
                # Verificar si ya existe una alerta de SEGUNDA_AUSENCIA para esta semana
                titulo_busqueda = f"Segunda Ausencia Semanal: {emp.nombre} {emp.apellido}"
                alerta_existente = AlertaAsistencia.objects.filter(
                    empleado=emp,
                    tipo='SEGUNDA_AUSENCIA',
                    created_at__date__gte=inicio_semana
                ).exists()

                if not alerta_existente:
                    fechas_str = ", ".join(d.strftime('%d/%m') for d in dias_sin_marcaje)
                    AlertaAsistencia.objects.create(
                        tipo='SEGUNDA_AUSENCIA',
                        empleado=emp,
                        titulo=titulo_busqueda,
                        mensaje=(
                            f"El empleado {emp.nombre} {emp.apellido} acumula {len(dias_sin_marcaje)} días sin registrar asistencia "
                            f"esta semana ({fechas_str}). El 1er día cuenta como día libre. "
                            f"Decida si autoriza la falta o si suma las 8 horas como deuda pendiente."
                        ),
                        leida=False
                    )

    @action(detail=True, methods=['post'], url_path='resolver')
    def resolver_alerta(self, request, pk=None):
        """
        Resuelve una alerta:
        decision='JUSTIFICAR': Marca como justificada (no genera deuda)
        decision='SUMAR_DEUDA': Suma 8 horas al saldo de horas_pendientes del empleado
        """
        alerta = self.get_object()
        decision = request.data.get('decision', 'JUSTIFICAR')  # 'JUSTIFICAR' o 'SUMAR_DEUDA'
        empleado = alerta.empleado

        if empleado:
            if decision == 'SUMAR_DEUDA' and alerta.tipo == 'SEGUNDA_AUSENCIA':
                hoy = timezone.localdate()
                primer_dia_mes = hoy.replace(day=1)
                if empleado.periodo_horas_pendientes != primer_dia_mes:
                    empleado.horas_pendientes = 0.00
                    empleado.periodo_horas_pendientes = primer_dia_mes

                empleado.horas_pendientes = float(empleado.horas_pendientes) + 8.00
                empleado.save(update_fields=['horas_pendientes', 'periodo_horas_pendientes'])
                
                BitacoraAccion.objects.create(
                    usuario=request.user if request.user.is_authenticated else None,
                    accion='REGISTRO_MANUAL',
                    descripcion=f"Se sumaron 8.0 hrs de deuda a {empleado.nombre} {empleado.apellido} por ausencia no justificada (Alerta #{alerta.id}).",
                    ip_address=_get_clean_ip(request)
                )
            else:
                BitacoraAccion.objects.create(
                    usuario=request.user if request.user.is_authenticated else None,
                    accion='REGISTRO_MANUAL',
                    descripcion=f"Se justificó la alerta #{alerta.id} de {empleado.nombre} {empleado.apellido} (sin recargo de horas).",
                    ip_address=_get_clean_ip(request)
                )

        alerta.leida = True
        alerta.save(update_fields=['leida'])
        return Response({
            'status': 'ok',
            'mensaje': 'Alerta procesada correctamente.',
            'empleado_horas_pendientes': float(empleado.horas_pendientes) if empleado else 0.0
        })

    @action(detail=False, methods=['post'], url_path='marcar-todas-leidas')
    def marcar_todas_leidas(self, request):
        AlertaAsistencia.objects.filter(leida=False).update(leida=True)
        return Response({'status': 'ok', 'mensaje': 'Todas las alertas han sido marcadas como leídas.'})

    @action(detail=False, methods=['post'], url_path='depurar-historial')
    def depurar_historial(self, request):
        """
        Depura fotografías y datos prescindibles con más de 6 meses (180 días) de antigüedad,
        manteniendo intactos a los empleados, sus carnets y sus saldos de horas.
        """
        import datetime
        meses = int(request.data.get('meses', 6))
        limite_fecha = timezone.now() - datetime.timedelta(days=meses * 30)

        # 1. Liberar fotografías de registros antiguos (manteniendo el registro de texto)
        registros_con_foto = RegistroAsistencia.objects.filter(
            fecha_hora__lt=limite_fecha,
            foto_verificacion__isnull=False
        ).exclude(foto_verificacion='')
        
        fotos_liberadas = 0
        for reg in registros_con_foto:
            try:
                reg.foto_verificacion.delete(save=False)
            except Exception:
                pass
            reg.foto_verificacion = None
            reg.save(update_fields=['foto_verificacion'])
            fotos_liberadas += 1

        # 2. Limpiar bitácora antigua
        bitacora_eliminada = BitacoraAccion.objects.filter(fecha_hora__lt=limite_fecha).delete()[0]

        # 3. Limpiar alertas antiguas ya leídas
        alertas_eliminadas = AlertaAsistencia.objects.filter(created_at__lt=limite_fecha, leida=True).delete()[0]

        # Marcar alertas de mantenimiento como leídas
        AlertaAsistencia.objects.filter(tipo='MANTENIMIENTO').update(leida=True)

        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='MANTENIMIENTO_DEPURACION',
            descripcion=f"Depuración semestral ejecutada: {fotos_liberadas} fotos liberadas, {bitacora_eliminada} logs de bitácora y {alertas_eliminadas} alertas antiguas depuradas.",
            ip_address=_get_clean_ip(request)
        )

        return Response({
            'status': 'ok',
            'mensaje': f'Depuración completada exitosamente. Se liberaron {fotos_liberadas} fotografías y se limpiaron {bitacora_eliminada + alertas_eliminadas} registros antiguos.',
            'fotos_liberadas': fotos_liberadas,
            'bitacora_eliminada': bitacora_eliminada,
            'alertas_eliminadas': alertas_eliminadas,
        })


# ==========================================
# 🟢 ENDPOINT PRINCIPAL DEL KIOSCO DE MARCAJE
# ==========================================

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
@renderer_classes([JSONRenderer])
def marcar_asistencia_kiosco(request):
    """
    Endpoint invocado por el Kiosco al escanear un Código QR.
    Acepta: qr_token, tipo_evento (opcional), foto (opcional).
    """
    qr_token = request.data.get('qr_token') or request.data.get('token')
    if not qr_token:
        return Response({'detail': 'Código QR no proporcionado.'}, status=400)

    # Validar firma HMAC del Código QR
    import hmac
    import hashlib
    from django.conf import settings

    if not qr_token or '.' not in qr_token:
        return Response({'status': 'error', 'mensaje': 'Formato de Código QR inválido (sin firma).'}, status=400)

    raw_uuid, signature = qr_token.split('.', 1)
    expected_signature = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        raw_uuid.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()[:16]

    if not hmac.compare_digest(signature, expected_signature):
        return Response({'status': 'error', 'mensaje': 'Código QR no válido. Posible copia o falsificación.'}, status=400)

    try:
        empleado = Empleado.objects.get(qr_code_token=qr_token, activo=True)
    except Empleado.DoesNotExist:
        return Response({'status': 'error', 'mensaje': 'Código QR no encontrado en base de datos o empleado inactivo.'}, status=400)

    # Permite enviar fecha_hora simulada desde el cliente (para testing dinámico)
    fecha_hora_simulada = request.data.get('fecha_hora')
    if fecha_hora_simulada:
        from django.utils.dateparse import parse_datetime
        dt_sim = parse_datetime(fecha_hora_simulada)
        if dt_sim:
            if timezone.is_naive(dt_sim):
                dt_sim = timezone.make_aware(dt_sim, timezone.get_current_timezone())
            dt_local = dt_sim.astimezone(timezone.get_current_timezone())
            fecha_hora_registro = dt_sim
            hoy = dt_local.date()
        else:
            fecha_hora_registro = timezone.now()
            hoy = timezone.localdate()
    else:
        fecha_hora_registro = timezone.now()
        hoy = timezone.localdate()

    # Definir rango de fecha local en UTC para SQLite-safe query
    import datetime
    start_dt = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.min), timezone.get_current_timezone())
    end_dt = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.max), timezone.get_current_timezone())

    # Buscar marcajes del empleado en la fecha correspondiente (Hora Nicaragua)
    registros_hoy = RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_dt, end_dt)
    ).order_by('fecha_hora')

    # ── BLOQUEO ANTI-REBOTE (Cooldown de 5 minutos) ────────────────────────
    if registros_hoy.exists():
        ultimo_reg = registros_hoy.last()
        segundos_diff = (fecha_hora_registro - ultimo_reg.fecha_hora).total_seconds()
        if 0 <= segundos_diff < 300:  # Menos de 5 minutos (300 seg)
            hora_local_str = ultimo_reg.fecha_hora.astimezone(timezone.get_current_timezone()).strftime('%I:%M %p')
            minutos_hace = max(1, int(segundos_diff // 60))
            return Response({
                'status': 'cooldown',
                'mensaje': (
                    f"¡Hola {empleado.nombre}! Tu marcaje de {ultimo_reg.get_tipo_evento_display()} "
                    f"ya fue registrado a las {hora_local_str} (hace {minutos_hace} min). "
                    f"No te preocupes, tu registro está guardado."
                ),
                'registro': RegistroAsistenciaSerializer(ultimo_reg, context={'request': request}).data,
                'horas_trabajadas_hoy': round(_calcular_horas_netas_dia(list(registros_hoy)), 2)
            })

    # Tipo de evento solicitado o auto-detectado inteligentemente por franja horaria
    tipo_evento = request.data.get('tipo_evento')
    dt_local = fecha_hora_registro.astimezone(timezone.get_current_timezone())
    hora_mins = dt_local.hour * 60 + dt_local.minute

    if not tipo_evento:
        if empleado.tipo_turno == 'QUEBRADO':
            if not registros_hoy.exists():
                tipo_evento = 'ENTRADA'
            else:
                ultimo_evento = registros_hoy.last().tipo_evento
                if ultimo_evento == 'ENTRADA':
                    # Si el empleado marcó entrada al mediodía y ahora marca después de las 5:30 PM (1050 min),
                    # omitió marcar salida a pausa de las 3:00 PM y está marcando el retorno de la tarde (6:00 PM)
                    if hora_mins >= 1050:
                        tipo_evento = 'ENTRADA_QUEBRADA'
                        AlertaAsistencia.objects.create(
                            tipo='REGISTRO_INCOMPLETO',
                            empleado=empleado,
                            titulo=f"Omisión de pausa detectada: {empleado.nombre} {empleado.apellido}",
                            mensaje=(
                                f"El empleado {empleado.nombre} no registró su salida a pausa (3:00 PM) "
                                f"y marcó retorno de la tarde a las {dt_local.strftime('%I:%M %p')}. "
                                f"El sistema ajustó su marcaje a Retorno para preservar sus horas."
                            ),
                            leida=False
                        )
                    else:
                        tipo_evento = 'SALIDA_QUEBRADA'
                elif ultimo_evento == 'SALIDA_QUEBRADA':
                    tipo_evento = 'ENTRADA_QUEBRADA'
                elif ultimo_evento == 'ENTRADA_QUEBRADA':
                    tipo_evento = 'SALIDA_DEFINITIVA'
                else:
                    tipo_evento = 'ENTRADA'
        else:  # CORRIDO
            if not registros_hoy.exists():
                tipo_evento = 'ENTRADA'
            else:
                ultimo_evento = registros_hoy.last().tipo_evento
                if ultimo_evento == 'ENTRADA':
                    tipo_evento = 'SALIDA_DEFINITIVA'
                else:
                    tipo_evento = 'ENTRADA'

    foto = request.FILES.get('foto')

    # ── DETECCIÓN DE HORARIO INUSUAL / MADRUGADA ───────────────────────────
    if 1 <= dt_local.hour < 10:
        AlertaAsistencia.objects.create(
            tipo='MARCACION_SOSPECHOSA',
            empleado=empleado,
            titulo=f"Marcación fuera de horario: {empleado.nombre} {empleado.apellido}",
            mensaje=(
                f"Se detectó un marcaje a las {dt_local.strftime('%I:%M %p')} "
                f"({tipo_evento}), fuera del horario operativo regular del restaurante."
            ),
            leida=False
        )

    with transaction.atomic():
        registro = RegistroAsistencia.objects.create(
            empleado=empleado,
            tipo_evento=tipo_evento,
            foto_verificacion=foto if foto else None,
            fecha_hora=fecha_hora_registro,
            ip_address=_get_clean_ip(request)
        )

    # Calcular horas trabajadas hoy acumuladas hasta el momento
    registros_actualizados = list(RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_dt, end_dt)
    ).order_by('fecha_hora'))

    horas_netas_hoy = _calcular_horas_netas_dia(registros_actualizados)

    # ── ALERTA: ENTRADA sin SALIDA previa del día anterior ─────────────────
    # Si hoy el empleado marca ENTRADA pero ayer tenía una ENTRADA sin cerrar, alertar al admin
    if tipo_evento == 'ENTRADA':
        ayer = hoy - datetime.timedelta(days=1)
        start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
        end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
        regs_ayer = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_ayer, end_ayer)
        ).order_by('fecha_hora'))
        if regs_ayer:
            ultimo_ayer = regs_ayer[-1].tipo_evento
            if ultimo_ayer in ('ENTRADA', 'ENTRADA_QUEBRADA'):
                # Ayer quedó con entrada sin salida
                AlertaAsistencia.objects.get_or_create(
                    tipo='REGISTRO_INCOMPLETO',
                    empleado=empleado,
                    titulo=f"Registro incompleto: {empleado.nombre} {empleado.apellido}",
                    defaults={
                        'mensaje': (
                            f"El día {ayer.strftime('%d/%m/%Y')} el empleado registró "
                            f"{regs_ayer[-1].get_tipo_evento_display()} a las "
                            f"{regs_ayer[-1].fecha_hora.astimezone(timezone.get_current_timezone()).strftime('%I:%M %p')} "
                            f"pero nunca registró su Salida. "
                            f"Por favor, agregue la salida manualmente para calcular correctamente sus horas."
                        ),
                        'leida': False
                    }
                )

    # ── HORAS EXTRA: día con más de 8h → crear AutorizacionHorasExtra ──────
    if tipo_evento == 'SALIDA_DEFINITIVA' and horas_netas_hoy > 8.0:
        horas_extra = horas_netas_hoy - 8.0
        AutorizacionHorasExtra.objects.update_or_create(
            empleado=empleado,
            fecha=hoy,
            defaults={
                'horas_extra_solicitadas': round(horas_extra, 2),
                'estado': 'PENDIENTE'
            }
        )

    # ── HORAS EXTRA: 7mo día trabajado en la semana ─────────────────────────
    if tipo_evento == 'SALIDA_DEFINITIVA':
        _verificar_septimo_dia(empleado, hoy, horas_netas_hoy)

    # ── HORAS DEBIDAS: acumular déficit del día en horas_pendientes ─────────
    if tipo_evento == 'SALIDA_DEFINITIVA':
        _acumular_horas_pendientes(empleado, hoy, horas_netas_hoy)

    # ── DETECCIÓN DE PUNTUALIDAD Y CREACIÓN DE ALERTAS INTERNAS ─────────────
    try:
        hora_actual = registro.fecha_hora.astimezone(timezone.get_current_timezone())
        tipo = registro.tipo_evento
        
        # Determinar el turno según marcajes del día
        tiene_quebrado = any(r.tipo_evento in ['SALIDA_QUEBRADA', 'ENTRADA_QUEBRADA'] for r in registros_actualizados)
        primera_ent = next((r for r in registros_actualizados if r.tipo_evento in ['ENTRADA']), None)
        
        turno_detectado = 'Desconocido'
        if tiene_quebrado:
            turno_detectado = 'Quebrado'
        elif primera_ent:
            dt_ent = primera_ent.fecha_hora.astimezone(timezone.get_current_timezone())
            # Corrido 2 entra a las 3pm (hora >= 14:00, < 17:00)
            if 14 <= dt_ent.hour < 17:
                turno_detectado = 'Corrido 2'
            else:
                turno_detectado = 'Corrido 1'

        mins_marcados = hora_actual.hour * 60 + hora_actual.minute
        alerta_creada = False
        alerta_tipo = ''
        alerta_titulo = ''
        alerta_mensaje = ''

        if tipo == 'ENTRADA':
            # Corrido 1 / Quebrado → 12:00pm (720 min) | Corrido 2 → 3:00pm (900 min)
            target = 900 if turno_detectado == 'Corrido 2' else 720
            diff = mins_marcados - target
            # Alerta solo si es tardanza severa (>30 min) para no saturar al admin con nimiedades
            if diff > 30:
                alerta_creada = True
                alerta_tipo = 'TARDANZA'
                alerta_titulo = f"Tardanza severa: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = f"Llegó {diff} min tarde. Marcaje a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."

        elif tipo == 'SALIDA_DEFINITIVA':
            # Filosofía de 8 Horas: Alertar si el trabajador no cumplió al menos 7.5h en el día completo
            if horas_netas_hoy < 7.5:
                deficit_hrs = round(8.0 - horas_netas_hoy, 1)
                alerta_creada = True
                alerta_tipo = 'SALIDA_ANTICIPADA'
                alerta_titulo = f"Jornada incompleta: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = f"Se retiró antes de cumplir sus 8 horas. Acumuló {round(horas_netas_hoy, 1)} hrs hoy (Déficit de {deficit_hrs} hrs)."

        if alerta_creada:
            AlertaAsistencia.objects.create(
                tipo=alerta_tipo,
                empleado=empleado,
                titulo=alerta_titulo,
                mensaje=alerta_mensaje
            )
    except Exception as ex:
        print(f"Error procesando alertas: {ex}")

    horas_restantes_hoy = max(0.0, round(8.0 - horas_netas_hoy, 2))
    cumplio_meta = horas_netas_hoy >= 7.95

    if tipo_evento == 'ENTRADA':
        mensaje_kiosco = f"¡Hola {empleado.nombre}! Entrada registrada. Jornada iniciada."
    elif tipo_evento == 'SALIDA_QUEBRADA':
        mensaje_kiosco = f"¡Buen descanso, {empleado.nombre}! Llevas {round(horas_netas_hoy, 1)} hrs acumuladas. Te faltan {round(horas_restantes_hoy, 1)} hrs para tus 8h."
    elif tipo_evento == 'ENTRADA_QUEBRADA':
        mensaje_kiosco = f"¡Bienvenido de vuelta, {empleado.nombre}! Llevas {round(horas_netas_hoy, 1)} hrs del primer turno. Te restan {round(horas_restantes_hoy, 1)} hrs para tus 8h."
    elif tipo_evento == 'SALIDA_DEFINITIVA':
        if cumplio_meta:
            mensaje_kiosco = f"¡Excelente trabajo, {empleado.nombre}! Completaste {round(horas_netas_hoy, 1)} hrs hoy (Meta de 8 hrs cumplida 🎉). ¡Buen descanso!"
        else:
            mensaje_kiosco = f"Jornada finalizada, {empleado.nombre}. Acumulaste {round(horas_netas_hoy, 1)} hrs hoy (Déficit de {round(horas_restantes_hoy, 1)} hrs)."
    else:
        mensaje_kiosco = f"¡Hola {empleado.nombre}! Marcaje registrado correctamente."

    return Response({
        'status': 'ok',
        'mensaje': mensaje_kiosco,
        'registro': RegistroAsistenciaSerializer(registro, context={'request': request}).data,
        'horas_trabajadas_hoy': round(horas_netas_hoy, 2),
        'horas_restantes_hoy': round(horas_restantes_hoy, 2),
        'cumplio_meta_8h': cumplio_meta,
    })


def _calcular_horas_netas_dia(registros_dia):
    """
    Suma el tiempo entre ENTRADA -> SALIDA_QUEBRADA y ENTRADA_QUEBRADA -> SALIDA_DEFINITIVA.
    """
    total_segundos = 0
    entrada_temp = None

    for reg in registros_dia:
        if reg.tipo_evento in ('ENTRADA', 'ENTRADA_QUEBRADA'):
            entrada_temp = reg.fecha_hora
        elif reg.tipo_evento in ('SALIDA_QUEBRADA', 'SALIDA_DEFINITIVA') and entrada_temp:
            diferencia = (reg.fecha_hora - entrada_temp).total_seconds()
            if diferencia > 0:
                total_segundos += diferencia
            entrada_temp = None

    return total_segundos / 3600.0


def _acumular_horas_pendientes(empleado, fecha_hoy, horas_trabajadas_dia):
    """
    Si el empleado trabajó menos de 8 horas, acumula el déficit en horas_pendientes.
    Reinicia el saldo si el mes cambió desde el último registro del período.
    Las horas ordinarias se limitan a 8h por día (el exceso es horas extra, no reduce deuda).
    """
    horas_ordinarias = min(horas_trabajadas_dia, 8.0)
    deficit = max(0.0, 8.0 - horas_ordinarias)

    if deficit <= 0:
        return  # No hay deuda que acumular este día

    primer_dia_mes = fecha_hoy.replace(day=1)

    # Reiniciar si el período cambió (nuevo mes)
    if empleado.periodo_horas_pendientes != primer_dia_mes:
        empleado.horas_pendientes = 0.00
        empleado.periodo_horas_pendientes = primer_dia_mes

    empleado.horas_pendientes = float(empleado.horas_pendientes) + round(deficit, 2)
    empleado.save(update_fields=['horas_pendientes', 'periodo_horas_pendientes'])


def _verificar_septimo_dia(empleado, fecha_hoy, horas_trabajadas_dia):
    """
    Detecta si el empleado ya trabajó 6 días anteriores en la misma semana ISO.
    Si es así, las horas del día actual se generan como solicitud de horas extra.
    """
    import datetime
    # Semana ISO: Lunes=0, Domingo=6
    inicio_semana = fecha_hoy - datetime.timedelta(days=fecha_hoy.weekday())
    fin_semana = inicio_semana + datetime.timedelta(days=6)

    # Contar días distintos con al menos una ENTRADA en la semana (excluyendo hoy)
    dias_trabajados = RegistroAsistencia.objects.filter(
        empleado=empleado,
        tipo_evento='ENTRADA',
        fecha_hora__date__gte=inicio_semana,
        fecha_hora__date__lt=fecha_hoy,
    ).dates('fecha_hora', 'day').count()

    if dias_trabajados >= 6:
        # El empleado ya cumplió sus 6 días — hoy es el 7mo, todo va a extra
        horas_extra_7mo = min(horas_trabajadas_dia, 8.0)
        if horas_extra_7mo > 0:
            AutorizacionHorasExtra.objects.update_or_create(
                empleado=empleado,
                fecha=fecha_hoy,
                defaults={
                    'horas_extra_solicitadas': round(horas_extra_7mo, 2),
                    'estado': 'PENDIENTE'
                }
            )


# ==========================================
# 📊 GENERADOR DE REPORTES EXCEL DE NÓMINA
# ==========================================

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
@renderer_classes([ExcelBinaryRenderer, JSONRenderer])
def exportar_reporte_nomina_excel(request):
    """
    Genera una hoja de cálculo Excel (.xlsx) con el resumen de horas ordinarias y extras autorizadas.
    """
    try:
        import datetime
        from datetime import datetime as dt
        inicio_str = request.GET.get('fecha_inicio')
        fin_str = request.GET.get('fecha_fin')

        hoy = timezone.localdate()
        fecha_inicio = dt.strptime(inicio_str, '%Y-%m-%d').date() if inicio_str else hoy.replace(day=1)
        fecha_fin = dt.strptime(fin_str, '%Y-%m-%d').date() if fin_str else hoy

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "BodegónPass"
        ws.views.sheetView[0].showGridLines = True

        # Estilos de Excel (Basado en el Verde Institucional de El Bodegón)
        COLOR_HEADER = "1C6856"
        COLOR_TITLE = "134F42"
        font_titulo = Font(name='Calibri', size=16, bold=True, color='FFFFFF')
        font_sub = Font(name='Calibri', size=11, italic=True, color='FFFFFF')
        font_header = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
        font_data = Font(name='Calibri', size=11)
        font_bold = Font(name='Calibri', size=11, bold=True)

        fill_header = PatternFill(fill_type='solid', start_color=COLOR_HEADER, end_color=COLOR_HEADER)
        fill_title = PatternFill(fill_type='solid', start_color=COLOR_TITLE, end_color=COLOR_TITLE)
        fill_zebra = PatternFill(fill_type='solid', start_color='F9F9F9', end_color='F9F9F9')

        thin_border = Border(
            left=Side(style='thin', color='CCCCCC'),
            right=Side(style='thin', color='CCCCCC'),
            top=Side(style='thin', color='CCCCCC'),
            bottom=Side(style='thin', color='CCCCCC')
        )

        # Headers — ahora 10 columnas
        headers = [
            "ID",
            "Empleado",
            "Cargo / Puesto",
            "Días Trabajados",
            "Días Libres (Tomados)",
            "Ausencias Extra",
            "Horas Ordinarias",
            "Horas Feriados (Días)",
            "Horas Extra Aprobadas",
            "Horas Debidas (Déficit)",
        ]

        ws.merge_cells('A1:J1')
        ws['A1'] = "BODEGÓN PASS — REPORTE DE ASISTENCIA Y PERSONAL"
        ws['A1'].font = font_titulo
        ws['A1'].fill = fill_title
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('A2:J2')
        ws['A2'] = f"Período del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')} — Generado el {hoy.strftime('%d/%m/%Y')}"
        ws['A2'].font = font_sub
        ws['A2'].fill = fill_title
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')

        ws.append([])        # Fila 3 vacía
        ws.append(headers)   # Fila 4 Headers

        for col in range(1, 11):
            cell = ws.cell(row=4, column=col)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal='center', vertical='center')

        empleados = Empleado.objects.filter(activo=True)
        row_idx = 5

        # Obtener feriados en el rango
        feriados_set = set(DiaFeriado.objects.filter(
            fecha__gte=fecha_inicio,
            fecha__lte=fecha_fin
        ).values_list('fecha', flat=True))

        # El restaurante opera los 7 días — NO se excluye ningún día de la semana
        # Se calcula un total de días del período sin feriados
        total_dias_periodo = 0
        curr = fecha_inicio
        while curr <= fecha_fin:
            if curr not in feriados_set:
                total_dias_periodo += 1
            curr += datetime.timedelta(days=1)

        for emp in empleados:
            start_query = timezone.make_aware(datetime.datetime.combine(fecha_inicio, datetime.time.min), timezone.get_current_timezone())
            end_query = timezone.make_aware(datetime.datetime.combine(fecha_fin, datetime.time.max), timezone.get_current_timezone())
            
            registros = RegistroAsistencia.objects.filter(
                empleado=emp,
                fecha_hora__range=(start_query, end_query)
            ).order_by('fecha_hora')

            # Agrupar registros por día local (Nicaragua)
            horas_normales_trabajadas = 0.0
            feriados_trabajados_dias = 0
            feriados_trabajados_info = []
            dias_map = {}
            for reg in registros:
                reg_local = reg.fecha_hora.astimezone(timezone.get_current_timezone())
                dia_local = reg_local.date()
                if dia_local < fecha_inicio or dia_local > fecha_fin:
                    continue
                if dia_local not in dias_map:
                    dias_map[dia_local] = []
                dias_map[dia_local].append(reg)

            dias_trabajados = len(dias_map)

            for dia, regs in dias_map.items():
                horas_dia = _calcular_horas_netas_dia(regs)
                horas_ord = min(horas_dia, 8.0)
                if dia in feriados_set:
                    if horas_ord >= 8.0:
                        feriados_trabajados_dias += 1
                        desc_feriado = DiaFeriado.objects.filter(fecha=dia).first()
                        nombre_feriado = desc_feriado.descripcion if desc_feriado else "Día Feriado"
                        feriados_trabajados_info.append(
                            f"- {dia.strftime('%d/%m/%Y')}: {nombre_feriado} ({round(horas_ord, 2)} hrs)"
                        )
                    else:
                        horas_normales_trabajadas += horas_ord
                else:
                    horas_normales_trabajadas += horas_ord

            # ── Detectar días libres y ausencias extra usando lógica semanal ────
            # Por cada semana en el período, el primer día sin marcaje = día libre.
            # El 2do+ día sin marcaje = ausencia extra.
            dias_libres = 0
            ausencias_extra = 0
            horas_debidas = 0.0

            # Iterar semana por semana
            curr_day = fecha_inicio
            # Ir al inicio de la semana ISO del primer día
            semana_inicio = curr_day - datetime.timedelta(days=curr_day.weekday())
            semanas_procesadas = set()

            curr_day = fecha_inicio
            while curr_day <= fecha_fin:
                semana_key = curr_day - datetime.timedelta(days=curr_day.weekday())
                if semana_key not in semanas_procesadas:
                    semanas_procesadas.add(semana_key)
                    semana_fin = semana_key + datetime.timedelta(days=6)
                    # Limitar al rango del reporte
                    s_inicio = max(semana_key, fecha_inicio)
                    s_fin = min(semana_fin, fecha_fin)

                    ausencias_semana = 0
                    d = s_inicio
                    while d <= s_fin:
                        if d not in feriados_set:
                            if d not in dias_map:
                                # Día sin marcaje
                                if ausencias_semana == 0:
                                    dias_libres += 1  # Primera ausencia = día libre
                                else:
                                    ausencias_extra += 1  # Segunda+ = ausencia extra
                                    horas_debidas += 8.0   # Suma 8h de deuda
                                ausencias_semana += 1
                            else:
                                # Día trabajado: calcular déficit de horas
                                regs_d = dias_map[d]
                                horas_dia = _calcular_horas_netas_dia(regs_d)
                                horas_ord = min(horas_dia, 8.0)
                                deficit = max(0.0, 8.0 - horas_ord)
                                horas_debidas += deficit
                        d += datetime.timedelta(days=1)
                curr_day += datetime.timedelta(days=1)

            # Horas extra aprobadas
            from django.db.models import Sum
            horas_extra_aprobadas = AutorizacionHorasExtra.objects.filter(
                empleado=emp,
                fecha__gte=fecha_inicio,
                fecha__lte=fecha_fin,
                estado='APROBADO'
            ).aggregate(total=Sum('horas_extra_autorizadas'))['total'] or 0.0

            fila = [
                emp.id,
                f"{emp.nombre} {emp.apellido}",
                emp.get_cargo_display(),
                dias_trabajados,
                dias_libres,
                ausencias_extra,
                round(horas_normales_trabajadas, 2),
                feriados_trabajados_dias,
                round(float(horas_extra_aprobadas), 2),
                round(horas_debidas, 2),
            ]
            ws.append(fila)

            if feriados_trabajados_dias > 0 and feriados_trabajados_info:
                from openpyxl.comments import Comment
                comentario_texto = "Detalle de Feriados Laborados:\n" + "\n".join(feriados_trabajados_info)
                cell_feriado = ws.cell(row=row_idx, column=8)
                cell_feriado.comment = Comment(comentario_texto, "SGP El Bodegon")

            for col in range(1, 11):
                cell = ws.cell(row=row_idx, column=col)
                cell.font = font_data
                cell.border = thin_border
                if row_idx % 2 == 0:
                    cell.fill = fill_zebra
                if col in [1, 4, 5, 6, 7, 8, 9, 10]:
                    cell.alignment = Alignment(horizontal='right')
                else:
                    cell.alignment = Alignment(horizontal='left')

            row_idx += 1

        # Fila de Totales
        ws.append([])
        row_idx += 1
        ws.merge_cells(f'A{row_idx}:F{row_idx}')
        ws[f'A{row_idx}'] = "TOTALES GENERALES:"
        ws[f'A{row_idx}'].font = font_bold
        ws[f'A{row_idx}'].alignment = Alignment(horizontal='right')

        for col_letter, col_num in [('G', 7), ('H', 8), ('I', 9), ('J', 10)]:
            cell = ws[f'{col_letter}{row_idx}']
            cell.value = f"=SUM({col_letter}5:{col_letter}{row_idx-2})"
            cell.font = font_bold
            cell.border = thin_border
            cell.alignment = Alignment(horizontal='right')

        # Ajustar ancho de columnas
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

        from io import BytesIO
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        nombre_archivo = f"BodegonPass_Reporte_{fecha_inicio.strftime('%Y%m%d')}_{fecha_fin.strftime('%Y%m%d')}.xlsx"
        response = HttpResponse(buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        response['X-Filename'] = nombre_archivo
        response['Access-Control-Expose-Headers'] = 'Content-Disposition, X-Filename'

        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='EXPORTAR_NOMINA',
            descripcion=f"Reporte de horas y asistencia Excel exportado ({fecha_inicio} a {fecha_fin}).",
            ip_address=_get_clean_ip(request)
        )

        return response

    except Exception as e:
        return Response({'detail': f'Error generando reporte Excel: {str(e)}'}, status=500)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def sync_batch_asistencia(request):
    """
    Sincroniza un lote de marcajes registrados sin conexión.
    """
    payload = request.data
    if not isinstance(payload, list):
        return Response({'detail': 'Se requiere una lista de marcajes.'}, status=400)

    # Ordenar cronológicamente por fecha_hora para garantizar que la auto-detección
    # de eventos se realice en la secuencia correcta.
    try:
        payload = sorted(payload, key=lambda x: x.get('fecha_hora', ''))
    except Exception as e:
        print(f"Error ordenando payload de sincronización: {e}")

    respuestas = []
    for item in payload:
        qr_code_token = item.get('qr_code_token')
        tipo_evento = item.get('tipo_evento')
        fecha_hora_str = item.get('fecha_hora')
        foto = item.get('foto')

        # 1. Validar HMAC
        import hmac
        import hashlib
        from django.conf import settings

        if not qr_code_token or '.' not in qr_code_token:
            respuestas.append({'status': 'error', 'mensaje': 'Formato QR inválido.', 'token': qr_code_token})
            continue

        raw_uuid, signature = qr_code_token.split('.', 1)
        expected_signature = hmac.new(
            settings.SECRET_KEY.encode('utf-8'),
            raw_uuid.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()[:16]

        if not hmac.compare_digest(signature, expected_signature):
            respuestas.append({'status': 'error', 'mensaje': 'Firma QR no válida.', 'token': qr_code_token})
            continue

        # 2. Buscar Empleado
        try:
            empleado = Empleado.objects.get(qr_code_token=qr_code_token, activo=True)
        except Empleado.DoesNotExist:
            respuestas.append({'status': 'error', 'mensaje': 'Empleado no encontrado o inactivo.', 'token': qr_code_token})
            continue

        # 3. Guardar registro
        from django.core.files.base import ContentFile
        import base64
        from django.utils.dateparse import parse_datetime
        import datetime

        foto_file = None
        if foto and ',' in foto:
            try:
                format, imgstr = foto.split(';base64,')
                ext = format.split('/')[-1]
                foto_file = ContentFile(base64.b64decode(imgstr), name=f"{empleado.id}_{int(timezone.now().timestamp())}.{ext}")
            except Exception as e:
                print(f"Error procesando base64: {e}")

        fecha_hora = parse_datetime(fecha_hora_str) if fecha_hora_str else timezone.now()
        # Asegurar zona horaria correcta
        if fecha_hora and timezone.is_naive(fecha_hora):
            fecha_hora = timezone.make_aware(fecha_hora, timezone.get_current_timezone())

        # Auto-detectar tipo_evento si no se proporciona
        if not tipo_evento:
            dt_local = fecha_hora.astimezone(timezone.get_current_timezone())
            dia = dt_local.date()
            start_dt = timezone.make_aware(datetime.combine(dia, datetime.time.min), timezone.get_current_timezone())
            end_dt = timezone.make_aware(datetime.combine(dia, datetime.time.max), timezone.get_current_timezone())
            
            registros_hoy = RegistroAsistencia.objects.filter(
                empleado=empleado,
                fecha_hora__range=(start_dt, end_dt)
            ).order_by('fecha_hora')

            if empleado.tipo_turno == 'QUEBRADO':
                if not registros_hoy.exists():
                    tipo_evento = 'ENTRADA'
                else:
                    ultimo_evento = registros_hoy.last().tipo_evento
                    if ultimo_evento == 'ENTRADA':
                        tipo_evento = 'SALIDA_QUEBRADA'
                    elif ultimo_evento == 'SALIDA_QUEBRADA':
                        tipo_evento = 'ENTRADA_QUEBRADA'
                    elif ultimo_evento == 'ENTRADA_QUEBRADA':
                        tipo_evento = 'SALIDA_DEFINITIVA'
                    else:
                        tipo_evento = 'ENTRADA'
            else:  # CORRIDO
                if not registros_hoy.exists():
                    tipo_evento = 'ENTRADA'
                else:
                    ultimo_evento = registros_hoy.last().tipo_evento
                    if ultimo_evento == 'ENTRADA':
                        tipo_evento = 'SALIDA_DEFINITIVA'
                    else:
                        tipo_evento = 'ENTRADA'

        with transaction.atomic():
            registro = RegistroAsistencia.objects.create(
                empleado=empleado,
                tipo_evento=tipo_evento,
                foto_verificacion=foto_file,
                fecha_hora=fecha_hora,
                ip_address=_get_clean_ip(request)
            )

        # Calcular horas hoy y verificar tardanzas
        dt_local = fecha_hora.astimezone(timezone.get_current_timezone())
        dia = dt_local.date()
        
        import datetime
        start_dt = timezone.make_aware(datetime.datetime.combine(dia, datetime.time.min), timezone.get_current_timezone())
        end_dt = timezone.make_aware(datetime.datetime.combine(dia, datetime.time.max), timezone.get_current_timezone())
        
        registros_actualizados = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_dt, end_dt)
        ).order_by('fecha_hora'))

        # Lógica de horas extras y déficit
        horas_netas_hoy = _calcular_horas_netas_dia(registros_actualizados)

        # Si es ENTRADA, revisar si el día previo quedó sin salida
        if tipo_evento == 'ENTRADA':
            ayer = dia - datetime.timedelta(days=1)
            start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
            end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
            regs_ayer = list(RegistroAsistencia.objects.filter(
                empleado=empleado,
                fecha_hora__range=(start_ayer, end_ayer)
            ).order_by('fecha_hora'))
            if regs_ayer:
                ultimo_ayer = regs_ayer[-1].tipo_evento
                if ultimo_ayer in ('ENTRADA', 'ENTRADA_QUEBRADA'):
                    AlertaAsistencia.objects.get_or_create(
                        tipo='REGISTRO_INCOMPLETO',
                        empleado=empleado,
                        titulo=f"Registro incompleto (Offline): {empleado.nombre} {empleado.apellido}",
                        defaults={
                            'mensaje': (
                                f"El día {ayer.strftime('%d/%m/%Y')} el empleado registró "
                                f"{regs_ayer[-1].get_tipo_evento_display()} "
                                f"pero nunca registró su Salida. Por favor, agregue la salida manualmente."
                            ),
                            'leida': False
                        }
                    )

        if tipo_evento == 'SALIDA_DEFINITIVA':
            if horas_netas_hoy > 8.0:
                horas_extra = horas_netas_hoy - 8.0
                AutorizacionHorasExtra.objects.update_or_create(
                    empleado=empleado,
                    fecha=dia,
                    defaults={
                        'horas_extra_solicitadas': round(horas_extra, 2),
                        'estado': 'PENDIENTE'
                    }
                )
            # 7mo día de la semana
            _verificar_septimo_dia(empleado, dia, horas_netas_hoy)
            # Horas debidas / pendientes
            _acumular_horas_pendientes(empleado, dia, horas_netas_hoy)

        # Alertas de asistencia
        try:
            tiene_quebrado = any(r.tipo_evento in ['SALIDA_QUEBRADA', 'ENTRADA_QUEBRADA'] for r in registros_actualizados)
            primera_ent = next((r for r in registros_actualizados if r.tipo_evento in ['ENTRADA', 'ENTRADA_QUEBRADA']), None)
            
            turno_detectado = 'Desconocido'
            if tiene_quebrado:
                turno_detectado = 'Quebrado'
            elif primera_ent:
                dt_ent = primera_ent.fecha_hora.astimezone(timezone.get_current_timezone())
                if dt_ent.hour >= 14:
                    turno_detectado = 'Corrido 2'
                else:
                    turno_detectado = 'Corrido 1'

            hora_actual = registro.fecha_hora.astimezone(timezone.get_current_timezone())
            mins_marcados = hora_actual.hour * 60 + hora_actual.minute
            alerta_creada = False
            alerta_tipo = ''
            alerta_titulo = ''
            alerta_mensaje = ''

            if tipo_evento == 'ENTRADA':
                target = 720
                if turno_detectado == 'Corrido 2' or (turno_detectado == 'Desconocido' and mins_marcados > 810):
                    target = 900
                diff = mins_marcados - target
                if diff > 10:
                    alerta_creada = True
                    alerta_tipo = 'TARDANZA'
                    alerta_titulo = f"Tardanza (Offline): {empleado.nombre} {empleado.apellido}"
                    alerta_mensaje = f"Llegó {diff} minutos tarde. Marcaje offline a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."
            elif tipo_evento == 'ENTRADA_QUEBRADA':
                target = 1080
                diff = mins_marcados - target
                if diff > 10:
                    alerta_creada = True
                    alerta_tipo = 'TARDANZA'
                    alerta_titulo = f"Tardanza Regreso (Offline): {empleado.nombre} {empleado.apellido}"
                    alerta_mensaje = f"Regresó de la pausa {diff} minutos tarde. Marcaje offline a las {hora_actual.strftime('%I:%M %p')}."
            elif tipo_evento == 'SALIDA_QUEBRADA':
                target = 900
                diff = target - mins_marcados
                if diff > 5:
                    alerta_creada = True
                    alerta_tipo = 'SALIDA_ANTICIPADA'
                    alerta_titulo = f"Salida anticipada Pausa (Offline): {empleado.nombre} {empleado.apellido}"
                    alerta_mensaje = f"Se retiró a la pausa {diff} minutos antes. Marcaje offline a las {hora_actual.strftime('%I:%M %p')}."
            elif tipo_evento == 'SALIDA_DEFINITIVA':
                target = 1380
                if turno_detectado == 'Corrido 1':
                    target = 1200
                diff = target - mins_marcados
                if diff > 5:
                    alerta_creada = True
                    alerta_tipo = 'SALIDA_ANTICIPADA'
                    alerta_titulo = f"Salida definitiva anticipada (Offline): {empleado.nombre} {empleado.apellido}"
                    alerta_mensaje = f"Salió {diff} minutos antes de su turno. Marcaje offline a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."

            if alerta_creada:
                AlertaAsistencia.objects.create(
                    tipo=alerta_tipo,
                    empleado=empleado,
                    titulo=alerta_titulo,
                    mensaje=alerta_mensaje
                )
        except Exception as ex:
            print(f"Error procesando alertas batch: {ex}")

        respuestas.append({'status': 'ok', 'id': registro.id, 'empleado': empleado.nombre})

    return Response({'status': 'ok', 'sincronizados': respuestas})
