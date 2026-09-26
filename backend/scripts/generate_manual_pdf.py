import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, HRFlowable, Image
)
from reportlab.pdfgen import canvas

# Paleta Corporativa El Bodegón Pass
COLOR_PRIMARY = colors.HexColor('#1c6856')      # Esmeralda Bodegón
COLOR_PRIMARY_DARK = colors.HexColor('#134e42') # Esmeralda Profundo
COLOR_PRIMARY_LIGHT = colors.HexColor('#e8f5f1')# Verde pastel fondo
COLOR_ACCENT = colors.HexColor('#d97706')       # Ámbar / Dorado
COLOR_ACCENT_LIGHT = colors.HexColor('#fef3c7') # Ámbar pastel
COLOR_DANGER = colors.HexColor('#be123c')       # Rojo alerta
COLOR_DANGER_LIGHT = colors.HexColor('#ffe4e6') # Rosa pastel
COLOR_DARK = colors.HexColor('#1c1917')         # Stone 900
COLOR_TEXT = colors.HexColor('#292524')         # Stone 800
COLOR_MUTED = colors.HexColor('#78716c')        # Stone 500
COLOR_BORDER = colors.HexColor('#e7e5e4')       # Stone 200
COLOR_BG_ALT = colors.HexColor('#f8fafc')       # Slate muy claro

