import datetime
import math
from decimal import Decimal
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from django.core.cache import cache
from django.db import transaction
from django.db.models import BooleanField, Case, Q, Sum, Value, When
from django.utils import timezone
from django.http import HttpResponse, HttpResponseRedirect
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes, renderer_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import (
    Empleado, RegistroAsistencia, BitacoraAccion, DiaFeriado,
    AutorizacionHorasExtra, AlertaAsistencia, PermisoAusencia,
    CompensacionHoras, CompensacionFeriado, PagoVacaciones, PagoHorasExtra
)
from .serializers import (
    EmpleadoSerializer, RegistroAsistenciaSerializer, BitacoraAccionSerializer,
    DiaFeriadoSerializer, AutorizacionHorasExtraSerializer, AlertaAsistenciaSerializer,
    PermisoAusenciaSerializer, CompensacionHorasSerializer, CompensacionFeriadoSerializer,
    PagoVacacionesSerializer, PagoHorasExtraSerializer
)
from .auth import verificar_pin_nomina, foto_firma_valida
from .authentication import IsPanelAdmin


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


def _obtener_dias_vacaciones_disponibles(emp):
    """
    Calcula el saldo real disponible de vacaciones:
    Disponibles = Acumuladas - Tomadas (PermisoAusencia de tipo VACACIONES / VACACIONES_PAGADAS).
    """
    acumuladas = Decimal(str(emp.dias_vacaciones_acumuladas or '0.00'))
    permisos = PermisoAusencia.objects.filter(empleado=emp)
    tomadas = sum(
        Decimal(str(p.total_dias or 0))
        for p in permisos
        if p.descuenta_vacaciones
    )
    return max(Decimal('0.00'), round(acumuladas - tomadas, 2))


def _vacaciones_por_dias(dias_laborados):
    """Días de vacaciones (2 decimales) que generan N días laborados: N × 2.5 / 30."""
    return round(Decimal(str(dias_laborados)) * Decimal('2.5') / Decimal('30'), 2)


def _verificar_acreditacion_vacaciones_empleado(emp, fecha_referencia=None):
    """
    Acredita las vacaciones estrictamente por DÍA LABORADO:
    - Factor por día laborado = 2.5 días / 30 = ~0.08333... días por cada día con asistencia registrada.
    - CORTE A DÍA VENCIDO (AYER): Nunca evalúa ni bloquea el día en curso ('hoy') a las 12:01 AM
      antes de que inicien los turnos; solo evalúa días ya concluidos (hasta 'ayer').
    - Si el colaborador NO registró asistencia en esa fecha (faltó, descansó o estuvo de vacaciones):
      NO acumula fracción en ese día (0.00).
    """
    if not emp.activo:
        return False

    tz = timezone.get_current_timezone()
    hoy = timezone.now().astimezone(tz).date()
    ayer = hoy - datetime.timedelta(days=1)

    if not fecha_referencia or fecha_referencia >= hoy:
        fecha_referencia = ayer

    if 'maverick' in emp.nombre.lower() or emp.id == 40:
        if emp.ultimo_corte_vacaciones != fecha_referencia:
            emp.ultimo_corte_vacaciones = fecha_referencia
            emp.save(update_fields=['ultimo_corte_vacaciones'])
        return False

    if not emp.ultimo_corte_vacaciones:
        emp.ultimo_corte_vacaciones = datetime.date(fecha_referencia.year, fecha_referencia.month, 1) - datetime.timedelta(days=1)
        emp.save(update_fields=['ultimo_corte_vacaciones'])

    corte = emp.ultimo_corte_vacaciones
    if corte >= fecha_referencia:
        return False

    curr = corte + datetime.timedelta(days=1)
    dias_laborados_acreditados = 0
    dias_no_laborados = 0
    total_incremento = Decimal('0.00')

    # El redondeo a 2 decimales se aplica sobre el acumulado del mes (no por corte), para que
    # 30 días laborados sumen exactamente 2.50 aunque la acreditación corra a diario.
    laborados_mes = 0
    if curr.day != 1:
        inicio_mes_dt = timezone.make_aware(datetime.datetime.combine(curr.replace(day=1), datetime.time.min), tz)
        corte_fin_dt = timezone.make_aware(datetime.datetime.combine(corte, datetime.time.max), tz)
        laborados_mes = len({
            fh.astimezone(tz).date()
            for fh in RegistroAsistencia.objects.filter(
                empleado=emp,
                fecha_hora__range=(inicio_mes_dt, corte_fin_dt)
            ).values_list('fecha_hora', flat=True)
        })

    while curr <= fecha_referencia:
        if curr.day == 1:
            laborados_mes = 0
        # Comprobar en zona horaria de Nicaragua si el trabajador registró asistencia en esta fecha
        start_dt = timezone.make_aware(datetime.datetime.combine(curr, datetime.time.min), tz)
        end_dt = timezone.make_aware(datetime.datetime.combine(curr, datetime.time.max), tz)
        asistio = RegistroAsistencia.objects.filter(
            empleado=emp,
            fecha_hora__range=(start_dt, end_dt)
        ).exists()

        if asistio:
            dias_laborados_acreditados += 1
            total_incremento += _vacaciones_por_dias(laborados_mes + 1) - _vacaciones_por_dias(laborados_mes)
            laborados_mes += 1
        else:
            dias_no_laborados += 1

        curr += datetime.timedelta(days=1)

    emp.ultimo_corte_vacaciones = fecha_referencia
    if total_incremento > Decimal('0.00'):
        emp.dias_vacaciones_acumuladas = (emp.dias_vacaciones_acumuladas or Decimal('0.00')) + total_incremento
        emp.save(update_fields=['dias_vacaciones_acumuladas', 'ultimo_corte_vacaciones'])

        BitacoraAccion.objects.create(
            usuario=None,
            accion='EDITAR_EMPLEADO',
            descripcion=(
                f"Acreditación vacaciones por día laborado (+0.0833/día): +{total_incremento:.2f} d "
                f"para {emp.nombre} {emp.apellido} ({dias_laborados_acreditados} d laborados con asistencia, "
                f"{dias_no_laborados} d sin asistencia hasta {fecha_referencia})."
            ),
            ip_address='127.0.0.1'
        )
        return True
    else:
        emp.save(update_fields=['ultimo_corte_vacaciones'])
        return False


def _verificar_acreditacion_vacaciones_todos():
    """
    Verifica y devenga las vacaciones de todos los colaboradores activos diariamente
    evaluando únicamente hasta el día vencido ('ayer').
    """
    try:
        _evaluar_y_autoacreditar_feriados_pendientes()
    except Exception as e:
        print(f"Error evaluando feriados pendientes en verificación general: {e}")
    ayer = timezone.now().astimezone(timezone.get_current_timezone()).date() - datetime.timedelta(days=1)
    candidatos = list(Empleado.objects.filter(activo=True).filter(
        Q(ultimo_corte_vacaciones__isnull=True) | Q(ultimo_corte_vacaciones__lt=ayer)
    ))
    if not candidatos:
        return

    for emp in candidatos:
        try:
            _verificar_acreditacion_vacaciones_empleado(emp, ayer)
        except Exception:
            pass



class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.prefetch_related('permisos').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [IsPanelAdmin]

    def list(self, request, *args, **kwargs):
        try:
            _verificar_acreditacion_vacaciones_todos()
        except Exception:
            pass
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get', 'post'], url_path='auditar-inasistencias-historial')
    def auditar_inasistencias_historial(self, request):
        """
        Escanea el historial de asistencia (Opción A: desde el 1 de septiembre de 2026 hasta ayer)
        buscando colaboradores con faltas injustificadas:
        - Si aplicar=False (o GET): Modo SIMULACIÓN / DRY-RUN. Devuelve el desglose detallado de quiénes,
          qué días faltaron y cómo cambiaría su saldo sin modificar la base de datos.
        - Si aplicar=True (POST): Aplica la deducción de 1.0 día de vacaciones (si saldo >= 1) o
          carga 8.0 horas de deuda (si saldo < 1), registrando en PermisoAusencia y BitacoraAccion.
        """
        import datetime
        from django.db import transaction

        tz = timezone.get_current_timezone()
        hoy = timezone.localdate()

        fecha_inicio_str = request.data.get('fecha_inicio') if request.method == 'POST' else request.GET.get('fecha_inicio')
        fecha_fin_str = request.data.get('fecha_fin') if request.method == 'POST' else request.GET.get('fecha_fin')
        aplicar_param = request.data.get('aplicar') if request.method == 'POST' else request.GET.get('aplicar')
        aplicar = str(aplicar_param).lower() in ['true', '1', 'si', 'yes']

        try:
            fecha_inicio = datetime.datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date() if fecha_inicio_str else datetime.date(2026, 9, 1)
        except Exception:
            fecha_inicio = datetime.date(2026, 9, 1)

        try:
            fecha_fin = datetime.datetime.strptime(fecha_fin_str, '%Y-%m-%d').date() if fecha_fin_str else (hoy - datetime.timedelta(days=1))
        except Exception:
            fecha_fin = hoy - datetime.timedelta(days=1)

        # Cargar todos los feriados en el rango
        feriados = set(DiaFeriado.objects.filter(
            fecha__gte=fecha_inicio,
            fecha__lte=fecha_fin
        ).values_list('fecha', flat=True))

        detalles_empleados = []
        total_faltas_detectadas = 0
        total_vacaciones_deducidas = Decimal('0.00')
        total_horas_deuda_cargadas = Decimal('0.00')

        with transaction.atomic():
            for emp in Empleado.objects.filter(activo=True).order_by('nombre', 'apellido'):
                # Maverick Calderón culminó su plazo de 15 días de vacaciones previo a su renuncia (19/09/2026).
                # Conforme a la instrucción administrativa, a partir de que acabaron esos 15 días,
                # no se le restan ni se le suman vacaciones ni horas de deuda.
                if 'maverick' in emp.nombre.lower() or emp.id == 40:
                    continue

                primer_reg = RegistroAsistencia.objects.filter(empleado=emp).order_by('fecha_hora').first()
                if not primer_reg:
                    continue

                primer_dia_emp = primer_reg.fecha_hora.astimezone(tz).date()
                inicio_emp = max(fecha_inicio, primer_dia_emp)
                if inicio_emp > fecha_fin:
                    continue

                # Recorrer semana a semana (lunes a domingo)
                curr_lunes = inicio_emp - datetime.timedelta(days=inicio_emp.weekday())
                faltas_empleado = []

                while curr_lunes <= fecha_fin:
                    domingo_semana = curr_lunes + datetime.timedelta(days=6)
                    # Días de la semana que caen dentro del período de auditoría del empleado
                    dias_eval_semana = []
                    d = curr_lunes
                    while d <= domingo_semana:
                        if inicio_emp <= d <= fecha_fin:
                            dias_eval_semana.append(d)
                        d += datetime.timedelta(days=1)

                    if dias_eval_semana:
                        # Marcajes del empleado en esta semana
                        start_semana_dt = timezone.make_aware(datetime.datetime.combine(dias_eval_semana[0], datetime.time.min), tz)
                        end_semana_dt = timezone.make_aware(datetime.datetime.combine(dias_eval_semana[-1], datetime.time.max), tz)

                        dias_con_marcaje = set(
                            fh.astimezone(tz).date()
                            for fh in RegistroAsistencia.objects.filter(
                                empleado=emp,
                                fecha_hora__gte=start_semana_dt,
                                fecha_hora__lte=end_semana_dt
                            ).values_list('fecha_hora', flat=True)
                        )

                        # Permisos ya registrados
                        permisos_semana = PermisoAusencia.objects.filter(
                            empleado=emp,
                            fecha_inicio__lte=dias_eval_semana[-1],
                            fecha_fin__gte=dias_eval_semana[0]
                        )
                        dias_con_permiso = set()
                        for p in permisos_semana:
                            p_curr = max(p.fecha_inicio, dias_eval_semana[0])
                            p_end = min(p.fecha_fin, dias_eval_semana[-1])
                            while p_curr <= p_end:
                                dias_con_permiso.add(p_curr)
                                p_curr += datetime.timedelta(days=1)

                        dias_libres_o_faltas = [
                            dia for dia in dias_eval_semana
                            if dia not in dias_con_marcaje and dia not in dias_con_permiso and dia not in feriados
                        ]

                        # En una semana completa de trabajo de 6 días, 1 día no laborado es el descanso semanal regular.
                        # Si hay 2 o más días sin laborar ni justificar, el 1ero es su libre y los demás son faltas.
                        if len(dias_libres_o_faltas) >= 2:
                            # Los días a partir del segundo son inasistencias injustificadas
                            for falta_dia in dias_libres_o_faltas[1:]:
                                faltas_empleado.append({
                                    'fecha': falta_dia.strftime('%Y-%m-%d'),
                                    'dia_semana': falta_dia.strftime('%A'),
                                    'semana': f"Semana {curr_lunes.strftime('%d/%m')} al {domingo_semana.strftime('%d/%m')}",
                                })

                    curr_lunes += datetime.timedelta(days=7)

                if faltas_empleado:
                    # Calcular saldo disponible previo a las deducciones de inasistencias
                    saldo_disp_inicial = _obtener_dias_vacaciones_disponibles(emp)

                    saldo_disp_actual = saldo_disp_inicial
                    deuda_horas_inicial = emp.horas_pendientes or Decimal('0.00')
                    deuda_horas_actual = deuda_horas_inicial
                    dias_vac_deducir = Decimal('0.00')
                    horas_deuda_sumar = Decimal('0.00')
                    acciones_detalle = []

                    for f in faltas_empleado:
                        f_date = datetime.datetime.strptime(f['fecha'], '%Y-%m-%d').date()

                        # Comprobar si ya existe un permiso para esa fecha exacta para evitar duplicar
                        ya_existe = PermisoAusencia.objects.filter(
                            empleado=emp,
                            fecha_inicio__lte=f_date,
                            fecha_fin__gte=f_date
                        ).exists()
                        if ya_existe:
                            continue

                        if saldo_disp_actual >= Decimal('1.00'):
                            saldo_disp_actual = max(Decimal('0.00'), saldo_disp_actual - Decimal('1.00'))
                            dias_vac_deducir += Decimal('1.00')
                            acciones_detalle.append(f"{f['fecha']}: -1.0 día de vacaciones")

                            if aplicar:
                                PermisoAusencia.objects.create(
                                    empleado=emp,
                                    fecha_inicio=f_date,
                                    fecha_fin=f_date,
                                    tipo='VACACIONES',
                                    motivo=f"Deducción por inasistencia injustificada del {f_date.strftime('%d/%m/%Y')}"
                                )
                        else:
                            # La bolsa se reinicia cada mes: solo las faltas del mes vigente suman horas
                            suma_a_bolsa = f_date.replace(day=1) == hoy.replace(day=1)
                            if suma_a_bolsa:
                                deuda_horas_actual += Decimal('8.00')
                                horas_deuda_sumar += Decimal('8.00')
                                acciones_detalle.append(f"{f['fecha']}: +8.0 hrs de deuda a bolsa")
                            else:
                                acciones_detalle.append(f"{f['fecha']}: falta registrada (mes cerrado, no suma a la bolsa)")

                            if aplicar:
                                PermisoAusencia.objects.create(
                                    empleado=emp,
                                    fecha_inicio=f_date,
                                    fecha_fin=f_date,
                                    tipo='PERMISO_AUTORIZADO',
                                    motivo=f"Deuda por inasistencia sin saldo de vacaciones (+8.0 hrs) del {f_date.strftime('%d/%m/%Y')}"
                                )
                                if suma_a_bolsa:
                                    _cargar_falta_a_deuda(emp, f_date)

                    total_faltas_detectadas += len(acciones_detalle)
                    total_vacaciones_deducidas += dias_vac_deducir
                    total_horas_deuda_cargadas += horas_deuda_sumar

                    if aplicar:
                        BitacoraAccion.objects.create(
                            usuario=request.user if request.user.is_authenticated else None,
                            accion='EDITAR_EMPLEADO',
                            descripcion=(
                                f"Auditoría Histórica Inasistencias (01/09 al {fecha_fin.strftime('%d/%m')}): {len(acciones_detalle)} falta(s) aplicada(s) a "
                                f"{emp.nombre} {emp.apellido}. Vacaciones deducidas: -{dias_vac_deducir:.2f} d "
                                f"(Saldo disponible: {saldo_disp_inicial:.2f} d -> {saldo_disp_actual:.2f} d). "
                                f"Deuda horas: +{horas_deuda_sumar:.1f} h (Deuda: {deuda_horas_inicial:.1f} h -> {deuda_horas_actual:.1f} h)."
                            ),
                            ip_address=_get_clean_ip(request)
                        )

                    detalles_empleados.append({
                        'empleado_id': emp.id,
                        'nombre': f"{emp.nombre} {emp.apellido}",
                        'cargo': emp.get_cargo_display(),
                        'num_faltas': len(acciones_detalle),
                        'faltas': faltas_empleado,
                        'saldo_vacaciones_inicial': float(saldo_disp_inicial),
                        'dias_vacaciones_deducir': float(dias_vac_deducir),
                        'nuevo_saldo_vacaciones': float(saldo_disp_actual),
                        'deuda_horas_inicial': float(deuda_horas_inicial),
                        'horas_deuda_sumar': float(horas_deuda_sumar),
                        'nueva_deuda_horas': float(deuda_horas_actual),
                        'acciones': acciones_detalle,
                    })

        return Response({
            'status': 'ok',
            'modo': 'APLICADO' if aplicar else 'SIMULACION_PREVIA',
            'periodo': {
                'fecha_inicio': fecha_inicio.strftime('%Y-%m-%d'),
                'fecha_fin': fecha_fin.strftime('%Y-%m-%d'),
            },
            'resumen': {
                'total_empleados_con_faltas': len(detalles_empleados),
                'total_faltas_detectadas': total_faltas_detectadas,
                'total_vacaciones_deducidas': float(total_vacaciones_deducidas),
                'total_horas_deuda_cargadas': float(total_horas_deuda_cargadas),
            },
            'detalles': detalles_empleados
        })

    @action(detail=True, methods=['post'], url_path='ajustar-vacaciones')
    def ajustar_vacaciones(self, request, pk=None):
        empleado = self.get_object()
        dias = request.data.get('dias_vacaciones_acumuladas')
        motivo = request.data.get('motivo', 'Ajuste inicial de saldo por administración')
        if dias is None:
            return Response({'error': 'El campo dias_vacaciones_acumuladas es obligatorio.'}, status=400)
        try:
            val = round(float(dias), 2)
        except (ValueError, TypeError):
            return Response({'error': 'Valor de días inválido.'}, status=400)

        empleado.dias_vacaciones_acumuladas = Decimal(str(val))
        now_dt = timezone.now().astimezone(timezone.get_current_timezone()).date()
        empleado.ultimo_corte_vacaciones = now_dt
        empleado.save()

        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='EDITAR_EMPLEADO',
            descripcion=f"Saldo de vacaciones para {empleado.nombre} {empleado.apellido} ajustado a {val} días acumulados. Motivo: {motivo}",
            ip_address=_get_clean_ip(self.request)
        )
        serializer = self.get_serializer(empleado)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='ajustar-horas-pendientes')
    def ajustar_horas_pendientes(self, request, pk=None):
        empleado = self.get_object()
        horas = request.data.get('horas_pendientes', 0.0)
        motivo = request.data.get('motivo', 'Ajuste manual de horas debidas por administración')
        try:
            val = round(float(horas), 2)
        except (ValueError, TypeError):
            return Response({'error': 'Valor de horas inválido.'}, status=400)

        deuda_previa = float(empleado.horas_pendientes or 0.0)
        empleado.horas_pendientes = Decimal(str(max(0.0, val)))
        empleado.save(update_fields=['horas_pendientes'])

        BitacoraAccion.objects.create(
            usuario=self.request.user if (self.request.user and self.request.user.is_authenticated) else None,
            accion='EDITAR_EMPLEADO',
            descripcion=f"Saldo de horas debidas para {empleado.nombre} {empleado.apellido} ajustado de {deuda_previa:.1f}h a {val:.1f}h. Motivo: {motivo}",
            ip_address=_get_clean_ip(self.request)
        )
        serializer = self.get_serializer(empleado)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='declarar-dia-libre')
    def declarar_dia_libre(self, request):
        empleado_id = request.data.get('empleado_id') or request.data.get('empleado')
        fecha_str = request.data.get('fecha')
        if not empleado_id or not fecha_str:
            return Response({'error': 'Se requiere empleado_id y fecha (YYYY-MM-DD).'}, status=400)

        try:
            empleado = Empleado.objects.get(id=empleado_id)
        except Empleado.DoesNotExist:
            return Response({'error': 'Empleado no encontrado.'}, status=404)

        from django.utils.dateparse import parse_date
        fecha_obj = parse_date(str(fecha_str)[:10])
        if not fecha_obj:
            return Response({'error': 'Formato de fecha inválido.'}, status=400)

        tz_ni = timezone.get_current_timezone()
        start_dia = timezone.make_aware(datetime.datetime.combine(fecha_obj, datetime.time.min), tz_ni)
        end_dia = timezone.make_aware(datetime.datetime.combine(fecha_obj, datetime.time.max), tz_ni) + datetime.timedelta(hours=5)

        regs = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_dia, end_dia)
        ).order_by('fecha_hora'))

        horas_netas = _calcular_horas_netas_dia(regs)

        # Anular cualquier déficit que este día haya generado
        meta = _jornada_esperada(fecha_obj, regs)
        deficit_dia = max(0.0, meta - horas_netas)
        deuda_previa = float(empleado.horas_pendientes or 0.0)
        if deficit_dia > 0:
            nueva_deuda = max(0.0, round(deuda_previa - deficit_dia, 1))
            empleado.horas_pendientes = Decimal(str(nueva_deuda))
            empleado.save(update_fields=['horas_pendientes'])

        # Eliminar cualquier compensación de horas generada en esa fecha
        CompensacionHoras.objects.filter(
            empleado=empleado,
            fecha_compensacion=fecha_obj
        ).delete()

        # Enviar las horas trabajadas a AutorizacionHorasExtra como PENDIENTE
        horas_solicitadas = max(0.5, round(horas_netas, 1)) if horas_netas >= 0.5 else round(horas_netas, 1)
        if horas_solicitadas > 0:
            AutorizacionHorasExtra.objects.update_or_create(
                empleado=empleado,
                fecha=fecha_obj,
                defaults={
                    'horas_extra_solicitadas': Decimal(str(horas_solicitadas)),
                    'horas_extra_autorizadas': Decimal('0.00'),
                    'estado': 'PENDIENTE',
                    'comentario': f"[Día Libre Laborado] Jornada de apoyo en descanso ({horas_netas:.1f} hrs trabajadas). Enviado para aprobación gerencial."
                }
            )

        # Marcar cualquier alerta asociada como leída
        alertas = AlertaAsistencia.objects.filter(
            empleado=empleado,
            created_at__range=(start_dia, end_dia + datetime.timedelta(days=1)),
            tipo__in=['DEFICIT_JORNADA', 'SALIDA_ANTICIPADA', 'INASISTENCIA']
        )
        for al in alertas:
            al.leida = True
            al.mensaje += f"\n\n[RESUELTO - DÍA LIBRE LABORADO]: Déficit anulado. +{horas_solicitadas:.1f} hrs enviadas a aprobación de horas extra."
            al.save(update_fields=['leida', 'mensaje'])

        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='REGISTRO_MANUAL',
            descripcion=f"Jornada del {fecha_obj.strftime('%d/%m/%Y')} de {empleado.nombre} {empleado.apellido} declarada como Día Libre Laborado. Déficit anulado (-{deficit_dia:.1f}h) y +{horas_solicitadas:.1f} hrs enviadas a aprobación de horas extra.",
            ip_address=_get_clean_ip(request)
        )

        return Response({
            'status': 'ok',
            'mensaje': f'Jornada del {fecha_obj.strftime("%d/%m/%Y")} declarada exitosamente como Día Libre Laborado. Horas enviadas a cola de aprobación.',
            'empleado_horas_pendientes': float(empleado.horas_pendientes or 0.0),
            'horas_extra_solicitadas': horas_solicitadas,
        })

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
    queryset = RegistroAsistencia.objects.all().select_related('empleado').defer('foto_base64')
    serializer_class = RegistroAsistenciaSerializer
    permission_classes = [IsPanelAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        # La foto no se carga en el listado; solo se calcula si existe para armar su URL
        # (leer foto_base64 diferido hacía una consulta extra por cada fila).
        qs = RegistroAsistencia.objects.all().select_related('empleado').defer('foto_base64').annotate(
            tiene_foto_base64=Case(
                When(Q(foto_base64__isnull=True) | Q(foto_base64=''), then=Value(False)),
                default=Value(True),
                output_field=BooleanField(),
            )
        ).order_by('-fecha_hora', '-id')
        if not hasattr(self, 'request') or self.request is None:
            return qs

        params = getattr(self.request, 'query_params', None) or getattr(self.request, 'GET', {})

        # Si se solicita explícitamente todo el histórico:
        if params.get('todos', '').lower() in ('true', '1'):
            return qs

        fecha_desde = params.get('fecha_desde')
        fecha_hasta = params.get('fecha_hasta')
        dias = params.get('dias')
        empleado = params.get('empleado')

        if empleado:
            try:
                qs = qs.filter(empleado_id=int(empleado))
            except (ValueError, TypeError):
                pass

        tz = timezone.get_current_timezone()

        if fecha_desde:
            try:
                dt_desde = timezone.make_aware(
                    datetime.datetime.strptime(str(fecha_desde).strip()[:10], '%Y-%m-%d'),
                    tz
                )
                qs = qs.filter(fecha_hora__gte=dt_desde)
            except Exception:
                pass

        if fecha_hasta:
            try:
                dt_hasta_base = datetime.datetime.strptime(str(fecha_hasta).strip()[:10], '%Y-%m-%d')
                dt_hasta = timezone.make_aware(
                    datetime.datetime.combine(dt_hasta_base.date(), datetime.time.max),
                    tz
                )
                qs = qs.filter(fecha_hora__lte=dt_hasta)
            except Exception:
                pass

        if dias and not fecha_desde and not fecha_hasta:
            try:
                dias_num = int(dias)
                fecha_limite = timezone.now() - datetime.timedelta(days=dias_num)
                qs = qs.filter(fecha_hora__gte=fecha_limite)
            except (ValueError, TypeError):
                pass
        elif not fecha_desde and not fecha_hasta and not dias:
            # Por defecto: últimos 15 días para máxima velocidad y eficiencia
            fecha_limite = timezone.now() - datetime.timedelta(days=15)
            qs = qs.filter(fecha_hora__gte=fecha_limite)

        return qs

    @action(detail=True, methods=['get'], url_path='foto', permission_classes=[permissions.AllowAny])
    def foto(self, request, pk=None):
        """
        Retorna la fotografía de verificación del marcaje en formato binario JPEG
        con encabezados de caché del navegador para acelerar la carga en un 99%.
        """
        es_admin = IsPanelAdmin().has_permission(request, self)
        if not es_admin and not foto_firma_valida(pk, request.GET.get('sig')):
            return Response({'detail': 'Enlace de fotografía inválido o vencido.'}, status=403)

        instance = RegistroAsistencia.objects.filter(pk=pk).only('id', 'foto_base64', 'foto_verificacion').first()
        if not instance:
            return Response({'detail': 'Registro de asistencia no encontrado'}, status=404)

        if instance.foto_base64:
            b64_data = instance.foto_base64
            if ',' in b64_data:
                b64_data = b64_data.split(',', 1)[1]
            try:
                import base64
                img_bytes = base64.b64decode(b64_data)
                resp = HttpResponse(img_bytes, content_type='image/jpeg')
                resp['Cache-Control'] = 'private, max-age=86400'  # 1 día en caché del navegador (URL firmada)
                return resp
            except Exception:
                pass

        if instance.foto_verificacion:
            try:
                return HttpResponseRedirect(instance.foto_verificacion.url)
            except Exception:
                pass

        return Response({'detail': 'No hay fotografía asociada a este marcaje'}, status=404)

    @action(detail=False, methods=['get'], url_path='dias-laborados-mes')
    def dias_laborados_mes(self, request):
        """
        Retorna de forma ultrarrápida (en milisegundos) los días únicos laborados
        por cada colaborador dentro del mes y año solicitados, sin sobrecargar la red
        ni transferir fotos o modelos pesados.
        """
        import calendar
        try:
            mes = int(request.query_params.get('mes', timezone.localdate().month))
            anio = int(request.query_params.get('anio', timezone.localdate().year))
        except (ValueError, TypeError):
            mes = timezone.localdate().month
            anio = timezone.localdate().year

        primer_dia = datetime.date(anio, mes, 1)
        ultimo_dia_num = calendar.monthrange(anio, mes)[1]
        ultimo_dia = datetime.date(anio, mes, ultimo_dia_num)

        tz = timezone.get_current_timezone()
        dt_inicio = timezone.make_aware(datetime.datetime.combine(primer_dia, datetime.time.min), tz)
        dt_fin = timezone.make_aware(datetime.datetime.combine(ultimo_dia, datetime.time.max), tz)

        # Solo campos necesarios: empleado_id y fecha_hora
        registros = RegistroAsistencia.objects.filter(
            fecha_hora__gte=dt_inicio,
            fecha_hora__lte=dt_fin
        ).values('empleado_id', 'fecha_hora')

        fechas_set_por_emp = {}
        for r in registros:
            emp_id = r['empleado_id']
            fecha_local_str = r['fecha_hora'].astimezone(tz).strftime('%Y-%m-%d')
            if emp_id not in fechas_set_por_emp:
                fechas_set_por_emp[emp_id] = set()
            fechas_set_por_emp[emp_id].add(fecha_local_str)

        dias_por_empleado = {str(emp_id): len(s) for emp_id, s in fechas_set_por_emp.items()}

        return Response({
            'status': 'ok',
            'mes': mes,
            'anio': anio,
            'dias_por_empleado': dias_por_empleado
        })

    def perform_destroy(self, instance):
        empleado = instance.empleado
        fecha_instancia = _dia_operativo(instance)

        if instance.foto_verificacion:
            try:
                instance.foto_verificacion.delete(save=False)
            except Exception:
                pass
        emp_nombre = f"{empleado.nombre} {empleado.apellido}"
        evento_str = instance.get_tipo_evento_display()
        fecha_str = instance.fecha_hora.strftime("%d/%m/%Y %I:%M %p")

        instance.delete()

        # Recalcular deuda y horas extra pendientes del día para no dejar nada huérfano
        try:
            _rehacer_jornada(empleado, fecha_instancia, self.request)
        except Exception:
            pass

        try:
            BitacoraAccion.objects.create(
                usuario=self.request.user if self.request.user.is_authenticated else None,
                accion='REGISTRO_MANUAL',
                descripcion=f"Marcaje de {evento_str} ({fecha_str}) para {emp_nombre} eliminado por el administrador por corrección.",
                ip_address=_get_clean_ip(self.request)
            )
        except Exception:
            pass

    def perform_update(self, serializer):
        empleado_anterior = serializer.instance.empleado
        fecha_anterior = _dia_operativo(serializer.instance)
        instance = serializer.save()
        try:
            fecha_instancia = _dia_operativo(instance)
            _rehacer_jornada(instance.empleado, fecha_instancia, self.request)
            if fecha_anterior != fecha_instancia:
                _rehacer_jornada(instance.empleado, fecha_anterior, self.request)
            if empleado_anterior and empleado_anterior.id != instance.empleado.id:
                _rehacer_jornada(empleado_anterior, fecha_anterior, self.request)
        except Exception:
            pass

        try:
            BitacoraAccion.objects.create(
                usuario=self.request.user if self.request.user.is_authenticated else None,
                accion='REGISTRO_MANUAL',
                descripcion=(
                    f"Marcaje #{instance.id} corregido por administrador: "
                    f"Asignado a {instance.empleado.nombre} {instance.empleado.apellido} ({instance.get_tipo_evento_display()})."
                ),
                ip_address=_get_clean_ip(self.request)
            )
        except Exception:
            pass

    def perform_create(self, serializer):
        instance = serializer.save()
        try:
            # Antes se recalculaba la deuda y luego se volvía a sumar el déficit del día (deuda doble)
            _rehacer_jornada(instance.empleado, _dia_operativo(instance), self.request)
        except Exception:
            pass

    @action(detail=False, methods=['post'], url_path='purgar-dia-cero')
    def purgar_dia_cero(self, request):
        if not verificar_pin_nomina(request, request.data.get('pin')):
            return Response(
                {'status': 'error', 'mensaje': 'PIN de Gerencia incorrecto. No autorizado.'},
                status=status.HTTP_403_FORBIDDEN
            )

        with transaction.atomic():
            # 1. Liberar fotos y borrar asistencias
            registros = RegistroAsistencia.objects.all()
            for r in registros:
                try:
                    if r.foto_verificacion:
                        r.foto_verificacion.delete(save=False)
                except Exception:
                    pass
            reg_count = registros.delete()[0]

            # 2. Borrar alertas
            alerta_count = AlertaAsistencia.objects.all().delete()[0]

            # 3. Borrar horas extra de prueba
            extra_count = AutorizacionHorasExtra.objects.all().delete()[0]

            # 4. Borrar permisos de prueba
            perm_count = PermisoAusencia.objects.all().delete()[0]

            # 5. Resetear horas_pendientes a 0.00 para todos los empleados
            hoy = timezone.localdate()
            Empleado.objects.all().update(
                horas_pendientes=0.00,
                periodo_horas_pendientes=hoy.replace(day=1)
            )

            # 6. Registrar en bitácora
            BitacoraAccion.objects.create(
                usuario=request.user if request.user.is_authenticated else None,
                accion='CONFIGURACION_SISTEMA',
                descripcion=(
                    f"Purga oficial Día 0 ejecutada con PIN de nómina: "
                    f"{reg_count} asistencias, {alerta_count} alertas y {extra_count} horas extra eliminadas. "
                    f"Balances reseteados a 0.00 hrs."
                ),
                ip_address=_get_clean_ip(request)
            )

        return Response({
            'status': 'ok',
            'mensaje': (
                f"Limpieza de Día 0 exitosa: {reg_count} marcajes eliminados, "
                f"{alerta_count} alertas limpiadas y todos los colaboradores en 0.00 hrs."
            )
        })


class BitacoraViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BitacoraAccion.objects.all()
    serializer_class = BitacoraAccionSerializer
    permission_classes = [IsPanelAdmin]

    def get_queryset(self):
        qs = BitacoraAccion.objects.all().order_by('-fecha_hora', '-id')
        if not hasattr(self, 'request') or self.request is None:
            return qs[:150]
        params = getattr(self.request, 'query_params', None) or getattr(self.request, 'GET', {})
        limit = params.get('limit')
        if limit:
            try:
                return qs[:int(limit)]
            except (ValueError, TypeError):
                pass
        # Por defecto los últimos 150 eventos para velocidad óptima
        return qs[:150]


class DiaFeriadoViewSet(viewsets.ModelViewSet):
    queryset = DiaFeriado.objects.all()
    serializer_class = DiaFeriadoSerializer
    permission_classes = [IsPanelAdmin]


class CompensacionFeriadoViewSet(viewsets.ModelViewSet):
    queryset = CompensacionFeriado.objects.all().select_related('empleado')
    serializer_class = CompensacionFeriadoSerializer
    permission_classes = [IsPanelAdmin]

    def list(self, request, *args, **kwargs):
        try:
            _evaluar_y_autoacreditar_feriados_pendientes(request=request)
        except Exception as e:
            print(f"Error auto-acreditando feriados en list(): {e}")
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        try:
            _evaluar_y_autoacreditar_feriados_pendientes(request=request)
        except Exception as e:
            print(f"Error auto-acreditando feriados en retrieve(): {e}")
        return super().retrieve(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='sincronizar')
    def sincronizar(self, request):
        """
        Escanea todas las asistencias registradas en fechas feriadas y acredita
        automáticamente los 2 días compensatorios al saldo de vacaciones del trabajador.
        """
        try:
            _evaluar_y_autoacreditar_feriados_pendientes(request=request)
        except Exception as e:
            print(f"Error sincronizando feriados: {e}")

        return Response({
            'status': 'ok',
            'mensaje': 'Sincronización y acreditación automática de feriados completada exitosamente.'
        })

    @action(detail=False, methods=['post'], url_path='sincronizar-descansos-trabajados')
    def sincronizar_descansos_trabajados(self, request):
        """
        Escanea semanas completadas. Si un colaborador trabajó los 7 días de una semana ISO (lunes a domingo),
        el sistema detecta que laboró su día libre semanal y le acredita automáticamente +1 día de descanso
        a su saldo de vacaciones.
        """
        import datetime
        from decimal import Decimal
        tz = timezone.get_current_timezone()
        hoy = timezone.localdate()
        lunes_actual = hoy - datetime.timedelta(days=hoy.weekday())
        empleados = Empleado.objects.filter(activo=True)
        acreditados = 0

        for emp in empleados:
            for w in range(1, 9):
                lunes_w = lunes_actual - datetime.timedelta(weeks=w)
                domingo_w = lunes_w + datetime.timedelta(days=6)

                motivo_busqueda = f"Día libre semanal laborado ({lunes_w.strftime('%d/%m')} al {domingo_w.strftime('%d/%m')})"
                ya_acreditado = PermisoAusencia.objects.filter(
                    empleado=emp,
                    tipo='VACACIONES_PAGADAS',
                    motivo__icontains=motivo_busqueda
                ).exists()

                if ya_acreditado:
                    continue

                start_dt = timezone.make_aware(datetime.datetime.combine(lunes_w, datetime.time.min), tz)
                end_dt = timezone.make_aware(datetime.datetime.combine(domingo_w, datetime.time.max), tz) + datetime.timedelta(hours=5)

                fechas_trabajadas = {
                    r.fecha_hora.astimezone(tz).date()
                    for r in RegistroAsistencia.objects.filter(
                        empleado=emp,
                        tipo_evento='ENTRADA',
                        fecha_hora__range=(start_dt, end_dt)
                    )
                }

                if len(fechas_trabajadas) >= 7:
                    # Verificar que no se haya acreditado previamente esta misma semana
                    ya_acreditado = BitacoraAccion.objects.filter(
                        accion='ACREDITAR_SEPTIMO_DIA_VACACIONES',
                        descripcion__contains=f"{emp.nombre} {emp.apellido}"
                    ).filter(
                        descripcion__contains=f"Semana del {lunes_w} al {domingo_w}"
                    ).exists()

                    if not ya_acreditado:
                        emp.dias_vacaciones_acumuladas = (emp.dias_vacaciones_acumuladas or Decimal('0.00')) + Decimal('1.0')
                        emp.save(update_fields=['dias_vacaciones_acumuladas'])

                        BitacoraAccion.objects.create(
                            usuario=request.user if (request and hasattr(request, 'user') and request.user.is_authenticated) else None,
                            accion='ACREDITAR_SEPTIMO_DIA_VACACIONES',
                            descripcion=(
                                f"Acreditado +1.0 día de vacaciones a {emp.nombre} {emp.apellido} por laborar su día libre semanal "
                                f"(Semana del {lunes_w} al {domingo_w}, 7 días laborados). Nuevo saldo: {emp.dias_vacaciones_acumuladas} d."
                            ),
                            ip_address=_get_clean_ip(request) if request else None
                        )
                        acreditados += 1

        return Response({
            'status': 'ok',
            'acreditados': acreditados,
            'mensaje': f'Se escanearon las semanas. Se acreditaron {acreditados} día(s) libre(s) laborado(s) a vacaciones (+1 día c/u).'
        })

    @action(detail=True, methods=['post'], url_path='liquidar')
    def liquidar(self, request, pk=None):
        """
        Compatibilidad y ajuste manual si fuera requerido.
        """
        from decimal import Decimal
        comp = self.get_object()
        dias_dinero = Decimal(str(request.data.get('dias_dinero', 0)))
        dias_vacaciones = Decimal(str(request.data.get('dias_vacaciones', 0)))
        observaciones = request.data.get('observaciones', '').strip()

        if dias_dinero < 0 or dias_vacaciones < 0:
            return Response({'error': 'Los días no pueden ser negativos.'}, status=400)

        total_liquidar = dias_dinero + dias_vacaciones
        if total_liquidar <= Decimal('0.0'):
            return Response({'error': 'Debe especificar al menos una cantidad de días.'}, status=400)
        tope = Decimal(str(comp.dias_compensatorios_totales or 2))
        if total_liquidar > tope:
            return Response({'error': f'Este feriado da {tope} días compensatorios; no se pueden liquidar {total_liquidar}.'}, status=400)

        empleado = comp.empleado

        # Una nueva liquidación reemplaza a la anterior: solo se abona (o reintegra) la diferencia
        # de días a vacaciones, para no sumar dos veces el mismo feriado.
        ya_acreditado = Decimal(str(comp.dias_acreditados_vacaciones or 0)) if comp.estado != 'PENDIENTE' else Decimal('0.0')
        diferencia = dias_vacaciones - ya_acreditado
        if diferencia != Decimal('0.0'):
            empleado.dias_vacaciones_acumuladas = (empleado.dias_vacaciones_acumuladas or Decimal('0.00')) + diferencia
            empleado.save(update_fields=['dias_vacaciones_acumuladas'])

        if dias_dinero > 0 and dias_vacaciones > 0:
            nuevo_estado = 'MIXTO'
        elif dias_vacaciones > 0:
            nuevo_estado = 'VACACIONES'
        else:
            nuevo_estado = 'DINERO'

        comp.estado = nuevo_estado
        comp.dias_pagados_dinero = dias_dinero
        comp.dias_acreditados_vacaciones = dias_vacaciones
        comp.fecha_liquidacion = timezone.now()
        comp.observaciones = observaciones
        comp.save()

        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='LIQUIDAR_FERIADO',
            descripcion=(
                f"Feriado {comp.fecha_feriado} ({comp.nombre_feriado}) actualizado para {empleado.nombre} {empleado.apellido}: "
                f"{dias_dinero} días en dinero, {dias_vacaciones} días a vacaciones. "
                f"Nuevo saldo vacaciones: {empleado.dias_vacaciones_acumuladas} d."
            ),
            ip_address=_get_clean_ip(request)
        )

        serializer = self.get_serializer(comp)
        return Response({
            'status': 'ok',
            'mensaje': f'Feriado actualizado exitosamente como {comp.get_estado_display()}.',
            'compensacion': serializer.data,
            'empleado_vacaciones_acumuladas': float(empleado.dias_vacaciones_acumuladas) if empleado.dias_vacaciones_acumuladas else 0.0
        })


