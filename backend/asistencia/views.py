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

    # Tipo de evento solicitado o auto-detectado
    tipo_evento = request.data.get('tipo_evento')

    if not tipo_evento:
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

    foto = request.FILES.get('foto')

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

    # Si es salida definitiva y excede las 8 horas (jornada ordinaria)
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

    # ── DETECCIÓN DE PUNTUALIDAD Y CREACIÓN DE ALERTAS INTERNAS ─────────────
    try:
        hora_actual = registro.fecha_hora.astimezone(timezone.get_current_timezone())
        tipo = registro.tipo_evento
        
        # Determinar el turno según marcajes del día
        tiene_quebrado = any(r.tipo_evento in ['SALIDA_QUEBRADA', 'REGRESO_QUEBRADA'] for r in registros_actualizados)
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

        mins_marcados = hora_actual.hour * 60 + hora_actual.minute
        alerta_creada = False
        alerta_tipo = ''
        alerta_titulo = ''
        alerta_mensaje = ''

        if tipo == 'ENTRADA':
            target = 720  # 12:00 md
            if turno_detectado == 'Corrido 2' or (turno_detectado == 'Desconocido' and mins_marcados > 810):
                target = 900  # 3:00 pm
            
            diff = mins_marcados - target
            if diff > 10:  # Tolerancia de 10 min
                alerta_creada = True
                alerta_tipo = 'TARDANZA'
                alerta_titulo = f"Tardanza detectada: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = f"Llegó {diff} minutos tarde. Marcaje a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."
                
        elif tipo == 'ENTRADA_QUEBRADA':
            target = 1080  # 6:00 pm
            diff = mins_marcados - target
            if diff > 10:
                alerta_creada = True
                alerta_tipo = 'TARDANZA'
                alerta_titulo = f"Tardanza en regreso: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = f"Regresó de la pausa {diff} minutos tarde. Marcaje a las {hora_actual.strftime('%I:%M %p')}."
                
        elif tipo == 'SALIDA_QUEBRADA':
            target = 900  # 3:00 pm
            diff = target - mins_marcados
            if diff > 5:
                alerta_creada = True
                alerta_tipo = 'SALIDA_ANTICIPADA'
                alerta_titulo = f"Salida anticipada Pausa: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = f"Se retiró a la pausa {diff} minutos antes de tiempo. Marcaje a las {hora_actual.strftime('%I:%M %p')}."
                
        elif tipo == 'SALIDA_DEFINITIVA':
            target = 1380  # 11:00 pm
            if turno_detectado == 'Corrido 1':
                target = 1200  # 8:00 pm
            
            diff = target - mins_marcados
            if diff > 5:
                alerta_creada = True
                alerta_tipo = 'SALIDA_ANTICIPADA'
                alerta_titulo = f"Salida definitiva anticipada: {empleado.nombre} {empleado.apellido}"
                alerta_mensaje = f"Salió {diff} minutos antes de tiempo. Marcaje a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."

        if alerta_creada:
            AlertaAsistencia.objects.create(
                tipo=alerta_tipo,
                empleado=empleado,
                titulo=alerta_titulo,
                mensaje=alerta_mensaje
            )
    except Exception as ex:
        print(f"Error procesando alertas: {ex}")

    return Response({
        'status': 'ok',
        'mensaje': f"¡Hola {empleado.nombre}! Marcaje registrado correctamente.",
        'registro': RegistroAsistenciaSerializer(registro, context={'request': request}).data,
        'horas_trabajadas_hoy': round(horas_netas_hoy, 2)
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
        from datetime import datetime as dt
        inicio_str = request.GET.get('fecha_inicio')
        fin_str = request.GET.get('fecha_fin')

        hoy = timezone.localdate()
        fecha_inicio = dt.strptime(inicio_str, '%Y-%m-%d').date() if inicio_str else hoy.replace(day=1)
        fecha_fin = dt.strptime(fin_str, '%Y-%m-%d').date() if fin_str else hoy

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Reporte de Asistencia"
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

        # Encabezado del documento
        ws.merge_cells('A1:H1')
        ws['A1'] = "RESTAURANTE EL BODEGÓN — REPORTES DE HORAS Y ASISTENCIA"
        ws['A1'].font = font_titulo
        ws['A1'].fill = fill_title
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('A2:H2')
        ws['A2'] = f"Período del {fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')} — Generado el {hoy.strftime('%d/%m/%Y')}"
        ws['A2'].font = font_sub
        ws['A2'].fill = fill_title
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')

        # Headers
        headers = [
            "ID",
            "Empleado",
            "Cargo / Puesto",
            "Días Asistidos",
            "Horas Ordinarias (Normales)",
            "Feriados Trabajados (Días)",
            "Horas Extra Aprobadas",
            "Horas Debidas (Faltantes)"
        ]

        ws.append([]) # Fila 3 vacía
        ws.append(headers) # Fila 4 Headers

        for col in range(1, 9):
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

        # Calcular días laborables normales (Lunes a Sábado, no feriados)
        dias_laborables_normales = 0
        curr = fecha_inicio
        while curr <= fecha_fin:
            if curr.weekday() != 6 and curr not in feriados_set:
                dias_laborables_normales += 1
            curr += datetime.timedelta(days=1)

        horas_objetivo_normales = dias_laborables_normales * 8.0

        for emp in empleados:
            # Traer registros usando rango amplio para evitar desfases de zona horaria en la consulta SQL de SQLite
            start_query = timezone.make_aware(datetime.datetime.combine(fecha_inicio, datetime.time.min), timezone.get_current_timezone())
            end_query = timezone.make_aware(datetime.datetime.combine(fecha_fin, datetime.time.max), timezone.get_current_timezone())
            
            registros = RegistroAsistencia.objects.filter(
                empleado=emp,
                fecha_hora__range=(start_query, end_query)
            ).order_by('fecha_hora')

            # Calcular horas por día agrupando en memoria según hora local de Nicaragua
            horas_normales_trabajadas = 0.0
            feriados_trabajados_dias = 0
            feriados_trabajados_info = []
            horas_debidas = 0.0
            dias_map = {}
            for reg in registros:
                # Convertir a hora local de Nicaragua para obtener la fecha correcta
                reg_local = reg.fecha_hora.astimezone(timezone.get_current_timezone())
                dia_local = reg_local.date()
                
                # Excluir si cae fuera del rango del reporte
                if dia_local < fecha_inicio or dia_local > fecha_fin:
                    continue
                    
                if dia_local not in dias_map:
                    dias_map[dia_local] = []
                dias_map[dia_local].append(reg)

            dias_unicos = len(dias_map)

            for dia, regs in dias_map.items():
                horas_dia = _calcular_horas_netas_dia(regs)
                # Jornada ordinaria máxima es de 8 horas
                horas_ord = min(horas_dia, 8.0)
                
                if dia in feriados_set:
                    # Cuenta como feriado doble únicamente si completa 8.0 horas
                    if horas_ord >= 8.0:
                        feriados_trabajados_dias += 1
                        desc_feriado = DiaFeriado.objects.filter(fecha=dia).first()
                        nombre_feriado = desc_feriado.descripcion if desc_feriado else "Día Feriado"
                        feriados_trabajados_info.append(
                            f"- {dia.strftime('%d/%m/%Y')}: {nombre_feriado} ({round(horas_ord, 2)} hrs)"
                        )
                    else:
                        # Si no completa las 8 horas en feriado, se suman como horas ordinarias simples
                        horas_normales_trabajadas += horas_ord
                else:
                    horas_normales_trabajadas += horas_ord

            # Calcular horas debidas recorriendo cada día del período para incluir inasistencias y tardanzas
            horas_debidas = 0.0
            curr_day = fecha_inicio
            while curr_day <= fecha_fin:
                if curr_day.weekday() != 6 and curr_day not in feriados_set:
                    if curr_day in dias_map:
                        regs = dias_map[curr_day]
                        horas_dia = _calcular_horas_netas_dia(regs)
                        horas_ord = min(horas_dia, 8.0)
                        deuda_dia = max(0.0, 8.0 - horas_ord)
                        horas_debidas += deuda_dia
                    else:
                        # Inasistencia completa en día laborable
                        horas_debidas += 8.0
                curr_day += datetime.timedelta(days=1)

            # Obtener horas extra aprobadas
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
                dias_unicos,
                round(horas_normales_trabajadas, 2),
                feriados_trabajados_dias,
                round(float(horas_extra_aprobadas), 2),
                round(horas_debidas, 2)
            ]
            ws.append(fila)

            # Agregar comentario de Excel en la celda de feriados si corresponde
            if feriados_trabajados_dias > 0 and feriados_trabajados_info:
                from openpyxl.comments import Comment
                comentario_texto = "Detalle de Feriados Laborados:\n" + "\n".join(feriados_trabajados_info)
                cell_feriado = ws.cell(row=row_idx, column=6)
                cell_feriado.comment = Comment(comentario_texto, "SGP El Bodegon")

            for col in range(1, 9):
                cell = ws.cell(row=row_idx, column=col)
                cell.font = font_data
                cell.border = thin_border
                if row_idx % 2 == 0:
                    cell.fill = fill_zebra
                if col in [1, 4, 5, 6, 7, 8]:
                    cell.alignment = Alignment(horizontal='right')
                else:
                    cell.alignment = Alignment(horizontal='left')

            row_idx += 1

        # Fila de Totales
        ws.append([])
        row_idx += 1
        ws.merge_cells(f'A{row_idx}:D{row_idx}')
        ws[f'A{row_idx}'] = "TOTALES GENERALES:"
        ws[f'A{row_idx}'].font = font_bold
        ws[f'A{row_idx}'].alignment = Alignment(horizontal='right')

        # Calcular sumas de E (Ordinarias), F (Feriadas) y G (Extras) y H (Debidas) usando fórmulas
        cell_ord = ws[f'E{row_idx}']
        cell_ord.value = f"=SUM(E5:E{row_idx-2})"
        cell_ord.font = font_bold
        cell_ord.border = thin_border
        cell_ord.alignment = Alignment(horizontal='right')

        cell_fer = ws[f'F{row_idx}']
        cell_fer.value = f"=SUM(F5:F{row_idx-2})"
        cell_fer.font = font_bold
        cell_fer.border = thin_border
        cell_fer.alignment = Alignment(horizontal='right')

        cell_ext = ws[f'G{row_idx}']
        cell_ext.value = f"=SUM(G5:G{row_idx-2})"
        cell_ext.font = font_bold
        cell_ext.border = thin_border
        cell_ext.alignment = Alignment(horizontal='right')

        cell_deb = ws[f'H{row_idx}']
        cell_deb.value = f"=SUM(H5:H{row_idx-2})"
        cell_deb.font = font_bold
        cell_deb.border = thin_border
        cell_deb.alignment = Alignment(horizontal='right')

        # Ajustar ancho de columnas
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

        from io import BytesIO
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        nombre_archivo = f"Reporte_Horas_Bodegon_{fecha_inicio.strftime('%Y%m%d')}_{fecha_fin.strftime('%Y%m%d')}.xlsx"
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

        # Lógica de horas extras
        horas_netas_hoy = _calcular_horas_netas_dia(registros_actualizados)
        if tipo_evento == 'SALIDA_DEFINITIVA' and horas_netas_hoy > 8.0:
            horas_extra = horas_netas_hoy - 8.0
            AutorizacionHorasExtra.objects.update_or_create(
                empleado=empleado,
                fecha=dia,
                defaults={
                    'horas_extra_solicitadas': round(horas_extra, 2),
                    'estado': 'PENDIENTE'
                }
            )

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