class NumberedCanvas(canvas.Canvas):
    """Canvas de dos pasos para calcular el total exacto de páginas y dibujar encabezado/pie."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages):
        # Omitir decoraciones en la portada (página 1)
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(COLOR_MUTED)

        # Encabezado (Header)
        self.drawString(54, letter[1] - 36, "EL BODEGÓN PASS  |  MANUAL OFICIAL DE USUARIO Y OPERACIONES")
        self.setFont("Helvetica", 8)
        self.drawRightString(letter[0] - 54, letter[1] - 36, "VERSIÓN 2.0 • 2026")
        
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.75)
        self.line(54, letter[1] - 42, letter[0] - 54, letter[1] - 42)

        # Pie de página (Footer)
        self.line(54, 45, letter[0] - 54, 45)
        self.drawString(54, 32, "Restaurante & Bar El Bodegón  •  Control de Asistencia, Nómina y Horas Extra")
        page_str = f"Página {self._pageNumber} de {total_pages}"
        self.drawRightString(letter[0] - 54, 32, page_str)

        self.restoreState()

def create_manual_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Modificar estilos estándar
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=34,
        textColor=colors.white,
        alignment=1, # Centrado
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=13,
        leading=18,
        textColor=colors.HexColor('#d1fae5'),
        alignment=1,
    )

    h1_style = ParagraphStyle(
        'Header1Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=COLOR_PRIMARY_DARK,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Header2Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=COLOR_PRIMARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=COLOR_TEXT,
        spaceAfter=6,
    )

    body_bold = ParagraphStyle(
        'BodyBoldCustom',
        parent=body_style,
        fontName='Helvetica-Bold',
    )

    bullet_style = ParagraphStyle(
        'BulletCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=COLOR_TEXT,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4,
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=COLOR_DARK,
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white,
        alignment=0,
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=COLOR_TEXT,
    )

    story = []

    # ─────────────────────────────────────────────────────────────────────────
    # 1. PORTADA PROFESIONAL
    # ─────────────────────────────────────────────────────────────────────────
    logo_path = os.path.join(os.path.dirname(__file__), '../../frontend/public/logo-emblem.png')
    logo_full_path = os.path.join(os.path.dirname(__file__), '../../frontend/public/logo.png')

    # Banner superior
    banner_data = [
        [
            Paragraph("<font size=9 color='#d1fae5'><b>SISTEMA DE ASISTENCIA Y GESTIÓN OPERATIVA</b></font>", subtitle_style)
        ],
        [
            Paragraph("EL BODEGÓN PASS", title_style)
        ],
        [
            Paragraph("Manual Oficial de Usuario y Operaciones", ParagraphStyle('CoverSub2', parent=subtitle_style, fontName='Helvetica-Bold', fontSize=15, textColor=colors.HexColor('#fde047')))
        ],
        [
            Paragraph("Control Biométrico • Jornadas & Turnos • Horas Extra • Nómina • Vacaciones", subtitle_style)
        ]
    ]
    banner_table = Table(banner_data, colWidths=[504])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_PRIMARY),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 16),
        ('BOTTOMPADDING', (0,0), (-1,-1), 16),
        ('LEFTPADDING', (0,0), (-1,-1), 20),
        ('RIGHTPADDING', (0,0), (-1,-1), 20),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 25))

    # Emblema / Logo Central
    if os.path.exists(logo_path):
        story.append(Image(logo_path, width=1.5*inch, height=1.5*inch))
    story.append(Spacer(1, 20))

    # Resumen de Ficha Técnica
    meta_data = [
        [Paragraph("<b>Organización:</b>", body_bold), Paragraph("Restaurante & Bar El Bodegón", body_style)],
        [Paragraph("<b>Sistema:</b>", body_bold), Paragraph("El Bodegón Pass (Web App + Kiosco Biométrico)", body_style)],
        [Paragraph("<b>Versión del Software:</b>", body_bold), Paragraph("2.0 (Turbopack / Django REST / FaceAPI)", body_style)],
        [Paragraph("<b>Fecha de Emisión:</b>", body_bold), Paragraph("Septiembre 2026", body_style)],
        [Paragraph("<b>Dirigido a:</b>", body_bold), Paragraph("Personal Operativo, Administradores de Turno y Gerencia", body_style)],
        [Paragraph("<b>Seguridad y Roles:</b>", body_bold), Paragraph("Acceso por Roles (PIN Maestro 2322 para Autorizaciones)", body_style)],
    ]
    meta_table = Table(meta_data, colWidths=[150, 354])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_PRIMARY_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, COLOR_PRIMARY),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(meta_table)

    story.append(Spacer(1, 40))
    story.append(Paragraph(
        "<i>Este manual contiene instrucciones operativas detalladas, políticas laborales legales y guías de uso para la correcta administración del tiempo, asistencia y compensación en El Bodegón.</i>",
        ParagraphStyle('IntroItalic', parent=body_style, alignment=1, textColor=COLOR_MUTED)
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # 2. ÍNDICE DE CONTENIDOS
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("ÍNDICE GENERAL DEL MANUAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceBefore=4, spaceAfter=12))

    toc_data = [
        [Paragraph("<b>Sección 1:</b> Introducción y Arquitectura del Sistema", body_style), Paragraph("Pág. 3", body_bold)],
        [Paragraph("<b>Sección 2:</b> Kiosco Biométrico (Punto de Marcaje del Colaborador)", body_style), Paragraph("Pág. 4", body_bold)],
        [Paragraph("<b>Sección 3:</b> Panel de Monitoreo en Vivo (Control de Asistencia)", body_style), Paragraph("Pág. 5", body_bold)],
        [Paragraph("<b>Sección 4:</b> Módulo de Horas Extra (Aprobación, PIN 2322 y Boleta)", body_style), Paragraph("Pág. 6", body_bold)],
        [Paragraph("<b>Sección 5:</b> Cuadro de Nómina y Reportes de Horas (Sticky, Áreas y Vistas)", body_style), Paragraph("Pág. 7", body_bold)],
        [Paragraph("<b>Sección 6:</b> Vacaciones, Permisos y Feriados (Cálculo Legal)", body_style), Paragraph("Pág. 8", body_bold)],
        [Paragraph("<b>Sección 7:</b> Gestión de Empleados, Rostros y Carnets QR", body_style), Paragraph("Pág. 9", body_bold)],
        [Paragraph("<b>Sección 8:</b> Políticas de Bolsa de Horas y Control Gerencial", body_style), Paragraph("Pág. 10", body_bold)],
        [Paragraph("<b>Sección 9:</b> Preguntas Frecuentes (FAQ) y Resolución de Incidencias", body_style), Paragraph("Pág. 11", body_bold)],
    ]
    toc_table = Table(toc_data, colWidths=[420, 84])
    toc_table.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(toc_table)
    story.append(Spacer(1, 15))

    def make_callout(text, title="NOTA IMPORTANTE", style="info"):
        bg = COLOR_PRIMARY_LIGHT if style == "info" else (COLOR_ACCENT_LIGHT if style == "warning" else COLOR_DANGER_LIGHT)
        bcolor = COLOR_PRIMARY if style == "info" else (COLOR_ACCENT if style == "warning" else COLOR_DANGER)
        content = [
            [Paragraph(f"<b>{title}</b>", ParagraphStyle('CalloutTitle', parent=callout_style, fontName='Helvetica-Bold', textColor=bcolor))],
            [Paragraph(text, callout_style)]
        ]
        t = Table(content, colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg),
            ('BOX', (0,0), (-1,-1), 1, bcolor),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ]))
        return t

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 1: INTRODUCCIÓN Y ARQUITECTURA
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 1: INTRODUCCIÓN Y ARQUITECTURA", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "<b>El Bodegón Pass</b> es una plataforma integral diseñada específicamente para las operaciones gastronómicas "
        "y de hospitalidad de <b>Restaurante & Bar El Bodegón</b>. Su propósito es digitalizar, automatizar y auditar con precisión "
        "quirúrgica el cumplimiento de horarios, el registro biométrico facial, el cálculo estricto de horas ordinarias y extras, "
        "así como el control legal de feriados y vacaciones conforme a la legislación laboral de Nicaragua.",
        body_style
    ))

    story.append(Paragraph("1.1 Roles de Usuario y Responsabilidades", h2_style))
    roles_data = [
        [Paragraph("Rol", table_header_style), Paragraph("Dispositivo / Acceso", table_header_style), Paragraph("Funciones y Permisos Principales", table_header_style)],
        [
            Paragraph("<b>Colaborador</b><br/>(Cocina, Salón, Barra, Operaciones)", table_cell_style),
            Paragraph("Tablet Kiosco en Entrada<br/>(URL: <code>/kiosco</code>)", table_cell_style),
            Paragraph("• Marcaje de Entrada y Salida con Reconocimiento Facial.<br/>• Registro de Inicio y Fin de Comida.<br/>• Consulta rápida de saldo de vacaciones.", table_cell_style)
        ],
        [
            Paragraph("<b>Administrador de Turno</b>", table_cell_style),
            Paragraph("Móvil / Tablet / PC Caja<br/>(URL: <code>/control</code>)", table_cell_style),
            Paragraph("• Monitoreo en vivo de personal en turno.<br/>• Verificación de ausencias o tardanzas.<br/>• Consulta de bitácora con fotografías.", table_cell_style)
        ],
        [
            Paragraph("<b>Gerencia General / Nómina</b>", table_cell_style),
            Paragraph("PC Oficina / Laptop<br/>(URL: <code>/admin/nomina</code>)", table_cell_style),
            Paragraph("• Aprobación/Rechazo de Horas Extra con PIN 2322.<br/>• Gestión de Bolsa de Horas y Salidas Anticipadas.<br/>• Emisión de Boletas de Pago y Liquidación Quincenal.<br/>• Descarga de nómina en formato Excel.", table_cell_style)
        ],
    ]
    roles_table = Table(roles_data, colWidths=[130, 140, 234])
    roles_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(roles_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("1.2 Mapa Rápido de URLs del Sistema", h2_style))
    story.append(Paragraph("• <b>/kiosco</b>: Terminal principal de marcaje biométrico interactivo para colaboradores.", bullet_style))
    story.append(Paragraph("• <b>/control</b>: Tablero de presencia y control de piso en tiempo real.", bullet_style))
    story.append(Paragraph("• <b>/admin/nomina</b>: Módulo central de nómina, aprobación de horas extra, feriados y vacaciones.", bullet_style))
    story.append(Paragraph("• <b>/admin/empleados</b>: Padrón de colaboradores, configuración de sueldos y captura facial.", bullet_style))
    story.append(Paragraph("• <b>/admin/empleados/imprimir</b>: Generador e impresor de credenciales físicas con código QR.", bullet_style))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 2: KIOSCO BIOMÉTRICO
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 2: EL KIOSCO BIOMÉTRICO (PUNTO DE MARCAJE)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Kiosco es la aplicación frontal instalada en la tablet física ubicada en el punto de acceso de colaboradores. "
        "Funciona en pantalla completa y está diseñado para una interacción ágil que no tome más de 3 a 5 segundos por trabajador.",
        body_style
    ))

    story.append(Paragraph("2.1 Métodos de Identificación", h2_style))
    story.append(Paragraph(
        "<b>1. Reconocimiento Facial Inteligente:</b> El colaborador se ubica frente a la cámara. "
        "El modelo de redes neuronales (FaceAPI) detecta los puntos de referencia faciales y reconoce de forma unívoca al trabajador en tiempo real.<br/>"
        "<b>2. Código PIN Personal (Respaldo):</b> Si el colaborador tiene gafas oscuras, mascarilla o dificultades de iluminación, "
        "puede seleccionar el teclado numérico en pantalla e ingresar su PIN personal de 4 dígitos registrado en el sistema.",
        body_style
    ))

    story.append(Paragraph("2.2 Los 4 Tipos de Marcaje Operativo", h2_style))
    marcajes_data = [
        [Paragraph("Marcaje", table_header_style), Paragraph("Color / Icono", table_header_style), Paragraph("Regla y Efecto en el Sistema", table_header_style)],
        [
            Paragraph("<b>1. ENTRADA</b>", table_cell_style),
            Paragraph("Verde Esmeralda", table_cell_style),
            Paragraph("Inicia la jornada de trabajo. Captura la hora exacta de ingreso y toma la fotografía de auditoría.", table_cell_style)
        ],
        [
            Paragraph("<b>2. INICIO COMIDA</b>", table_cell_style),
            Paragraph("Ámbar / Naranja", table_cell_style),
            Paragraph("Pausa la jornada para el almuerzo o cena oficial. Pasa el estado del empleado a 'En Descanso'.", table_cell_style)
        ],
        [
            Paragraph("<b>3. FIN COMIDA</b>", table_cell_style),
            Paragraph("Azul / Celeste", table_cell_style),
            Paragraph("Finaliza el descanso y reanuda el conteo de tiempo laboral de la jornada.", table_cell_style)
        ],
        [
            Paragraph("<b>4. SALIDA</b>", table_cell_style),
            Paragraph("Rojo / Carmín", table_cell_style),
            Paragraph("Cierra formalmente el turno. Calcula el tiempo total neto laborado (descontando comidas).", table_cell_style)
        ],
    ]
    marcajes_table = Table(marcajes_data, colWidths=[110, 110, 284])
    marcajes_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(marcajes_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("2.3 Reglas Automáticas al Marcar Salida", h2_style))
    story.append(Paragraph(
        "Al momento de pulsar <b>SALIDA</b>, el motor de asistencia ejecuta las siguientes validaciones inmediatas:",
        body_style
    ))
    story.append(Paragraph("• <b>Jornada Normal Completa (8.0 Horas):</b> Si el tiempo laborado es de 8 horas, el turno se registra como completado.", bullet_style))
    story.append(Paragraph("• <b>Salida Anticipada (Cero Tolerancia):</b> Si laboró menos de 8.0 horas (por ejemplo 7.4 hrs), el déficit exacto (0.6 hrs) se acumula limpiamente en su <b>Bolsa de Horas</b> (<code>horas_pendientes</code>) y se dispara una alerta para gerencia. <i>No se borran solicitudes de horas extra a ciegas.</i>", bullet_style))
    story.append(Paragraph("• <b>Detección de Horas Extra (>= 30 Minutos):</b> Las horas extra solo se activan a partir de 30 minutos (0.5 hrs) laborados por encima de las 8 horas base. Excedentes menores (ej. 15 minutos) se descartan y se computan intervalos enteros de media hora (0.5, 1.0, 1.5, etc.), generando automáticamente una <b>Solicitud Pendiente de Horas Extra</b>.", bullet_style))

    story.append(Spacer(1, 4))
    story.append(make_callout(
        "Para garantizar una detección facial inmediata en el Kiosco, el colaborador debe ubicarse a 50-70 cm de la cámara, "
        "mantener el rostro iluminado y evitar gorras o lentes reflectantes que tapen los ojos.",
        "CONSEJO DE AUDITORÍA BIOMÉTRICA",
        "warning"
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 3: PANEL DE MONITOREO EN VIVO
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 3: MONITOREO EN VIVO (PANEL DE CONTROL)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El panel accesible desde <code>/control</code> y <code>/admin/asistencia</code> permite a la administración y a los supervisores de turno "
        "conocer en cualquier segundo la composición real del personal dentro del restaurante.",
        body_style
    ))

    story.append(Paragraph("3.1 Estados del Personal en Piso", h2_style))
    story.append(Paragraph("• <b>Presente / Trabajando (Verde):</b> Colaborador con marcaje de Entrada activo y sin salida ni comida pendiente.", bullet_style))
    story.append(Paragraph("• <b>En Almuerzo / Comida (Ámbar):</b> Colaborador que registró inicio de comida y está disfrutando de su descanso legal.", bullet_style))
    story.append(Paragraph("• <b>Salida Registrada (Gris/Azul):</b> Colaborador que ya culminó su turno de trabajo del día.", bullet_style))
    story.append(Paragraph("• <b>Ausente / Sin Registro (Rojo):</b> Colaborador programado que aún no ha colocado su Entrada.", bullet_style))

    story.append(Paragraph("3.2 Auditoría con Fotografía de Marcaje", h2_style))
    story.append(Paragraph(
        "Cada vez que un colaborador registra un evento en el Kiosco, la cámara captura una fotografía de verificación instantánea. "
        "En la vista de asistencia, el supervisor puede hacer clic sobre el registro para visualizar la fotografía en alta resolución, "
        "la hora con segundos exactos y la dirección IP del terminal, impidiendo el 'marcaje cruzado' o suplantación de identidad.",
        body_style
    ))

    story.append(Paragraph("3.3 Campanita de Alertas en Tiempo Real", h2_style))
    story.append(Paragraph(
        "El ícono de la campana en el encabezado administrativo notifica al instante eventos críticos:",
        body_style
    ))
    story.append(Paragraph("• <b>Déficit de Jornada (Salida Anticipada):</b> Alerta generada cuando un colaborador sale antes de cumplir sus 8 horas.", bullet_style))
    story.append(Paragraph("• <b>Solicitud de Horas Extra Pendiente:</b> Alerta cuando alguien superó las 8 horas y requiere autorización de gerencia.", bullet_style))
    story.append(Paragraph("• <b>Exceso de Límite Legal (Art. 58):</b> Aviso de que un colaborador ha acumulado más de 9 horas extra en la semana.", bullet_style))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 4: GESTIÓN DE HORAS EXTRA
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 4: GESTIÓN DE HORAS EXTRA (PIN 2322 & BOLETAS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El módulo de Horas Extra en <code>/admin/nomina</code> está diseñado para garantizar que ninguna hora extra sea pagada "
        "sin previa autorización gerencial justificada.",
        body_style
    ))

    story.append(Paragraph("4.1 Flujo Operativo de Aprobación", h2_style))
    story.append(Paragraph("<b>Paso 1 - Detección:</b> El Kiosco detecta que el colaborador laboró más de 8.5 horas y genera la solicitud en estado <code>PENDIENTE</code>.", bullet_style))
    story.append(Paragraph("<b>Paso 2 - Previsualización:</b> El gerente hace clic en la solicitud y examina el desglose (hora de entrada, hora de salida, tiempo ordinario y horas solicitadas).", bullet_style))
    story.append(Paragraph("<b>Paso 3 - Validación de Seguridad con PIN Maestro:</b> Al presionar 'Aprobar' o 'Rechazar', el sistema despliega el teclado seguro solicitando el PIN <b>2322</b>. El PIN se digita sin lag y confirma la operación al instante.", bullet_style))
    story.append(Paragraph("<b>Paso 4 - Apertura Automática de Boleta Oficial:</b> Inmediatamente tras aprobar con éxito, el sistema abre la <b>Boleta Oficial de Horas Extra</b> en pantalla para revisión, respaldo o impresión inmediata.", bullet_style))

    story.append(Spacer(1, 4))
    story.append(make_callout(
        "<b>PIN Maestro de Horas Extra: 2322</b><br/>"
        "Este código es de uso restringido para propietarios y administradores generales. "
        "Protege la nómina contra autorizaciones accidentales o no autorizadas.",
        "SEGURIDAD CRÍTICA",
        "danger"
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4.2 Estructura y Folio de la Boleta Oficial", h2_style))
    story.append(Paragraph(
        "Toda autorización aprobada genera un comprobante legal con un número de folio único "
        "(ejemplo: <code>BHE-2026-0042</code>). La boleta contiene:",
        body_style
    ))
    story.append(Paragraph("• Datos de identidad del colaborador y cargo.", bullet_style))
    story.append(Paragraph("• Fecha del turno laborado y marcajes biométricos de Entrada y Salida.", bullet_style))
    story.append(Paragraph("• Horas solicitadas vs. Horas autorizadas por gerencia.", bullet_style))
    story.append(Paragraph("• Salario ordinario por hora y tarifa con recargo legal de horas extra (+100%).", bullet_style))
    story.append(Paragraph("• Monto total a pagar en Córdobas (C$) y líneas de firma para el colaborador y la empresa.", bullet_style))

    story.append(Paragraph("4.3 Pestaña 'Por Pagar' y Liquidación Quincenal", h2_style))
    story.append(Paragraph(
        "Las horas extra aprobadas pasan a la sub-pestaña <b>Por Pagar (Aprobadas)</b>. Aquí se acumulan hasta el día de pago de la quincena, "
        "donde el administrador puede emitir el recibo de liquidación consolidado y enviarlas al historial de pagadas con su recibo formal.",
        body_style
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 5: CUADRO DE NÓMINA Y REPORTES
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 5: CUADRO DE NÓMINA (REPORTE DE HORAS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El <b>Reporte de Horas</b> en <code>/admin/nomina</code> consolida todas las variables operativas en un cuadro interactivo de alto rendimiento.",
        body_style
    ))

    story.append(Paragraph("5.1 Mejoras de Navegación (Sticky & Filtros)", h2_style))
    story.append(Paragraph("• <b>Columna de Empleado Fija (Sticky Column):</b> Al desplazarse horizontalmente por las 10 columnas, la columna con el nombre y cargo permanece fija a la izquierda con sombreado, evitando confusiones de fila.", bullet_style))
    story.append(Paragraph("• <b>Encabezados y Totales Fijos (Sticky Header & Footer):</b> Al desplazarse verticalmente, la fila de títulos de columna y la fila de totales del período se mantienen siempre a la vista.", bullet_style))
    story.append(Paragraph("• <b>Filtros por Área Operativa:</b> Botones de acceso rápido para segmentar el personal en: <i>Todos, Cocina & Parrilla, Salón & Servicio, Caja & Barra, Operaciones, y Gerencia</i>.", bullet_style))
    story.append(Paragraph("• <b>Conmutador de Vistas:</b> Alterna entre <b>Tabla Detallada</b> (cuadrícula completa) y <b>Vista Tarjetas</b> (tarjetas individuales para consulta rápida en tablets y móviles).", bullet_style))

    story.append(Paragraph("5.2 Significado de las 10 Columnas del Cuadro", h2_style))
    cols_data = [
        [Paragraph("Columna", table_header_style), Paragraph("Descripción y Regla Contable", table_header_style)],
        [Paragraph("<b>Empleado y Puesto</b>", table_cell_style), Paragraph("Nombre completo, cargo oficial y badges de permisos activos.", table_cell_style)],
        [Paragraph("<b>Días Trabajados</b>", table_cell_style), Paragraph("Días con marcaje efectivo de asistencia en el rango de fechas.", table_cell_style)],
        [Paragraph("<b>Días Libres</b>", table_cell_style), Paragraph("Días de descanso semanal tomados en el período.", table_cell_style)],
        [Paragraph("<b>Horas Ordinarias</b>", table_cell_style), Paragraph("Suma de horas regulares trabajadas (hasta 8h por jornada).", table_cell_style)],
        [Paragraph("<b>Feriados Trabajados</b>", table_cell_style), Paragraph("Días feriados laborados. Generan automáticamente <b>+2 días</b> en vacaciones.", table_cell_style)],
        [Paragraph("<b>Vacaciones Pagadas</b>", table_cell_style), Paragraph("Días de vacaciones liquidados en dinero con botón <b>(+)</b> para emitir recibo.", table_cell_style)],
        [Paragraph("<b>H. Extra Aprobadas</b>", table_cell_style), Paragraph("Horas extra autorizadas con PIN 2322. Muestra alerta si excede 9h semanales.", table_cell_style)],
        [Paragraph("<b>H. Extra por Aprobar</b>", table_cell_style), Paragraph("Horas pendientes de evaluación con botón directo para revisarlas.", table_cell_style)],
        [Paragraph("<b>Horas Debidas</b>", table_cell_style), Paragraph("Déficit acumulado por salidas anticipadas (Saldo en Bolsa de Horas).", table_cell_style)],
        [Paragraph("<b>Vacaciones Restantes</b>", table_cell_style), Paragraph("Saldo neto de días disponibles con botón de auditoría legal completa.", table_cell_style)],
    ]
    cols_table = Table(cols_data, colWidths=[150, 354])
    cols_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(cols_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("5.3 Exportación a Planilla Excel Oficial", h2_style))
    story.append(Paragraph(
        "Al presionar <b>Descargar Planilla Quincenal</b>, el sistema genera automáticamente un libro Excel profesional con fórmulas, "
        "desglosando salarios ordinarios, recargos de horas extra al 100%, feriados dobles, vacaciones e INSS laboral y patronal.",
        body_style
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 6: VACACIONES, PERMISOS Y FERIADOS
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 6: VACACIONES, PERMISOS Y FERIADOS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Bodegón Pass implementa de forma estricta las disposiciones del Código del Trabajo de Nicaragua para el cálculo de descansos.",
        body_style
    ))

    story.append(Paragraph("6.1 Regla Legal de Acumulación de Vacaciones", h2_style))
    story.append(Paragraph(
        "Conforme a la ley laboral vigente, todo trabajador acumula <b>15 días de vacaciones por cada 6 meses continuos de trabajo</b> "
        "(equivalente a <b>2.5 días por cada mes completo laborado</b>).<br/>"
        "El sistema calcula la antigüedad exacta de cada colaborador a partir de su <code>fecha_ingreso</code> registrada en el expediente.",
        body_style
    ))

    story.append(Paragraph("6.2 Tratamiento de Feriados Nacionales", h2_style))
    story.append(Paragraph(
        "El restaurante cuenta con un catálogo de Feriados Oficiales (1 de Enero, Jueves y Viernes Santo, 1 de Mayo, 19 de Julio, "
        "1 y 10 de Agosto en Managua, 14 y 15 de Septiembre, 8 y 25 de Diciembre).<br/>"
        "<b>Regla de Feriado Trabajado:</b> Cuando un colaborador asiste en día feriado, el Kiosco lo detecta de forma automática: "
        "el turno se computa como feriado trabajado y el sistema <b>abona 2 días adicionales de descanso a su saldo de vacaciones</b> "
        "como compensación legal.",
        body_style
    ))

    story.append(Paragraph("6.3 Pago de Vacaciones en Dinero", h2_style))
    story.append(Paragraph(
        "Si la empresa y el trabajador acuerdan liquidar vacaciones no gozadas en dinero:<br/>"
        "1. En el Cuadro de Nómina, presionar el botón <b>(+)</b> en la columna 'Vacaciones Pagadas'.<br/>"
        "2. Ingresar los días a liquidar (ej. 3.0 días) y la fecha de corte.<br/>"
        "3. El sistema calcula el monto en C$ según el salario promedio diario y emite el <b>Recibo Oficial de Pago de Vacaciones</b> "
        "con número correlativo, descontando de forma inmediata los días del saldo disponible.",
        body_style
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 7: GESTIÓN DE EMPLEADOS Y CARNETS
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 7: EXPEDIENTES, ROSTROS Y CARNETS QR", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("7.1 Expediente del Colaborador (`/admin/empleados`)", h2_style))
    story.append(Paragraph(
        "Permite dar de alta a nuevos trabajadores registrando: Nombre, Apellidos, Cédula, Cargo Oficial, Área Operativa, "
        "Salario Base por Hora o Mensual, y PIN personal de 4 dígitos.",
        body_style
    ))

    story.append(Paragraph("7.2 Enrolamiento Facial Biométrico", h2_style))
    story.append(Paragraph(
        "Para enrolar el rostro de un colaborador:<br/>"
        "1. En el perfil del empleado, presionar <b>'Capturar Rostro'</b>.<br/>"
        "2. Solicitar al colaborador mirar fijamente a la cámara con expresión neutral.<br/>"
        "3. El sistema extrae el vector biométrico (descriptor de 128 dimensiones) y lo almacena de forma segura y encriptada en la base de datos.",
        body_style
    ))

    story.append(Paragraph("7.3 Generación e Impresión de Carnets con QR", h2_style))
    story.append(Paragraph(
        "Accediendo a <code>/admin/empleados/imprimir</code>, la administración puede generar las credenciales físicas de la empresa "
        "con formato carnet (fotografía, logotipo, cargo, cédula y código QR de acceso rápido), listas para plastificar o portar en gafete.",
        body_style
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 8: BOLSA DE HORAS Y CONTROL GERENCIAL
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 8: BOLSA DE HORAS Y CONTROL GERENCIAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "La <b>Bolsa de Horas</b> (campo <code>horas_pendientes</code>) es el mecanismo de control para gestionar las salidas "
        "anticipadas y tiempos pendientes de reposición sin incurrir en deducciones arbitrarias.",
        body_style
    ))

    story.append(Paragraph("8.1 Principio de Control Gerencial (Cero Borrados Silenciosos)", h2_style))
    story.append(Paragraph(
        "En versiones anteriores, el sistema recortaba o eliminaba de forma automática las solicitudes de horas extra pendientes "
        "cuando un colaborador salía antes de su turno. <b>Bajo el nuevo esquema de Control Gerencial:</b>",
        body_style
    ))
    story.append(Paragraph("• El Kiosco <b>nunca toca ni elimina</b> las horas extra solicitadas por el colaborador.", bullet_style))
    story.append(Paragraph("• Toda salida menor a 8.0 horas genera un registro limpio de déficit que se acumula en su Bolsa de Horas.", bullet_style))
    story.append(Paragraph("• El gerente recibe la alerta y puede decidir en el panel cuál de las 3 vías aplicar:", bullet_style))
    story.append(Paragraph("   <b>A. Justificar / Exonerar:</b> Si la salida anticipada obedeció a causa médica o cierre autorizado.", bullet_style))
    story.append(Paragraph("   <b>B. Cargar a Deuda:</b> Mantener las horas en Bolsa para ser repuestas en un turno futuro.", bullet_style))
    story.append(Paragraph("   <b>C. Cruzar con Horas Extra:</b> Descontar conscientemente del saldo de horas extra aprobadas con respaldo documentado.", bullet_style))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # SECCIÓN 9: PREGUNTAS FRECUENTES (FAQ)
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SECCIÓN 9: PREGUNTAS FRECUENTES Y SOPORTE", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    faq_items = [
        ("¿Qué hacer si el Kiosco no reconoce el rostro de un colaborador?",
         "El colaborador puede marcar inmediatamente pulsando el botón 'Ingresar con PIN' e introduciendo sus 4 dígitos. Posteriormente, el administrador puede ir a /admin/empleados y re-capturar su fotografía facial con mejor iluminación."),
        ("¿Por qué no se generó solicitud de horas extra si el empleado salió 15 minutos tarde?",
         "Por política operativa y legal, las horas extra se computan a partir de 30 minutos (0.5 hrs) laborados por encima de las 8 horas normales. Tiempos inferiores a media hora se descartan para evitar cobros de tiempos muertos o demoras involuntarias."),
        ("¿Cómo se reimprime una Boleta de Horas Extra o de Vacaciones?",
         "En /admin/nomina, pestaña 'Horas Extra' sub-pestaña 'Historial' o en el Cuadro de Nómina haciendo clic sobre el badge con el número de folio (ej. BHE-2026-0012). Se abrirá la boleta con el botón 'Imprimir' directo."),
        ("¿Qué significa la alerta '⚠️ >9h sem (Art. 58)' en una solicitud de horas extra?",
         "Indica que con esa aprobación, el colaborador superaría el límite máximo de 9 horas extra semanales establecido en el Artículo 58 del Código del Trabajo de Nicaragua. Se recomienda precaución o reasignación de turnos."),
        ("¿Cómo descargar el reporte de nómina en Excel para la quincena?",
         "En /admin/nomina, arriba del cuadro principal, haga clic en 'Planilla Quincenal' y elija 'Quincena Anterior' o 'Quincena Actual'. El archivo Excel se descargará de inmediato con formato corporativo."),
    ]

    for q, a in faq_items:
        story.append(Paragraph(f"<b>P: {q}</b>", body_bold))
        story.append(Paragraph(f"<b>R:</b> {a}", body_style))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=0.5, color=COLOR_BORDER, spaceBefore=6, spaceAfter=10))
    story.append(Paragraph(
        "<b>Restaurante & Bar El Bodegón</b> • Sistema El Bodegón Pass v2.0 • Desarrollado para Control Operativo y Laboral Integral.",
        ParagraphStyle('EndNotice', parent=body_style, alignment=1, fontSize=8, textColor=COLOR_MUTED)
    ))

    # Construir documento PDF con NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Manual generado exitosamente en: {output_path}")

if __name__ == '__main__':
    # Salidas: Guardar en frontend/public para descarga web directa y en la raíz del proyecto
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '../../'))
    
    public_target = os.path.join(project_root, 'frontend/public/manual_el_bodegon_pass.pdf')
    root_target = os.path.join(project_root, 'Manual_de_Usuario_El_Bodegon_Pass.pdf')

    create_manual_pdf(public_target)
    create_manual_pdf(root_target)