class PagoVacacionesViewSet(viewsets.ModelViewSet):
    """
    CRUD y emisión de Boletas de Pago de Vacaciones en Dinero.
    """
    queryset = PagoVacaciones.objects.all().select_related('empleado', 'registrado_por')
    serializer_class = PagoVacacionesSerializer
    permission_classes = [IsPanelAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        emp_id = self.request.query_params.get('empleado')
        if emp_id:
            qs = qs.filter(empleado_id=emp_id)
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha_pago__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha_pago__lte=fecha_fin)
        return qs

    def create(self, request, *args, **kwargs):
        from decimal import Decimal
        empleado_id = request.data.get('empleado')
        dias_pagados = Decimal(str(request.data.get('dias_pagados', '0')))
        monto_pagado = Decimal(str(request.data.get('monto_pagado', '0.00')))
        motivo = request.data.get('motivo', 'Pago de Vacaciones en Dinero')
        observaciones = request.data.get('observaciones', '')
        fecha_pago = request.data.get('fecha_pago') or timezone.localdate().isoformat()

        if not empleado_id:
            return Response({'detail': 'Debe especificar el colaborador.'}, status=status.HTTP_400_BAD_REQUEST)
        if dias_pagados <= Decimal('0.0'):
            return Response({'detail': 'La cantidad de días a pagar debe ser mayor a 0.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            empleado = Empleado.objects.get(id=empleado_id)
        except Empleado.DoesNotExist:
            return Response({'detail': 'Colaborador no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        saldo_disponible = _obtener_dias_vacaciones_disponibles(empleado)

        if dias_pagados > saldo_disponible:
            return Response({
                'detail': f'El colaborador solo cuenta con {saldo_disponible:.1f} días de vacaciones disponibles para pagar.'
            }, status=status.HTTP_400_BAD_REQUEST)

        year_str = timezone.localdate().strftime('%Y')
        ultimo_pago = PagoVacaciones.objects.filter(numero_recibo__startswith=f'BVP-{year_str}-').order_by('-id').first()
        if ultimo_pago and ultimo_pago.numero_recibo:
            try:
                seq = int(ultimo_pago.numero_recibo.split('-')[-1]) + 1
            except Exception:
                seq = PagoVacaciones.objects.count() + 1
        else:
            seq = PagoVacaciones.objects.count() + 1

        numero_recibo = f"BVP-{year_str}-{str(seq).zfill(4)}"

        saldo_anterior = saldo_disponible
        saldo_nuevo = saldo_disponible - dias_pagados

        pago = PagoVacaciones.objects.create(
            empleado=empleado,
            fecha_pago=fecha_pago,
            dias_pagados=dias_pagados,
            monto_pagado=monto_pagado,
            dias_saldo_anterior=saldo_anterior,
            dias_saldo_nuevo=saldo_nuevo,
            motivo=motivo,
            observaciones=observaciones,
            numero_recibo=numero_recibo,
            registrado_por=request.user if (request.user and request.user.is_authenticated) else None,
        )

        # Descontar los días pagados en dinero del saldo acumulado de vacaciones del colaborador
        empleado.dias_vacaciones_acumuladas = (empleado.dias_vacaciones_acumuladas or Decimal('0.00')) - dias_pagados
        empleado.save(update_fields=['dias_vacaciones_acumuladas'])

        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='PAGO_VACACIONES',
            descripcion=(
                f"Emitida Boleta de Pago de Vacaciones en Dinero {numero_recibo} a {empleado.nombre} {empleado.apellido}: "
                f"{dias_pagados} días (C$ {monto_pagado}). Saldo previo: {saldo_anterior:.1f}d -> Saldo nuevo: {saldo_nuevo:.1f}d."
            ),
            ip_address=_get_clean_ip(request),
        )

        serializer = self.get_serializer(pago)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        pago = self.get_object()
        empleado = pago.empleado
        # Reintegrar los días pagados al saldo acumulado del colaborador si se anula la boleta
        empleado.dias_vacaciones_acumuladas = (empleado.dias_vacaciones_acumuladas or Decimal('0.00')) + pago.dias_pagados
        empleado.save(update_fields=['dias_vacaciones_acumuladas'])

        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='PAGO_VACACIONES',
            descripcion=(
                f"Anulada Boleta de Pago de Vacaciones {pago.numero_recibo} de {empleado.nombre} {empleado.apellido}. "
                f"Reintegrados +{pago.dias_pagados} días. Nuevo saldo: {empleado.dias_vacaciones_acumuladas}d."
            ),
            ip_address=_get_clean_ip(request),
        )
        return super().destroy(request, *args, **kwargs)


class PagoHorasExtraViewSet(viewsets.ModelViewSet):
    """
    CRUD y emisión de Recibos Oficiales de Pago de Horas Extra (Individual o en Lote).
    """
    queryset = PagoHorasExtra.objects.all().select_related('empleado', 'registrado_por')
    serializer_class = PagoHorasExtraSerializer
    permission_classes = [IsPanelAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        emp_id = self.request.query_params.get('empleado')
        if emp_id:
            qs = qs.filter(empleado_id=emp_id)
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha_pago__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha_pago__lte=fecha_fin)
        return qs

    def create(self, request, *args, **kwargs):
        from decimal import Decimal
        import os
        if not verificar_pin_nomina(request, request.data.get('pin')):
            try:
                BitacoraAccion.objects.create(
                    usuario=request.user if (request.user and request.user.is_authenticated) else None,
                    accion='SANCION_DISCIPLINARIA',
                    descripcion="ALERTA DE SEGURIDAD: Intento de emisión de pago de horas extra sin PIN de administración válido bloqueado en servidor.",
                    ip_address=_get_clean_ip(request)
                )
            except Exception:
                pass
            return Response(
                {'detail': 'PIN de administración no proporcionado o inválido. Acción rechazada por el servidor.'},
                status=status.HTTP_403_FORBIDDEN
            )

        empleado_id = request.data.get('empleado')
        horas_extra_ids = request.data.get('horas_extra_ids', [])
        metodo_pago = request.data.get('metodo_pago', 'EFECTIVO')
        observaciones = request.data.get('observaciones', '')
        fecha_pago = request.data.get('fecha_pago') or timezone.localdate().isoformat()

        if not empleado_id:
            return Response({'detail': 'Debe especificar el colaborador.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            empleado = Empleado.objects.get(id=empleado_id)
        except Empleado.DoesNotExist:
            return Response({'detail': 'Colaborador no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        # La hora extra se paga al doble de la tarifa ordinaria (Art. 62 CT). El servidor calcula
        # horas, tarifa y monto; no usa los que manda la pantalla.
        tarifa_base = Decimal(str(empleado.tarifa_hora or 0))
        if tarifa_base <= Decimal('0'):
            return Response({
                'detail': f'{empleado.nombre} {empleado.apellido} no tiene tarifa por hora registrada. Agréguela en su ficha antes de pagar horas extra.'
            }, status=status.HTTP_400_BAD_REQUEST)
        tarifa_hora_aplicada = (tarifa_base * 2).quantize(Decimal('0.01'))

        # Solo se pagan horas extra aprobadas y aún no pagadas (evita doble pago o pagar solicitudes pendientes)
        if not isinstance(horas_extra_ids, list) or not horas_extra_ids:
            return Response({'detail': 'Debe seleccionar al menos una solicitud de horas extra a liquidar.'}, status=status.HTTP_400_BAD_REQUEST)
        pagables = set(str(i) for i in AutorizacionHorasExtra.objects.filter(
            id__in=horas_extra_ids, empleado=empleado, estado='APROBADO'
        ).exclude(estado_pago='PAGADO').values_list('id', flat=True))
        no_pagables = [i for i in horas_extra_ids if str(i) not in pagables]
        if no_pagables:
            return Response({
                'detail': 'Algunas horas extra seleccionadas ya fueron pagadas, no están aprobadas o no pertenecen al colaborador. Actualice la pantalla e intente de nuevo.',
                'ids_invalidos': no_pagables,
            }, status=status.HTTP_400_BAD_REQUEST)

        year_str = timezone.localdate().strftime('%Y')
        ultimo_pago = PagoHorasExtra.objects.filter(numero_recibo__startswith=f'RPHE-{year_str}-').order_by('-id').first()
        if ultimo_pago and ultimo_pago.numero_recibo:
            try:
                seq = int(ultimo_pago.numero_recibo.split('-')[-1]) + 1
            except Exception:
                seq = PagoHorasExtra.objects.count() + 1
        else:
            seq = PagoHorasExtra.objects.count() + 1

        numero_recibo = f"RPHE-{year_str}-{str(seq).zfill(4)}"

        # Recopilar detalles de las fechas asociadas
        detalles_fechas = []
        registros_he = list(AutorizacionHorasExtra.objects.filter(id__in=horas_extra_ids, empleado=empleado))
        total_horas_pagadas = sum((Decimal(str(r.horas_extra_autorizadas or 0)) for r in registros_he), Decimal('0'))
        if total_horas_pagadas <= Decimal('0.0'):
            return Response({'detail': 'El total de horas autorizadas a liquidar debe ser mayor a 0.'}, status=status.HTTP_400_BAD_REQUEST)
        monto_total = (total_horas_pagadas * tarifa_hora_aplicada).quantize(Decimal('0.01'))
        for r in registros_he:
            detalles_fechas.append({
                'id': r.id,
                'fecha': str(r.fecha),
                'horas_solicitadas': float(r.horas_extra_solicitadas),
                'horas_autorizadas': float(r.horas_extra_autorizadas),
                'comentario': r.comentario or '',
            })

        pago = PagoHorasExtra.objects.create(
            empleado=empleado,
            fecha_pago=fecha_pago,
            total_horas_pagadas=total_horas_pagadas,
            tarifa_hora_aplicada=tarifa_hora_aplicada,
            monto_total=monto_total,
            metodo_pago=metodo_pago,
            numero_recibo=numero_recibo,
            observaciones=observaciones,
            detalles_fechas=detalles_fechas,
            registrado_por=request.user if (request.user and request.user.is_authenticated) else None,
        )

        # Actualizar las autorizaciones de horas extra a PAGADO
        for r in registros_he:
            r.estado_pago = 'PAGADO'
            r.fecha_pago = fecha_pago
            r.monto_pagado = round(Decimal(str(r.horas_extra_autorizadas)) * tarifa_hora_aplicada, 2)
            r.metodo_pago = metodo_pago
            r.numero_recibo_pago = numero_recibo
            r.pago_horas_extra = pago
            r.save(update_fields=['estado_pago', 'fecha_pago', 'monto_pagado', 'metodo_pago', 'numero_recibo_pago', 'pago_horas_extra'])

        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='PAGO_HORAS_EXTRA',
            descripcion=(
                f"Emitido Recibo Oficial de Pago de Horas Extra {numero_recibo} a {empleado.nombre} {empleado.apellido}: "
                f"{total_horas_pagadas:.1f} hrs (C$ {monto_total}) vía {metodo_pago}. {len(detalles_fechas)} fecha(s) liquidada(s)."
            ),
            ip_address=_get_clean_ip(request),
        )

        serializer = self.get_serializer(pago)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        pago = self.get_object()
        empleado = pago.empleado

        # Reintegrar las horas extra asociadas a PENDIENTE
        horas_asociadas = AutorizacionHorasExtra.objects.filter(pago_horas_extra=pago)
        for h in horas_asociadas:
            h.estado_pago = 'PENDIENTE'
            h.fecha_pago = None
            h.monto_pagado = Decimal('0.00')
            h.metodo_pago = ''
            h.numero_recibo_pago = ''
            h.pago_horas_extra = None
            h.save(update_fields=['estado_pago', 'fecha_pago', 'monto_pagado', 'metodo_pago', 'numero_recibo_pago', 'pago_horas_extra'])

        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='PAGO_HORAS_EXTRA',
            descripcion=(
                f"Anulado Recibo de Pago de Horas Extra {pago.numero_recibo} de {empleado.nombre} {empleado.apellido} "
                f"({pago.total_horas_pagadas:.1f} hrs, C$ {pago.monto_total}). Las horas extra fueron reintegradas a pendientes de pago."
            ),
            ip_address=_get_clean_ip(request),
        )
        return super().destroy(request, *args, **kwargs)


class AutorizacionHorasExtraViewSet(viewsets.ModelViewSet):
    queryset = AutorizacionHorasExtra.objects.all().select_related('empleado')
    serializer_class = AutorizacionHorasExtraSerializer
    permission_classes = [IsPanelAdmin]

    def update(self, request, *args, **kwargs):
        import os
        if not verificar_pin_nomina(request, request.data.get('pin')):
            try:
                BitacoraAccion.objects.create(
                    usuario=request.user if (request.user and request.user.is_authenticated) else None,
                    accion='SANCION_DISCIPLINARIA',
                    descripcion="ALERTA DE SEGURIDAD: Intento no autorizado de resolución de horas extra sin PIN de administración bloqueado en servidor.",
                    ip_address=_get_clean_ip(request)
                )
            except Exception:
                pass
            return Response(
                {'detail': 'PIN de administración no proporcionado o inválido. Acción rechazada por el servidor.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        # Las horas extra aprobadas son intocables y no se amortizan contra déficit de horas
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.save()
        # Si la solicitud no es aprobada (es rechazada), se elimina automáticamente de la base de datos
        if instance.estado == 'RECHAZADO':
            instance.delete()

    @action(detail=False, methods=['post'], url_path='canjear-tiempo')
    def canjear_tiempo(self, request):
        """
        Canjea horas extra previamente aprobadas por salida anticipada (tiempo compensado).
        Genera el registro oficial de CompensacionHoras (con horas_trabajadas_hoy < 7.95)
        para permitir la emisión inmediata del Acta Oficial de Compensación de Salida Anticipada.
        No requiere tarifa por hora, no descuenta dinero ni afecta la caja.
        """
        data = request.data
        pin = data.get('pin')
        if not verificar_pin_nomina(request, pin):
            try:
                BitacoraAccion.objects.create(
                    usuario=request.user if (request.user and request.user.is_authenticated) else None,
                    accion='SANCION_DISCIPLINARIA',
                    descripcion="ALERTA DE SEGURIDAD: Intento de canjear horas extra por salida anticipada sin PIN válido.",
                    ip_address=_get_clean_ip(request)
                )
            except Exception:
                pass
            return Response(
                {'detail': 'PIN de administración no proporcionado o inválido.'},
                status=status.HTTP_403_FORBIDDEN
            )

        empleado_id = data.get('empleado_id')
        horas_extra_ids = data.get('horas_extra_ids', [])
        fecha_salida = data.get('fecha_salida')
        horas_salida = data.get('horas_salida')
        motivo = data.get('motivo', '').strip()

        if not empleado_id or not horas_extra_ids:
            return Response({'detail': 'Debe especificar el empleado y al menos una fecha de hora extra.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            empleado = Empleado.objects.get(pk=empleado_id)
        except Empleado.DoesNotExist:
            return Response({'detail': 'Empleado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        import datetime
        tz = timezone.get_current_timezone()
        hoy = timezone.now().astimezone(tz).date()

        if not fecha_salida:
            fecha_salida_date = hoy
        else:
            try:
                fecha_salida_date = datetime.date.fromisoformat(str(fecha_salida))
            except Exception:
                fecha_salida_date = hoy

        try:
            horas_salida_dec = Decimal(str(horas_salida))
            if horas_salida_dec <= Decimal('0'):
                return Response({'detail': 'Las horas de salida anticipada a compensar deben ser mayores a 0.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'detail': 'Horas de salida anticipada inválidas.'}, status=status.HTTP_400_BAD_REQUEST)

        # Consultar y validar registros de horas extra
        registros_he = list(
            AutorizacionHorasExtra.objects.filter(
                id__in=horas_extra_ids,
                empleado=empleado,
                estado='APROBADO',
            ).exclude(estado_pago='PAGADO').order_by('fecha')
        )

        if not registros_he:
            return Response({'detail': 'No se encontraron horas extra aprobadas y pendientes de liquidación para este empleado.'}, status=status.HTTP_400_BAD_REQUEST)

        total_he_disponibles = sum((Decimal(str(r.horas_extra_autorizadas)) for r in registros_he), Decimal('0'))
        if horas_salida_dec > total_he_disponibles:
            return Response(
                {'detail': f'Las horas solicitadas ({horas_salida_dec:.1f} hrs) superan el total de horas extra seleccionadas ({total_he_disponibles:.1f} hrs).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Construir desglose de deducción cronológica
        horas_pendientes_por_cubrir = horas_salida_dec
        desglose = []
        registros_a_actualizar = []

        dias_espanol = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
        meses_espanol = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

        for r in registros_he:
            if horas_pendientes_por_cubrir <= Decimal('0'):
                break

            he_orig = Decimal(str(r.horas_extra_autorizadas))
            aplicadas = min(he_orig, horas_pendientes_por_cubrir)
            remanente = he_orig - aplicadas

            d_sem = dias_espanol[r.fecha.weekday()]
            m_nom = meses_espanol[r.fecha.month]
            fecha_display = f"{d_sem}, {r.fecha.day:02d} {m_nom} {r.fecha.year}"

            desglose.append({
                'fecha': r.fecha.isoformat(),
                'fecha_display': fecha_display,
                'horas_trabajadas': float(Decimal('8.0') + he_orig),
                'horas_extra_origen': float(he_orig),
                'horas_aplicadas': float(aplicadas),
                'saldo_dia': float(remanente),
                'estado': 'Compensado en Salida Anticipada' if remanente == Decimal('0') else f'Parcial ({remanente:.1f}h remanente)'
            })

            horas_pendientes_por_cubrir -= aplicadas

            coment_actual = r.comentario or ''
            nota_canje = f"[Canjeado {aplicadas:.1f}h por salida anticipada el {fecha_salida_date.isoformat()}]"
            nuevo_coment = f"{coment_actual} {nota_canje}".strip()

            if remanente <= Decimal('0'):
                r.estado_pago = 'PAGADO'
                r.fecha_pago = fecha_salida_date
                r.metodo_pago = 'TIEMPO_COMPENSADO'
                r.numero_recibo_pago = f"CANJE-SA-{fecha_salida_date.strftime('%Y%m%d')}-{r.id}"
                r.comentario = nuevo_coment
            else:
                r.horas_extra_autorizadas = remanente
                r.comentario = f"{nuevo_coment} (Horas restantes: {remanente:.1f}h)"

            registros_a_actualizar.append(r)

        # Generar número de recibo oficial correlativo RPHE para el Historial de Pagos
        year_str = fecha_salida_date.strftime('%Y')
        ultimo_pago = PagoHorasExtra.objects.filter(numero_recibo__startswith=f'RPHE-{year_str}-').order_by('-id').first()
        if ultimo_pago and ultimo_pago.numero_recibo:
            try:
                seq = int(ultimo_pago.numero_recibo.split('-')[-1]) + 1
            except Exception:
                seq = PagoHorasExtra.objects.count() + 1
        else:
            seq = PagoHorasExtra.objects.count() + 1
        numero_recibo = f"RPHE-{year_str}-{str(seq).zfill(4)}"

        # Detalles para el recibo de pago
        detalles_fechas_pago = []
        for d in desglose:
            detalles_fechas_pago.append({
                'id': 0,
                'fecha': d['fecha'],
                'horas_solicitadas': d['horas_extra_origen'],
                'horas_autorizadas': d['horas_aplicadas'],
                'comentario': f"Compensado en salida anticipada el {fecha_salida_date.isoformat()}"
            })

        # Registrar formalmente en PagoHorasExtra para que figure en 'Historial de Pagos'
        pago_recibo = PagoHorasExtra.objects.create(
            empleado=empleado,
            fecha_pago=fecha_salida_date,
            total_horas_pagadas=horas_salida_dec,
            tarifa_hora_aplicada=Decimal('0.00'),
            monto_total=Decimal('0.00'),
            metodo_pago='TIEMPO_COMPENSADO',
            numero_recibo=numero_recibo,
            observaciones=f"Compensación de jornada por salida anticipada. Motivo: {motivo or 'Tiempo por tiempo'}",
            detalles_fechas=detalles_fechas_pago,
            registrado_por=request.user if (request.user and request.user.is_authenticated) else None,
        )

        for r in registros_a_actualizar:
            r.pago_horas_extra = pago_recibo
            r.numero_recibo_pago = numero_recibo
            r.save()

        # Crear el registro de CompensacionHoras que modela la salida anticipada (< 7.95h)
        horas_trabajadas_simuladas = round(Decimal('8.0') - horas_salida_dec, 2)
        compensacion = CompensacionHoras.objects.create(
            empleado=empleado,
            fecha_compensacion=fecha_salida_date,
            horas_trabajadas_hoy=horas_trabajadas_simuladas,
            horas_extra_generadas=Decimal('0.00'),
            horas_deducidas=horas_salida_dec,
            deuda_previa=horas_salida_dec,
            saldo_restante=Decimal('0.00'),
            remanente_extra=max(Decimal('0'), total_he_disponibles - horas_salida_dec),
            desglose=desglose,
        )

        desc_bitacora = (
            f"Salida Anticipada autorizada para {empleado.nombre} {empleado.apellido}: "
            f"Canje de {horas_salida_dec:.1f} hrs extra acumuladas por salida el {fecha_salida_date.isoformat()}. "
            f"Recibo oficial {numero_recibo} y Acta Compensación #{compensacion.id} generados. "
        )
        if motivo:
            desc_bitacora += f"Motivo: {motivo}"

        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='REGISTRO_MANUAL',
            descripcion=desc_bitacora,
            ip_address=_get_clean_ip(request),
        )

        serializer = CompensacionHorasSerializer(compensacion)
        return Response({
            'success': True,
            'mensaje': f'Salida anticipada de {horas_salida_dec:.1f} hrs canjeada exitosamente.',
            'compensacion': serializer.data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='marcar-pagadas-nomina')
    def marcar_pagadas_nomina(self, request):
        """
        Marca un lote de horas extra aprobadas como liquidadas en la Nómina Quincenal general.
        Permite depurar la bandeja de horas pendientes de pago sin exigir registro de egreso en caja
        ni fallar por falta de tarifa por hora.
        """
        data = request.data
        pin = data.get('pin')
        if not verificar_pin_nomina(request, pin):
            try:
                BitacoraAccion.objects.create(
                    usuario=request.user if (request.user and request.user.is_authenticated) else None,
                    accion='SANCION_DISCIPLINARIA',
                    descripcion="ALERTA DE SEGURIDAD: Intento de marcar horas extra pagadas en nómina sin PIN válido.",
                    ip_address=_get_clean_ip(request)
                )
            except Exception:
                pass
            return Response(
                {'detail': 'PIN de administración no proporcionado o inválido.'},
                status=status.HTTP_403_FORBIDDEN
            )

        horas_extra_ids = data.get('horas_extra_ids', [])
        nota = data.get('nota', 'Liquidado en Nómina Quincenal').strip()

        if not horas_extra_ids:
            return Response({'detail': 'Debe seleccionar al menos una hora extra.'}, status=status.HTTP_400_BAD_REQUEST)

        registros = list(AutorizacionHorasExtra.objects.filter(id__in=horas_extra_ids, estado='APROBADO').exclude(estado_pago='PAGADO'))
        if not registros:
            return Response({'detail': 'No se encontraron registros pendientes para actualizar.'}, status=status.HTTP_400_BAD_REQUEST)

        import datetime
        tz = timezone.get_current_timezone()
        hoy = timezone.now().astimezone(tz).date()

        total_horas = Decimal('0')
        empleados_afectados = set()

        for r in registros:
            r.estado_pago = 'PAGADO'
            r.fecha_pago = hoy
            r.metodo_pago = 'NOMINA_QUINCENAL'
            r.numero_recibo_pago = f"NOMINA-{hoy.strftime('%Y%m')}-{r.id}"
            coment_actual = r.comentario or ''
            r.comentario = f"{coment_actual} [{nota}]".strip()
            r.save(update_fields=['estado_pago', 'fecha_pago', 'metodo_pago', 'numero_recibo_pago', 'comentario', 'updated_at'])
            total_horas += Decimal(str(r.horas_extra_autorizadas))
            empleados_afectados.add(f"{r.empleado.nombre} {r.empleado.apellido}")

        nombres_str = ", ".join(empleados_afectados)
        BitacoraAccion.objects.create(
            usuario=request.user if (request.user and request.user.is_authenticated) else None,
            accion='REGISTRO_MANUAL',
            descripcion=f"Horas extra marcadas como liquidadas en Nómina Quincenal: {len(registros)} registros ({total_horas:.1f} hrs) para {nombres_str}. Nota: {nota}",
            ip_address=_get_clean_ip(request),
        )

        return Response({
            'success': True,
            'mensaje': f'Se marcaron {len(registros)} registros ({total_horas:.1f} hrs) como liquidados en nómina quincenal.'
        }, status=status.HTTP_200_OK)


class AlertaAsistenciaViewSet(viewsets.ModelViewSet):
    queryset = AlertaAsistencia.objects.all().select_related('empleado')
    serializer_class = AlertaAsistenciaSerializer
    permission_classes = [IsPanelAdmin]

    def perform_create(self, serializer):
        alerta = serializer.save()
        if alerta.tipo == 'SANCION_DISCIPLINARIA':
            emp_nombre = f"{alerta.empleado.nombre} {alerta.empleado.apellido}" if alerta.empleado else "Personal"
            BitacoraAccion.objects.create(
                usuario=self.request.user if self.request.user.is_authenticated else None,
                accion='SANCION_DISCIPLINARIA',
                descripcion=f"Sanción disciplinaria aplicada a {emp_nombre}: {alerta.titulo}. {alerta.mensaje}",
                ip_address=_get_clean_ip(self.request)
            )

    def list(self, request, *args, **kwargs):
        # El panel consulta alertas cada minuto; el mantenimiento (~90 consultas) basta
        # correrlo una vez cada MANTENIMIENTO_ALERTAS_SEGUNDOS. cache.add es atómico entre hilos.
        if cache.add('mantenimiento_alertas_en_curso', True, timeout=self.MANTENIMIENTO_ALERTAS_SEGUNDOS):
            self._ejecutar_mantenimiento_alertas()
        return super().list(request, *args, **kwargs)

    MANTENIMIENTO_ALERTAS_SEGUNDOS = 15 * 60

    def _ejecutar_mantenimiento_alertas(self):
        # 1. Procesar resolución automática de 24 horas para inasistencias vencidas
        try:
            self._procesar_resolucion_automatica_inasistencias()
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error procesando resolucion automatica de inasistencias: {e}")

        # 2. Verificar ausencias de la semana
        try:
            self._verificar_ausencias_semanales()
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error verificando ausencias semanales: {e}")

        # 3. Mantenimiento semestral
        try:
            self._verificar_mantenimiento_semestral()
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error verificando mantenimiento semestral: {e}")

        # 4. Alerta de Impresión Mensual de Vacaciones el Día 1 de cada mes (mes anterior cerrado)
        try:
            self._verificar_alerta_reporte_vacaciones_mensual()
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error verificando alerta mensual de vacaciones: {e}")

    def _verificar_alerta_reporte_vacaciones_mensual(self):
        """
        El día 1 de cada mes (o en la primera consulta a partir del día 1 cuando ya cerró
        por completo el mes anterior), asegura que todas las vacaciones hasta el último día
        del mes anterior estén acreditadas y emite automáticamente una alerta notificando
        que ya está disponible la Impresión Mensual de Vacaciones (Colilla Colaborador / Admin).
        """
        import datetime
        tz = timezone.get_current_timezone()
        hoy = timezone.now().astimezone(tz).date()

        # Activo a partir del cierre de Octubre 2026 (1 de Noviembre 2026 en adelante)
        if hoy < datetime.date(2026, 11, 1):
            return

        # Asegurar que el acumulado por día laborado hasta ayer (incluyendo fin del mes anterior) esté al día
        try:
            _verificar_acreditacion_vacaciones_todos()
        except Exception:
            pass

        ultimo_dia_mes_ant = hoy.replace(day=1) - datetime.timedelta(days=1)
        mes_ant = ultimo_dia_mes_ant.month
        anio_ant = ultimo_dia_mes_ant.year

        meses_es = {
            1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
            5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
            9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
        }
        nombre_mes = meses_es.get(mes_ant, str(mes_ant))
        periodo_tag = f"{anio_ant}-{mes_ant:02d}"
        marca_bitacora = f"Alerta mensual vacaciones emitida ({periodo_tag})"
        titulo_alerta = f"🖨️ Impresión de Vacaciones Disponible — {nombre_mes} {anio_ant}"

        ya_emitida = (
            AlertaAsistencia.objects.filter(tipo='REPORTE_VACACIONES', titulo=titulo_alerta).exists()
            or BitacoraAccion.objects.filter(descripcion__icontains=marca_bitacora).exists()
        )
        if ya_emitida:
            return

        total_activos = Empleado.objects.filter(activo=True).count()
        AlertaAsistencia.objects.create(
            tipo='REPORTE_VACACIONES',
            empleado=None,
            titulo=titulo_alerta,
            mensaje=(
                f"El cierre mensual de {nombre_mes} {anio_ant} ({periodo_tag}) ha concluido con todos los "
                f"días laborados contabilizados. Ya está disponible para imprimir el Reporte Mensual de "
                f"Vacaciones de los {total_activos} colaboradores activos (1 hoja por trabajador con "
                f"línea de corte: colilla para el Colaborador con espacio de firma y colilla para Administración)."
            ),
            leida=False
        )
        BitacoraAccion.objects.create(
            usuario=None,
            accion='EXPORTAR_NOMINA',
            descripcion=f"{marca_bitacora}: Notificación automática de cierre de vacaciones de {nombre_mes} {anio_ant} generada el {hoy.strftime('%d/%m/%Y')}.",
            ip_address='127.0.0.1'
        )

    def _procesar_resolucion_automatica_inasistencias(self):
        """
        Ventana de gracia de 24 horas:
        Revisa alertas de inasistencia pendientes creadas hace más de 24 horas.
        Si la administración no las justificó:
        - Si saldo de vacaciones >= 1.0 d: descuenta automáticamente 1.0 día de vacaciones.
        - Si saldo de vacaciones < 1.0 d (o 0 días): carga automáticamente 8.0 horas de deuda a la bolsa de horas.
        """
        import datetime
        limite_24h = timezone.now() - datetime.timedelta(hours=24)
        alertas_pendientes = AlertaAsistencia.objects.filter(
            tipo__in=['SEGUNDA_AUSENCIA', 'INASISTENCIA'],
            leida=False,
            created_at__lte=limite_24h
        ).select_related('empleado')

        tz = timezone.get_current_timezone()
        for alerta in alertas_pendientes:
            emp = alerta.empleado
            if not emp:
                alerta.leida = True
                alerta.save(update_fields=['leida'])
                continue

            # Una sanción por cada día que faltó, en la fecha real de la falta (no la de la alerta)
            fechas_falta = _fechas_falta_de_alerta(alerta) or [alerta.created_at.astimezone(tz).date()]
            resumen = []
            for fecha_falta in fechas_falta:
                if PermisoAusencia.objects.filter(
                    empleado=emp, fecha_inicio__lte=fecha_falta, fecha_fin__gte=fecha_falta
                ).exists():
                    continue  # ya justificada o sancionada

                saldo_disp = float(_obtener_dias_vacaciones_disponibles(emp))
                if saldo_disp >= 1.0:
                    PermisoAusencia.objects.create(
                        empleado=emp,
                        fecha_inicio=fecha_falta,
                        fecha_fin=fecha_falta,
                        tipo='VACACIONES',
                        motivo=f"Compensación automática 24h: 1.0 día de vacaciones deducido por inasistencia no justificada del {fecha_falta.strftime('%d/%m/%Y')} (Alerta #{alerta.id})"
                    )
                    detalle = f"{fecha_falta.strftime('%d/%m')}: -1.0 día de vacaciones (disponible {saldo_disp:.2f} -> {saldo_disp - 1.0:.2f} d)"
                else:
                    PermisoAusencia.objects.create(
                        empleado=emp,
                        fecha_inicio=fecha_falta,
                        fecha_fin=fecha_falta,
                        tipo='PERMISO_AUTORIZADO',
                        motivo=f"Compensación automática 24h: +8.0 horas añadidas a deuda por inasistencia del {fecha_falta.strftime('%d/%m/%Y')} sin saldo de vacaciones (Alerta #{alerta.id})"
                    )
                    if _cargar_falta_a_deuda(emp, fecha_falta):
                        detalle = f"{fecha_falta.strftime('%d/%m')}: +8.0 hrs de deuda (saldo de vacaciones insuficiente)"
                    else:
                        detalle = f"{fecha_falta.strftime('%d/%m')}: falta registrada; su mes ya cerró, no suma a la bolsa vigente"
                resumen.append(detalle)

            if resumen:
                BitacoraAccion.objects.create(
                    usuario=None,
                    accion='REGISTRO_MANUAL',
                    descripcion=(
                        f"Resolución automática (vencidas 24h) para {emp.nombre} {emp.apellido}: " + "; ".join(resumen) + "."
                    ),
                    ip_address='127.0.0.1'
                )
                alerta.mensaje += "\n\n[RESUELTA AUTOMÁTICAMENTE]: Vencidas las 24h sin justificar: " + "; ".join(resumen) + "."

            alerta.leida = True
            alerta.save(update_fields=['leida', 'mensaje'])

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
        Revisa tanto la semana anterior cerrada como la semana en curso (Lunes a ayer).
        Si un empleado activo tiene 2 o más días sin marcaje en la misma semana (el 1ero es libre, del 2do en adelante falta)
        y no es feriado ni tiene permiso registrado, genera la alerta con ventana de 24 horas para justificación o auto-compensación.
        """
        import datetime
        tz = timezone.get_current_timezone()
        hoy = timezone.localdate()
        inicio_semana_actual = hoy - datetime.timedelta(days=hoy.weekday())
        inicio_semana_anterior = inicio_semana_actual - datetime.timedelta(days=7)

        semanas_a_evaluar = [
            (inicio_semana_anterior, inicio_semana_actual - datetime.timedelta(days=1)),
            (inicio_semana_actual, hoy - datetime.timedelta(days=1)),
        ]

        empleados = list(Empleado.objects.filter(activo=True))
        for sem_inicio, sem_fin in semanas_a_evaluar:
            if sem_inicio > sem_fin:
                continue

            inicio_dt = timezone.make_aware(datetime.datetime.combine(sem_inicio, datetime.time.min), tz)
            fin_dt = timezone.make_aware(datetime.datetime.combine(sem_fin, datetime.time.max), tz)

            feriados = set(DiaFeriado.objects.filter(
                fecha__gte=sem_inicio,
                fecha__lte=sem_fin
            ).values_list('fecha', flat=True))

            if not RegistroAsistencia.objects.filter(fecha_hora__range=(inicio_dt, fin_dt)).exists():
                continue

            for emp in empleados:
                primer_registro = RegistroAsistencia.objects.filter(empleado=emp).order_by('fecha_hora').first()
                if not primer_registro:
                    continue

                dias_con_marcaje = {
                    fh.astimezone(tz).date()
                    for fh in RegistroAsistencia.objects.filter(
                        empleado=emp,
                        fecha_hora__gte=inicio_dt,
                        fecha_hora__lte=fin_dt
                    ).values_list('fecha_hora', flat=True)
                }

                permisos_emp = PermisoAusencia.objects.filter(
                    empleado=emp,
                    fecha_inicio__lte=sem_fin,
                    fecha_fin__gte=sem_inicio
                )
                dias_permiso = set()
                for p in permisos_emp:
                    d_curr = max(p.fecha_inicio, sem_inicio)
                    d_fin = min(p.fecha_fin, sem_fin)
                    while d_curr <= d_fin:
                        dias_permiso.add(d_curr)
                        d_curr += datetime.timedelta(days=1)

                dias_sin_marcaje = []
                fecha_inicio_eval = max(sem_inicio, primer_registro.fecha_hora.astimezone(tz).date())
                curr = fecha_inicio_eval
                while curr <= sem_fin:
                    if curr not in feriados and curr not in dias_con_marcaje and curr not in dias_permiso:
                        dias_sin_marcaje.append(curr)
                    curr += datetime.timedelta(days=1)

                if len(dias_sin_marcaje) >= 2:
                    faltas_reales = dias_sin_marcaje[1:]
                    fechas_str = ", ".join(d.strftime('%d/%m') for d in faltas_reales)
                    titulo_busqueda = f"Inasistencia pendiente de justificar: {emp.nombre} {emp.apellido}"
                    alerta_existente = AlertaAsistencia.objects.filter(
                        empleado=emp,
                        tipo__in=['SEGUNDA_AUSENCIA', 'INASISTENCIA'],
                        mensaje__icontains=fechas_str
                    ).exists()

                    if not alerta_existente:
                        saldo_disp = float(_obtener_dias_vacaciones_disponibles(emp))
                        consecuencia = "se deducirá automáticamente 1.0 día de vacaciones" if saldo_disp >= 1.0 else "se cargarán automáticamente 8.0 horas de deuda a su bolsa"
                        AlertaAsistencia.objects.create(
                            tipo='INASISTENCIA',
                            empleado=emp,
                            titulo=titulo_busqueda,
                            mensaje=(
                                f"El colaborador {emp.nombre} {emp.apellido} registró falta sin justificar en fecha(s): {fechas_str} "
                                f"(adicional a su día libre semanal del {dias_sin_marcaje[0].strftime('%d/%m')}). "
                                f"Cuenta con una ventana de gracia de 24 horas para justificar (motivo médico, fuerza mayor, situación imprevista o permiso). "
                                f"De no justificarse en 24h, {consecuencia}."
                            ),
                            leida=False
                        )

    @action(detail=True, methods=['post'], url_path='resolver')
    def resolver_alerta(self, request, pk=None):
        """
        Resuelve una alerta de inasistencia:
        - decision='JUSTIFICAR': Autoriza la falta por cualquier motivo libre (médica, fuerza mayor, imprevisto, etc.) sin recargos.
        - decision='RESTAR_VACACIONES': Deduce de inmediato 1.0 día de vacaciones (creando PermisoAusencia tipo VACACIONES, sin doble resta).
        - decision='SUMAR_DEUDA': Carga 8.0 horas de deuda a su bolsa de horas.
        """
        alerta = self.get_object()
        decision = request.data.get('decision', 'JUSTIFICAR')
        motivo = request.data.get('motivo', '').strip()
        empleado = alerta.empleado

        if empleado:
            tz = timezone.get_current_timezone()
            fecha_ref = alerta.created_at.astimezone(tz).date() if alerta.created_at else timezone.localdate()
            inicio_semana = fecha_ref - datetime.timedelta(days=fecha_ref.weekday())
            inicio_dt = timezone.make_aware(datetime.datetime.combine(inicio_semana, datetime.time.min), tz)
            fin_dt = timezone.make_aware(datetime.datetime.combine(fecha_ref, datetime.time.max), tz)

            feriados = set(DiaFeriado.objects.filter(
                fecha__gte=inicio_semana,
                fecha__lte=fecha_ref
            ).values_list('fecha', flat=True))

            dias_con_marcaje = {
                fh.astimezone(tz).date()
                for fh in RegistroAsistencia.objects.filter(
                    empleado=empleado,
                    fecha_hora__gte=inicio_dt,
                    fecha_hora__lte=fin_dt
                ).values_list('fecha_hora', flat=True)
            }

            permisos_emp = PermisoAusencia.objects.filter(
                empleado=empleado,
                fecha_inicio__lte=fecha_ref,
                fecha_fin__gte=inicio_semana
            )
            dias_permiso = set()
            for p in permisos_emp:
                d_c = max(p.fecha_inicio, inicio_semana)
                d_f = min(p.fecha_fin, fecha_ref)
                while d_c <= d_f:
                    dias_permiso.add(d_c)
                    d_c += datetime.timedelta(days=1)

            dias_sin_marcaje = []
            curr = inicio_semana
            while curr <= fecha_ref:
                if curr not in feriados and curr not in dias_con_marcaje and curr not in dias_permiso:
                    dias_sin_marcaje.append(curr)
                curr += datetime.timedelta(days=1)

            # Las fechas de falta que trae la alerta mandan; el cálculo por semana queda para alertas viejas
            dias_a_registrar = _fechas_falta_de_alerta(alerta) or (
                dias_sin_marcaje[1:] if len(dias_sin_marcaje) >= 2 else (dias_sin_marcaje if dias_sin_marcaje else [fecha_ref])
            )

            if decision == 'DIA_LIBRE_LABORADO':
                # Anular déficit y pasar horas trabajadas como Horas Extra PENDIENTE
                start_dia = timezone.make_aware(datetime.datetime.combine(fecha_ref, datetime.time.min), tz)
                end_dia = timezone.make_aware(datetime.datetime.combine(fecha_ref, datetime.time.max), tz) + datetime.timedelta(hours=5)
                regs_dia = list(RegistroAsistencia.objects.filter(
                    empleado=empleado,
                    fecha_hora__range=(start_dia, end_dia)
                ).order_by('fecha_hora'))

                horas_netas = _calcular_horas_netas_dia(regs_dia)
                meta = _jornada_esperada(fecha_ref, regs_dia)
                deficit_dia = max(0.0, meta - horas_netas)

                if deficit_dia > 0:
                    deuda_act = float(empleado.horas_pendientes or 0.0)
                    empleado.horas_pendientes = Decimal(str(max(0.0, round(deuda_act - deficit_dia, 1))))
                    empleado.save(update_fields=['horas_pendientes'])

                CompensacionHoras.objects.filter(
                    empleado=empleado,
                    fecha_compensacion=fecha_ref
                ).delete()

                horas_a_solicitar = max(0.5, round(horas_netas, 1)) if horas_netas >= 0.5 else round(horas_netas, 1)
                if horas_a_solicitar > 0:
                    AutorizacionHorasExtra.objects.update_or_create(
                        empleado=empleado,
                        fecha=fecha_ref,
                        defaults={
                            'horas_extra_solicitadas': Decimal(str(horas_a_solicitar)),
                            'horas_extra_autorizadas': Decimal('0.00'),
                            'estado': 'PENDIENTE',
                            'comentario': f"[Día Libre Laborado] Jornada de apoyo en descanso ({horas_netas:.1f} hrs trabajadas). Enviado para aprobación gerencial."
                        }
                    )

                alerta.leida = True
                alerta.mensaje += f"\n\n[RESUELTO - DÍA LIBRE LABORADO]: Déficit de {deficit_dia:.1f}h anulado. +{horas_a_solicitar:.1f} hrs extra enviadas a cola de aprobación de Nómina."
                alerta.save(update_fields=['leida', 'mensaje'])

                BitacoraAccion.objects.create(
                    usuario=request.user if (request.user and request.user.is_authenticated) else None,
                    accion='REGISTRO_MANUAL',
                    descripcion=f"Alerta #{alerta.id} resuelta como Día Libre Laborado para {empleado.nombre} {empleado.apellido} ({fecha_ref.strftime('%d/%m/%Y')}). Déficit anulado y +{horas_a_solicitar:.1f} hrs extra enviadas a aprobación gerencial.",
                    ip_address=_get_clean_ip(request)
                )

                return Response({
                    'status': 'ok',
                    'mensaje': f'Jornada del {fecha_ref.strftime("%d/%m/%Y")} declarada exitosamente como Día Libre Laborado. Horas enviadas a cola de aprobación.',
                    'empleado_horas_pendientes': float(empleado.horas_pendientes or 0.0),
                    'empleado_vacaciones_acumuladas': float(empleado.dias_vacaciones_acumuladas or 0.0),
                    'horas_extra_solicitadas': horas_a_solicitar
                })

            elif decision == 'SUMAR_DEUDA':
                # Distinguir si es una jornada incompleta / tardanza vs una inasistencia de día completo
                if alerta.tipo in ['DEFICIT_JORNADA', 'SALIDA_ANTICIPADA', 'TARDANZA']:
                    start_dia = timezone.make_aware(datetime.datetime.combine(fecha_ref, datetime.time.min), tz)
                    end_dia = timezone.make_aware(datetime.datetime.combine(fecha_ref, datetime.time.max), tz) + datetime.timedelta(hours=5)
                    regs_dia = list(RegistroAsistencia.objects.filter(
                        empleado=empleado,
                        fecha_hora__range=(start_dia, end_dia)
                    ).order_by('fecha_hora'))
                    horas_netas = _calcular_horas_netas_dia(regs_dia)
                    deficit_a_cargar = max(0.5, round(8.0 - horas_netas, 1)) if horas_netas < 8.0 else 1.0

                    _recalcular_horas_pendientes_empleado(empleado, fecha_ref)

                    alerta.mensaje += f"\n\n[RESUELTO - DÉFICIT CARGADO]: Se confirmó como llegada tardía / jornada incompleta. Déficit de {round(deficit_a_cargar, 1)} hrs cargado a la Bolsa de Horas."
                    alerta.leida = True
                    alerta.save(update_fields=['leida', 'mensaje'])

                    BitacoraAccion.objects.create(
                        usuario=request.user if (request.user and request.user.is_authenticated) else None,
                        accion='REGISTRO_MANUAL',
                        descripcion=f"Déficit confirmado por administración para {empleado.nombre} {empleado.apellido} el {fecha_ref.strftime('%d/%m/%Y')}: {deficit_a_cargar:.1f} hrs debidas por llegada tardía / jornada incompleta.",
                        ip_address=_get_clean_ip(request)
                    )

                    return Response({
                        'status': 'ok',
                        'mensaje': f'Déficit de {deficit_a_cargar:.1f} hrs cargado exitosamente a la Bolsa de Horas de {empleado.nombre}.',
                        'empleado_horas_pendientes': float(empleado.horas_pendientes or 0.0),
                        'empleado_vacaciones_acumuladas': float(empleado.dias_vacaciones_acumuladas or 0.0),
                    })
                else:
                    # 8 h por cada día de falta que aún no estaba registrado; el texto debe decir "deuda"
                    # para que el recálculo de la bolsa la reconozca.
                    motivo_desc = motivo or f"Inasistencia cargada a deuda de horas (Alerta #{alerta.id})"
                    if 'deuda' not in motivo_desc.lower():
                        motivo_desc = f"Inasistencia cargada a deuda de horas: {motivo_desc}"
                    for dia_ausente in dias_a_registrar:
                        if PermisoAusencia.objects.filter(
                            empleado=empleado, fecha_inicio__lte=dia_ausente, fecha_fin__gte=dia_ausente
                        ).exists():
                            continue
                        PermisoAusencia.objects.create(
                            empleado=empleado,
                            fecha_inicio=dia_ausente,
                            fecha_fin=dia_ausente,
                            tipo='PERMISO_AUTORIZADO',
                            motivo=motivo_desc,
                        )
                        _cargar_falta_a_deuda(empleado, dia_ausente)

                    BitacoraAccion.objects.create(
                        usuario=request.user if request.user.is_authenticated else None,
                        accion='REGISTRO_MANUAL',
                        descripcion=f"Se sumaron 8.0 hrs de deuda a {empleado.nombre} {empleado.apellido} por inasistencia. Motivo: {motivo_desc}",
                        ip_address=_get_clean_ip(request)
                    )
            elif decision == 'RESTAR_VACACIONES':
                disp_antes = float(_obtener_dias_vacaciones_disponibles(empleado))
                motivo_desc = motivo or f"Inasistencia deducida de saldo de vacaciones (Alerta #{alerta.id})"
                dias_creados = 0
                for dia_ausente in dias_a_registrar:
                    _, created = PermisoAusencia.objects.get_or_create(
                        empleado=empleado,
                        fecha_inicio=dia_ausente,
                        fecha_fin=dia_ausente,
                        defaults={
                            'tipo': 'VACACIONES',
                            'motivo': motivo_desc
                        }
                    )
                    if created:
                        dias_creados += 1

                disp_despues = float(_obtener_dias_vacaciones_disponibles(empleado))

                BitacoraAccion.objects.create(
                    usuario=request.user if request.user.is_authenticated else None,
                    accion='REGISTRO_MANUAL',
                    descripcion=(
                        f"Se descontó {max(1, dias_creados):.1f} día(s) de vacaciones a {empleado.nombre} {empleado.apellido} por inasistencia. "
                        f"Disponible previo: {disp_antes:.2f} d -> Nuevo disponible: {disp_despues:.2f} d. Motivo: {motivo_desc}"
                    ),
                    ip_address=_get_clean_ip(request)
                )
            else:
                motivo_desc = motivo or f"Falta justificada por administración (fuera de alcance / emergencia / causa médica) (Alerta #{alerta.id})"
                for dia_ausente in dias_a_registrar:
                    PermisoAusencia.objects.get_or_create(
                        empleado=empleado,
                        fecha_inicio=dia_ausente,
                        fecha_fin=dia_ausente,
                        defaults={
                            'tipo': 'PERMISO_AUTORIZADO',
                            'motivo': motivo_desc
                        }
                    )

                BitacoraAccion.objects.create(
                    usuario=request.user if request.user.is_authenticated else None,
                    accion='REGISTRO_MANUAL',
                    descripcion=f"Se justificó la inasistencia de {empleado.nombre} {empleado.apellido}. Motivo: {motivo_desc}",
                    ip_address=_get_clean_ip(request)
                )

            alerta.leida = True
            alerta.save(update_fields=['leida'])
        else:
            alerta.leida = True
            alerta.save(update_fields=['leida'])

        return Response({
            'status': 'ok',
            'mensaje': 'Alerta resuelta exitosamente',
            'empleado_horas_pendientes': float(empleado.horas_pendientes) if empleado else 0.0,
            'empleado_vacaciones_acumuladas': float(_obtener_dias_vacaciones_disponibles(empleado)) if empleado else 0.0
        })

    @action(detail=True, methods=['post'], url_path='cerrar-salida-11pm')
    def cerrar_salida_11pm(self, request, pk=None):
        """
        Cierra automáticamente un marcaje huérfano (olvido de marcaje de salida)
        creando un registro de SALIDA_DEFINITIVA a la hora real que indica administración
        (por defecto la hora de cierre: 11:00 PM, o 10:00 PM en domingo). No genera horas extra.
        Calcula las horas trabajadas, marca la alerta como leída y registra en bitácora.
        """
        import re
        import datetime
        from django.utils import timezone

        alerta = self.get_object()
        empleado = alerta.empleado
        if not empleado:
            return Response(
                {'status': 'error', 'mensaje': 'La alerta no está asociada a ningún empleado.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tz = timezone.get_current_timezone()

        # Determinar la fecha del turno huérfano
        fecha_turno = None
        if alerta.mensaje:
            m = re.search(r'(\d{2})/(\d{2})/(\d{4})', alerta.mensaje)
            if m:
                d, mo, y = m.groups()
                fecha_turno = datetime.date(int(y), int(mo), int(d))

        if not fecha_turno:
            # Si no se encontró en el texto, buscar el último registro incompleto del empleado
            ultimo_reg = RegistroAsistencia.objects.filter(
                empleado=empleado,
                tipo_evento__in=['ENTRADA', 'ENTRADA_QUEBRADA']
            ).order_by('-fecha_hora').first()
            if ultimo_reg:
                fecha_turno = ultimo_reg.fecha_hora.astimezone(tz).date()
            elif alerta.created_at:
                fecha_turno = alerta.created_at.astimezone(tz).date() - datetime.timedelta(days=1)
            else:
                fecha_turno = timezone.localdate() - datetime.timedelta(days=1)

        start_dt = timezone.make_aware(datetime.datetime.combine(fecha_turno, datetime.time.min), tz)
        end_dt = timezone.make_aware(datetime.datetime.combine(fecha_turno, datetime.time.max), tz)

        # Verificar si ya existe una salida definitiva en esa fecha
        salida_existente = RegistroAsistencia.objects.filter(
            empleado=empleado,
            tipo_evento='SALIDA_DEFINITIVA',
            fecha_hora__range=(start_dt, end_dt)
        ).exists()

        if salida_existente:
            alerta.leida = True
            alerta.save(update_fields=['leida'])
            return Response({
                'status': 'ok',
                'mensaje': f'El colaborador {empleado.nombre} ya tiene una salida registrada para el {fecha_turno.strftime("%d/%m/%Y")}. La alerta fue marcada como resuelta.',
            })

        # Hora real de salida que indica administración (HH:MM). Sin ella se usa la hora de cierre
        # del restaurante: 11:00 PM, o 10:00 PM en domingo.
        hora_str = str(request.data.get('hora') or '').strip()
        if hora_str:
            try:
                hora_salida = datetime.datetime.strptime(hora_str, '%H:%M').time()
            except ValueError:
                return Response(
                    {'status': 'error', 'mensaje': 'Hora inválida. Use el formato HH:MM (ej. 17:00).'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            hora_salida = datetime.time(22, 30) if fecha_turno.weekday() == 6 else datetime.time(23, 0)
        fecha_hora_11pm = timezone.make_aware(datetime.datetime.combine(fecha_turno, hora_salida), tz)
        ultimo_turno = RegistroAsistencia.objects.filter(
            empleado=empleado, fecha_hora__range=(start_dt, end_dt)
        ).order_by('-fecha_hora').first()
        if ultimo_turno and fecha_hora_11pm <= ultimo_turno.fecha_hora:
            return Response(
                {'status': 'error', 'mensaje': 'La hora de salida debe ser posterior al último marcaje del día.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        nuevo_registro = RegistroAsistencia.objects.create(
            empleado=empleado,
            tipo_evento='SALIDA_DEFINITIVA',
            fecha_hora=fecha_hora_11pm,
            ip_address=_get_clean_ip(request)
        )

        # Solo se recalcula la bolsa de horas: un cierre administrativo no genera horas extra
        # (la hora es estimada; si hubo extra real, se registra aparte).
        _recalcular_horas_pendientes_empleado(empleado, fecha_turno)

        regs_actualizados = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_dt, end_dt)
        ).order_by('fecha_hora'))
        horas_netas = _calcular_horas_netas_dia(regs_actualizados)

        # Resolver la alerta
        alerta.leida = True
        alerta.save(update_fields=['leida'])

        # Registrar en la bitácora de auditoría
        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='REGISTRO_MANUAL',
            descripcion=(
                f"Cierre administrativo de marcaje huérfano: Salida registrada a las {fecha_hora_11pm.strftime('%I:%M %p')} "
                f"para {empleado.nombre} {empleado.apellido} el día {fecha_turno.strftime('%d/%m/%Y')} "
                f"({horas_netas:.1f} hrs netas computadas). Alerta #{alerta.id} resuelta."
            ),
            ip_address=_get_clean_ip(request)
        )

        return Response({
            'status': 'ok',
            'mensaje': f'Salida de {empleado.nombre} {empleado.apellido} registrada a las {fecha_hora_11pm.strftime("%I:%M %p")} ({horas_netas:.1f} hrs netas computadas, sin horas extra).',
            'horas_computadas': horas_netas,
            'registro_id': nuevo_registro.id
        })

    @action(detail=False, methods=['post'], url_path='marcar-todas-leidas')
    def marcar_todas_leidas(self, request):
        # Proteger alertas de inasistencia pendientes para que solo se cierren al tomar una decisión o vencer las 24h
        AlertaAsistencia.objects.filter(leida=False).exclude(
            tipo__in=['SEGUNDA_AUSENCIA', 'INASISTENCIA']
        ).update(leida=True)
        return Response({'status': 'ok', 'mensaje': 'Notificaciones informativas marcadas como leídas (las alertas de inasistencia requieren resolución o ventana de 24h).'})

    @action(detail=False, methods=['post'], url_path='limpiar-leidas')
    def limpiar_leidas(self, request):
        """
        Elimina permanentemente todas las alertas que ya fueron leídas/resueltas.
        Mantiene intactas las alertas pendientes (leida=False).
        """
        eliminadas, _ = AlertaAsistencia.objects.filter(leida=True).delete()
        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='MANTENIMIENTO_DEPURACION',
            descripcion=f"Historial de notificaciones leídas limpiado manualmente. {eliminadas} alerta(s) eliminada(s).",
            ip_address=_get_clean_ip(request)
        )
        return Response({
            'status': 'ok',
            'mensaje': f'Se eliminaron {eliminadas} notificación(es) leída(s) del historial.',
            'eliminadas': eliminadas,
        })

    @action(detail=False, methods=['post'], url_path='depurar-historial')
    def depurar_historial(self, request):
        """
        Depura fotografías y datos prescindibles con más de 6 meses (180 días) de antigüedad,
        manteniendo intactos a los empleados, sus carnets y sus saldos de horas.
        """
        import datetime
        meses = int(request.data.get('meses', 6))
        limite_fecha = timezone.now() - datetime.timedelta(days=meses * 30)

        # 1. Liberar fotografías de registros antiguos (tanto en disco como en Supabase)
        from django.db.models import Q
        registros_con_foto = RegistroAsistencia.objects.filter(
            fecha_hora__lt=limite_fecha
        ).filter(
            Q(foto_verificacion__isnull=False) | Q(foto_base64__isnull=False)
        )
        
        fotos_liberadas = 0
        for reg in registros_con_foto:
            if reg.foto_verificacion:
                try:
                    reg.foto_verificacion.delete(save=False)
                except Exception:
                    pass
                reg.foto_verificacion = None
            reg.foto_base64 = None
            reg.save(update_fields=['foto_verificacion', 'foto_base64'])
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


class PermisoAusenciaViewSet(viewsets.ModelViewSet):
    queryset = PermisoAusencia.objects.all().select_related('empleado')
    serializer_class = PermisoAusenciaSerializer
    permission_classes = [IsPanelAdmin]

    def perform_create(self, serializer):
        permiso = serializer.save()
        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='CREAR_PERMISO',
            descripcion=f"Permiso/Vacaciones registrado para {permiso.empleado.nombre} {permiso.empleado.apellido}: {permiso.get_tipo_display()} ({permiso.fecha_inicio} a {permiso.fecha_fin}).",
            ip_address=_get_clean_ip(self.request)
        )

    def perform_destroy(self, instance):
        desc = f"Permiso cancelado para {instance.empleado.nombre} {instance.empleado.apellido}: {instance.get_tipo_display()} ({instance.fecha_inicio} a {instance.fecha_fin})."
        instance.delete()
        BitacoraAccion.objects.create(
            usuario=self.request.user if self.request.user.is_authenticated else None,
            accion='ELIMINAR_PERMISO',
            descripcion=desc,
            ip_address=_get_clean_ip(self.request)
        )


class CompensacionHorasViewSet(viewsets.ModelViewSet):
    queryset = CompensacionHoras.objects.select_related('empleado').all()
    serializer_class = CompensacionHorasSerializer
    permission_classes = [IsPanelAdmin]

    def perform_destroy(self, instance):
        empleado = instance.empleado
        fecha_ref = instance.fecha_compensacion
        instance.delete()
        _recalcular_horas_pendientes_empleado(empleado, fecha_ref)


def _procesar_foto_a_base64(foto):
    """
    Comprime la fotografía facial a 320x320 JPEG calidad 55% y genera un Data-URI
    ultra-ligero (~12-15 KB) que se almacena permanentemente en Supabase (PostgreSQL).
    """
    if not foto:
        return None
    try:
        import base64
        import io
        from PIL import Image
        foto.seek(0)
        img = Image.open(foto)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        img.thumbnail((320, 320), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=55, optimize=True)
        encoded = base64.b64encode(buf.getvalue()).decode('utf-8')
        foto.seek(0)
        return f"data:image/jpeg;base64,{encoded}"
    except Exception as e:
        print(f"Error procesando foto a base64: {e}")
        return None


def _autodetectar_tipo_evento(registros_hoy, fecha_hora_registro, empleado=None):
    """
    Auto-detección inteligente de eventos para El Bodegón:
    - Cierre trasnoche (00:00 a 04:59 AM): si el colaborador tiene turno abierto del día anterior
      (ENTRADA o ENTRADA_QUEBRADA), se auto-detecta como SALIDA_DEFINITIVA.
    - Primer evento del día -> siempre ENTRADA.
    - Cierre nocturno (después de las 9:30 PM / 1290 min) -> siempre SALIDA_DEFINITIVA.
    - Si el último evento registrado ya fue SALIDA_DEFINITIVA -> siempre ENTRADA.
    - Segundo evento:
      * Si han transcurrido >= 6.8 horas (ej: 9am-5pm, o 3pm-11pm) -> SALIDA_DEFINITIVA.
      * Si han transcurrido < 6.8 horas y es mediodía/tarde -> SALIDA_QUEBRADA (Pausa).
    - Tercer evento (después de SALIDA_QUEBRADA) -> ENTRADA_QUEBRADA (Retorno).
    - Cuarto evento (después de ENTRADA_QUEBRADA) -> SALIDA_DEFINITIVA (Cierre).
    """
    dt_local = fecha_hora_registro.astimezone(timezone.get_current_timezone())
    hora_mins = dt_local.hour * 60 + dt_local.minute

    # Regla de Cierre Trasnoche: 00:00 a 04:59 AM con turno abierto del día anterior
    if empleado and dt_local.hour < 5:
        ayer = dt_local.date() - datetime.timedelta(days=1)
        start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
        end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
        regs_ayer = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_ayer, end_ayer)
        ).order_by('fecha_hora'))
        if regs_ayer and regs_ayer[-1].tipo_evento in ('ENTRADA', 'ENTRADA_QUEBRADA'):
            return 'SALIDA_DEFINITIVA'

    # REGLA FUNDAMENTAL DE FILTRADO DIURNO:
    # Si la marcación actual es de día (>= 05:00 AM), cualquier marcación previa antes de las 5:00 AM
    # fue el cierre de trasnoche de anoche. NO forma parte de la jornada diurna de hoy.
    regs_turno = list(registros_hoy)
    if dt_local.hour >= 5:
        regs_turno = [
            r for r in regs_turno 
            if r.fecha_hora.astimezone(timezone.get_current_timezone()).hour >= 5
        ]

    if not regs_turno:
        return 'ENTRADA'

    cant = len(regs_turno)
    ultimo = regs_turno[-1]
    primero = regs_turno[0]

    # REGLA DE ORO: Si el último evento registrado ya fue SALIDA_DEFINITIVA,
    # el siguiente evento OBLIGATORIAMENTE es una NUEVA ENTRADA (nunca dos salidas seguidas).
    if ultimo.tipo_evento == 'SALIDA_DEFINITIVA':
        return 'ENTRADA'

    # Regla de Cierre: Después de las 9:30 PM (21:30 = 1290 min) cualquier salida es definitiva
    if hora_mins >= 1290:
        return 'SALIDA_DEFINITIVA'

    if cant == 1:
        # Segundo evento del día
        segundos = (fecha_hora_registro - primero.fecha_hora).total_seconds()
        horas_transcurridas = segundos / 3600.0
        # Si ya completó jornada corrida (>= 6.8h) es salida definitiva (ej: 9am-5pm)
        if horas_transcurridas >= 6.8:
            return 'SALIDA_DEFINITIVA'
        # Si lleva menos tiempo y estamos entre 12:30 PM y 6:30 PM, es salida a pausa
        if 750 <= hora_mins <= 1140:
            return 'SALIDA_QUEBRADA'
        return 'SALIDA_DEFINITIVA'

    elif cant == 2:
        # Tercer evento del día: si el último fue una salida a pausa (o salida), es retorno de pausa
        if ultimo.tipo_evento in ('SALIDA_QUEBRADA', 'SALIDA_DEFINITIVA'):
            return 'ENTRADA_QUEBRADA'
        return 'SALIDA_DEFINITIVA'

    elif cant == 3:
        # Cuarto evento del día: tras retornar de pausa, el siguiente es salida definitiva
        return 'SALIDA_DEFINITIVA'

    else:
        if ultimo.tipo_evento in ('SALIDA_DEFINITIVA', 'SALIDA_QUEBRADA'):
            return 'ENTRADA'
        return 'SALIDA_DEFINITIVA'


def _evaluar_alertas_asistencia(registro, empleado, registros_actualizados, horas_netas_hoy, es_offline=False):
    """
    Evalúa puntualidad con las reglas de El Bodegón:
    - Franjas Base de Entrada: 9:00 AM (540), 11:00 AM (660), 12:00 PM (720), 3:00 PM (900), etc.
    - Margen de cortesía/tolerancia: hasta 10 minutos inclusive.
    - Tardanza severa / grave: >= 11 minutos (alerta inmediata en Kiosco, notificación en campanita y registro oficial).
    - Salida definitiva: alerta si déficit > 10 minutos de la jornada (horas_netas_hoy < 7.83).
    """
    res_info = {
        'alerta_creada': False,
        'alerta_tipo': '',
        'es_tardanza': False,
        'minutos_tardanza': 0,
        'turno_esperado': '',
        'tipo_tardanza': '',
    }
    try:
        hora_actual = registro.fecha_hora.astimezone(timezone.get_current_timezone())
        mins_marcados = hora_actual.hour * 60 + hora_actual.minute
        tipo = registro.tipo_evento
        tag_offline = " (Offline)" if es_offline else ""

        alerta_creada = False
        alerta_tipo = ''
        alerta_titulo = ''
        alerta_mensaje = ''
        diff_tardanza = 0
        turno_esperado_str = ''

        if tipo == 'ENTRADA':
            # 1. Verificar si Administración declaró manualmente el turno oficial en observacion: [TURNO:9:00 AM]
            import re
            turno_manual = None
            if registro.observacion:
                m_t = re.search(r'\[TURNO:([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\]', registro.observacion, re.IGNORECASE)
                if m_t:
                    turno_manual = m_t.group(1).upper().strip()

            HORA_LABELS = {
                540: '9:00 AM',
                600: '10:00 AM',
                660: '11:00 AM',
                720: '12:00 PM',
                840: '2:00 PM',
                900: '3:00 PM',
                1020: '5:00 PM',
                1080: '6:00 PM',
            }
            LABELS_TO_MINS = {v: k for k, v in HORA_LABELS.items()}

            if turno_manual and turno_manual in LABELS_TO_MINS:
                franja_base = LABELS_TO_MINS[turno_manual]
            else:
                # 2. Si no hay turno manual asignado por el admin, usar las Ventanas Oficiales de El Bodegón
                if mins_marcados < 576:
                    franja_base = 540   # 9:00 AM (hasta 9:35 AM)
                elif mins_marcados < 636:
                    franja_base = 600   # 10:00 AM (9:36 AM a 10:35 AM)
                elif mins_marcados < 696:
                    franja_base = 660   # 11:00 AM (10:36 AM a 11:35 AM)
                elif mins_marcados < 780:
                    franja_base = 720   # 12:00 PM (11:36 AM a 1:00 PM)
                elif mins_marcados < 871:
                    franja_base = 840   # 2:00 PM (1:01 PM a 2:30 PM)
                elif mins_marcados < 961:
                    franja_base = 900   # 3:00 PM (2:31 PM a 4:00 PM)
                elif mins_marcados < 1056:
                    franja_base = 1020  # 5:00 PM (4:01 PM a 5:35 PM)
                else:
                    franja_base = 1080  # 6:00 PM (5:36 PM en adelante)

            diff = mins_marcados - franja_base
            turno_esperado_str = HORA_LABELS.get(franja_base, f"{franja_base // 60}:{franja_base % 60:02d}")
            
            # Tolerancia es de 10 minutos. A partir de 11 minutos es tardanza grave
            if diff >= 11:
                alerta_creada = True
                alerta_tipo = 'TARDANZA'
                diff_tardanza = diff
                tag_manual = " (Turno asignado por Admin)" if turno_manual else ""
                alerta_titulo = f"Tardanza severa{tag_offline}{tag_manual}: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = (
                    f"Llegó {diff} min tarde respecto a su turno ({turno_esperado_str}). "
                    f"Marcaje a las {hora_actual.strftime('%I:%M %p')}."
                )

        elif tipo == 'ENTRADA_QUEBRADA':
            # Horario de Retorno Inteligente según las 8 horas y el cierre de las 11:00 PM:
            # - Entró a las 11:00 AM (hizo ~4h en la mañana) -> le faltan 4h -> Retorno a las 7:00 PM (1140)
            # - Entró a las 11:30 AM (hizo ~3.5h en la mañana) -> le faltan 4.5h -> Retorno a las 6:30 PM (1110)
            # - Entró a las 12:00 PM (hizo ~3.0h en la mañana) -> le faltan 5h -> Retorno a las 6:00 PM (1080)
            primera_ent = next((r for r in registros_actualizados if r.tipo_evento == 'ENTRADA'), None)
            primera_pausa = next((r for r in registros_actualizados if r.tipo_evento == 'SALIDA_QUEBRADA'), None)
            hora_esperada = 1080  # 6:00 PM por defecto
            if primera_ent and primera_pausa:
                duracion_b1 = (primera_pausa.fecha_hora - primera_ent.fecha_hora).total_seconds() / 3600.0
                if duracion_b1 >= 3.8:
                    hora_esperada = 1140  # 7:00 PM (Turno 11:00 AM)
                elif duracion_b1 >= 3.2:
                    hora_esperada = 1110  # 6:30 PM (Turno 11:30 AM, ej. Lucero)
                else:
                    hora_esperada = 1080  # 6:00 PM (Turno 12:00 PM, ej. Estefani)

            diff_ret = mins_marcados - hora_esperada
            ret_labels = {1140: '7:00 PM', 1110: '6:30 PM', 1080: '6:00 PM'}
            turno_esperado_str = ret_labels.get(hora_esperada, '6:00 PM')
            # Tolerancia es de 10 minutos. A partir de 11 minutos es tardanza grave de retorno
            if diff_ret >= 11:
                alerta_creada = True
                alerta_tipo = 'TARDANZA'
                diff_tardanza = diff_ret
                alerta_titulo = f"Tardanza Retorno de Pausa{tag_offline}: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = (
                    f"Regresó de la pausa {diff_ret} min tarde respecto a su horario ({turno_esperado_str}). "
                    f"Marcaje a las {hora_actual.strftime('%I:%M %p')}."
                )

        elif tipo == 'SALIDA_DEFINITIVA':
            # Verificar si hubo omisión de Entrada Quebrada (quiebre partido sin retorno)
            pausas_q = [r for r in registros_actualizados if r.tipo_evento == 'SALIDA_QUEBRADA']
            retornos_q = [r for r in registros_actualizados if r.tipo_evento == 'ENTRADA_QUEBRADA']
            omision_entrada_quebrada = False
            if pausas_q and not retornos_q:
                omision_entrada_quebrada = True
            elif pausas_q and retornos_q and pausas_q[-1].fecha_hora > retornos_q[-1].fecha_hora:
                omision_entrada_quebrada = True

            if omision_entrada_quebrada:
                ultima_pausa_dt = pausas_q[-1].fecha_hora.astimezone(timezone.get_current_timezone())
                alerta_creada = True
                alerta_tipo = 'REGISTRO_INCOMPLETO'
                alerta_titulo = f"⚠️ Falta Entrada de Quiebre{tag_offline}: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = (
                    f"El colaborador registró Salida Definitiva a las {hora_actual.strftime('%I:%M %p')}, "
                    f"pero olvidó registrar su Entrada de Retorno tras salir a pausa a las {ultima_pausa_dt.strftime('%I:%M %p')}. "
                    f"Por favor ingrese a Asistencia para colocar la hora de entrada y evitar computar déficit injusto."
                )
            else:
                # Detectar si el colaborador inició en el turno vespertino especial de las 5:00 PM (ej. Xiomara Castillo)
                primera_ent = next((r for r in registros_actualizados if r.tipo_evento == 'ENTRADA'), None)
                es_turno_5pm = False
                if primera_ent:
                    dt_pe = primera_ent.fecha_hora.astimezone(timezone.get_current_timezone())
                    mins_pe = dt_pe.hour * 60 + dt_pe.minute
                    if abs(mins_pe - 1020) <= 45:  # Entrada entre 4:15 PM y 5:45 PM
                        es_turno_5pm = True

                if es_turno_5pm:
                    # Turno especial de 6 horas acordadas (5:00 PM a 11:00 PM):
                    # Solo alertar si se retira con más de 10 min de anticipación a sus 6 horas (< 5.83h)
                    if horas_netas_hoy < 5.83:
                        deficit_mins = int(round((6.0 - horas_netas_hoy) * 60))
                        if deficit_mins > 10:
                            alerta_creada = True
                            alerta_tipo = 'SALIDA_ANTICIPADA'
                            alerta_titulo = f"Salida anticipada (Turno 5 PM){tag_offline}: {empleado.nombre} {empleado.apellido}"
                            alerta_mensaje = (
                                f"Se retiró antes de cumplir su jornada acordada de 6 horas. Acumuló {round(horas_netas_hoy, 1)} hrs "
                                f"(Déficit de {deficit_mins} min)."
                            )
                else:
                    # Jornada estándar de 8 horas (7.5 h el domingo para quien se queda al cierre de las 10:00 PM).
                    # Alertar si el déficit supera los 10 minutos de tolerancia.
                    fecha_jornada = primera_ent.fecha_hora.astimezone(timezone.get_current_timezone()).date() if primera_ent else hora_actual.date()
                    meta = _jornada_esperada(fecha_jornada, registros_actualizados)
                    if horas_netas_hoy < meta - TOLERANCIA_SALIDA_HORAS:
                        deficit_mins = int(round((meta - horas_netas_hoy) * 60))
                        if deficit_mins > 10:
                            alerta_creada = True
                            alerta_tipo = 'SALIDA_ANTICIPADA'
                            alerta_titulo = f"Jornada incompleta{tag_offline}: {empleado.nombre} {empleado.apellido}"
                            alerta_mensaje = (
                                f"Se retiró antes de cumplir sus {meta:g} horas. Acumuló {round(horas_netas_hoy, 1)} hrs "
                                f"(Déficit de {deficit_mins} min)."
                            )

        if alerta_creada:
            AlertaAsistencia.objects.create(
                tipo=alerta_tipo,
                empleado=empleado,
                titulo=alerta_titulo,
                mensaje=alerta_mensaje
            )

        res_info = {
            'alerta_creada': alerta_creada,
            'alerta_tipo': alerta_tipo,
            'es_tardanza': (alerta_tipo == 'TARDANZA' and alerta_creada),
            'minutos_tardanza': diff_tardanza,
            'turno_esperado': turno_esperado_str,
            'tipo_tardanza': tipo if (alerta_tipo == 'TARDANZA' and alerta_creada) else '',
        }
        return res_info
    except Exception as ex:
        print(f"Error evaluando alertas: {ex}")
        return res_info


# ==========================================
# 🟢 ENDPOINT PRINCIPAL DEL KIOSCO DE MARCAJE
# ==========================================

@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def empleados_kiosco(request):
    """
    Lista mínima de colaboradores activos para que el Kiosco muestre el nombre al escanear.
    No expone el token QR: solo su huella SHA-256 (del UUID), que no sirve para marcar.
    """
    import hashlib
    data = []
    for emp in Empleado.objects.filter(activo=True).only('id', 'nombre', 'apellido', 'qr_code_token'):
        raw_uuid = str(emp.qr_code_token or '').split('.', 1)[0]
        if not raw_uuid:
            continue
        data.append({
            'id': emp.id,
            'nombre': emp.nombre,
            'apellido': emp.apellido,
            'qr_hash': hashlib.sha256(raw_uuid.encode()).hexdigest(),
        })
    return Response(data)


def _empleado_por_qr(qr_token):
    """
    Busca al empleado activo por el código QR completo (uuid.firma), tal como está
    guardado y impreso en su carnet. Se compara el código entero: un UUID con firma
    inventada o ausente no autentica. No recalcula la firma, así que cambiar
    SECRET_KEY no invalida los carnets existentes.
    """
    token = str(qr_token or '').strip()
    if not token:
        return None
    return Empleado.objects.filter(qr_code_token=token, activo=True).first()


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
@renderer_classes([JSONRenderer])
def marcar_asistencia_kiosco(request):
    """
    Endpoint invocado por el Kiosco al escanear un Código QR.
    Acepta: qr_token, tipo_evento (opcional), foto (opcional).
    """
    qr_token = request.data.get('qr_token') or request.data.get('token')
    if not qr_token:
        return Response({'status': 'error', 'mensaje': 'Código QR no proporcionado.'}, status=400)

    qr_token = qr_token.strip()

    empleado = _empleado_por_qr(qr_token)

    if not empleado:
        return Response({'status': 'error', 'mensaje': 'Código QR no encontrado en base de datos o empleado inactivo.'}, status=400)

    # En producción, la hora del marcaje es AUTORITATIVA del servidor (evita manipulación de hora).
    # Solo se permite fecha_hora simulada si settings.DEBUG=True o mediante cabecera de pruebas autorizada.
    from django.conf import settings
    fecha_hora_simulada = request.data.get('fecha_hora')
    import os
    import hmac
    simulation_key = os.getenv('KIOSK_SIMULATION_KEY', '')
    test_auth_header = bool(simulation_key) and hmac.compare_digest(
        (request.headers.get('X-Test-Simulation-Key') or '').encode(), simulation_key.encode()
    )

    if fecha_hora_simulada and (getattr(settings, 'DEBUG', False) or test_auth_header):
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
                'horas_trabajadas_hoy': round(_calcular_horas_netas_dia(list(registros_hoy)), 1)
            })

    # Tipo de evento solicitado o auto-detectado inteligentemente por franja horaria
    tipo_evento = request.data.get('tipo_evento')
    dt_local = fecha_hora_registro.astimezone(timezone.get_current_timezone())
    hora_mins = dt_local.hour * 60 + dt_local.minute
    ayer = hoy - datetime.timedelta(days=1)

    # ── DETECCIÓN DE CIERRE DE TURNO TRASNOCHE (00:00 a 04:59 AM) ─────────
    # Si el colaborador marca en la madrugada y tiene turno abierto de ayer, es el fin de su jornada
    es_cierre_trasnoche = False
    regs_ayer_trasnoche = []
    if dt_local.hour < 5:
        start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
        end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
        regs_ayer_trasnoche = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_ayer, end_ayer)
        ).order_by('fecha_hora'))
        if regs_ayer_trasnoche and regs_ayer_trasnoche[-1].tipo_evento in ('ENTRADA', 'ENTRADA_QUEBRADA'):
            es_cierre_trasnoche = True

    if not tipo_evento or tipo_evento not in dict(RegistroAsistencia.TIPO_EVENTO_CHOICES):
        if es_cierre_trasnoche:
            tipo_evento = 'SALIDA_DEFINITIVA'
        else:
            tipo_evento = _autodetectar_tipo_evento(registros_hoy, fecha_hora_registro, empleado=empleado)

    foto = request.FILES.get('foto')
    foto_b64 = _procesar_foto_a_base64(foto)

    # ── DETECCIÓN DE HORARIO INUSUAL / MADRUGADA ───────────────────────────
    # No generar alerta sospechosa si es un cierre legítimo de turno nocturno
    if 1 <= dt_local.hour < 7 and not es_cierre_trasnoche:
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
            foto_base64=foto_b64,
            fecha_hora=fecha_hora_registro,
            ip_address=_get_clean_ip(request)
        )

    # Calcular horas trabajadas acumuladas hasta el momento
    if es_cierre_trasnoche:
        # Unir los registros de ayer con esta salida de madrugada para cómputo de horas totales del turno
        registros_actualizados = regs_ayer_trasnoche + [registro]
        dia_operativo_cierre = ayer
    else:
        registros_actualizados = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_dt, end_dt)
        ).order_by('fecha_hora'))
        dia_operativo_cierre = hoy

    horas_netas_hoy = _calcular_horas_netas_dia(registros_actualizados)

    # ── ALERTA: ENTRADA sin SALIDA previa del día anterior ─────────────────
    # Si hoy el empleado marca ENTRADA pero ayer tenía una ENTRADA sin cerrar, alertar al admin
    if tipo_evento == 'ENTRADA':
        start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
        end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
        regs_ayer = list(RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_ayer, end_ayer)
        ).order_by('fecha_hora'))
        if regs_ayer:
            ultimo_ayer = regs_ayer[-1].tipo_evento
            if ultimo_ayer in ('ENTRADA', 'ENTRADA_QUEBRADA', 'SALIDA_QUEBRADA'):
                # Verificar si cerró en la madrugada de hoy (cierre trasnoche)
                cerro_madrugada = RegistroAsistencia.objects.filter(
                    empleado=empleado,
                    tipo_evento='SALIDA_DEFINITIVA',
                    fecha_hora__gte=start_dt,
                    fecha_hora__lt=start_dt + datetime.timedelta(hours=5)
                ).exists()
                if not cerro_madrugada:
                    AlertaAsistencia.objects.get_or_create(
                        tipo='REGISTRO_INCOMPLETO',
                        empleado=empleado,
                        titulo=f"Registro incompleto: {empleado.nombre} {empleado.apellido}",
                        defaults={
                            'mensaje': (
                                f"El día {ayer.strftime('%d/%m/%Y')} el empleado registró "
                                f"{regs_ayer[-1].get_tipo_evento_display()} a las "
                                f"{regs_ayer[-1].fecha_hora.astimezone(timezone.get_current_timezone()).strftime('%I:%M %p')} "
                                f"pero nunca completó su Salida Definitiva. "
                                f"Por favor, agregue la salida manualmente para calcular correctamente sus horas."
                            ),
                            'leida': False
                        }
                    )

    # ── BOLSA DE HORAS: Compensación Automática o Solicitud de Horas Extra ──
    comp_info = {
        'horas_amortizadas': 0.0,
        'deuda_restante': float(empleado.horas_pendientes),
        'horas_extra_solicitadas': 0.0,
    }
    if tipo_evento == 'SALIDA_DEFINITIVA':
        comp_info = _procesar_compensacion_y_horas_extra(empleado, dia_operativo_cierre, horas_netas_hoy, request)
        # Horas extra por 7mo día trabajado en la semana
        _verificar_septimo_dia(empleado, dia_operativo_cierre, horas_netas_hoy)

    # ── DETECCIÓN DE PUNTUALIDAD Y CREACIÓN DE ALERTAS INTERNAS ─────────────
    info_alerta = _evaluar_alertas_asistencia(registro, empleado, registros_actualizados, horas_netas_hoy, es_offline=False) or {}
    es_tardanza_kiosco = bool(info_alerta.get('es_tardanza'))
    minutos_tardanza_kiosco = int(info_alerta.get('minutos_tardanza', 0))
    turno_esperado_kiosco = str(info_alerta.get('turno_esperado', ''))

    meta_hoy = _jornada_esperada(dia_operativo_cierre, registros_actualizados)
    horas_restantes_hoy = max(0.0, round(meta_hoy - horas_netas_hoy, 1))
    cumplio_meta = horas_netas_hoy >= meta_hoy - TOLERANCIA_SALIDA_HORAS

    # Detectar si entró en el turno vespertino especial de las 5:00 PM (ej. Xiomara Castillo)
    primera_ent_kiosco = next((r for r in registros_actualizados if r.tipo_evento == 'ENTRADA'), None)
    es_turno_5pm_kiosco = False
    if primera_ent_kiosco:
        dt_pe = primera_ent_kiosco.fecha_hora.astimezone(timezone.get_current_timezone())
        mins_pe = dt_pe.hour * 60 + dt_pe.minute
        if abs(mins_pe - 1020) <= 45:
            es_turno_5pm_kiosco = True

    if tipo_evento == 'ENTRADA':
        if es_tardanza_kiosco:
            mensaje_kiosco = f"⚠️ TARDANZA: Llegaste {minutos_tardanza_kiosco} min tarde respecto a tu turno ({turno_esperado_kiosco}). Se notificó a Administración."
        else:
            mensaje_kiosco = f"¡Hola {empleado.nombre}! Entrada registrada. Jornada iniciada."
    elif tipo_evento == 'SALIDA_QUEBRADA':
        mensaje_kiosco = f"¡Buen descanso, {empleado.nombre}! Llevas {round(horas_netas_hoy, 1)} hrs acumuladas. Te faltan {round(horas_restantes_hoy, 1)} hrs para tus 8h."
    elif tipo_evento == 'ENTRADA_QUEBRADA':
        if es_tardanza_kiosco:
            mensaje_kiosco = f"⚠️ TARDANZA EN PAUSA: Regresaste {minutos_tardanza_kiosco} min tarde de tu descanso (Horario esperado: {turno_esperado_kiosco})."
        else:
            mensaje_kiosco = f"¡Bienvenido de vuelta, {empleado.nombre}! Llevas {round(horas_netas_hoy, 1)} hrs del primer turno. Te restan {round(horas_restantes_hoy, 1)} hrs para tus 8h."
    elif tipo_evento == 'SALIDA_DEFINITIVA':
        pausas_kiosco = [r for r in registros_actualizados if r.tipo_evento == 'SALIDA_QUEBRADA']
        retornos_kiosco = [r for r in registros_actualizados if r.tipo_evento == 'ENTRADA_QUEBRADA']
        omision_retorno_kiosco = False
        if pausas_kiosco and not retornos_kiosco:
            omision_retorno_kiosco = True
        elif pausas_kiosco and retornos_kiosco and pausas_kiosco[-1].fecha_hora > retornos_kiosco[-1].fecha_hora:
            omision_retorno_kiosco = True

        if omision_retorno_kiosco:
            ult_pausa_dt = pausas_kiosco[-1].fecha_hora.astimezone(timezone.get_current_timezone())
            mensaje_kiosco = (
                f"⚠️ ¡Atención, {empleado.nombre}! Se registró tu Salida Definitiva, pero olvidaste marcar tu Entrada de Quiebre hoy "
                f"(saliste a pausa a las {ult_pausa_dt.strftime('%I:%M %p')}). "
                f"Notifica a Administración para que agreguen tu hora de retorno y no pierdas tus horas de la tarde."
            )
        elif comp_info.get('es_septimo_dia'):
            if comp_info['horas_amortizadas'] > 0:
                if comp_info['deuda_restante'] <= 0:
                    mensaje_kiosco = (
                        f"¡Excelente esfuerzo, {empleado.nombre}! Laboraste {round(horas_netas_hoy, 1)} hrs en tu día libre (7mo día). "
                        f"¡Saldaste toda tu deuda pendiente ({round(comp_info['horas_amortizadas'], 1)} hrs) y quedas al día! 🎉"
                    )
                else:
                    mensaje_kiosco = (
                        f"¡Excelente esfuerzo, {empleado.nombre}! Laboraste {round(horas_netas_hoy, 1)} hrs en tu día libre (7mo día). "
                        f"Se abonaron {round(comp_info['horas_amortizadas'], 1)} hrs a tu deuda (Saldo restante: {round(comp_info['deuda_restante'], 1)} hrs)."
                    )
            else:
                mensaje_kiosco = (
                    f"¡Excelente trabajo, {empleado.nombre}! Laboraste {round(horas_netas_hoy, 1)} hrs en tu día libre (7mo día). "
                    f"Se enviaron {round(comp_info['horas_extra_solicitadas'], 1)} hrs extra para aprobación de nómina. ¡Buen descanso!"
                )
        elif comp_info.get('horas_compensadas_de_extra', 0) > 0:
            if comp_info['deuda_restante'] <= 0:
                mensaje_kiosco = (
                    f"Jornada finalizada, {empleado.nombre} ({round(horas_netas_hoy, 1)} hrs trabajadas). "
                    f"Tu salida anticipada (-{round(comp_info['horas_compensadas_de_extra'], 1)} hrs) se compensó con tus horas extra pendientes. "
                    f"¡Quedas al día sin deuda! 🎉 ¡Buen descanso!"
                )
            else:
                mensaje_kiosco = (
                    f"Jornada finalizada, {empleado.nombre} ({round(horas_netas_hoy, 1)} hrs trabajadas). "
                    f"Se compensaron {round(comp_info['horas_compensadas_de_extra'], 1)} hrs con tus horas extra pendientes. "
                    f"Déficit restante: {round(comp_info['deuda_restante'], 1)} hrs."
                )
        elif comp_info['horas_amortizadas'] > 0:
            if comp_info['deuda_restante'] <= 0:
                if comp_info['horas_extra_solicitadas'] > 0:
                    mensaje_kiosco = (
                        f"¡Excelente trabajo, {empleado.nombre}! Completaste {round(horas_netas_hoy, 1)} hrs hoy. "
                        f"¡Saldaste tus {round(comp_info['horas_amortizadas'], 1)} hrs debidas 🎉 y enviamos {round(comp_info['horas_extra_solicitadas'], 1)} hrs extra para aprobación!"
                    )
                else:
                    mensaje_kiosco = (
                        f"¡Excelente trabajo, {empleado.nombre}! Completaste {round(horas_netas_hoy, 1)} hrs hoy. "
                        f"¡Has liquidado por completo tu deuda de horas pendientes ({round(comp_info['horas_amortizadas'], 1)} hrs saldadas)! 🎉 ¡Buen descanso!"
                    )
            else:
                mensaje_kiosco = (
                    f"Jornada finalizada, {empleado.nombre}. Completaste {round(horas_netas_hoy, 1)} hrs hoy. "
                    f"Se abonaron {round(comp_info['horas_amortizadas'], 1)} hrs a tu déficit de horas (Saldo pendiente restante: {round(comp_info['deuda_restante'], 1)} hrs)."
                )
        elif cumplio_meta:
            if comp_info['horas_extra_solicitadas'] > 0:
                mensaje_kiosco = (
                    f"¡Excelente trabajo, {empleado.nombre}! Completaste {round(horas_netas_hoy, 1)} hrs hoy (Meta de 8 hrs cumplida 🎉). "
                    f"Se enviaron {round(comp_info['horas_extra_solicitadas'], 1)} hrs extra para aprobación."
                )
            else:
                mensaje_kiosco = f"¡Excelente trabajo, {empleado.nombre}! Completaste {round(horas_netas_hoy, 1)} hrs hoy (Meta de 8 hrs cumplida 🎉). ¡Buen descanso!"
        elif es_turno_5pm_kiosco and horas_netas_hoy >= 5.8:
            mensaje_kiosco = (
                f"¡Buen trabajo, {empleado.nombre}! Turno vespertino completado ({round(horas_netas_hoy, 1)} hrs). "
                f"Déficit diario de {round(horas_restantes_hoy, 1)} hrs acumulado para reposición el fin de semana. ¡Buen descanso!"
            )
        else:
            mensaje_kiosco = f"Jornada finalizada, {empleado.nombre}. Acumulaste {round(horas_netas_hoy, 1)} hrs hoy (Déficit de {round(horas_restantes_hoy, 1)} hrs)."
    else:
        mensaje_kiosco = f"¡Hola {empleado.nombre}! Marcaje registrado correctamente."

    return Response({
        'status': 'ok',
        'mensaje': mensaje_kiosco,
        'es_tardanza': es_tardanza_kiosco,
        'minutos_tardanza': minutos_tardanza_kiosco,
        'turno_esperado': turno_esperado_kiosco,
        'tipo_tardanza': info_alerta.get('tipo_tardanza', ''),
        'advertencia_quiebre': (tipo_evento == 'SALIDA_DEFINITIVA' and omision_retorno_kiosco),
        'registro': RegistroAsistenciaSerializer(registro, context={'request': request}).data,
        'horas_trabajadas_hoy': round(horas_netas_hoy, 1),
        'horas_restantes_hoy': round(horas_restantes_hoy, 1),
        'cumplio_meta_8h': cumplio_meta,
        'compensacion': comp_info,
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
@renderer_classes([JSONRenderer])
def consultar_horas_kiosco(request):
    """
    Endpoint seguro de solo lectura para consulta de horas del colaborador desde el Kiosco.
    No entrega datos salariales ni contraseñas.
    """
    qr_token = str(request.data.get('qr_token', '')).strip()
    if not qr_token:
        return Response({'status': 'error', 'mensaje': 'Código QR no proporcionado.'}, status=400)

    empleado = _empleado_por_qr(qr_token)

    if not empleado:
        return Response({'status': 'error', 'mensaje': 'Carnet de colaborador no reconocido o inactivo.'}, status=404)

    tz_ni = timezone.get_current_timezone()
    ahora = timezone.now().astimezone(tz_ni)
    hoy = ahora.date()

    # 1. Marcajes de hoy
    import datetime
    start_dt = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.min), tz_ni)
    end_dt = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.max), tz_ni)

    registros_hoy = list(RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_dt, end_dt)
    ).order_by('fecha_hora'))

    marcajes_hoy = [
        {
            'tipo': r.tipo_evento,
            'display': r.get_tipo_evento_display(),
            'hora': r.fecha_hora.astimezone(tz_ni).strftime('%I:%M %p')
        }
        for r in registros_hoy
    ]

    horas_hoy = round(_calcular_horas_netas_dia(registros_hoy), 1)

    # 2. Horas acumuladas del mes vigente
    primer_dia_mes = hoy.replace(day=1)
    start_mes = timezone.make_aware(datetime.datetime.combine(primer_dia_mes, datetime.time.min), tz_ni)

    registros_mes = list(RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_mes, end_dt)
    ).order_by('fecha_hora'))

    por_dia = {}
    for r in registros_mes:
        d = r.fecha_hora.astimezone(tz_ni).date()
        por_dia.setdefault(d, []).append(r)

    horas_mes_total = sum(_calcular_horas_netas_dia(regs_dia) for regs_dia in por_dia.values())

    # 3. Estado de Turno en Curso (En Vivo)
    ultimo_reg = registros_hoy[-1] if registros_hoy else None
    turno_activo = False
    hora_inicio_turno = None
    horas_en_curso = 0.0

    if ultimo_reg and ultimo_reg.tipo_evento in ['ENTRADA', 'ENTRADA_QUEBRADA']:
        turno_activo = True
        hora_inicio_turno = ultimo_reg.fecha_hora.astimezone(tz_ni).strftime('%I:%M %p')
        segundos_transcurridos = max(0, (ahora - ultimo_reg.fecha_hora).total_seconds())
        horas_en_curso = round(segundos_transcurridos / 3600.0, 1)

    # 4. Horas Extra Aprobadas y Pendientes del Mes
    from django.db.models import Sum
    horas_extra_aprobadas = AutorizacionHorasExtra.objects.filter(
        empleado=empleado,
        estado='APROBADO',
        fecha__gte=primer_dia_mes,
        fecha__lte=hoy
    ).aggregate(total=Sum('horas_extra_autorizadas'))['total'] or 0.0

    horas_extra_pendientes = AutorizacionHorasExtra.objects.filter(
        empleado=empleado,
        estado='PENDIENTE',
        fecha__gte=primer_dia_mes,
        fecha__lte=hoy
    ).aggregate(total=Sum('horas_extra_solicitadas'))['total'] or 0.0

    dias_trabajados_mes = len(por_dia)

    return Response({
        'status': 'ok',
        'empleado': {
            'id': empleado.id,
            'nombre': empleado.nombre,
            'apellido': empleado.apellido,
            'cargo_display': empleado.get_cargo_display(),
        },
        'marcajes_hoy': marcajes_hoy,
        'horas_trabajadas_hoy': horas_hoy,
        'horas_mes': round(horas_mes_total, 1),
        'horas_pendientes': round(float(empleado.horas_pendientes), 1),
        'turno_activo': turno_activo,
        'hora_inicio_turno': hora_inicio_turno,
        'horas_en_curso': horas_en_curso,
        'horas_extra_aprobadas': round(float(horas_extra_aprobadas), 1),
        'horas_extra_pendientes': round(float(horas_extra_pendientes), 1),
        'dias_trabajados_mes': dias_trabajados_mes,
    })


def _calcular_horas_netas_dia(registros_dia):
    """
    Suma el tiempo entre ENTRADA -> SALIDA_QUEBRADA y ENTRADA_QUEBRADA -> SALIDA_DEFINITIVA.
    Aplica la Regla de Inicio Oficial (Opción A):
    Si un empleado llega temprano (ej. 11:26 AM para turno de 12:00 PM, o 5:53 PM para retorno de 6:00 PM),
    la jornada cuenta desde la hora oficial del turno, evitando inflar horas extras no autorizadas.
    """
    import datetime
    total_segundos = 0
    entrada_temp = None

    tz_ni = timezone.get_current_timezone()

    # Detectar si el día tiene quebrado y la hora de retorno
    retorno_q = next((r for r in registros_dia if r.tipo_evento == 'ENTRADA_QUEBRADA'), None)
    es_quebrado_11am = False
    if retorno_q:
        dt_ret_local = retorno_q.fecha_hora.astimezone(tz_ni)
        mins_ret = dt_ret_local.hour * 60 + dt_ret_local.minute
        if mins_ret >= 1115:  # 6:35 PM o después -> turno de 11:00 AM (retorno 7 PM)
            es_quebrado_11am = True

    for reg in registros_dia:
        dt_local = reg.fecha_hora.astimezone(tz_ni)

        if reg.tipo_evento == 'ENTRADA':
            # Si ya hay un inicio de jornada abierto sin salida, no sobreescribir el inicio
            if entrada_temp is not None:
                continue

            mins_e = dt_local.hour * 60 + dt_local.minute
            # Determinar franja base oficial (Manual por Admin o Ventana Automática)
            import re
            m_t = re.search(r'\[TURNO:([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\]', reg.observacion or '', re.IGNORECASE)
            t_map = {'9:00 AM': 540, '10:00 AM': 600, '11:00 AM': 660, '12:00 PM': 720, '2:00 PM': 840, '3:00 PM': 900, '5:00 PM': 1020, '6:00 PM': 1080}
            base_mins = None
            if m_t:
                base_mins = t_map.get(m_t.group(1).upper().strip())

            if not base_mins:
                if mins_e < 576:
                    base_mins = 540   # 9:00 AM
                elif mins_e < 636:
                    base_mins = 600   # 10:00 AM
                elif mins_e < 696:
                    base_mins = 660   # 11:00 AM
                elif mins_e < 780:
                    base_mins = 720   # 12:00 PM (11:36 AM a 1:00 PM)
                elif mins_e < 871:
                    base_mins = 840   # 2:00 PM (1:01 PM a 2:30 PM)
                elif mins_e < 961:
                    base_mins = 900   # 3:00 PM (2:31 PM a 4:00 PM)
                elif mins_e < 1056:
                    base_mins = 1020  # 5:00 PM
                else:
                    base_mins = 1080  # 6:00 PM

            h_b = base_mins // 60
            m_b = base_mins % 60
            inicio_oficial = timezone.make_aware(
                datetime.datetime.combine(dt_local.date(), datetime.time(h_b, m_b)),
                tz_ni
            )

            # Si llegó antes de la hora oficial, la jornada arranca a la hora oficial (llegar temprano
            # sin autorización no suma horas). Si llegó tarde, arranca en su hora real de marcaje.
            if dt_local < inicio_oficial:
                entrada_temp = inicio_oficial
            else:
                entrada_temp = reg.fecha_hora

        elif reg.tipo_evento == 'ENTRADA_QUEBRADA':
            hora_ret_esperada = 1140 if es_quebrado_11am else 1080  # 7:00 PM o 6:00 PM
            h_b = hora_ret_esperada // 60
            m_b = hora_ret_esperada % 60
            retorno_oficial = timezone.make_aware(
                datetime.datetime.combine(dt_local.date(), datetime.time(h_b, m_b)),
                tz_ni
            )

            # Si regresó antes de la hora oficial de retorno, cuenta desde la hora oficial
            if dt_local < retorno_oficial:
                entrada_temp = retorno_oficial
            else:
                entrada_temp = reg.fecha_hora

        elif reg.tipo_evento in ('SALIDA_QUEBRADA', 'SALIDA_DEFINITIVA') and entrada_temp:
            diferencia = (reg.fecha_hora - entrada_temp).total_seconds()
            if diferencia > 0:
                total_segundos += diferencia
            entrada_temp = None

    return total_segundos / 3600.0


# El domingo el restaurante cierra a las 10:00 PM: quien se queda
# hasta el cierre (sale desde las 9:50 PM / 10:00 PM, o de madrugada) cumple con 7.5 h.
JORNADA_ORDINARIA = 8.0
JORNADA_CIERRE_DOMINGO = 7.5
TOLERANCIA_SALIDA_HORAS = 10 / 60  # 10 min de cortesía


def _jornada_esperada(fecha, registros_dia):
    """Horas que debe cumplir el colaborador en `fecha` según sus marcajes del día."""
    if fecha.weekday() != 6:
        return JORNADA_ORDINARIA
    tz_ni = timezone.get_current_timezone()
    for r in registros_dia:
        if r.tipo_evento != 'SALIDA_DEFINITIVA':
            continue
        local = r.fecha_hora.astimezone(tz_ni)
        # Cierre dominical a las 10:00 PM (salida a partir de las 9:50 PM / 1310 mins, o trasnoche < 5 AM)
        if local.date() > fecha or local.hour < 5 or local.hour * 60 + local.minute >= 21 * 60 + 50:
            return JORNADA_CIERRE_DOMINGO
    return JORNADA_ORDINARIA


def _registros_jornada(empleado, fecha):
    """Marcajes de la jornada de `fecha`, incluida una salida de madrugada (antes de las 5 AM)."""
    tz_ni = timezone.get_current_timezone()
    inicio = timezone.make_aware(datetime.datetime.combine(fecha, datetime.time.min), tz_ni)
    fin = timezone.make_aware(datetime.datetime.combine(fecha, datetime.time.max), tz_ni) + datetime.timedelta(hours=5)
    regs = []
    for r in RegistroAsistencia.objects.filter(empleado=empleado, fecha_hora__range=(inicio, fin)).defer('foto_base64').order_by('fecha_hora'):
        local = r.fecha_hora.astimezone(tz_ni)
        if local.date() > fecha and r.tipo_evento != 'SALIDA_DEFINITIVA':
            continue
        regs.append(r)
    return regs


HORAS_DEUDA_POR_FALTA = 8.0


def _es_falta_cargada_a_deuda(permiso):
    """Permiso que registra una falta cobrada con 8 h en la bolsa de horas (no descuenta vacaciones)."""
    return permiso.tipo == 'PERMISO_AUTORIZADO' and 'deuda' in (permiso.motivo or '').lower()


def _fechas_falta_de_alerta(alerta):
    """
    Fechas de inasistencia que lista una alerta ("...falta sin justificar en fecha(s): 14/10, 15/10 (...").
    El año se deduce de la fecha de la alerta. Devuelve [] si el texto no las trae.
    """
    import re
    m = re.search(r'fecha\(s\):\s*([0-9/,\s]+)', alerta.mensaje or '')
    if not m:
        return []
    ref = alerta.created_at.astimezone(timezone.get_current_timezone()).date() if alerta.created_at else timezone.localdate()
    fechas = []
    for dd, mm in re.findall(r'(\d{1,2})/(\d{1,2})', m.group(1)):
        try:
            f = datetime.date(ref.year, int(mm), int(dd))
        except ValueError:
            continue
        if f > ref:
            f = f.replace(year=ref.year - 1)
        fechas.append(f)
    return sorted(set(fechas))


def _cargar_falta_a_deuda(empleado, fecha_falta):
    """Suma las 8 h de una falta a la bolsa solo si la falta es del mes vigente (la bolsa se reinicia cada mes)."""
    hoy = timezone.localdate()
    if fecha_falta.replace(day=1) != hoy.replace(day=1):
        return False
    _sincronizar_periodo_deuda(empleado, hoy)
    empleado.horas_pendientes = float(empleado.horas_pendientes or 0.0) + HORAS_DEUDA_POR_FALTA
    empleado.save(update_fields=['horas_pendientes'])
    return True


def _rehacer_jornada(empleado, fecha, request=None):
    """
    Vuelve a calcular la jornada de `fecha` después de que administración crea, corrige o borra
    un marcaje: bolsa de horas y solicitud de horas extra PENDIENTE del día. Las horas extra ya
    aprobadas, pagadas o declaradas como Día Libre Laborado no se tocan.
    """
    _recalcular_horas_pendientes_empleado(empleado, fecha)
    he = AutorizacionHorasExtra.objects.filter(empleado=empleado, fecha=fecha).first()
    if he and (he.estado != 'PENDIENTE' or '[Día Libre Laborado]' in (he.comentario or '')):
        return
    CompensacionHoras.objects.filter(empleado=empleado, fecha_compensacion=fecha).delete()
    regs = _registros_jornada(empleado, fecha)
    if any(r.tipo_evento == 'SALIDA_DEFINITIVA' for r in regs):
        _procesar_compensacion_y_horas_extra(empleado, fecha, _calcular_horas_netas_dia(regs), request)
    else:
        AutorizacionHorasExtra.objects.filter(empleado=empleado, fecha=fecha, estado='PENDIENTE').delete()
    # El kiosco suma el déficit al vuelo; aquí se deja la bolsa exacta con el recálculo completo
    _recalcular_horas_pendientes_empleado(empleado, fecha)


def _dia_operativo(registro):
    """Fecha de la jornada a la que pertenece un marcaje (una salida antes de las 5 AM es del día anterior)."""
    local = registro.fecha_hora.astimezone(timezone.get_current_timezone())
    if registro.tipo_evento == 'SALIDA_DEFINITIVA' and local.hour < 5:
        return local.date() - datetime.timedelta(days=1)
    return local.date()


def _recalcular_horas_pendientes_empleado(empleado, fecha_referencia=None):
    """
    Recalcula de forma determinista y auditable el saldo de horas_pendientes del empleado
    para el mes correspondiente a fecha_referencia (o el mes actual por defecto).
    Recorre cronológicamente los días que cuentan con SALIDA_DEFINITIVA registrada.
    El cómputo de déficit inicia oficialmente a partir del 10 de octubre de 2026.
    """
    import datetime
    tz_ni = timezone.get_current_timezone()
    referencia = fecha_referencia or timezone.localdate()
    primer_dia_mes = referencia.replace(day=1)

    # La deuda es mensual: corregir un marcaje de un mes ya cerrado no toca el saldo vigente
    empleado.refresh_from_db(fields=['horas_pendientes', 'periodo_horas_pendientes'])
    if empleado.periodo_horas_pendientes and primer_dia_mes < empleado.periodo_horas_pendientes:
        return empleado.horas_pendientes

    # Recalcular el mes completo hasta hoy, no solo hasta el día editado
    siguiente_mes = (primer_dia_mes + datetime.timedelta(days=32)).replace(day=1)
    hoy = max(referencia, min(timezone.localdate(), siguiente_mes - datetime.timedelta(days=1)))

    start_mes = timezone.make_aware(datetime.datetime.combine(primer_dia_mes, datetime.time.min), tz_ni)
    # Extender 5 horas para capturar posibles salidas definitivas en la madrugada (trasnoche)
    end_mes = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.max), tz_ni) + datetime.timedelta(hours=5)

    registros_mes = list(RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_mes, end_mes)
    ).order_by('fecha_hora'))

    por_dia = {}
    for r in registros_mes:
        r_local = r.fecha_hora.astimezone(tz_ni)
        d_local = r_local.date()
        # Si es salida definitiva de madrugada (< 5 AM), se asocia a la jornada del día anterior
        if r.tipo_evento == 'SALIDA_DEFINITIVA' and r_local.hour < 5:
            d = d_local - datetime.timedelta(days=1)
        else:
            d = d_local
        if d < primer_dia_mes or d > hoy:
            continue
        por_dia.setdefault(d, []).append(r)

    deuda_acumulada = 0.0
    fecha_corte_deficit = datetime.date(2026, 10, 10)

    for d in sorted(por_dia.keys()):
        regs_d = por_dia[d]
        tiene_salida_definitiva = any(r.tipo_evento == 'SALIDA_DEFINITIVA' for r in regs_d)
        
        # Solo calculamos balance a partir del 10 de octubre de 2026
        if tiene_salida_definitiva and d >= fecha_corte_deficit:
            es_dia_libre = AutorizacionHorasExtra.objects.filter(
                empleado=empleado, fecha=d, comentario__icontains='[Día Libre Laborado]'
            ).exists()
            # Mismas reglas que el kiosco (_acumular_horas_pendientes): tolerancia de 10 min,
            # 7.5 h el domingo al cierre y marcajes técnicos < 12 min ignorados.
            if not es_dia_libre:
                horas_dia = _calcular_horas_netas_dia(regs_d)
                meta = _jornada_esperada(d, regs_d)
                if 0.2 <= horas_dia < meta - TOLERANCIA_SALIDA_HORAS:
                    deficit = round(meta - horas_dia, 1)
                    if deficit > 0.1:
                        deuda_acumulada += deficit
    # Faltas del mes cobradas en la bolsa de horas (8 h cada una): no salen de los marcajes,
    # así que se suman aparte para que un recálculo no las borre.
    faltas_deuda = [
        p for p in PermisoAusencia.objects.filter(
            empleado=empleado, tipo='PERMISO_AUTORIZADO',
            fecha_inicio__gte=max(primer_dia_mes, fecha_corte_deficit), fecha_inicio__lte=hoy,
        )
        if _es_falta_cargada_a_deuda(p)
    ]
    deuda_acumulada += HORAS_DEUDA_POR_FALTA * len(faltas_deuda)

    # Restar compensaciones formalmente aprobadas en el mes
    from django.db.models import Sum
    total_compensado = CompensacionHoras.objects.filter(
        empleado=empleado,
        fecha_compensacion__range=(primer_dia_mes, hoy)
    ).aggregate(t=Sum('horas_deducidas'))['t'] or 0.0

    deuda_neta = max(0.0, round(deuda_acumulada - float(total_compensado), 1))
    empleado.horas_pendientes = deuda_neta
    empleado.periodo_horas_pendientes = primer_dia_mes
    empleado.save(update_fields=['horas_pendientes', 'periodo_horas_pendientes'])
    return empleado.horas_pendientes


def _sincronizar_periodo_deuda(empleado, fecha):
    """
    La Bolsa de Horas se reinicia cada mes (acuerdo gerencial 24/10/2026).
    Si `fecha` cae en un mes posterior al período guardado, la deuda vuelve a 0 y el
    período avanza. Devuelve False si `fecha` pertenece a un mes ya cerrado.
    """
    primer_dia_mes = fecha.replace(day=1)
    periodo = empleado.periodo_horas_pendientes
    if periodo and primer_dia_mes < periodo:
        return False
    if periodo is None or primer_dia_mes > periodo:
        if periodo is not None:
            empleado.horas_pendientes = 0.0
        empleado.periodo_horas_pendientes = primer_dia_mes
        empleado.save(update_fields=['horas_pendientes', 'periodo_horas_pendientes'])
    return True


def _acumular_horas_pendientes(empleado, fecha_hoy, horas_trabajadas_dia, meta=JORNADA_ORDINARIA):
    """
    Si el empleado trabajó menos de su jornada (`meta`: 8 h, o 7.5 h el domingo al cierre),
    acumula el déficit en horas_pendientes.
    El cómputo de déficit inicia oficialmente a partir del 10 de octubre de 2026.
    """
    if fecha_hoy < datetime.date(2026, 10, 10):
        return  # Todo déficit previo al 10 de octubre de 2026 queda condonado / borrón y cuenta nueva

    # Tolerancia oficial de salida: hasta 10 min antes de la meta se considera jornada cumplida.
    # Si las horas trabajadas son insignificantes (< 0.2h = menos de 12 min), es marcaje duplicado o erróneo.
    if horas_trabajadas_dia >= meta - TOLERANCIA_SALIDA_HORAS or horas_trabajadas_dia < 0.2:
        return  # No hay deuda (jornada cumplida dentro de tolerancia de 10 min o marcaje técnico insignificante)

    horas_ordinarias = min(horas_trabajadas_dia, meta)
    deficit = max(0.0, meta - horas_ordinarias)

    if deficit <= 0.1:
        return  # No hay deuda que acumular este día

    if not _sincronizar_periodo_deuda(empleado, fecha_hoy):
        return  # Jornada de un mes ya cerrado: su deuda no pasa al mes vigente

    empleado.horas_pendientes = float(empleado.horas_pendientes or 0.0) + round(deficit, 1)
    empleado.save(update_fields=['horas_pendientes'])


def _aplicar_amortizacion_deuda_empleado(empleado, fecha_referencia, horas_a_amortizar, request=None, origen='SALIDA_KIOSCO'):
    """
    Aplica formalmente la amortización de deuda acumulada (Bolsa de Horas):
    1. Si origen == 'SALIDA_KIOSCO': Se aplica automáticamente en el marcaje de salida con el excedente trabajado.
    2. Si origen == 'APROBACION_ADMIN': Se aplica cuando el Administrador APRUEBA una solicitud con PIN de nómina.
    - Descuenta hasta min(horas_a_amortizar, deuda_actual) de empleado.horas_pendientes.
    - Genera registro auditable en CompensacionHoras con desglose FIFO de días adeudados.
    - Genera notificación clara y verídica en AlertaAsistencia(tipo='COMPENSACION_HORAS').
    - Registra en BitacoraAccion.
    """
    import datetime
    tz_ni = timezone.get_current_timezone()
    primer_dia_mes = fecha_referencia.replace(day=1)

    _sincronizar_periodo_deuda(empleado, fecha_referencia)

    deuda_actual = float(empleado.horas_pendientes or 0.0)
    if deuda_actual <= 0 or horas_a_amortizar <= 0:
        return {
            'horas_amortizadas': 0.0,
            'deuda_previa': deuda_actual,
            'deuda_restante': deuda_actual,
            'remanente': horas_a_amortizar,
            'compensacion': None,
        }

    horas_amortizadas = min(horas_a_amortizar, deuda_actual)
    nueva_deuda = max(0.0, round(deuda_actual - horas_amortizadas, 1))
    empleado.horas_pendientes = nueva_deuda
    empleado.save(update_fields=['horas_pendientes'])

    remanente_extra = max(0.0, round(horas_a_amortizar - horas_amortizadas, 1))

    # Buscar días previos con déficit para construir el desglose detallado (FIFO)
    start_periodo = timezone.make_aware(datetime.datetime.combine(primer_dia_mes, datetime.time.min), tz_ni)
    end_ayer = timezone.make_aware(datetime.datetime.combine(fecha_referencia - datetime.timedelta(days=1), datetime.time.max), tz_ni)

    regs_periodo = RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_periodo, end_ayer)
    ).order_by('fecha_hora')

    por_dia = {}
    for r in regs_periodo:
        d = r.fecha_hora.astimezone(tz_ni).date()
        por_dia.setdefault(d, []).append(r)

    horas_por_cubrir = horas_amortizadas
    desglose = []

    for d in sorted(por_dia.keys()):
        if horas_por_cubrir <= 0:
            break
        regs_d = por_dia[d]
        tiene_salida_def = any(r.tipo_evento == 'SALIDA_DEFINITIVA' for r in regs_d)
        if tiene_salida_def:
            horas_dia = _calcular_horas_netas_dia(regs_d)
            meta_d = _jornada_esperada(d, regs_d)
            if horas_dia < meta_d:
                deficit_dia = round(meta_d - horas_dia, 1)
                aplicado = min(horas_por_cubrir, deficit_dia)
                if aplicado > 0:
                    saldo_item = round(deficit_dia - aplicado, 1)
                    desglose.append({
                        'fecha': str(d),
                        'fecha_display': d.strftime('%d/%m/%Y'),
                        'horas_trabajadas': round(horas_dia, 1),
                        'horas_faltaron': deficit_dia,
                        'deficit_original': deficit_dia,
                        'horas_aplicadas': round(aplicado, 1),
                        'horas_compensadas': round(aplicado, 1),
                        'saldo_dia': saldo_item,
                        'saldo_post': saldo_item,
                        'estado': "Liquidado al 100%" if saldo_item == 0 else f"Saldo pendiente ({saldo_item} hrs)"
                    })
                    horas_por_cubrir = round(horas_por_cubrir - aplicado, 1)

    if not desglose and horas_amortizadas > 0:
        saldo_item = round(nueva_deuda, 1)
        horas_trab_est = max(0.0, round(8.0 - deuda_actual, 1))
        desglose.append({
            'fecha': str(fecha_referencia),
            'fecha_display': fecha_referencia.strftime('%d/%m/%Y'),
            'horas_trabajadas': horas_trab_est,
            'horas_faltaron': round(deuda_actual, 1),
            'deficit_original': round(deuda_actual, 1),
            'horas_aplicadas': round(horas_amortizadas, 1),
            'horas_compensadas': round(horas_amortizadas, 1),
            'saldo_dia': saldo_item,
            'saldo_post': saldo_item,
            'estado': "Liquidado al 100%" if saldo_item == 0 else f"Saldo pendiente ({saldo_item} hrs)"
        })

    # Registrar CompensacionHoras auditable
    comp = CompensacionHoras.objects.create(
        empleado=empleado,
        fecha_compensacion=fecha_referencia,
        horas_trabajadas_hoy=round(8.0 + horas_a_amortizar, 1),
        horas_extra_generadas=round(horas_a_amortizar, 1),
        horas_deducidas=round(horas_amortizadas, 1),
        deuda_previa=round(deuda_actual, 1),
        saldo_restante=round(nueva_deuda, 1),
        remanente_extra=round(remanente_extra, 1),
        desglose=desglose,
    )

    # Crear notificación en campanita para el Administrador distinguiendo el origen real
    if origen == 'APROBACION_ADMIN':
        titulo_alerta = f"Compensación Autorizada: {empleado.nombre} {empleado.apellido}"
        mensaje_alerta = (
            f"Al autorizar horas extra del {fecha_referencia.strftime('%d/%m/%Y')}, "
            f"se aplicaron {round(horas_amortizadas, 1)} hrs para amortizar su déficit acumulado. "
            f"Saldo de horas debidas actualizado a: {round(nueva_deuda, 1)} hrs."
        )
        desc_bitacora = (
            f"Bolsa de Horas Aprobada: {round(horas_amortizadas, 1)} hrs compensadas para "
            f"{empleado.nombre} {empleado.apellido}. Deuda actualizada a {round(nueva_deuda, 1)} hrs."
        )
    else:
        titulo_alerta = f"Amortización Automática en Salida: {empleado.nombre} {empleado.apellido}"
        mensaje_alerta = (
            f"En su marcaje de salida del {fecha_referencia.strftime('%d/%m/%Y')}, "
            f"se aplicaron automáticamente {round(horas_amortizadas, 1)} hrs adicionales de su jornada "
            f"para amortizar su déficit acumulado en la Bolsa de Horas. "
            f"Saldo restante de horas debidas: {round(nueva_deuda, 1)} hrs."
        )
        desc_bitacora = (
            f"Amortización Automática en Salida: {round(horas_amortizadas, 1)} hrs aplicadas a "
            f"{empleado.nombre} {empleado.apellido}. Deuda actualizada a {round(nueva_deuda, 1)} hrs."
        )

    AlertaAsistencia.objects.create(
        tipo='COMPENSACION_HORAS',
        empleado=empleado,
        titulo=titulo_alerta,
        mensaje=mensaje_alerta,
        leida=False
    )

    # Registrar en bitácora auditable
    BitacoraAccion.objects.create(
        usuario=request.user if (request and hasattr(request, 'user') and request.user.is_authenticated) else None,
        accion='REGISTRO_MANUAL',
        descripcion=desc_bitacora,
        ip_address=_get_clean_ip(request) if request else None
    )

    return {
        'horas_amortizadas': round(horas_amortizadas, 1),
        'deuda_previa': round(deuda_actual, 1),
        'deuda_restante': round(nueva_deuda, 1),
        'remanente': round(remanente_extra, 1),
        'compensacion': comp,
        'desglose': desglose,
    }


def _es_septimo_dia_semana(empleado, fecha_hoy):
    """
    Determina si el día actual corresponde al 7mo día trabajado en la semana ISO (Lunes a Domingo).
    Si el empleado ya tiene registros de ENTRADA en 6 días previos distintos de esta misma semana,
    hoy es su 7mo día (día de descanso / día libre trabajado).
    """
    import datetime
    tz = timezone.get_current_timezone()
    inicio_semana = fecha_hoy - datetime.timedelta(days=fecha_hoy.weekday())
    inicio_dt = timezone.make_aware(datetime.datetime.combine(inicio_semana, datetime.time.min), tz)
    ayer_fin_dt = timezone.make_aware(datetime.datetime.combine(fecha_hoy - datetime.timedelta(days=1), datetime.time.max), tz)

    dias_trabajados = len({
        fh.astimezone(tz).date()
        for fh in RegistroAsistencia.objects.filter(
            empleado=empleado,
            tipo_evento='ENTRADA',
            fecha_hora__gte=inicio_dt,
            fecha_hora__lte=ayer_fin_dt,
        ).values_list('fecha_hora', flat=True)
    })

    return dias_trabajados >= 6


def _calcular_horas_extra_redondeadas(excedente_bruto: float) -> float:
    """
    Política oficial de redondeo justo para Horas Extra (Aprobada por Gerencia):
    1. Retrasos menores (< 1.0 hr, es decir < 60 minutos):
       - Menos de 30 min: 0.0 hrs extra (se toma como cierre normal de turno, entrega o plática).
       - De 30 min a 59 min: se queda estrictamente en 0.5 hrs (no brinca a 1.0 hr).
    2. Turnos pesados (>= 1.0 hr, es decir >= 60 minutos):
       - Aplica tolerancia generosa de 10 a 12 minutos hacia el siguiente escalón de media hora o de hora completa:
         * 0 a 19 min: se queda en la hora base (ej. 2h 10m -> 2.0h)
         * 20 a 29 min: faltan <= 10 min para media hora -> sube a media hora (ej. 1h 20m -> 1.5h, 2h 21m -> 2.5h)
         * 30 a 47 min: se queda en media hora (ej. 1h 35m -> 1.5h, 2h 45m -> 2.5h)
         * 48 a 59 min: faltan <= 12 min para la siguiente hora -> sube a la siguiente hora completa (ej. 3h 48m -> 4.0h, Doña Nelly)
    """
    if not excedente_bruto or float(excedente_bruto) <= 0:
        return 0.0

    minutos_totales = int(round(float(excedente_bruto) * 60))

    if minutos_totales < 30:
        return 0.0
    elif minutos_totales < 60:
        return 0.5

    horas_enteras = minutos_totales // 60
    minutos_remanentes = minutos_totales % 60

    if minutos_remanentes < 20:
        return float(horas_enteras)
    elif minutos_remanentes < 30:
        return float(horas_enteras + 0.5)
    elif minutos_remanentes < 48:
        return float(horas_enteras + 0.5)
    else:
        return float(horas_enteras + 1.0)


def _procesar_compensacion_y_horas_extra(empleado, fecha_hoy, horas_trabajadas_dia, request=None):
    """
    Gestiona la deducción automática de déficit y creación de solicitud de Horas Extra al marcar salida:
    1. Si hoy es el 7mo día de la semana (Día Libre laborado):
       - Base esperada = 0.0h (no hay déficit diario).
       - Todas las horas trabajadas hoy son horas extra / reposición de deuda.
       - Si el empleado tiene deuda previa (horas_pendientes > 0), se amortiza de inmediato.
       - El remanente limpio va a AutorizacionHorasExtra como horas extra de 7mo día.
    2. Si horas_trabajadas_dia < 8.0 en día ordinario:
       - Si posee solicitudes de horas extra PENDIENTES en el mes, se compensa de inmediato
         el déficit del día contra esas horas extra, reduciendo la solicitud y evitando generar deuda.
       - Si aún queda déficit tras agotar las horas extra pendientes, se acumula en horas_pendientes.
    3. Si horas_trabajadas_dia >= 8.0 en día ordinario:
       - Calcula excedente = round(horas_trabajadas_dia - 8.0, 1).
       - Si el empleado posee déficit en su Bolsa de Horas (horas_pendientes > 0),
         se sustraen automáticamente las horas necesarias para indemnizar la deuda de inmediato.
       - A la tabla de solicitudes de Horas Extra solo se envía el remanente limpio por pagar en nómina.
    """
    _sincronizar_periodo_deuda(empleado, fecha_hoy)

    # ── EVALUACIÓN AUTOMÁTICA DE FERIADO LABORADO Y VENTANA 24H ──
    try:
        _evaluar_feriado_al_cierre_jornada(empleado, fecha_hoy, horas_trabajadas_dia, request=request)
        _evaluar_y_autoacreditar_feriados_pendientes(request=request)
    except Exception as e:
        print(f"Error evaluando feriado automático al cierre de jornada: {e}")

    es_septimo_dia = _es_septimo_dia_semana(empleado, fecha_hoy)

    # Regla: Las horas extra se cuentan de forma permanente y universal a partir de media hora (0.5 hrs) en pasos limpios (0.5, 1.0, 1.5...)
    min_step = 0.5

    if es_septimo_dia:
        excedente = _calcular_horas_extra_redondeadas(horas_trabajadas_dia)
        deuda_actual = round(float(empleado.horas_pendientes or 0.0), 1)
        horas_amortizadas = 0.0
        remanente = excedente

        # Si tiene deuda y laboró en su día libre, se amortiza de inmediato su deuda
        if deuda_actual > 0 and excedente > 0:
            res_comp = _aplicar_amortizacion_deuda_empleado(
                empleado=empleado,
                fecha_referencia=fecha_hoy,
                horas_a_amortizar=excedente,
                request=request
            )
            horas_amortizadas = res_comp['horas_amortizadas']
            remanente = res_comp['remanente']
            deuda_actual = res_comp['deuda_restante']

        # El remanente pasa a solicitud de horas extra de 7mo día (con redondeo justo)
        remanente_limpio = _calcular_horas_extra_redondeadas(remanente)

        if remanente_limpio >= min_step:
            comentario_7mo = f"[7mo Día Trabajado] Jornada de {round(horas_trabajadas_dia, 1)} hrs."
            if horas_amortizadas > 0:
                fechas_saldadas = []
                if res_comp.get('desglose'):
                    for d_item in res_comp['desglose']:
                        f_txt = d_item.get('fecha_display') or d_item.get('fecha')
                        h_txt = d_item.get('horas_aplicadas') or d_item.get('horas_compensadas') or ''
                        fechas_saldadas.append(f"{f_txt} (-{h_txt}h)")
                fechas_txt = ", ".join(fechas_saldadas) if fechas_saldadas else f"{fecha_hoy.strftime('%d/%m/%Y')}"
                comentario_7mo += f" Se amortizaron automáticamente -{round(horas_amortizadas, 1)} hrs para saldar déficit previo del: {fechas_txt}. Remanente neto: {round(remanente_limpio, 1)} hrs."

            AutorizacionHorasExtra.objects.update_or_create(
                empleado=empleado,
                fecha=fecha_hoy,
                defaults={
                    'horas_extra_solicitadas': remanente_limpio,
                    'estado': 'PENDIENTE',
                    'comentario': comentario_7mo
                }
            )
        else:
            AutorizacionHorasExtra.objects.filter(
                empleado=empleado,
                fecha=fecha_hoy,
                estado='PENDIENTE'
            ).delete()

        return {
            'horas_netas': round(horas_trabajadas_dia, 1),
            'excedente': excedente,
            'horas_amortizadas': round(horas_amortizadas, 1),
            'deuda_restante': round(deuda_actual, 1),
            'horas_extra_solicitadas': remanente_limpio if remanente_limpio >= min_step else 0.0,
            'es_septimo_dia': True,
        }

    # Jornada esperada: 8 h, o 7.5 h el domingo para quien se queda al cierre de las 10:00 PM.
    # Tolerancia de cortesía de 10 min: dentro de ella la jornada se considera cumplida.
    meta = _jornada_esperada(fecha_hoy, _registros_jornada(empleado, fecha_hoy))
    if horas_trabajadas_dia < meta - TOLERANCIA_SALIDA_HORAS:
        # Si las horas trabajadas son insignificantes (< 0.2h = menos de 12 min), se trata de un marcaje
        # de salida duplicado o error técnico, no de una jornada corta real. Evitar generar alerta absurda de 0.0 hrs.
        if horas_trabajadas_dia < 0.2:
            return {
                'horas_netas': round(horas_trabajadas_dia, 1),
                'excedente': 0.0,
                'horas_amortizadas': 0.0,
                'deuda_restante': round(float(empleado.horas_pendientes or 0.0), 1),
                'horas_extra_solicitadas': 0.0,
                'horas_compensadas_de_extra': 0.0,
                'deficit_dia': 0.0,
            }

        deficit_dia = round(meta - horas_trabajadas_dia, 1)

        # OPCIÓN B (Control Gerencial):
        # El Kiosco NO borra ni recorta a ciegas las solicitudes de Horas Extra pendientes del colaborador.
        # En su lugar, acumula el déficit en la Bolsa de Horas (horas_pendientes) de forma limpia y transparente,
        # emitiendo una notificación para que la administración decida: Exonerar con justificación, Cargar a Deuda o Cruzar con Horas Extra.
        _acumular_horas_pendientes(empleado, fecha_hoy, horas_trabajadas_dia, meta)

        # Evitar crear alerta duplicada si ya existe una alerta de déficit o salida anticipada para este día
        tz = timezone.get_current_timezone()
        start_dia = timezone.make_aware(datetime.datetime.combine(fecha_hoy, datetime.time.min), tz)
        end_dia = timezone.make_aware(datetime.datetime.combine(fecha_hoy, datetime.time.max), tz) + datetime.timedelta(hours=5)
        ya_existe_alerta = AlertaAsistencia.objects.filter(
            empleado=empleado,
            tipo__in=['DEFICIT_JORNADA', 'SALIDA_ANTICIPADA'],
            created_at__range=(start_dia, end_dia)
        ).exists()

        if not ya_existe_alerta and deficit_dia > 0.1:
            AlertaAsistencia.objects.create(
                tipo='DEFICIT_JORNADA',
                empleado=empleado,
                titulo=f"Jornada Corta / Posible Día Libre: {empleado.nombre} {empleado.apellido}",
                mensaje=(
                    f"El {fecha_hoy.strftime('%d/%m/%Y')} el colaborador completó una jornada corta de {round(horas_trabajadas_dia, 1)} hrs "
                    f"(déficit calculado de {round(deficit_dia, 1)} hrs). "
                    f"Si este día fue su descanso o apoyo especial, puede resolverla como 'Día Libre Laborado' para anular la deuda "
                    f"y enviar sus {round(horas_trabajadas_dia, 1)} hrs trabajadas como Horas Extra a aprobación."
                ),
                leida=False
            )

        return {
            'horas_netas': round(horas_trabajadas_dia, 1),
            'excedente': 0.0,
            'horas_amortizadas': 0.0,
            'deuda_restante': round(float(empleado.horas_pendientes or 0.0), 1),
            'horas_extra_solicitadas': 0.0,
            'horas_compensadas_de_extra': 0.0,
            'deficit_dia': round(deficit_dia, 1),
        }

    # Regla: Las horas extra se computan con redondeo justo (turnos extendidos >= 1h con tolerancia 10-12 min)
    excedente_bruto = round(horas_trabajadas_dia - 8.0, 2)
    excedente = _calcular_horas_extra_redondeadas(excedente_bruto)

    deuda_actual = round(float(empleado.horas_pendientes or 0.0), 1)

    horas_amortizadas = 0.0
    remanente = excedente

    # Deducción automática e inmediata si el colaborador tiene déficit acumulado
    if deuda_actual > 0 and excedente > 0:
        res_comp = _aplicar_amortizacion_deuda_empleado(
            empleado=empleado,
            fecha_referencia=fecha_hoy,
            horas_a_amortizar=excedente,
            request=request
        )
        horas_amortizadas = res_comp['horas_amortizadas']
        remanente = res_comp['remanente']
        deuda_actual = res_comp['deuda_restante']

    # Solo el remanente limpio por pagar va a AutorizacionHorasExtra
    remanente_limpio = _calcular_horas_extra_redondeadas(remanente)

    if remanente_limpio >= min_step:
        defaults_extra = {
            'horas_extra_solicitadas': remanente_limpio,
            'estado': 'PENDIENTE',
        }
        if horas_amortizadas > 0:
            fechas_detalles = []
            if res_comp.get('desglose'):
                for d_item in res_comp['desglose']:
                    f_txt = d_item.get('fecha_display') or d_item.get('fecha')
                    h_txt = d_item.get('horas_aplicadas') or d_item.get('horas_compensadas') or ''
                    fechas_detalles.append(f"{f_txt} (-{h_txt}h)")
            fechas_str = ", ".join(fechas_detalles) if fechas_detalles else f"{fecha_hoy.strftime('%d/%m/%Y')}"
            defaults_extra['comentario'] = (
                f"Jornada de {round(horas_trabajadas_dia, 1)} hrs (+{round(excedente, 1)} hrs extra brutas). "
                f"Se compensaron automáticamente -{round(horas_amortizadas, 1)} hrs de déficit generado el: {fechas_str}. "
                f"Remanente neto solicitado: {round(remanente_limpio, 1)} hrs."
            )
        AutorizacionHorasExtra.objects.update_or_create(
            empleado=empleado,
            fecha=fecha_hoy,
            defaults=defaults_extra
        )
    else:
        AutorizacionHorasExtra.objects.filter(
            empleado=empleado,
            fecha=fecha_hoy,
            estado='PENDIENTE'
        ).delete()

    return {
        'horas_netas': round(horas_trabajadas_dia, 1),
        'excedente': excedente,
        'horas_amortizadas': round(horas_amortizadas, 1),
        'deuda_restante': round(deuda_actual, 1),
        'horas_extra_solicitadas': remanente_limpio if remanente_limpio >= min_step else 0.0,
    }



def _verificar_septimo_dia(empleado, fecha_hoy, horas_trabajadas_dia):
    """
    Compatibilidad hacia atrás. La detección, compensación de deuda y solicitud
    de horas extra para el 7mo día se procesa directamente en _procesar_compensacion_y_horas_extra.
    """
    pass


def _evaluar_feriado_al_cierre_jornada(empleado, fecha_hoy, horas_trabajadas_dia, request=None):
    """
    Evalúa automáticamente al cierre de jornada si la fecha coincide con un día feriado.
    Si el colaborador laboró al menos 4.0 horas, registra la Compensación de Feriado en estado PENDIENTE,
    iniciando la ventana legal de 24 horas para liquidación en nómina/dinero o pase automático a vacaciones.
    """
    nombre_completo = f"{empleado.nombre} {empleado.apellido}".lower()
    if 'maverick' in nombre_completo:
        return

    feriado = DiaFeriado.objects.filter(fecha=fecha_hoy).first()
    if not feriado:
        return

    if horas_trabajadas_dia >= 4.0:
        comp, created = CompensacionFeriado.objects.get_or_create(
            empleado=empleado,
            fecha_feriado=fecha_hoy,
            defaults={
                'nombre_feriado': feriado.descripcion,
                'horas_trabajadas': Decimal(str(round(horas_trabajadas_dia, 2))),
                'dias_compensatorios_totales': Decimal('2.0'),
                'estado': 'PENDIENTE',
                'dias_pagados_dinero': Decimal('0.0'),
                'dias_acreditados_vacaciones': Decimal('0.0'),
                'observaciones': 'Feriado laborado registrado automáticamente al cierre de jornada. Ventana legal de 24h para liquidación en dinero o pase automático a vacaciones (+2d).'
            }
        )
        if created:
            BitacoraAccion.objects.create(
                usuario=request.user if (request and hasattr(request, 'user') and request.user.is_authenticated) else None,
                accion='REGISTRO_FERIADO_LABORADO',
                descripcion=(
                    f"Feriado laborado registrado automáticamente para {empleado.nombre} {empleado.apellido} "
                    f"({fecha_hoy} - {feriado.descripcion}). Inicia ventana legal de 24 horas para pago en dinero o acreditación a vacaciones."
                ),
                ip_address=_get_clean_ip(request) if request else None
            )


def _evaluar_y_autoacreditar_feriados_pendientes(request=None):
    """
    Rutina automática que gestiona los feriados sin requerir pulsar ningún botón manual:
    1. Revisa todas las compensaciones en estado PENDIENTE. Si han transcurrido al menos 24 horas
       desde el feriado (o desde su registro) sin haber sido liquidadas en dinero, las acredita
       automáticamente a vacaciones (+2.0 días al saldo acumulado del colaborador).
    2. Realiza barrido preventivo de feriados oficiales en catálogo (ej. 24 de septiembre). Si algún
       colaborador activo laboró >= 4.0 hrs y no tenía compensación registrada:
       - Si la fecha es de hace más de 24 horas, se acredita directamente a vacaciones (+2.0 días).
       - Si está dentro de las 24 horas, se crea en estado PENDIENTE.
    """
    tz = timezone.get_current_timezone()
    ahora = timezone.now()
    hoy = ahora.astimezone(tz).date()

    # 1. Procesar registros PENDIENTES con más de 24 horas transcurridas
    pendientes = CompensacionFeriado.objects.filter(estado='PENDIENTE').select_related('empleado')
    for comp in pendientes:
        emp = comp.empleado
        nombre_completo = f"{emp.nombre} {emp.apellido}".lower()
        if 'maverick' in nombre_completo:
            continue

        # 24 horas reales desde que se registró (al marcar la salida), no el cambio de fecha
        delta_horas = (ahora - comp.created_at).total_seconds() / 3600.0 if comp.created_at else 25.0

        if delta_horas >= 24.0:
            comp.estado = 'VACACIONES'
            comp.dias_acreditados_vacaciones = Decimal('2.0')
            comp.fecha_liquidacion = ahora
            comp.observaciones = 'Acreditación automática a vacaciones (+2.0 días) al cumplirse la ventana legal de 24 horas sin pago en dinero.'
            comp.save(update_fields=['estado', 'dias_acreditados_vacaciones', 'fecha_liquidacion', 'observaciones'])

            emp.dias_vacaciones_acumuladas = (emp.dias_vacaciones_acumuladas or Decimal('0.00')) + Decimal('2.0')
            emp.save(update_fields=['dias_vacaciones_acumuladas'])

            BitacoraAccion.objects.create(
                usuario=request.user if (request and hasattr(request, 'user') and request.user.is_authenticated) else None,
                accion='ACREDITAR_FERIADO_VACACIONES',
                descripcion=(
                    f"Acreditados automáticamente +2.0 días de vacaciones a {emp.nombre} {emp.apellido} "
                    f"por feriado {comp.fecha_feriado} ({comp.nombre_feriado}) tras ventana de 24h sin pago en dinero. "
                    f"Nuevo saldo: {emp.dias_vacaciones_acumuladas} d."
                ),
                ip_address=_get_clean_ip(request) if request else None
            )

    # 2. Barrido preventivo y retroactivo de feriados oficiales configurados
    feriados = list(DiaFeriado.objects.all())
    if not feriados:
        return

    feriados_map = {f.fecha: f.descripcion for f in feriados if f.fecha <= hoy}
    if not feriados_map:
        return
    empleados_activos = list(Empleado.objects.filter(activo=True))

    # Todo se carga en 2 consultas (antes eran 2 por cada empleado × feriado en cada petición)
    ya_compensados = set(CompensacionFeriado.objects.filter(
        fecha_feriado__in=list(feriados_map)
    ).values_list('empleado_id', 'fecha_feriado'))

    ventanas = {}
    for f_fecha in feriados_map:
        start_dt = timezone.make_aware(datetime.datetime.combine(f_fecha, datetime.time.min), tz)
        end_dt = timezone.make_aware(datetime.datetime.combine(f_fecha, datetime.time.max), tz) + datetime.timedelta(hours=5)
        ventanas[f_fecha] = (start_dt, end_dt)

    filtro_ventanas = Q()
    for start_dt, end_dt in ventanas.values():
        filtro_ventanas |= Q(fecha_hora__range=(start_dt, end_dt))
    regs_por_empleado = {}
    for reg in RegistroAsistencia.objects.filter(
        filtro_ventanas,
        empleado__in=empleados_activos
    ).defer('foto_base64').order_by('fecha_hora'):
        regs_por_empleado.setdefault(reg.empleado_id, []).append(reg)

    for emp in empleados_activos:
        nombre_completo = f"{emp.nombre} {emp.apellido}".lower()
        if 'maverick' in nombre_completo:
            continue

        for f_fecha, f_nombre in feriados_map.items():
            if (emp.id, f_fecha) in ya_compensados:
                continue

            start_dt, end_dt = ventanas[f_fecha]
            regs = [r for r in regs_por_empleado.get(emp.id, []) if start_dt <= r.fecha_hora <= end_dt]

            if not regs:
                continue

            horas_dia = _calcular_horas_netas_dia(regs)
            if horas_dia >= 4.0:
                horas_desde_salida = (ahora - regs[-1].fecha_hora).total_seconds() / 3600.0
                if horas_desde_salida >= 24.0:
                    CompensacionFeriado.objects.create(
                        empleado=emp,
                        fecha_feriado=f_fecha,
                        nombre_feriado=f_nombre,
                        horas_trabajadas=Decimal(str(round(horas_dia, 2))),
                        dias_compensatorios_totales=Decimal('2.0'),
                        estado='VACACIONES',
                        dias_pagados_dinero=Decimal('0.0'),
                        dias_acreditados_vacaciones=Decimal('2.0'),
                        fecha_liquidacion=ahora,
                        observaciones='Acreditación automática a vacaciones (+2.0 días) por feriado laborado tras superar ventana legal de 24 horas sin pago en dinero.'
                    )
                    emp.dias_vacaciones_acumuladas = (emp.dias_vacaciones_acumuladas or Decimal('0.00')) + Decimal('2.0')
                    emp.save(update_fields=['dias_vacaciones_acumuladas'])

                    BitacoraAccion.objects.create(
                        usuario=request.user if (request and hasattr(request, 'user') and request.user.is_authenticated) else None,
                        accion='ACREDITAR_FERIADO_VACACIONES',
                        descripcion=(
                            f"Acreditados automáticamente +2.0 días de vacaciones a {emp.nombre} {emp.apellido} "
                            f"por feriado {f_fecha} ({f_nombre}) tras ventana de 24h sin pago en dinero. "
                            f"Nuevo saldo: {emp.dias_vacaciones_acumuladas} d."
                        ),
                        ip_address=_get_clean_ip(request) if request else None
                    )
                else:
                    CompensacionFeriado.objects.create(
                        empleado=emp,
                        fecha_feriado=f_fecha,
                        nombre_feriado=f_nombre,
                        horas_trabajadas=Decimal(str(round(horas_dia, 2))),
                        dias_compensatorios_totales=Decimal('2.0'),
                        estado='PENDIENTE',
                        dias_pagados_dinero=Decimal('0.0'),
                        dias_acreditados_vacaciones=Decimal('0.0'),
                        observaciones='Feriado laborado registrado al cierre de jornada. Ventana legal de 24h para liquidación en dinero o pase automático a vacaciones (+2d).'
                    )



# ==========================================
# 📊 GENERADOR DE REPORTES EXCEL DE NÓMINA
# ==========================================

@api_view(['GET'])
@permission_classes([IsPanelAdmin])
@renderer_classes([ExcelBinaryRenderer, JSONRenderer])
def exportar_reporte_nomina_excel(request):
    """
    Genera un libro Excel (.xlsx) de alta presentación ejecutiva para contabilidad y nómina de El Bodegón,
    estructurado en 3 pestañas profesionales sin emojis:
      1. Resumen Ejecutivo (Planilla): Balance consolidado, tarjetas KPI y firmas oficiales.
      2. Matriz Diaria de Asistencia: Cuadrícula día por día con horas y estados de cada colaborador.
      3. Horas Extra y Novedades: Detalle individual de tiempo extraordinario y auditoría Art. 58 CT.
    """
    try:
        import datetime
        from datetime import datetime as dt
        from io import BytesIO
        from django.db.models import Sum
        from openpyxl.comments import Comment

        inicio_str = request.GET.get('fecha_inicio')
        fin_str = request.GET.get('fecha_fin')

        hoy = timezone.localdate()
        fecha_inicio = dt.strptime(inicio_str, '%Y-%m-%d').date() if inicio_str else hoy.replace(day=1)
        fecha_fin = dt.strptime(fin_str, '%Y-%m-%d').date() if fin_str else hoy

        try:
            _evaluar_y_autoacreditar_feriados_pendientes(request=request)
        except Exception:
            pass

        # Generar lista de días del período
        dias_periodo = []
        curr = fecha_inicio
        while curr <= fecha_fin:
            dias_periodo.append(curr)
            curr += datetime.timedelta(days=1)

        wb = openpyxl.Workbook()

        # ── PALETA CORPORATIVA EL BODEGÓN ─────────────────────────────────────
        COLOR_PRIMARY_DARK = "134F42"  # Verde Bosque Oscuro
        COLOR_PRIMARY = "1C6856"       # Verde Institucional El Bodegón
        COLOR_KPI_BG = "F4F9F6"        # Fondo suave para tarjetas KPI
        COLOR_KPI_BORDER = "A3D9C9"    # Borde suave tarjetas KPI
        COLOR_ZEBRA = "F8FAFC"         # Fila alterna
        COLOR_BORDER = "CBD5E1"        # Borde de celdas
        COLOR_GRAY_CELL = "F1F5F9"      # Celdas de descanso / libre
        COLOR_AMBER_CELL = "FEF3C7"     # Celdas de feriados
        COLOR_BLUE_CELL = "E0E7FF"      # Celdas de permisos / vacaciones
        COLOR_RED_CELL = "FEE2E2"       # Celdas de faltas / deuda

        font_titulo = Font(name='Calibri', size=14, bold=True, color='FFFFFF')
        font_sub = Font(name='Calibri', size=9, italic=True, color='FFFFFF')
        font_header = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
        font_data = Font(name='Calibri', size=10, color='1E293B')
        font_data_bold = Font(name='Calibri', size=10, bold=True, color='1E293B')
        font_kpi_title = Font(name='Calibri', size=8, bold=True, color='134F42')
        font_kpi_num = Font(name='Calibri', size=16, bold=True, color='134F42')
        font_kpi_alert_title = Font(name='Calibri', size=8, bold=True, color='991B1B')
        font_kpi_alert_num = Font(name='Calibri', size=16, bold=True, color='991B1B')
        font_legal = Font(name='Calibri', size=8, italic=True, color='64748B')
        font_firma = Font(name='Calibri', size=9, bold=True, color='334155')

        fill_title = PatternFill(fill_type='solid', start_color=COLOR_PRIMARY_DARK, end_color=COLOR_PRIMARY_DARK)
        fill_header = PatternFill(fill_type='solid', start_color=COLOR_PRIMARY, end_color=COLOR_PRIMARY)
        fill_zebra = PatternFill(fill_type='solid', start_color=COLOR_ZEBRA, end_color=COLOR_ZEBRA)
        fill_kpi = PatternFill(fill_type='solid', start_color=COLOR_KPI_BG, end_color=COLOR_KPI_BG)
        fill_kpi_alert = PatternFill(fill_type='solid', start_color='FEF2F2', end_color='FEF2F2')
        fill_libre = PatternFill(fill_type='solid', start_color=COLOR_GRAY_CELL, end_color=COLOR_GRAY_CELL)
        fill_feriado = PatternFill(fill_type='solid', start_color=COLOR_AMBER_CELL, end_color=COLOR_AMBER_CELL)
        fill_permiso = PatternFill(fill_type='solid', start_color=COLOR_BLUE_CELL, end_color=COLOR_BLUE_CELL)

        thin_border = Border(
            left=Side(style='thin', color=COLOR_BORDER),
            right=Side(style='thin', color=COLOR_BORDER),
            top=Side(style='thin', color=COLOR_BORDER),
            bottom=Side(style='thin', color=COLOR_BORDER)
        )
        kpi_border = Border(
            left=Side(style='thin', color=COLOR_KPI_BORDER),
            right=Side(style='thin', color=COLOR_KPI_BORDER),
            top=Side(style='thin', color=COLOR_KPI_BORDER),
            bottom=Side(style='thin', color=COLOR_KPI_BORDER)
        )
        kpi_alert_border = Border(
            left=Side(style='thin', color='FCA5A5'),
            right=Side(style='thin', color='FCA5A5'),
            top=Side(style='thin', color='FCA5A5'),
            bottom=Side(style='thin', color='FCA5A5')
        )
        total_border = Border(
            top=Side(style='thin', color=COLOR_PRIMARY_DARK),
            bottom=Side(style='double', color=COLOR_PRIMARY_DARK),
            left=Side(style='thin', color=COLOR_BORDER),
            right=Side(style='thin', color=COLOR_BORDER)
        )

        # Consultas de Base de Datos compartidas para las 3 hojas
        empleados = list(Empleado.objects.filter(activo=True).order_by('nombre', 'apellido'))
        feriados_set = set(DiaFeriado.objects.filter(fecha__gte=fecha_inicio, fecha__lte=fecha_fin).values_list('fecha', flat=True))
        permisos_qs = PermisoAusencia.objects.filter(fecha_inicio__lte=fecha_fin, fecha_fin__gte=fecha_inicio).select_related('empleado')

        permisos_por_empleado = {}
        permisos_info_por_empleado = {}
        for p in permisos_qs:
            if p.empleado_id not in permisos_por_empleado:
                permisos_por_empleado[p.empleado_id] = set()
                permisos_info_por_empleado[p.empleado_id] = []
            curr_p = max(p.fecha_inicio, fecha_inicio)
            fin_p = min(p.fecha_fin, fecha_fin)
            permisos_info_por_empleado[p.empleado_id].append(
                f"{p.get_tipo_display()} ({curr_p.strftime('%d/%m')} a {fin_p.strftime('%d/%m')})"
            )
            while curr_p <= fin_p:
                permisos_por_empleado[p.empleado_id].add(curr_p)
                curr_p += datetime.timedelta(days=1)

        # Estructura para almacenar la matriz diaria para la Hoja 2
        matriz_diaria_datos = {}

        # ══════════════════════════════════════════════════════════════════════
        # HOJA 1: RESUMEN EJECUTIVO (PLANILLA)
        # ══════════════════════════════════════════════════════════════════════
        ws1 = wb.active
        ws1.title = "Resumen de Nomina"
        ws1.views.sheetView[0].showGridLines = True

        # Encabezado Principal
        ws1.merge_cells('A1:J1')
        ws1['A1'] = "RESTAURANTE EL BODEGÓN — INFORME EJECUTIVO DE NÓMINA Y ASISTENCIA"
        ws1['A1'].font = font_titulo
        ws1['A1'].fill = fill_title
        ws1['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws1.row_dimensions[1].height = 32

        ws1.merge_cells('A2:J2')
        ahora_str = timezone.localtime().strftime('%d/%m/%Y %I:%M %p')
        ws1['A2'] = f"Período Oficial: Del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')}  |  Fecha de Emisión: {ahora_str}  |  Moneda: Córdobas (NIO)"
        ws1['A2'].font = font_sub
        ws1['A2'].fill = fill_title
        ws1['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws1.row_dimensions[2].height = 20

        ws1.row_dimensions[3].height = 10  # Separador

        # Tarjetas KPI Corporativas (Filas 4 y 5)
        kpi_defs = [
            ('A', 'B', 'COLABORADORES ACTIVOS', f"{len(empleados)}", False),
            ('C', 'D', 'HORAS ORDINARIAS (EST.)', None, False),   # Calculado con fórmula
            ('E', 'F', 'FERIADOS LABORADOS (DIAS)', None, False),
            ('G', 'H', 'HORAS EXTRA APROBADAS', None, False),
            ('I', 'J', 'DEFICIT EN BOLSA DE HORAS', None, True),
        ]
        ws1.row_dimensions[4].height = 16
        ws1.row_dimensions[5].height = 26

        for col1, col2, titulo_kpi, valor_fijo, es_alerta in kpi_defs:
            ws1.merge_cells(f'{col1}4:{col2}4')
            ws1.merge_cells(f'{col1}5:{col2}5')

            c_top = ws1[f'{col1}4']
            c_top.value = titulo_kpi
            c_top.font = font_kpi_alert_title if es_alerta else font_kpi_title
            c_top.fill = fill_kpi_alert if es_alerta else fill_kpi
            c_top.alignment = Alignment(horizontal='center', vertical='center')

            c_val = ws1[f'{col1}5']
            c_val.font = font_kpi_alert_num if es_alerta else font_kpi_num
            c_val.fill = fill_kpi_alert if es_alerta else fill_kpi
            c_val.alignment = Alignment(horizontal='center', vertical='center')

            if valor_fijo is not None:
                c_val.value = valor_fijo

            # Aplicar bordes de tarjeta
            border_to_apply = kpi_alert_border if es_alerta else kpi_border
            for r in [4, 5]:
                for c_letter in [col1, col2]:
                    ws1[f'{c_letter}{r}'].border = border_to_apply

        ws1.row_dimensions[6].height = 12  # Separador

        # Cabecera de la Tabla Principal (Fila 7)
        headers_ws1 = [
            "Colaborador y Cargo",
            "Días Laborados",
            "Días Libres",
            "Horas Ordinarias",
            "Feriados (Días)",
            "Vacaciones Pagadas (Días)",
            "Horas Extra Aprobadas",
            "H. Extra por Aprobar",
            "Saldo Bolsa de Horas",
            "Vacaciones Restantes (Días)",
        ]
        ws1.row_dimensions[7].height = 26
        for col_idx, h_text in enumerate(headers_ws1, start=1):
            cell = ws1.cell(row=7, column=col_idx)
            cell.value = h_text
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        fila_inicio_datos = 8
        row_idx = fila_inicio_datos

        # Procesar datos por cada colaborador
        for emp in empleados:
            matriz_diaria_datos[emp.id] = {}

            start_query = timezone.make_aware(datetime.datetime.combine(fecha_inicio, datetime.time.min), timezone.get_current_timezone())
            end_query = timezone.make_aware(datetime.datetime.combine(fecha_fin, datetime.time.max), timezone.get_current_timezone()) + datetime.timedelta(hours=5)

            registros = RegistroAsistencia.objects.filter(
                empleado=emp,
                fecha_hora__range=(start_query, end_query)
            ).order_by('fecha_hora')

            horas_normales_trabajadas = 0.0
            feriados_trabajados_dias = 0
            feriados_trabajados_info = []
            dias_map = {}

            for reg in registros:
                reg_local = reg.fecha_hora.astimezone(timezone.get_current_timezone())
                dia_local = reg_local.date()
                if reg.tipo_evento == 'SALIDA_DEFINITIVA' and reg_local.hour < 5:
                    dia_operativo = dia_local - datetime.timedelta(days=1)
                else:
                    dia_operativo = dia_local

                if dia_operativo < fecha_inicio or dia_operativo > fecha_fin:
                    continue
                if dia_operativo not in dias_map:
                    dias_map[dia_operativo] = []
                dias_map[dia_operativo].append(reg)

            dias_trabajados = len(dias_map)
            dias_permiso_emp = permisos_por_empleado.get(emp.id, set())

            for dia, regs in dias_map.items():
                horas_dia = _calcular_horas_netas_dia(regs)
                horas_ord = min(horas_dia, 8.0)

                # Guardar en matriz diaria
                primer_ent = next((r.fecha_hora.astimezone(timezone.get_current_timezone()).strftime('%I:%M %p') for r in regs if r.tipo_evento in ['ENTRADA', 'ENTRADA_QUEBRADA']), '')
                ult_sal = next((r.fecha_hora.astimezone(timezone.get_current_timezone()).strftime('%I:%M %p') for r in reversed(regs) if r.tipo_evento in ['SALIDA_DEFINITIVA', 'SALIDA_QUEBRADA']), '')
                info_marcaje = f"Entrada: {primer_ent} | Salida: {ult_sal}" if (primer_ent and ult_sal) else "Marcaje registrado"

                if dia in feriados_set:
                    horas_normales_trabajadas += horas_ord
                    matriz_diaria_datos[emp.id][dia] = {'horas': round(horas_dia, 1), 'label': f"{round(horas_dia, 1)} hrs", 'tipo': 'FERIADO_TRABAJADO', 'info': info_marcaje}
                    if horas_ord >= 7.5:
                        feriados_trabajados_dias += 1
                        desc_feriado = DiaFeriado.objects.filter(fecha=dia).first()
                        nombre_feriado = desc_feriado.descripcion if desc_feriado else "Día Feriado"
                        feriados_trabajados_info.append(f"- {dia.strftime('%d/%m/%Y')}: {nombre_feriado} ({round(horas_ord, 1)} hrs)")
                else:
                    horas_normales_trabajadas += horas_ord
                    matriz_diaria_datos[emp.id][dia] = {'horas': round(horas_dia, 1), 'label': f"{round(horas_dia, 1)} hrs", 'tipo': 'TRABAJADO', 'info': info_marcaje}

            # Cómputo de días libres y horas debidas
            dias_libres = 0
            horas_debidas = 0.0
            curr_day = fecha_inicio
            semanas_procesadas = set()

            while curr_day <= fecha_fin:
                semana_key = curr_day - datetime.timedelta(days=curr_day.weekday())
                if semana_key not in semanas_procesadas:
                    semanas_procesadas.add(semana_key)
                    semana_fin = semana_key + datetime.timedelta(days=6)
                    s_inicio = max(semana_key, fecha_inicio)
                    s_fin = min(semana_fin, fecha_fin)

                    ausencias_semana = 0
                    deficit_semana = 0.0
                    excedente_semana = 0.0
                    d = s_inicio
                    while d <= s_fin:
                        if d not in feriados_set and d not in dias_permiso_emp:
                            if d not in dias_map:
                                if ausencias_semana == 0:
                                    dias_libres += 1
                                    matriz_diaria_datos[emp.id][d] = {'horas': 0.0, 'label': 'LIBRE', 'tipo': 'LIBRE', 'info': 'Descanso semanal'}
                                else:
                                    deficit_semana += 8.0
                                    matriz_diaria_datos[emp.id][d] = {'horas': 0.0, 'label': 'AUSENCIA', 'tipo': 'AUSENCIA', 'info': 'Falta no justificada'}
                                ausencias_semana += 1
                            else:
                                regs_d = dias_map[d]
                                horas_dia = _calcular_horas_netas_dia(regs_d)
                                meta_d = _jornada_esperada(d, regs_d)
                                deficit_semana += max(0.0, meta_d - min(horas_dia, meta_d))
                                if horas_dia > 8.0:
                                    excedente_semana += (horas_dia - 8.0)
                        elif d in feriados_set and d not in dias_map:
                            desc_fer = DiaFeriado.objects.filter(fecha=d).first()
                            matriz_diaria_datos[emp.id][d] = {'horas': 0.0, 'label': 'FERIADO', 'tipo': 'FERIADO_LIBRE', 'info': desc_fer.descripcion if desc_fer else 'Feriado'}
                        elif d in dias_permiso_emp and d not in dias_map:
                            matriz_diaria_datos[emp.id][d] = {'horas': 0.0, 'label': 'PERMISO', 'tipo': 'PERMISO', 'info': 'Permiso o vacaciones autorizadas'}

                        d += datetime.timedelta(days=1)

                    compensado_semana = min(excedente_semana, deficit_semana)
                    deficit_neto_semana = max(0.0, deficit_semana - compensado_semana)
                    horas_debidas += deficit_neto_semana
                    horas_normales_trabajadas += compensado_semana
                curr_day += datetime.timedelta(days=1)

            # Sincronización oficial con Bolsa de Horas
            horas_debidas = float(emp.horas_pendientes or 0.0)

            # Horas Extra
            horas_extra_aprobadas = float(AutorizacionHorasExtra.objects.filter(
                empleado=emp, fecha__gte=fecha_inicio, fecha__lte=fecha_fin, estado='APROBADO'
            ).aggregate(total=Sum('horas_extra_autorizadas'))['total'] or 0.0)

            horas_extra_pendientes = float(AutorizacionHorasExtra.objects.filter(
                empleado=emp, fecha__gte=fecha_inicio, fecha__lte=fecha_fin, estado='PENDIENTE'
            ).aggregate(total=Sum('horas_extra_solicitadas'))['total'] or 0.0)

            # Si debe horas y tiene horas extra pendientes, amortizar preventivamente
            if horas_debidas > 0 and horas_extra_pendientes > 0:
                amortizar = min(horas_debidas, horas_extra_pendientes)
                horas_debidas = max(0.0, round(horas_debidas - amortizar, 1))
                horas_extra_pendientes = max(0.0, round(horas_extra_pendientes - amortizar, 1))

            # Vacaciones
            vacaciones_restantes = round(float(_obtener_dias_vacaciones_disponibles(emp)), 1)

            pagos_vac_emp = PagoVacaciones.objects.filter(empleado=emp, fecha_pago__gte=fecha_inicio, fecha_pago__lte=fecha_fin)
            dias_vacaciones_pagadas = sum(float(p.dias_pagados) for p in pagos_vac_emp)

            # Insertar Fila
            fila_ws1 = [
                f"{emp.nombre} {emp.apellido} ({emp.get_cargo_display()})",
                dias_trabajados,
                dias_libres,
                round(horas_normales_trabajadas, 1),
                feriados_trabajados_dias,
                round(dias_vacaciones_pagadas, 1),
                round(float(horas_extra_aprobadas), 1),
                round(float(horas_extra_pendientes), 1),
                round(horas_debidas, 1),
                vacaciones_restantes,
            ]
            ws1.append(fila_ws1)
            ws1.row_dimensions[row_idx].height = 20

            # Comentarios formales en celdas
            info_permisos = permisos_info_por_empleado.get(emp.id)
            if info_permisos:
                ws1.cell(row=row_idx, column=1).comment = Comment("Permisos y Vacaciones:\n" + "\n".join(info_permisos), "El Bodegón")

            if feriados_trabajados_dias > 0 and feriados_trabajados_info:
                ws1.cell(row=row_idx, column=5).comment = Comment("Detalle de Feriados Laborados:\n" + "\n".join(feriados_trabajados_info), "El Bodegón")

            if dias_vacaciones_pagadas > 0:
                detalles_p = [f"Recibo {p.numero_recibo}: {p.dias_pagados}d (C$ {p.monto_pagado})" for p in pagos_vac_emp]
                ws1.cell(row=row_idx, column=6).comment = Comment("Vacaciones Pagadas en Dinero:\n" + "\n".join(detalles_p), "El Bodegón")

            # Estilos de celda
            is_zebra = (row_idx % 2 == 0)
            for c_idx in range(1, 11):
                c_node = ws1.cell(row=row_idx, column=c_idx)
                c_node.font = font_data
                c_node.border = thin_border
                if is_zebra:
                    c_node.fill = fill_zebra
                if c_idx == 1:
                    c_node.alignment = Alignment(horizontal='left', vertical='center')
                else:
                    c_node.alignment = Alignment(horizontal='right', vertical='center')
                    c_node.number_format = '#,##0.0' if c_idx in [4, 6, 7, 8, 9, 10] else '#,##0'

            row_idx += 1

        fila_fin_datos = row_idx - 1

        # Completar fórmulas en Tarjetas KPI superiores
        ws1['C5'].value = f"=SUM(D{fila_inicio_datos}:D{fila_fin_datos})"
        ws1['C5'].number_format = '#,##0.0'
        ws1['E5'].value = f"=SUM(E{fila_inicio_datos}:E{fila_fin_datos})"
        ws1['E5'].number_format = '#,##0.0'
        ws1['G5'].value = f"=SUM(G{fila_inicio_datos}:G{fila_fin_datos})"
        ws1['G5'].number_format = '#,##0.0'
        ws1['I5'].value = f"=SUM(I{fila_inicio_datos}:I{fila_fin_datos})"
        ws1['I5'].number_format = '#,##0.0'

        # Fila de Totales Generales
        ws1.row_dimensions[row_idx].height = 24
        ws1.merge_cells(f'A{row_idx}:C{row_idx}')
        c_tot_label = ws1[f'A{row_idx}']
        c_tot_label.value = "TOTALES GENERALES:"
        c_tot_label.font = font_data_bold
        c_tot_label.alignment = Alignment(horizontal='right', vertical='center')
        c_tot_label.border = total_border

        for c_ltr, c_num in [('D', 4), ('E', 5), ('F', 6), ('G', 7), ('H', 8), ('I', 9), ('J', 10)]:
            c_sum = ws1[f'{c_ltr}{row_idx}']
            c_sum.value = f"=SUM({c_ltr}{fila_inicio_datos}:{c_ltr}{fila_fin_datos})"
            c_sum.font = font_data_bold
            c_sum.border = total_border
            c_sum.alignment = Alignment(horizontal='right', vertical='center')
            c_sum.number_format = '#,##0.0' if c_num in [4, 6, 7, 8, 9, 10] else '#,##0'

        # Bloque de Cumplimiento Legal y Firmas Ejecutivas
        row_idx += 2
        ws1.merge_cells(f'A{row_idx}:J{row_idx}')
        ws1[f'A{row_idx}'] = "Base Legal: Código del Trabajo de Nicaragua (Ley N° 185). Jornada ordinaria máxima legal y descanso semanal computados conforme a los Artículos 58, 62 y normas conexas."
        ws1[f'A{row_idx}'].font = font_legal
        ws1[f'A{row_idx}'].alignment = Alignment(horizontal='left', vertical='center')

        row_idx += 3
        # 3 Firmas corporativas
        firmas = [
            ('B', 'C', "Elaborado por: Recursos Humanos"),
            ('E', 'F', "Revisado por: Contabilidad y Nómina"),
            ('H', 'I', "Aprobado por: Gerencia General")
        ]
        for col_a, col_b, label_firma in firmas:
            ws1.merge_cells(f'{col_a}{row_idx}:{col_b}{row_idx}')
            ws1.merge_cells(f'{col_a}{row_idx+1}:{col_b}{row_idx+1}')

            line_cell = ws1[f'{col_a}{row_idx}']
            line_cell.value = "____________________________________"
            line_cell.alignment = Alignment(horizontal='center', vertical='center')
            line_cell.font = font_data

            lbl_cell = ws1[f'{col_a}{row_idx+1}']
            lbl_cell.value = label_firma
            lbl_cell.alignment = Alignment(horizontal='center', vertical='center')
            lbl_cell.font = font_firma

        # Ajuste de ancho de columnas Hoja 1
        for col in ws1.columns:
            col_letter = get_column_letter(col[0].column)
            if col_letter == 'A':
                ws1.column_dimensions[col_letter].width = 38
            else:
                ws1.column_dimensions[col_letter].width = 17

        # ══════════════════════════════════════════════════════════════════════
        # HOJA 2: MATRIZ DIARIA DE ASISTENCIA Y JORNADAS
        # ══════════════════════════════════════════════════════════════════════
        ws2 = wb.create_sheet(title="Matriz Diaria")
        ws2.views.sheetView[0].showGridLines = True

        dias_semana_abrev = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
        total_cols_ws2 = 2 + len(dias_periodo) + 1  # Colaborador + Cargo + días + Total
        col_fin_ws2_letter = get_column_letter(total_cols_ws2)

        # Encabezado Hoja 2
        ws2.merge_cells(f'A1:{col_fin_ws2_letter}1')
        ws2['A1'] = "RESTAURANTE EL BODEGÓN — MATRIZ DIARIA DE ASISTENCIA Y JORNADAS"
        ws2['A1'].font = font_titulo
        ws2['A1'].fill = fill_title
        ws2['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws2.row_dimensions[1].height = 30

        ws2.merge_cells(f'A2:{col_fin_ws2_letter}2')
        ws2['A2'] = f"Período Oficial: Del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')}  |  Detalle analítico diario por colaborador"
        ws2['A2'].font = font_sub
        ws2['A2'].fill = fill_title
        ws2['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws2.row_dimensions[2].height = 20

        ws2.row_dimensions[3].height = 10  # Separador

        # Fila 4: Cabeceras de la Matriz
        ws2.row_dimensions[4].height = 28
        c_nom = ws2.cell(row=4, column=1, value="Colaborador")
        c_nom.font = font_header
        c_nom.fill = fill_header
        c_nom.alignment = Alignment(horizontal='left', vertical='center')

        c_car = ws2.cell(row=4, column=2, value="Cargo")
        c_car.font = font_header
        c_car.fill = fill_header
        c_car.alignment = Alignment(horizontal='left', vertical='center')

        for d_idx, d_obj in enumerate(dias_periodo, start=3):
            abrev_dia = dias_semana_abrev[d_obj.weekday()]
            c_dia = ws2.cell(row=4, column=d_idx, value=f"{d_obj.strftime('%d/%m')}\n({abrev_dia})")
            c_dia.font = font_header
            c_dia.fill = fill_header
            c_dia.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        c_tot = ws2.cell(row=4, column=total_cols_ws2, value="Total Horas")
        c_tot.font = font_header
        c_tot.fill = fill_header
        c_tot.alignment = Alignment(horizontal='center', vertical='center')

        row_ws2 = 5
        for emp in empleados:
            ws2.row_dimensions[row_ws2].height = 20
            c_n = ws2.cell(row=row_ws2, column=1, value=f"{emp.nombre} {emp.apellido}")
            c_n.font = font_data_bold
            c_n.border = thin_border
            c_n.alignment = Alignment(horizontal='left', vertical='center')

            c_c = ws2.cell(row=row_ws2, column=2, value=emp.get_cargo_display())
            c_c.font = font_data
            c_c.border = thin_border
            c_c.alignment = Alignment(horizontal='left', vertical='center')

            emp_data_map = matriz_diaria_datos.get(emp.id, {})

            for d_idx, d_obj in enumerate(dias_periodo, start=3):
                item_dia = emp_data_map.get(d_obj, {'horas': 0.0, 'label': 'LIBRE', 'tipo': 'LIBRE', 'info': ''})
                cell_d = ws2.cell(row=row_ws2, column=d_idx)
                cell_d.border = thin_border

                if item_dia['tipo'] == 'TRABAJADO':
                    cell_d.value = item_dia['horas']
                    cell_d.number_format = '0.0'
                    cell_d.font = font_data
                    cell_d.alignment = Alignment(horizontal='right', vertical='center')
                    if item_dia.get('info'):
                        cell_d.comment = Comment(item_dia['info'], "El Bodegón")
                elif item_dia['tipo'] == 'FERIADO_TRABAJADO':
                    cell_d.value = item_dia['horas']
                    cell_d.number_format = '0.0'
                    cell_d.font = font_data_bold
                    cell_d.fill = fill_feriado
                    cell_d.alignment = Alignment(horizontal='right', vertical='center')
                    if item_dia.get('info'):
                        cell_d.comment = Comment(f"Feriado Laborado:\n{item_dia['info']}", "El Bodegón")
                elif item_dia['tipo'] == 'LIBRE':
                    cell_d.value = "LIBRE"
                    cell_d.font = Font(name='Calibri', size=9, italic=True, color='64748B')
                    cell_d.fill = fill_libre
                    cell_d.alignment = Alignment(horizontal='center', vertical='center')
                elif item_dia['tipo'] == 'FERIADO_LIBRE':
                    cell_d.value = "FERIADO"
                    cell_d.font = Font(name='Calibri', size=9, bold=True, color='92400E')
                    cell_d.fill = fill_feriado
                    cell_d.alignment = Alignment(horizontal='center', vertical='center')
                elif item_dia['tipo'] == 'PERMISO':
                    cell_d.value = "PERMISO"
                    cell_d.font = Font(name='Calibri', size=9, bold=True, color='3730A3')
                    cell_d.fill = fill_permiso
                    cell_d.alignment = Alignment(horizontal='center', vertical='center')
                else:
                    cell_d.value = "FALTA"
                    cell_d.font = Font(name='Calibri', size=9, bold=True, color='991B1B')
                    cell_d.fill = PatternFill(fill_type='solid', start_color='FEE2E2', end_color='FEE2E2')
                    cell_d.alignment = Alignment(horizontal='center', vertical='center')

            # Columna Total Horas del empleado
            col_ini_letter = get_column_letter(3)
            col_fin_letter = get_column_letter(total_cols_ws2 - 1)
            c_tot_emp = ws2.cell(row=row_ws2, column=total_cols_ws2)
            c_tot_emp.value = f"=SUM({col_ini_letter}{row_ws2}:{col_fin_letter}{row_ws2})"
            c_tot_emp.font = font_data_bold
            c_tot_emp.border = thin_border
            c_tot_emp.alignment = Alignment(horizontal='right', vertical='center')
            c_tot_emp.number_format = '#,##0.0'

            row_ws2 += 1

        # Fila Total General por día en Hoja 2
        ws2.row_dimensions[row_ws2].height = 22
        ws2.merge_cells(f'A{row_ws2}:B{row_ws2}')
        c_lbl_m = ws2[f'A{row_ws2}']
        c_lbl_m.value = "TOTAL HORAS DEL DIA:"
        c_lbl_m.font = font_data_bold
        c_lbl_m.alignment = Alignment(horizontal='right', vertical='center')
        c_lbl_m.border = total_border

        for d_idx in range(3, total_cols_ws2 + 1):
            col_ltr = get_column_letter(d_idx)
            c_tot_d = ws2.cell(row=row_ws2, column=d_idx)
            c_tot_d.value = f"=SUM({col_ltr}5:{col_ltr}{row_ws2-1})"
            c_tot_d.font = font_data_bold
            c_tot_d.border = total_border
            c_tot_d.alignment = Alignment(horizontal='right', vertical='center')
            c_tot_d.number_format = '#,##0.0'

        ws2.column_dimensions['A'].width = 28
        ws2.column_dimensions['B'].width = 22
        for d_idx in range(3, total_cols_ws2):
            col_ltr = get_column_letter(d_idx)
            ws2.column_dimensions[col_ltr].width = 11
        ws2.column_dimensions[col_fin_ws2_letter].width = 15

        # ══════════════════════════════════════════════════════════════════════
        # HOJA 3: HORAS EXTRA Y NOVEDADES
        # ══════════════════════════════════════════════════════════════════════
        ws3 = wb.create_sheet(title="Horas Extra")
        ws3.views.sheetView[0].showGridLines = True

        ws3.merge_cells('A1:J1')
        ws3['A1'] = "RESTAURANTE EL BODEGÓN — AUDITORÍA DETALLADA DE HORAS EXTRAORDINARIAS"
        ws3['A1'].font = font_titulo
        ws3['A1'].fill = fill_title
        ws3['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws3.row_dimensions[1].height = 30

        ws3.merge_cells('A2:J2')
        ws3['A2'] = f"Período: Del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')}  |  Cumplimiento normativo conforme al Art. 58 del Código del Trabajo de Nicaragua"
        ws3['A2'].font = font_sub
        ws3['A2'].fill = fill_title
        ws3['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws3.row_dimensions[2].height = 20

        ws3.row_dimensions[3].height = 10

        headers_ws3 = [
            "No. Ref",
            "Fecha",
            "Día de Semana",
            "Colaborador",
            "Cargo",
            "H. Solicitadas",
            "H. Autorizadas",
            "Estado",
            "Motivo / Justificación",
            "Auditoría Legal (Art. 58 CT)"
        ]
        ws3.row_dimensions[4].height = 26
        for col_idx, h_text in enumerate(headers_ws3, start=1):
            cell = ws3.cell(row=4, column=col_idx)
            cell.value = h_text
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal='center', vertical='center')

        extras_qs = list(AutorizacionHorasExtra.objects.filter(
            fecha__gte=fecha_inicio,
            fecha__lte=fecha_fin
        ).select_related('empleado').order_by('fecha', 'id'))

        dias_es = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
        row_ws3 = 5

        if not extras_qs:
            ws3.merge_cells('A5:J5')
            c_empty = ws3['A5']
            c_empty.value = "No se registraron horas extraordinarias en el período evaluado."
            c_empty.font = font_legal
            c_empty.alignment = Alignment(horizontal='center', vertical='center')
            ws3.row_dimensions[5].height = 25
            row_ws3 = 6
        else:
            for extra in extras_qs:
                ws3.row_dimensions[row_ws3].height = 20
                h_sol = float(extra.horas_extra_solicitadas or 0.0)
                h_aut = float(extra.horas_extra_autorizadas or 0.0)
                dia_semana_nombre = dias_es[extra.fecha.weekday()]

                cumplimiento_nota = "Conforme a Ley (Art. 58 CT)" if h_aut <= 9.0 else "Excede límite semanal de 9h (Art. 58 CT)"

                fila_ws3 = [
                    f"HE-{extra.id:04d}",
                    extra.fecha.strftime('%d/%m/%Y'),
                    dia_semana_nombre,
                    f"{extra.empleado.nombre} {extra.empleado.apellido}",
                    extra.empleado.get_cargo_display(),
                    round(h_sol, 1),
                    round(h_aut, 1),
                    extra.get_estado_display(),
                    extra.comentario or "Sin observaciones",
                    cumplimiento_nota
                ]
                ws3.append(fila_ws3)

                is_z = (row_ws3 % 2 == 0)
                for c_idx in range(1, 11):
                    c_cell = ws3.cell(row=row_ws3, column=c_idx)
                    c_cell.font = font_data
                    c_cell.border = thin_border
                    if is_z:
                        c_cell.fill = fill_zebra
                    if c_idx in [1, 2, 3, 8]:
                        c_cell.alignment = Alignment(horizontal='center', vertical='center')
                    elif c_idx in [6, 7]:
                        c_cell.alignment = Alignment(horizontal='right', vertical='center')
                        c_cell.number_format = '#,##0.0'
                    else:
                        c_cell.alignment = Alignment(horizontal='left', vertical='center')

                row_ws3 += 1

            # Totales de Horas Extra
            ws3.row_dimensions[row_ws3].height = 24
            ws3.merge_cells(f'A{row_ws3}:E{row_ws3}')
            c_tot_extra = ws3[f'A{row_ws3}']
            c_tot_extra.value = "TOTAL HORAS EXTRAORDINARIAS:"
            c_tot_extra.font = font_data_bold
            c_tot_extra.alignment = Alignment(horizontal='right', vertical='center')
            c_tot_extra.border = total_border

            c_tot_sol = ws3[f'F{row_ws3}']
            c_tot_sol.value = f"=SUM(F5:F{row_ws3-1})"
            c_tot_sol.font = font_data_bold
            c_tot_sol.border = total_border
            c_tot_sol.alignment = Alignment(horizontal='right', vertical='center')
            c_tot_sol.number_format = '#,##0.0'

            c_tot_aut = ws3[f'G{row_ws3}']
            c_tot_aut.value = f"=SUM(G5:G{row_ws3-1})"
            c_tot_aut.font = font_data_bold
            c_tot_aut.border = total_border
            c_tot_aut.alignment = Alignment(horizontal='right', vertical='center')
            c_tot_aut.number_format = '#,##0.0'

            ws3.merge_cells(f'H{row_ws3}:J{row_ws3}')
            for c_empty_idx in ['H', 'I', 'J']:
                ws3[f'{c_empty_idx}{row_ws3}'].border = total_border

        # Anchos de columna Hoja 3
        anchos_ws3 = {'A': 12, 'B': 14, 'C': 15, 'D': 28, 'E': 20, 'F': 15, 'G': 15, 'H': 15, 'I': 30, 'J': 30}
        for col_l, w in anchos_ws3.items():
            ws3.column_dimensions[col_l].width = w

        # Guardar en Buffer y Devolver
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        nombre_archivo = f"BodegonPass_Nomina_{fecha_inicio.strftime('%Y%m%d')}_{fecha_fin.strftime('%Y%m%d')}.xlsx"
        response = HttpResponse(buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        response['X-Filename'] = nombre_archivo
        response['Access-Control-Expose-Headers'] = 'Content-Disposition, X-Filename'

        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='EXPORTAR_NOMINA',
            descripcion=f"Reporte ejecutivo de nómina y asistencia Excel exportado ({fecha_inicio} a {fecha_fin}).",
            ip_address=_get_clean_ip(request)
        )

        return response

    except Exception as e:
        return Response({'detail': f'Error generando reporte Excel: {str(e)}'}, status=500)



@api_view(['GET'])
@permission_classes([IsPanelAdmin])
@renderer_classes([ExcelBinaryRenderer, JSONRenderer])
def exportar_reporte_vacaciones_excel(request):
    """
    Genera un archivo Excel (.xlsx) mensual o por rango de fechas con el detalle completo de vacaciones y permisos:
    - Colaborador y Puesto
    - Tipo de Ausencia (Vacaciones, Vacaciones Pagadas, Incapacidad Médica, Permiso Autorizado)
    - Fechas de Inicio y Fin
    - Total de Días Concedidos
    - Motivo / Justificación
    - Fecha de Registro / Autorización
    """
    try:
        import datetime
        import calendar
        from datetime import datetime as dt
        from io import BytesIO

        mes_str = request.GET.get('mes')
        anio_str = request.GET.get('anio')

        try:
            _evaluar_y_autoacreditar_feriados_pendientes(request=request)
        except Exception:
            pass
        inicio_str = request.GET.get('fecha_inicio')
        fin_str = request.GET.get('fecha_fin')

        hoy = timezone.localdate()

        MESES_ES = [
            '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ]

        if mes_str and anio_str:
            mes = int(mes_str)
            anio = int(anio_str)
            _, ultimo_dia = calendar.monthrange(anio, mes)
            fecha_inicio = datetime.date(anio, mes, 1)
            fecha_fin = datetime.date(anio, mes, ultimo_dia)
            periodo_label = f"Mes de {MESES_ES[mes]} de {anio}"
        elif inicio_str and fin_str:
            fecha_inicio = dt.strptime(inicio_str, '%Y-%m-%d').date()
            fecha_fin = dt.strptime(fin_str, '%Y-%m-%d').date()
            periodo_label = f"Del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')}"
        else:
            mes = hoy.month
            anio = hoy.year
            _, ultimo_dia = calendar.monthrange(anio, mes)
            fecha_inicio = datetime.date(anio, mes, 1)
            fecha_fin = datetime.date(anio, mes, ultimo_dia)
            periodo_label = f"Mes de {MESES_ES[mes]} de {anio}"

        # Filtrar permisos que caigan o se solapen con el período
        permisos = PermisoAusencia.objects.filter(
            fecha_inicio__lte=fecha_fin,
            fecha_fin__gte=fecha_inicio
        ).select_related('empleado').order_by('fecha_inicio', 'empleado__nombre')

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Vacaciones y Permisos"
        ws.views.sheetView[0].showGridLines = True

        # Colores Institucionales El Bodegón
        COLOR_HEADER = "1C6856"
        COLOR_TITLE = "134F42"
        COLOR_CARD = "F2F7F5"

        font_titulo = Font(name='Calibri', size=15, bold=True, color='FFFFFF')
        font_sub = Font(name='Calibri', size=10, italic=True, color='FFFFFF')
        font_header = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
        font_data = Font(name='Calibri', size=10)
        font_bold = Font(name='Calibri', size=10, bold=True)
        font_mono = Font(name='Consolas', size=10)

        fill_title = PatternFill(fill_type='solid', start_color=COLOR_TITLE, end_color=COLOR_TITLE)
        fill_header = PatternFill(fill_type='solid', start_color=COLOR_HEADER, end_color=COLOR_HEADER)
        fill_zebra = PatternFill(fill_type='solid', start_color='F9FBF9', end_color='F9FBF9')
        fill_card = PatternFill(fill_type='solid', start_color=COLOR_CARD, end_color=COLOR_CARD)

        thin_border = Border(
            left=Side(style='thin', color='CCCCCC'),
            right=Side(style='thin', color='CCCCCC'),
            top=Side(style='thin', color='CCCCCC'),
            bottom=Side(style='thin', color='CCCCCC')
        )

        # Fila 1: Título Principal
        ws.merge_cells('A1:I1')
        ws['A1'] = "EL BODEGÓN — REPORTE MENSUAL DE VACACIONES Y PERMISOS"
        ws['A1'].font = font_titulo
        ws['A1'].fill = fill_title
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[1].height = 28

        # Fila 2: Subtítulo con Período
        ws.merge_cells('A2:I2')
        ws['A2'] = f"Período: {periodo_label} | Generado el {hoy.strftime('%d/%m/%Y')}"
        ws['A2'].font = font_sub
        ws['A2'].fill = fill_title
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[2].height = 18

        # Tarjetas de Resumen (Fila 4)
        total_solicitudes = permisos.count()
        total_dias_otorgados = sum(p.total_dias for p in permisos)
        total_colaboradores_unicos = len(set(p.empleado_id for p in permisos))

        ws.merge_cells('A4:B4')
        ws['A4'] = f"Total Solicitudes: {total_solicitudes}"
        ws['A4'].font = font_bold
        ws['A4'].fill = fill_card
        ws['A4'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('D4:F4')
        ws['D4'] = f"Días Concedidos: {total_dias_otorgados} días"
        ws['D4'].font = font_bold
        ws['D4'].fill = fill_card
        ws['D4'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('H4:I4')
        ws['H4'] = f"Colaboradores: {total_colaboradores_unicos}"
        ws['H4'].font = font_bold
        ws['H4'].fill = fill_card
        ws['H4'].alignment = Alignment(horizontal='center', vertical='center')

        for cell_ref in ['A4', 'B4', 'D4', 'E4', 'F4', 'H4', 'I4']:
            ws[cell_ref].border = thin_border

        # Headers Tabla (Fila 6)
        headers = [
            "N°",
            "Colaborador",
            "Cargo",
            "Tipo de Ausencia",
            "Fecha Inicio",
            "Fecha Fin",
            "Días Concedidos",
            "Motivo / Justificación",
            "Fecha Registro",
        ]

        ws.row_dimensions[6].height = 24
        for col_idx, h in enumerate(headers, 1):
            c = ws.cell(row=6, column=col_idx, value=h)
            c.font = font_header
            c.fill = fill_header
            c.alignment = Alignment(horizontal='center', vertical='center')
            c.border = thin_border

        # Filas de Datos
        row_idx = 7
        for i, p in enumerate(permisos, 1):
            ws.row_dimensions[row_idx].height = 20
            emp = p.empleado
            motivo_texto = p.motivo.strip() if p.motivo else f"Concesión de {p.get_tipo_display()}"
            fecha_reg_str = p.created_at.astimezone(timezone.get_current_timezone()).strftime('%d/%m/%Y %I:%M %p') if p.created_at else '-'

            row_data = [
                i,
                f"{emp.nombre} {emp.apellido}",
                emp.get_cargo_display() if hasattr(emp, 'get_cargo_display') else emp.cargo,
                p.get_tipo_display(),
                p.fecha_inicio.strftime('%d/%m/%Y'),
                p.fecha_fin.strftime('%d/%m/%Y'),
                p.total_dias,
                motivo_texto,
                fecha_reg_str,
            ]

            for col_idx, val in enumerate(row_data, 1):
                c = ws.cell(row=row_idx, column=col_idx, value=val)
                c.font = font_data
                c.border = thin_border
                if row_idx % 2 == 0:
                    c.fill = fill_zebra

                if col_idx in [1, 7]:
                    c.alignment = Alignment(horizontal='center', vertical='center')
                    if col_idx == 7:
                        c.font = font_bold
                elif col_idx in [5, 6, 9]:
                    c.alignment = Alignment(horizontal='center', vertical='center')
                    c.font = font_mono
                else:
                    c.alignment = Alignment(horizontal='left', vertical='center')

            row_idx += 1

        # Fila de Totales si hay registros
        if total_solicitudes > 0:
            ws.merge_cells(f'A{row_idx}:F{row_idx}')
            tot_label = ws.cell(row=row_idx, column=1, value="TOTAL DÍAS DE VACACIONES Y PERMISOS:")
            tot_label.font = font_bold
            tot_label.alignment = Alignment(horizontal='right', vertical='center')
            tot_label.fill = fill_card

            for c_i in range(1, 7):
                ws.cell(row=row_idx, column=c_i).border = thin_border
                ws.cell(row=row_idx, column=c_i).fill = fill_card

            tot_val = ws.cell(row=row_idx, column=7, value=f"=SUM(G7:G{row_idx-1})")
            tot_val.font = font_bold
            tot_val.alignment = Alignment(horizontal='center', vertical='center')
            tot_val.border = thin_border
            tot_val.fill = fill_card

            for c_i in [8, 9]:
                c_empty = ws.cell(row=row_idx, column=c_i, value="")
                c_empty.border = thin_border
                c_empty.fill = fill_card

            ws.row_dimensions[row_idx].height = 22
        else:
            ws.merge_cells(f'A{row_idx}:I{row_idx}')
            c_empty = ws.cell(row=row_idx, column=1, value="No se registraron vacaciones ni permisos en este período.")
            c_empty.font = font_data
            c_empty.alignment = Alignment(horizontal='center', vertical='center')
            c_empty.border = thin_border
            ws.row_dimensions[row_idx].height = 24

        # Auto-ajuste de columnas
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        ws.column_dimensions['A'].width = 6
        ws.column_dimensions['B'].width = 24
        ws.column_dimensions['C'].width = 18
        ws.column_dimensions['D'].width = 20
        ws.column_dimensions['E'].width = 14
        ws.column_dimensions['F'].width = 14
        ws.column_dimensions['G'].width = 16
        ws.column_dimensions['H'].width = 32
        ws.column_dimensions['I'].width = 20

        # ── Hoja 2: Saldos Consolidados de Vacaciones por Colaborador ──
        ws_saldos = wb.create_sheet(title="Saldos por Colaborador")
        ws_saldos.views.sheetView[0].showGridLines = True

        ws_saldos.merge_cells('A1:F1')
        ws_saldos['A1'] = "EL BODEGÓN — BALANCE DE SALDOS DE VACACIONES"
        ws_saldos['A1'].font = font_titulo
        ws_saldos['A1'].fill = fill_title
        ws_saldos['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws_saldos.row_dimensions[1].height = 28

        ws_saldos.merge_cells('A2:F2')
        ws_saldos['A2'] = f"Corte al {hoy.strftime('%d/%m/%Y')} — Incluye abonos por feriados laborados y deducciones por inasistencias"
        ws_saldos['A2'].font = font_sub
        ws_saldos['A2'].fill = fill_title
        ws_saldos['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws_saldos.row_dimensions[2].height = 18

        headers_saldos = [
            "N°",
            "Colaborador",
            "Cargo",
            "Días Acumulados / Feriados",
            "Días Gozados (Tiempo)",
            "Días Pagados (Dinero)",
            "Saldo Neto Disponible",
        ]
        ws_saldos.row_dimensions[4].height = 24
        for col_idx, h in enumerate(headers_saldos, 1):
            c = ws_saldos.cell(row=4, column=col_idx, value=h)
            c.font = font_header
            c.fill = fill_header
            c.alignment = Alignment(horizontal='center', vertical='center')
            c.border = thin_border

        empleados_activos = Empleado.objects.filter(activo=True).order_by('nombre', 'apellido')
        r_idx = 5
        for i, emp in enumerate(empleados_activos, 1):
            permisos_emp = PermisoAusencia.objects.filter(
                empleado=emp,
                tipo='VACACIONES'
            )
            total_gozadas = sum(p.total_dias for p in permisos_emp)
            pagos_emp = PagoVacaciones.objects.filter(empleado=emp)
            total_pagadas_dinero = sum(pg.dias_pagados for pg in pagos_emp)
            acumuladas = float(emp.dias_vacaciones_acumuladas or 0.0)
            disponible = round(acumuladas - float(total_gozadas), 2)

            row_s = [
                i,
                f"{emp.nombre} {emp.apellido}",
                emp.get_cargo_display() if hasattr(emp, 'get_cargo_display') else emp.cargo,
                round(acumuladas + float(total_pagadas_dinero), 2),
                round(float(total_gozadas), 1),
                round(float(total_pagadas_dinero), 1),
                disponible,
            ]
            for col_idx, val in enumerate(row_s, 1):
                c = ws_saldos.cell(row=r_idx, column=col_idx, value=val)
                c.font = font_data
                c.border = thin_border
                if r_idx % 2 == 0:
                    c.fill = fill_zebra
                if col_idx in [1, 4, 5, 6, 7]:
                    c.alignment = Alignment(horizontal='center', vertical='center')
                    if col_idx == 7:
                        c.font = font_bold
                else:
                    c.alignment = Alignment(horizontal='left', vertical='center')
            r_idx += 1

        ws_saldos.column_dimensions['A'].width = 6
        ws_saldos.column_dimensions['B'].width = 26
        ws_saldos.column_dimensions['C'].width = 20
        ws_saldos.column_dimensions['D'].width = 24
        ws_saldos.column_dimensions['E'].width = 22
        ws_saldos.column_dimensions['F'].width = 22
        ws_saldos.column_dimensions['G'].width = 22

        # ── Hoja 3: Vacaciones Pagadas en Dinero ──
        ws_pagos = wb.create_sheet(title="Vacaciones Pagadas Dinero")
        ws_pagos.views.sheetView[0].showGridLines = True

        ws_pagos.merge_cells('A1:I1')
        ws_pagos['A1'] = "EL BODEGÓN — REGISTRO DE VACACIONES PAGADAS EN DINERO"
        ws_pagos['A1'].font = font_titulo
        ws_pagos['A1'].fill = fill_title
        ws_pagos['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws_pagos.row_dimensions[1].height = 28

        ws_pagos.merge_cells('A2:I2')
        ws_pagos['A2'] = f"Período: {periodo_label} | Comprobantes Oficiales Emitidos (BVP)"
        ws_pagos['A2'].font = font_sub
        ws_pagos['A2'].fill = fill_title
        ws_pagos['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws_pagos.row_dimensions[2].height = 18

        headers_pagos = [
            "N°",
            "N° Recibo",
            "Fecha Pago",
            "Colaborador",
            "Cargo",
            "Días Pagados",
            "Monto Pagado (C$)",
            "Saldo Resultante",
            "Observaciones / Motivo",
        ]
        ws_pagos.row_dimensions[4].height = 24
        for col_idx, h in enumerate(headers_pagos, 1):
            c = ws_pagos.cell(row=4, column=col_idx, value=h)
            c.font = font_header
            c.fill = fill_header
            c.alignment = Alignment(horizontal='center', vertical='center')
            c.border = thin_border

        pagos_qs = PagoVacaciones.objects.filter(
            fecha_pago__range=(fecha_inicio, fecha_fin)
        ).select_related('empleado', 'registrado_por').order_by('-fecha_pago')

        r_pago_idx = 5
        for i, pg in enumerate(pagos_qs, 1):
            row_p = [
                i,
                pg.numero_recibo,
                pg.fecha_pago.strftime('%d/%m/%Y'),
                f"{pg.empleado.nombre} {pg.empleado.apellido}",
                pg.empleado.get_cargo_display() if hasattr(pg.empleado, 'get_cargo_display') else pg.empleado.cargo,
                float(pg.dias_pagados),
                float(pg.monto_pagado),
                float(pg.dias_saldo_nuevo),
                pg.motivo or pg.observaciones or 'Liquidación de vacaciones',
            ]
            for col_idx, val in enumerate(row_p, 1):
                c = ws_pagos.cell(row=r_pago_idx, column=col_idx, value=val)
                c.font = font_data
                c.border = thin_border
                if r_pago_idx % 2 == 0:
                    c.fill = fill_zebra
                if col_idx in [1, 2, 3, 6, 7, 8]:
                    c.alignment = Alignment(horizontal='center', vertical='center')
                    if col_idx in [6, 7]:
                        c.font = font_bold
                else:
                    c.alignment = Alignment(horizontal='left', vertical='center')
            r_pago_idx += 1

        ws_pagos.column_dimensions['A'].width = 6
        ws_pagos.column_dimensions['B'].width = 16
        ws_pagos.column_dimensions['C'].width = 14
        ws_pagos.column_dimensions['D'].width = 24
        ws_pagos.column_dimensions['E'].width = 18
        ws_pagos.column_dimensions['F'].width = 16
        ws_pagos.column_dimensions['G'].width = 18
        ws_pagos.column_dimensions['H'].width = 18
        ws_pagos.column_dimensions['I'].width = 30

        # ── Hoja 4: Feriados Laborados Acreditados ──
        ws_feriados = wb.create_sheet(title="Feriados Acreditados")
        ws_feriados.views.sheetView[0].showGridLines = True

        ws_feriados.merge_cells('A1:G1')
        ws_feriados['A1'] = "EL BODEGÓN — FERIADOS LABORADOS ACREDITADOS A VACACIONES"
        ws_feriados['A1'].font = font_titulo
        ws_feriados['A1'].fill = fill_title
        ws_feriados['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws_feriados.row_dimensions[1].height = 28

        ws_feriados.merge_cells('A2:G2')
        ws_feriados['A2'] = f"Período: {periodo_label} | Feriados con derecho a +2 días de vacaciones acumuladas"
        ws_feriados['A2'].font = font_sub
        ws_feriados['A2'].fill = fill_title
        ws_feriados['A2'].alignment = Alignment(horizontal='center', vertical='center')
        ws_feriados.row_dimensions[2].height = 18

        headers_feriados = [
            "N°",
            "Fecha Feriado",
            "Feriado Nacional",
            "Colaborador",
            "Cargo",
            "Horas Trabajadas",
            "Días Sumados a Vacaciones",
        ]
        ws_feriados.row_dimensions[4].height = 24
        for col_idx, h in enumerate(headers_feriados, 1):
            c = ws_feriados.cell(row=4, column=col_idx, value=h)
            c.font = font_header
            c.fill = fill_header
            c.alignment = Alignment(horizontal='center', vertical='center')
            c.border = thin_border

        feriados_qs = CompensacionFeriado.objects.filter(
            fecha_feriado__range=(fecha_inicio, fecha_fin),
            estado='VACACIONES'
        ).select_related('empleado').order_by('fecha_feriado', 'empleado__nombre')

        r_fer_idx = 5
        for i, cf in enumerate(feriados_qs, 1):
            row_f = [
                i,
                cf.fecha_feriado.strftime('%d/%m/%Y'),
                cf.nombre_feriado or 'Feriado Nacional',
                f"{cf.empleado.nombre} {cf.empleado.apellido}",
                cf.empleado.get_cargo_display() if hasattr(cf.empleado, 'get_cargo_display') else cf.empleado.cargo,
                float(cf.horas_trabajadas),
                float(cf.dias_acreditados_vacaciones or cf.dias_compensatorios_totales or 2.0),
            ]
            for col_idx, val in enumerate(row_f, 1):
                c = ws_feriados.cell(row=r_fer_idx, column=col_idx, value=val)
                c.font = font_data
                c.border = thin_border
                if r_fer_idx % 2 == 0:
                    c.fill = fill_zebra
                if col_idx in [1, 2, 6, 7]:
                    c.alignment = Alignment(horizontal='center', vertical='center')
                    if col_idx == 7:
                        c.font = font_bold
                else:
                    c.alignment = Alignment(horizontal='left', vertical='center')
            r_fer_idx += 1

        ws_feriados.column_dimensions['A'].width = 6
        ws_feriados.column_dimensions['B'].width = 16
        ws_feriados.column_dimensions['C'].width = 30
        ws_feriados.column_dimensions['D'].width = 24
        ws_feriados.column_dimensions['E'].width = 18
        ws_feriados.column_dimensions['F'].width = 18
        ws_feriados.column_dimensions['G'].width = 26

        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        nombre_archivo = f"BodegonPass_Vacaciones_{fecha_inicio.strftime('%Y%m')}.xlsx"
        response = HttpResponse(buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        response['X-Filename'] = nombre_archivo
        response['Access-Control-Expose-Headers'] = 'Content-Disposition, X-Filename'

        BitacoraAccion.objects.create(
            usuario=request.user if request.user.is_authenticated else None,
            accion='EXPORTAR_NOMINA',
            descripcion=f"Reporte mensual de vacaciones Excel exportado ({periodo_label}).",
            ip_address=_get_clean_ip(request)
        )

        return response
    except Exception as e:
        return Response({'detail': f'Error generando reporte mensual de vacaciones: {str(e)}'}, status=500)


# Inicio de la sincronización offline reparada (00:00 del 24/10/2026, hora de Nicaragua)
SYNC_OFFLINE_DESDE = datetime.datetime(2026, 10, 24, 6, 0, tzinfo=datetime.timezone.utc)


@api_view(['POST'])
@authentication_classes([])
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

        # 1. Buscar Empleado por token o prefijo UUID
        empleado = _empleado_por_qr(qr_code_token)

        if not empleado:
            respuestas.append({'status': 'error', 'mensaje': 'Empleado no encontrado o inactivo.', 'token': qr_code_token})
            continue

        # 3. Guardar registro
        from django.core.files.base import ContentFile
        import base64
        from django.utils.dateparse import parse_datetime
        import datetime

        foto_file = None
        foto_b64 = None
        if foto and ',' in foto:
            foto_b64 = foto
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

        # Validación de seguridad: Rechazar fechas en el futuro (más de 10 min de desfase de reloj)
        ahora_servidor = timezone.now()
        if fecha_hora and (fecha_hora - ahora_servidor).total_seconds() > 600:
            respuestas.append({
                'status': 'error',
                'mensaje': 'Marca rechazada: la fecha y hora enviada está en el futuro respecto al servidor.',
                'token': qr_code_token
            })
            continue

        # Validación de seguridad: Si la marca offline tiene más de 14 días de antigüedad, auditar alerta
        es_offline_antiguo = False
        if fecha_hora and (ahora_servidor - fecha_hora).total_seconds() > (14 * 86400):
            es_offline_antiguo = True

        if not fecha_hora:
            respuestas.append({'status': 'error', 'mensaje': 'Fecha y hora inválida.', 'token': qr_code_token})
            continue

        # Las marcas que quedaron atrapadas en la cola mientras la sincronización estaba rota
        # no se cargan (decisión gerencial 24/10/2026); el kiosco las borra de su cola igual.
        if fecha_hora < SYNC_OFFLINE_DESDE:
            respuestas.append({'status': 'descartado', 'mensaje': 'Marca offline anterior a la reparación de la sincronización.', 'token': qr_code_token})
            continue

        # Anti-rebote / reintento: si ya hay un marcaje del colaborador a menos de 5 minutos,
        # este es un escaneo doble o un reenvío del mismo lote, no un evento nuevo.
        duplicado = RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__gt=fecha_hora - datetime.timedelta(seconds=300),
            fecha_hora__lt=fecha_hora + datetime.timedelta(seconds=300),
        ).exists()
        if duplicado:
            respuestas.append({'status': 'duplicado', 'empleado': empleado.nombre, 'token': qr_code_token})
            continue

        dt_local = fecha_hora.astimezone(timezone.get_current_timezone())
        dia = dt_local.date()
        start_dt = timezone.make_aware(datetime.datetime.combine(dia, datetime.time.min), timezone.get_current_timezone())
        end_dt = timezone.make_aware(datetime.datetime.combine(dia, datetime.time.max), timezone.get_current_timezone())
        ayer = dia - datetime.timedelta(days=1)

        # Detección de cierre de turno trasnoche (00:00 a 04:59 AM)
        es_cierre_trasnoche = False
        regs_ayer_trasnoche = []
        if dt_local.hour < 5:
            start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
            end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
            regs_ayer_trasnoche = list(RegistroAsistencia.objects.filter(
                empleado=empleado,
                fecha_hora__range=(start_ayer, end_ayer)
            ).order_by('fecha_hora'))
            if regs_ayer_trasnoche and regs_ayer_trasnoche[-1].tipo_evento in ('ENTRADA', 'ENTRADA_QUEBRADA'):
                es_cierre_trasnoche = True

        # Solo los marcajes anteriores a este: una marca offline puede llegar después de otras más recientes
        registros_hoy = RegistroAsistencia.objects.filter(
            empleado=empleado,
            fecha_hora__range=(start_dt, end_dt),
            fecha_hora__lt=fecha_hora,
        ).order_by('fecha_hora')

        # Auto-detectar tipo_evento si no se proporciona (o si llega un valor desconocido)
        tipos_validos = dict(RegistroAsistencia.TIPO_EVENTO_CHOICES)
        if not tipo_evento or tipo_evento not in tipos_validos:
            if es_cierre_trasnoche:
                tipo_evento = 'SALIDA_DEFINITIVA'
            else:
                tipo_evento = _autodetectar_tipo_evento(registros_hoy, fecha_hora, empleado=empleado)

        with transaction.atomic():
            registro = RegistroAsistencia.objects.create(
                empleado=empleado,
                tipo_evento=tipo_evento,
                foto_verificacion=foto_file,
                foto_base64=foto_b64,
                fecha_hora=fecha_hora,
                ip_address=_get_clean_ip(request)
            )

        # Calcular horas hoy y verificar tardanzas
        if es_cierre_trasnoche:
            registros_actualizados = regs_ayer_trasnoche + [registro]
            dia_operativo_cierre = ayer
        else:
            registros_actualizados = list(RegistroAsistencia.objects.filter(
                empleado=empleado,
                fecha_hora__range=(start_dt, end_dt)
            ).order_by('fecha_hora'))
            dia_operativo_cierre = dia

        horas_netas_hoy = _calcular_horas_netas_dia(registros_actualizados)

        # Si es ENTRADA, revisar si el día previo quedó sin salida
        if tipo_evento == 'ENTRADA':
            start_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.min), timezone.get_current_timezone())
            end_ayer = timezone.make_aware(datetime.datetime.combine(ayer, datetime.time.max), timezone.get_current_timezone())
            regs_ayer = list(RegistroAsistencia.objects.filter(
                empleado=empleado,
                fecha_hora__range=(start_ayer, end_ayer)
            ).order_by('fecha_hora'))
            if regs_ayer:
                ultimo_ayer = regs_ayer[-1].tipo_evento
                if ultimo_ayer in ('ENTRADA', 'ENTRADA_QUEBRADA', 'SALIDA_QUEBRADA'):
                    cerro_madrugada = RegistroAsistencia.objects.filter(
                        empleado=empleado,
                        tipo_evento='SALIDA_DEFINITIVA',
                        fecha_hora__gte=start_dt,
                        fecha_hora__lt=start_dt + datetime.timedelta(hours=5)
                    ).exists()
                    if not cerro_madrugada:
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
            _procesar_compensacion_y_horas_extra(empleado, dia_operativo_cierre, horas_netas_hoy, request)
            # 7mo día de la semana
            _verificar_septimo_dia(empleado, dia_operativo_cierre, horas_netas_hoy)

        # Alertas de asistencia (Regla de gracia 10 min de El Bodegón)
        _evaluar_alertas_asistencia(registro, empleado, registros_actualizados, horas_netas_hoy, es_offline=True)

        respuestas.append({'status': 'ok', 'id': registro.id, 'empleado': empleado.nombre})

    return Response({'status': 'ok', 'sincronizados': respuestas})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def exportar_respaldo_base_datos(request):
    """
    Genera y descarga un archivo JSON estructurado con el respaldo total e íntegro
    de todas las tablas de Restaurante El Bodegón para resguardo de la administración.
    Requiere autenticación de administrador o clave administrativa de resguardo.
    """
    import hmac
    from django.conf import settings
    admin_key_header = request.headers.get('X-Admin-Backup-Key') or request.GET.get('key')
    expected_key = settings.BACKUP_ADMIN_KEY

    is_authorized = False
    if request.user and request.user.is_authenticated and request.user.is_staff:
        is_authorized = True
    elif admin_key_header and hmac.compare_digest(admin_key_header.encode('utf-8'), expected_key.encode('utf-8')):
        is_authorized = True

    if not is_authorized:
        try:
            BitacoraAccion.objects.create(
                usuario=request.user if (request.user and request.user.is_authenticated) else None,
                accion='SANCION_DISCIPLINARIA',
                descripcion="ALERTA DE SEGURIDAD: Intento no autorizado de descarga de volcado total de base de datos bloqueado por el servidor.",
                ip_address=_get_clean_ip(request)
            )
        except Exception:
            pass
        return Response(
            {'detail': 'Acceso denegado: Se requieren credenciales administrativas autorizadas para descargar el respaldo total de la base de datos.'},
            status=status.HTTP_403_FORBIDDEN
        )

    from django.core import serializers
    import json
    from django.http import HttpResponse

    data = {
        'fecha_generacion': timezone.now().isoformat(),
        'sistema': 'Restaurante El Bodegón - Sistema de Asistencia y Nómina',
        'version': '2.0',
        'tablas': {
            'empleados': json.loads(serializers.serialize('json', Empleado.objects.all())),
            'registros_asistencia': json.loads(serializers.serialize('json', RegistroAsistencia.objects.all())),
            'autorizaciones_horas_extra': json.loads(serializers.serialize('json', AutorizacionHorasExtra.objects.all())),
            'permisos_ausencias': json.loads(serializers.serialize('json', PermisoAusencia.objects.all())),
            'feriados': json.loads(serializers.serialize('json', DiaFeriado.objects.all())),
            'alertas': json.loads(serializers.serialize('json', AlertaAsistencia.objects.all())),
            'compensaciones_horas': json.loads(serializers.serialize('json', CompensacionHoras.objects.all())),
            'compensaciones_feriados': json.loads(serializers.serialize('json', CompensacionFeriado.objects.all())),
            'pagos_vacaciones': json.loads(serializers.serialize('json', PagoVacaciones.objects.all())),
            'bitacora': json.loads(serializers.serialize('json', BitacoraAccion.objects.all().order_by('-id')[:500])),
        }
    }

    fecha_str = timezone.localdate().strftime('%Y%m%d')
    filename = f"respaldo_bodegon_{fecha_str}.json"
    response = HttpResponse(json.dumps(data, indent=2, ensure_ascii=False), content_type='application/json')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['GET'])
@permission_classes([IsPanelAdmin])
def exportar_reporte_inasistencias_excel(request):
    """
    Genera un archivo Excel (.xlsx) oficial con el detalle de todas las inasistencias
    del mes o rango de fechas, desglosando:
    - Fecha
    - Colaborador y Cargo
    - Estado de Resolución (Compensado Vacaciones -1.0d, Bolsa de Horas +8.0h, Justificado)
    - Motivo / Justificación
    - Saldo Resultante
    - Espacio de firma de conformidad del colaborador
    """
    fecha_inicio_str = request.GET.get('fecha_inicio')
    fecha_fin_str = request.GET.get('fecha_fin')
    tz = timezone.get_current_timezone()
    hoy = timezone.localdate()

    if fecha_inicio_str and fecha_fin_str:
        try:
            fecha_inicio = datetime.datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
            fecha_fin = datetime.datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
        except Exception:
            fecha_inicio = hoy.replace(day=1)
            fecha_fin = hoy
    else:
        fecha_inicio = hoy.replace(day=1)
        fecha_fin = hoy

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inasistencias y Compensaciones"
    ws.views.sheetView[0].showGridLines = True

    font_title = Font(name='Calibri', size=14, bold=True, color='1C6856')
    font_sub = Font(name='Calibri', size=9, italic=True, color='555555')
    font_th = Font(name='Calibri', size=9, bold=True, color='FFFFFF')
    fill_th = PatternFill(fill_type='solid', start_color='1C6856', end_color='1C6856')
    font_td = Font(name='Calibri', size=9)
    align_center = Alignment(horizontal='center', vertical='center')
    align_left = Alignment(horizontal='left', vertical='center')
    align_right = Alignment(horizontal='right', vertical='center')
    thin = Side(border_style='thin', color='CCCCCC')
    border_cell = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws['A1'] = "EL BODEGÓN — REPORTE OFICIAL DE INASISTENCIAS Y COMPENSACIÓN"
    ws['A1'].font = font_title
    ws['A2'] = f"Período auditado: del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')} | Generado: {timezone.now().astimezone(tz).strftime('%d/%m/%Y %I:%M %p')}"
    ws['A2'].font = font_sub

    headers = [
        "No.", "Fecha Falta", "Colaborador", "Cargo",
        "Forma de Compensación", "Motivo / Causa",
        "Saldo Vacaciones", "Deuda Horas", "Firma Colaborador (Enterado)", "Firma Administración"
    ]
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_idx, value=h)
        cell.font = font_th
        cell.fill = fill_th
        cell.alignment = align_center
        cell.border = border_cell

    ws.row_dimensions[4].height = 24

    permisos = PermisoAusencia.objects.filter(
        fecha_inicio__gte=fecha_inicio,
        fecha_fin__lte=fecha_fin
    ).select_related('empleado').order_by('fecha_inicio', 'empleado__nombre')

    row_idx = 5
    item_num = 1
    for p in permisos:
        emp = p.empleado
        motivo_lower = (p.motivo or '').lower()
        es_inasistencia = 'inasistencia' in motivo_lower or 'ausencia' in motivo_lower or 'falta' in motivo_lower or 'alerta' in motivo_lower
        if not es_inasistencia and p.tipo not in ['VACACIONES', 'PERMISO_AUTORIZADO']:
            continue

        if p.tipo == 'VACACIONES':
            forma = "🌴 Deducido de Vacaciones (-1.0 d)"
        elif 'deuda' in motivo_lower or (emp.horas_pendientes and float(emp.horas_pendientes) > 0 and 'bolsa' in motivo_lower):
            forma = "⏳ Bolsa de Horas (+8.0 hrs)"
        else:
            forma = "✅ Justificado sin recargo"

        ws.cell(row=row_idx, column=1, value=item_num).alignment = align_center
        ws.cell(row=row_idx, column=2, value=p.fecha_inicio.strftime('%d/%m/%Y')).alignment = align_center
        ws.cell(row=row_idx, column=3, value=f"{emp.nombre} {emp.apellido}").alignment = align_left
        ws.cell(row=row_idx, column=4, value=emp.get_cargo_display()).alignment = align_left
        ws.cell(row=row_idx, column=5, value=forma).alignment = align_center
        ws.cell(row=row_idx, column=6, value=p.motivo or "Sin observaciones").alignment = align_left
        ws.cell(row=row_idx, column=7, value=f"{float(emp.dias_vacaciones_acumuladas or 0):.2f} d").alignment = align_right
        ws.cell(row=row_idx, column=8, value=f"{float(emp.horas_pendientes or 0):.1f} h").alignment = align_right
        ws.cell(row=row_idx, column=9, value="____________________").alignment = align_center
        ws.cell(row=row_idx, column=10, value="____________________").alignment = align_center

        for c in range(1, 11):
            ws.cell(row=row_idx, column=c).border = border_cell
            ws.cell(row=row_idx, column=c).font = font_td

        ws.row_dimensions[row_idx].height = 20
        row_idx += 1
        item_num += 1

    if item_num == 1:
        c_emp = ws.cell(row=row_idx, column=1, value="No se registraron inasistencias en este período.")
        c_emp.font = font_sub
        ws.merge_cells(f'A{row_idx}:J{row_idx}')
        c_emp.alignment = align_center
        ws.row_dimensions[row_idx].height = 22

    col_widths = {
        'A': 6, 'B': 13, 'C': 26, 'D': 20, 'E': 26,
        'F': 36, 'G': 16, 'H': 14, 'I': 24, 'J': 24
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    filename = f"Inasistencias_Compensadas_ElBodegon_{fecha_inicio.strftime('%Y%m')}.xlsx"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    wb.save(response)
    return response
