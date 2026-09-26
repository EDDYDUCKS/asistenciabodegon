import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

# ─────────────────────────────────────────────────────────────────────────────
# PALETA DE IMPRESIÓN PROFESIONAL BLANCO Y NEGRO (CERO DESPERDICIO DE TÓNER)
# Optimizada al 100% para impresoras láser y de inyección monocromáticas.
# Sin bloques sólidos oscuros, sin fondos negros pesados, máxima nitidez y contraste.
# ─────────────────────────────────────────────────────────────────────────────
BW_BLACK        = colors.HexColor('#000000') # Negro puro para texto y títulos
BW_DARK         = colors.HexColor('#1A1A1A') # Gris casi negro de alto contraste
BW_MUTED        = colors.HexColor('#4A4A4A') # Gris oscuro legible
BW_BORDER_HEAVY = colors.HexColor('#000000') # Bordes negros sólidos principales
BW_BORDER_MID   = colors.HexColor('#444444') # Bordes intermedios nítidos
BW_BORDER_LIGHT = colors.HexColor('#999999') # Líneas divisoras sutiles
BW_GRAY_TINT    = colors.HexColor('#F2F2F2') # Gris tenue 5% (solo para resaltar encabezados)
BW_WHITE        = colors.HexColor('#FFFFFF') # Fondo blanco puro libre de tinta

class NumberedCanvasBW(canvas.Canvas):
    """
    Canvas en dos pasadas para calcular dinámicamente el número total de páginas
    y estampar encabezado institucional y pie con 'Página X de Y' en blanco y negro nítido.
    """
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
        # La portada (Pág. 1) no lleva encabezado ni pie
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(BW_BLACK)

        # Encabezado (Header en negro nítido con línea limpia)
        self.drawString(54, letter[1] - 34, "EL BODEGÓN PASS  •  MANUAL OFICIAL DE USUARIO Y OPERACIONES")
        self.setFont("Helvetica-Bold", 8)
        self.drawRightString(letter[0] - 54, letter[1] - 34, "EDICIÓN IMPRESA MONOCROMÁTICA")

        self.setStrokeColor(BW_BLACK)
        self.setLineWidth(0.75)
        self.line(54, letter[1] - 40, letter[0] - 54, letter[1] - 40)

        # Pie de página (Footer limpio sin fondos)
        self.line(54, 45, letter[0] - 54, 45)
        self.setFont("Helvetica", 8)
        self.setFillColor(BW_DARK)
        self.drawString(54, 32, "Restaurante & Bar El Bodegón  •  Control de Asistencia Biometría QR y Nómina")
        page_str = f"Página {self._pageNumber} de {total_pages}"
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(BW_BLACK)
        self.drawRightString(letter[0] - 54, 32, page_str)

        self.restoreState()

def build_pdf_manual(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Tipografías y Jerarquías de Texto en Negro Puro
    cover_title_style = ParagraphStyle(
        'CoverTitleBW',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=26,
        leading=30,
        textColor=BW_BLACK,
        alignment=1,
    )

    cover_sub_style = ParagraphStyle(
        'CoverSubBW',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=BW_DARK,
        alignment=1,
    )

    h1_style = ParagraphStyle(
        'H1_BW',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=BW_BLACK,
        spaceBefore=10,
        spaceAfter=3,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        'H2_BW',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=BW_BLACK,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        'Body_BW',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=BW_BLACK,
        spaceBefore=1,
        spaceAfter=4,
    )

    body_bold = ParagraphStyle(
        'BodyBold_BW',
        parent=body_style,
        fontName='Helvetica-Bold',
    )

    bullet_style = ParagraphStyle(
        'Bullet_BW',
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-10,
        spaceBefore=1,
        spaceAfter=2,
    )

    step_style = ParagraphStyle(
        'Step_BW',
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-10,
        spaceBefore=2,
        spaceAfter=3,
    )

    callout_text = ParagraphStyle(
        'CalloutText_BW',
        parent=body_style,
        fontSize=8.2,
        leading=11.5,
        textColor=BW_BLACK,
    )

    table_th_style = ParagraphStyle(
        'Th_BW',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=BW_BLACK,
    )

    table_td_style = ParagraphStyle(
        'Td_BW',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=BW_BLACK,
    )

    story = []

    def box_alert(text, title="NOTA IMPORTANTE", style="info"):
        """Recuadro de alerta en blanco y negro con borde nítido, sin fondos de tinta oscura."""
        content = [
            [Paragraph(f"<b>[ {title.upper()} ]</b>", ParagraphStyle('BoxTBW', parent=callout_text, fontName='Helvetica-Bold', textColor=BW_BLACK, fontSize=8.5))],
            [Paragraph(text, callout_text)]
        ]
        t = Table(content, colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), BW_WHITE),
            ('BOX', (0,0), (-1,-1), 1.25, BW_BLACK),
            ('LINEBELOW', (0,0), (-1,0), 0.75, BW_BLACK),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    def ui_mockup_box(title, rows, footer_note=None):
        """Genera un componente visual vectorial que representa una pantalla en blanco y negro sin gastar tinta."""
        tbl_data = []
        tbl_data.append([Paragraph(f"<b>PANTALLA / INTERFAZ: {title.upper()}</b>", ParagraphStyle('MockTBW', parent=callout_text, fontName='Helvetica-Bold', textColor=BW_BLACK, fontSize=8.5))])
        for r in rows:
            tbl_data.append([Paragraph(r, callout_text)])
        if footer_note:
            tbl_data.append([Paragraph(f"<i>* {footer_note}</i>", ParagraphStyle('MockFBW', parent=callout_text, fontName='Helvetica-Oblique', textColor=BW_MUTED, fontSize=7.5))])
        
        t = Table(tbl_data, colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), BW_GRAY_TINT),
            ('BACKGROUND', (0,1), (-1,-1), BW_WHITE),
            ('BOX', (0,0), (-1,-1), 1.25, BW_BLACK),
            ('LINEBELOW', (0,0), (-1,0), 1, BW_BLACK),
            ('INNERGRID', (0,1), (-1,-1), 0.5, BW_BORDER_LIGHT),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    # ═════════════════════════════════════════════════════════════════════════
    # 1. PORTADA EJECUTIVA EN BLANCO Y NEGRO (CERO MANCHAS DE TÓNER)
    # ═════════════════════════════════════════════════════════════════════════
    banner_data = [
        [Paragraph("<font size=10><b>RESTAURANTE & BAR EL BODEGÓN  •  EDICIÓN OPERATIVA 2026</b></font>", ParagraphStyle('CTop', parent=cover_sub_style, fontName='Helvetica-Bold', fontSize=10, textColor=BW_BLACK, alignment=1))],
        [Spacer(1, 4)],
        [Paragraph("EL BODEGÓN PASS", cover_title_style)],
        [Spacer(1, 3)],
        [Paragraph("MANUAL OFICIAL DE USUARIO Y OPERACIONES", ParagraphStyle('CSub1', parent=cover_sub_style, fontName='Helvetica-Bold', fontSize=13, leading=16, textColor=BW_BLACK, alignment=1))],
        [Paragraph("Guía Práctica Paso a Paso para el Administrador de Turno y el Jefe Propietario", ParagraphStyle('CSub2', parent=cover_sub_style, fontName='Helvetica', fontSize=10, leading=14, textColor=BW_DARK, alignment=1))],
        [Spacer(1, 4)],
        [Paragraph("Control de Asistencia Biometría QR • Nómina Quincenal • Horas Extra (PIN 2322) • Vacaciones • Feriados", ParagraphStyle('CSub3', parent=cover_sub_style, fontName='Helvetica-Bold', fontSize=8, textColor=BW_BLACK, alignment=1))],
    ]
    banner_table = Table(banner_data, colWidths=[504])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BW_WHITE),
        ('BOX', (0,0), (-1,-1), 2, BW_BLACK),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 20))

    # Ficha técnica de la portada en recuadro negro nítido
    cover_meta = [
        [Paragraph("<b>¿Para quién es este manual?</b>", body_bold), Paragraph("Para el Administrador de Turno, Supervisores, Cajeros, Gerencia General y Propietario del negocio.", body_style)],
        [Paragraph("<b>Propósito:</b>", body_bold), Paragraph("Explicar con instrucciones 100% sencillas y operativas cómo funciona el Kiosco con carnet QR, cómo revisar la asistencia en vivo, cómo previsualizar y autorizar horas extra con el PIN Maestro 2322, cómo liquidar vacaciones y cómo descargar la planilla en Excel.", body_style)],
        [Paragraph("<b>Enfoque:</b>", body_bold), Paragraph("Instrucciones paso a paso (1, 2, 3) a prueba de errores, diseñadas para que cualquier persona sin conocimientos de computación pueda dominar el sistema en pocos minutos.", body_style)],
        [Paragraph("<b>Claves Secretas del Sistema:</b>", body_bold), Paragraph("Contiene los dos códigos de seguridad oficiales:<br/>• <b>PIN 4512</b>: Acceso Administrativo para abrir el sistema en PC o celular.<br/>• <b>PIN 2322</b>: PIN Maestro de Gerencia para autorizar o rechazar horas extra.<br/><i>Nota: Los colaboradores NO tienen PIN; marcan exclusivamente con su Carnet QR único.</i>", body_style)],
    ]
    cover_meta_tbl = Table(cover_meta, colWidths=[140, 364])
    cover_meta_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BW_WHITE),
        ('BOX', (0,0), (-1,-1), 1.25, BW_BLACK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BW_BORDER_LIGHT),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(cover_meta_tbl)
    story.append(Spacer(1, 24))

    story.append(Paragraph(
        "<i>«Este manual está diseñado para impresión en blanco y negro de máxima nitidez. Cada botón, pantalla y proceso está explicado exactamente como funciona en el restaurante sin enredos técnicos.»</i>",
        ParagraphStyle('QuotesBW', parent=body_style, fontName='Helvetica-Oblique', alignment=1, textColor=BW_MUTED)
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # 2. ÍNDICE GENERAL DETALLADO
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("ÍNDICE GENERAL DEL MANUAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    toc_items = [
        ("Capítulo 1", "¿Cómo funciona El Bodegón Pass y quién hace cada tarea?", "Pág. 3"),
        ("Capítulo 2", "La Tablet de la Entrada (El Kiosco con Carnets QR)", "Pág. 4"),
        ("Capítulo 3", "El Panel de Control en Vivo (Supervisión del restaurante)", "Pág. 6"),
        ("Capítulo 4", "Previsualización y Aprobación de Horas Extra (PIN Maestro 2322)", "Pág. 7"),
        ("Capítulo 5", "El Cuadro de Nómina (Reporte de Horas, Filtros y Planilla Excel)", "Pág. 9"),
        ("Capítulo 6", "Vacaciones, Permisos y Feriados (Cálculo legal de Nicaragua)", "Pág. 10"),
        ("Capítulo 7", "Registro de Empleados Nuevos e Impresión de Carnets QR", "Pág. 11"),
        ("Capítulo 8", "La Bolsa de Horas (Qué hacer cuando alguien sale temprano)", "Pág. 12"),
        ("Capítulo 9", "Control de Compras y Gastos Diarios (Bodegón Control)", "Pág. 13"),
        ("Capítulo 10", "Seguridad del Sistema, Respaldos y Limpieza de Datos", "Pág. 13"),
        ("Capítulo 11", "¿Qué hago si...? (Guía rápida para resolver los 10 problemas típicos)", "Pág. 14"),
        ("Capítulo 12", "Lista de Chequeo Diaria y Quincenal del Administrador y del Jefe", "Pág. 15"),
    ]
    toc_table_data = []
    for cap, desc, pg in toc_items:
        toc_table_data.append([
            Paragraph(f"<b>{cap}</b>", body_bold),
            Paragraph(desc, body_style),
            Paragraph(pg, body_bold)
        ])
    toc_tbl = Table(toc_table_data, colWidths=[80, 360, 64])
    toc_tbl.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 0.5, BW_BORDER_LIGHT),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(toc_tbl)
    story.append(Spacer(1, 10))

    story.append(box_alert(
        "<b>Cómo leer este manual:</b> Cada vez que veas un texto en negrita entre corchetes como <b>[ ENTRADA ]</b> o <b>[ EVALUAR ]</b>, "
        "significa que es un botón de la pantalla que debes tocar con el dedo en la tablet o hacer clic con el ratón en la computadora.",
        "CONSEJO DE LECTURA",
        "info"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 1: INTRODUCCIÓN GENERAL Y ARQUITECTURA
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 1: CÓMO FUNCIONA EL BODEGÓN PASS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1.1 ¿Qué es el sistema y para qué sirve en el restaurante?", h2_style))
    story.append(Paragraph(
        "<b>El Bodegón Pass</b> es el sistema digital que controla la asistencia, los horarios y los pagos de los colaboradores "
        "de <b>Restaurante & Bar El Bodegón</b>. Su objetivo es que la administración y el jefe tengan el control exacto de quién vino a trabajar, "
        "a qué hora llegó, a qué hora comió, a qué hora se fue y cuántas horas extra se le deben pagar de forma justa y legal.",
        body_style
    ))
    story.append(Paragraph(
        "El sistema tiene dos partes principales que debes distinguir claramente:",
        body_style
    ))
    story.append(Paragraph("• <b>La Tablet de la Entrada (El Kiosco):</b> Es la pantalla táctil montada en la pared por donde entran los colaboradores. Solo sirve para que los cocineros, meseros, bartenders y personal de limpieza marquen su asistencia acercando su Carnet con Código QR a la cámara.", bullet_style))
    story.append(Paragraph("• <b>El Panel de Administración (En la Computadora o Celular):</b> Es la pantalla que usan el Administrador y el Jefe para revisar quién está trabajando, autorizar horas extra, emitir boletas de pago, ver vacaciones y descargar la planilla de pago en Excel.", bullet_style))

    story.append(Paragraph("1.2 Las Únicas Dos Claves de Seguridad que Existen en el Negocio", h2_style))
    story.append(Paragraph(
        "Para que nadie ajeno mueva la información de la empresa, el sistema está protegido con <b>únicamente dos claves numéricas oficiales</b>:",
        body_style
    ))

    story.append(ui_mockup_box(
        "LAS 2 CLAVES SECRETAS DE EL BODEGÓN",
        [
            "🔑 <b>PIN 4512 (Para entrar al Panel de Administración):</b> Lo pone el Administrador o el Jefe en la computadora de caja o en su celular para abrir el sistema. Abre el menú de empleados, asistencia y nómina.",
            "⭐ <b>PIN 2322 (PIN Maestro de Horas Extra):</b> Es la clave de máxima autoridad que solo el Jefe o la Gerencia General conocen. Se escribe cada vez que se va a autorizar o rechazar una hora extra en nómina para generar la boleta oficial.",
            "🚫 <b>ACLARACIÓN IMPORTANTE SOBRE LOS TRABAJADORES:</b> Los colaboradores (meseros, cocineros, etc.) <b>NO TIENEN NINGÚN PIN</b>. Marcan exclusivamente acercando su <b>Carnet Oficial con Código QR</b> frente a la cámara de la tablet. No tienen que memorizar contraseñas."
        ],
        "Nunca anotes el PIN 4512 ni el PIN 2322 a la vista de los clientes ni los compartas con el personal operativo."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("1.3 ¿Qué le toca hacer al Administrador y qué le toca hacer al Jefe?", h2_style))
    roles_matrix = [
        [Paragraph("Tarea Operativa", table_th_style), Paragraph("¿Le toca al Administrador de Turno?", table_th_style), Paragraph("¿Le toca al Jefe / Propietario?", table_th_style)],
        [Paragraph("Revisar que la Tablet esté encendida y limpia", table_td_style), Paragraph("<b>SÍ</b> (Al abrir el restaurante en su turno)", table_td_style), Paragraph("Supervisa aleatoriamente", table_td_style)],
        [Paragraph("Monitorear quién vino y quién falta", table_td_style), Paragraph("<b>SÍ</b> (En la pantalla de Asistencia de Hoy)", table_td_style), Paragraph("Revisa el resumen general", table_td_style)],
        [Paragraph("Cerrar turnos a quienes olvidaron marcar salida", table_td_style), Paragraph("<b>SÍ</b> (Tocando 'Cerrar 11:00 PM' en la campanita)", table_td_style), Paragraph("Revisa justificaciones", table_td_style)],
        [Paragraph("Aprobar Horas Extra con el PIN 2322", table_td_style), Paragraph("Revisa la previsualización y el turno", table_td_style), Paragraph("<b>SÍ</b> (Es quien pone el PIN 2322 y autoriza)", table_td_style)],
        [Paragraph("Emitir Boletas de Vacaciones en dinero", table_td_style), Paragraph("Llena los días que pide el muchacho", table_td_style), Paragraph("<b>SÍ</b> (Firma y autoriza la entrega del dinero)", table_td_style)],
        [Paragraph("Descargar el Excel para pagar la quincena", table_td_style), Paragraph("Revisa que los días trabajados estén bien", table_td_style), Paragraph("<b>SÍ</b> (Descarga el archivo y realiza los pagos)", table_td_style)],
    ]
    roles_tbl = Table(roles_matrix, colWidths=[160, 170, 174])
    roles_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BW_GRAY_TINT),
        ('GRID', (0,0), (-1,-1), 0.5, BW_BLACK),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(roles_tbl)

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 2: KIOSCO CON CARNET QR
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 2: LA TABLET DE LA ENTRADA (EL KIOSCO CON CARNET QR)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "En la entrada del restaurante, en la pared, está instalada la Tablet del Kiosco. "
        "Esta pantalla funciona como un <b>lector óptico inteligente</b>. Cada colaborador tiene su <b>Carnet Oficial con Código QR individual</b> "
        "(impreso en su gafete o guardado en su celular).",
        body_style
    ))

    # Mockup visual de la Tablet
    story.append(ui_mockup_box(
        "ASÍ SE VE LA PANTALLA DE LA TABLET DE ENTRADA",
        [
            "📷 <b>ÁREA DEL ESCÁNER ÓPTICO (Al centro):</b> Muestra la cámara en vivo. El trabajador acerca su carnet QR a 15-20 cm. En 1 segundo el Kiosco lee el código, saluda con su nombre: <i>'¡Hola, Xiomara Castillo! — Mesera'</i> y toma una fotografía biométrica en secreto.",
            "🟢 <b>BOTÓN [ ENTRADA ]:</b> Se presiona únicamente al llegar al restaurante a iniciar el turno de trabajo.",
            "🟠 <b>BOTÓN [ INICIO COMIDA ]:</b> Se presiona cuando el muchacho se sienta a comer su almuerzo o cena.",
            "🔵 <b>BOTÓN [ FIN COMIDA ]:</b> Se presiona en cuanto termina de comer para volver a sus labores de inmediato.",
            "🔴 <b>BOTÓN [ SALIDA ]:</b> Se presiona al quitarse el uniforme e irse definitivamente para la casa.",
            "🔍 <b>BOTÓN INFERIOR [ Consultar Mis Horas ]:</b> Permite que el trabajador acerque su QR para ver cuántas horas lleva trabajadas en el mes."
        ],
        "La Tablet toma una fotografía instantánea en secreto en cada marcaje para comprobar que la persona que muestra el carnet es quien realmente está marcando."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("2.1 Cómo Marcar Asistencia Paso a Paso (Para los Muchachos)", h2_style))
    story.append(Paragraph("<b>Paso 1: Mostrar el Carnet QR a la cámara:</b> El trabajador acerca el código QR de su gafete (o de la pantalla de su celular) a una distancia de 15 a 20 centímetros frente a la cámara de la tablet.", step_style))
    story.append(Paragraph("<b>Paso 2: Reconocimiento inmediato & Foto biométrica:</b> En 1 segundo el Kiosco leerá el código, mostrará su nombre arriba en letras grandes y capturará la foto de verificación.", step_style))
    story.append(Paragraph("<b>Paso 3: Tocar el botón que corresponda:</b>", step_style))
    story.append(Paragraph("   • Si va entrando a trabajar: Toca el botón <b>[ ENTRADA ]</b>.", bullet_style))
    story.append(Paragraph("   • Si va a almorzar o cenar: Toca el botón <b>[ INICIO COMIDA ]</b>.", bullet_style))
    story.append(Paragraph("   • Si terminó de comer: Toca el botón <b>[ FIN COMIDA ]</b>.", bullet_style))
    story.append(Paragraph("   • Si ya terminó su jornada: Toca el botón <b>[ SALIDA ]</b>.", bullet_style))
    story.append(Paragraph("<b>Paso 4: Confirmación auditiva y visual:</b> La tablet emitirá un pitido alegre, la pantalla dirá: <i>'¡Marcaje Registrado con Éxito!'</i> y mostrará el balance de horas cumplidas. Listo, el trabajador ya puede pasar a su área.", step_style))

    story.append(Spacer(1, 6))
    story.append(Paragraph("2.2 ¿Qué hacer si un carnet está arrugado o no se lee?", h2_style))
    story.append(Paragraph(
        "Si la cámara tarda en leer el carnet de un muchacho:<br/>"
        "1. Asegúrate de que no esté tapando con los dedos ninguna esquina del cuadro negro del QR.<br/>"
        "2. Mantén el carnet firme sin moverlo a unos 15 centímetros de la pantalla.<br/>"
        "3. Si el carnet físico de papel se dobló o se manchó con comida, el Administrador puede <b>imprimirle uno nuevo en 10 segundos</b> desde el menú 'Empleados' ➔ 'Imprimir Carnets', o mandarle la foto del QR a su WhatsApp para que lo marque desde la pantalla de su teléfono.",
        body_style
    ))

    story.append(PageBreak())

    story.append(Paragraph("2.3 Las Dos Reglas de Oro que el Kiosco Calcula Solo", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Tanto el Administrador como el Jefe deben tener clarísimas estas dos reglas para saber cómo calcula el sistema las horas de la gente:",
        body_style
    ))

    story.append(ui_mockup_box(
        "REGLA 1: SI SALE TEMPRANO, CADA MINUTO QUE FALTE SE GUARDA EN SU BOLSA DE HORAS",
        [
            "• La jornada obligatoria de trabajo en El Bodegón es de <b>8 horas completas</b>.",
            "• Si un muchacho marca salida y solo trabajó <b>7 horas con 30 minutos</b> (le faltó media hora), el sistema no le borra nada a escondidas.",
            "• El sistema anota automáticamente: <b>Déficit: 0.5 horas (30 minutos debidos)</b>.",
            "• Ese tiempo que debe se suma a su cuenta personal de <b>Bolsa de Horas</b> y le avisa al Jefe con una alerta para que decida si lo perdona (por ejemplo si salió por cita médica) o si se le compensa automáticamente con futuras horas extra."
        ],
        "Cero tolerancia: no hay minutos de gracia. Cualquier salida antes de las 8 horas exactas queda registrada."
    ))
    story.append(Spacer(1, 8))

    story.append(ui_mockup_box(
        "REGLA 2: LAS HORAS EXTRA SOLO EMPIEZAN A CONTAR A PARTIR DE 30 MINUTOS DESPUÉS DE SU HORA",
        [
            "• Para evitar que la gente cobre horas extra por quedarse 10 minutos platicando o cambiándose el mandil, las horas extra <b>solo se activan a partir de 30 minutos (0.5 hrs) laborados sobre las 8 horas normales</b>.",
            "• <b>Ejemplo A:</b> Si trabajó <b>8 horas y 15 minutos</b>: No hay horas extra. Su turno cierra en 8 horas normales completas.",
            "• <b>Ejemplo B:</b> Si trabajó <b>8 horas y 35 minutos</b>: Ya pasó la media hora. El sistema le genera automáticamente una solicitud de <b>0.5 horas extra (media hora)</b>.",
            "• <b>Ejemplo C:</b> Si trabajó <b>9 horas y 10 minutos</b>: Hizo una hora completa más. El sistema le genera una solicitud de <b>1.0 hora extra</b>.",
            "• Las horas extra siempre se cuentan en bloques limpios de media hora: 0.5h, 1.0h, 1.5h, 2.0h, etc."
        ],
        "Ninguna hora extra se paga sola. Todas van a la bandeja de pendientes para que el Jefe las revise y las autorice con su PIN Maestro 2322."
    ))

    story.append(Spacer(1, 10))
    story.append(box_alert(
        "<b>Consejo para el Administrador:</b> Al empezar tu turno por la mañana o por la tarde, pasa un paño suave por el lente de la cámara "
        "de la tablet. En los restaurantes el vapor y la grasa del ambiente empañan el lente y eso hace que la cámara tarde en enfocar los carnets.",
        "MANTENIMIENTO DIARIO DEL KIOSCO",
        "warning"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 3: PANEL DE MONITOREO EN TIEMPO REAL
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 3: EL PANEL DE CONTROL EN VIVO", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Desde la computadora de caja o desde tu teléfono celular puedes ver exactamente qué está pasando en el restaurante "
        "en cualquier segundo del día.",
        body_style
    ))

    story.append(Paragraph("3.1 Cómo Entrar al Sistema", h2_style))
    story.append(Paragraph("1. Abre el navegador de internet en la computadora o celular y abre El Bodegón Pass.", step_style))
    story.append(Paragraph("2. La pantalla te pedirá el PIN de acceso administrativo. Escribe <b>4512</b>.", step_style))
    story.append(Paragraph("3. ¡Listo! Ya estás adentro del panel general del restaurante.", step_style))

    story.append(Paragraph("3.2 La Pantalla de Asistencia de Hoy (El Semáforo del Personal)", h2_style))
    story.append(Paragraph(
        "En el menú de arriba, haz clic en <b>'Asistencia'</b>. Verás la lista de todo el personal dividida en 4 estados muy claros:",
        body_style
    ))

    story.append(ui_mockup_box(
        "LOS 4 ESTADOS DE LA ASISTENCIA DE HOY",
        [
            "• <b>PRESENTES EN TURNO:</b> Son los muchachos que ya escanearon su carnet en Entrada y están en la cocina, salón o barra trabajando.",
            "• <b>EN COMIDA / ALMUERZO:</b> Son los colaboradores que marcaron Inicio de Comida. La pantalla te muestra cuántos minutos llevan comiendo para que no se pasen de su tiempo.",
            "• <b>SALIDA REGISTRADA:</b> Son los trabajadores que ya terminaron su turno y marcaron su salida formal para irse a su casa.",
            "• <b>AUSENTES / NO HAN LLEGADO:</b> Empleados que debían entrar a trabajar y no han puesto su Entrada. Te sirve para llamarlos de inmediato a ver qué pasó."
        ],
        "Al hacer clic sobre el nombre de cualquier persona, puedes ver la foto exacta que le tomó la tablet al momento de marcar."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("3.3 La Campanita de Alertas (Esquina Superior Derecha)", h2_style))
    story.append(Paragraph(
        "Arriba a la derecha hay un ícono de campana. Si tiene un número, hazle clic para ver avisos urgentes:",
        body_style
    ))
    story.append(Paragraph("• <b>Aviso de Salida Temprano:</b> Te avisa si alguien marcó salida antes de tiempo y cuántas horas debe a la Bolsa.", bullet_style))
    story.append(Paragraph("• <b>Aviso de Horas Extra:</b> Te avisa si alguien se quedó trabajando después de su hora.", bullet_style))
    story.append(Paragraph("• <b>Aviso de Turno Abierto:</b> Te avisa si alguien se fue a su casa y se le olvidó marcar salida.", bullet_style))

    story.append(Paragraph("3.4 ¿Qué hacer si alguien se fue a su casa sin marcar salida?", h2_style))
    story.append(Paragraph(
        "Pasa seguido: un mesero termina cansado a las 10:30 PM y se va directo a su casa sin tocar la tablet. "
        "A las 11:00 de la noche la campanita se pondrá con aviso diciendo: <i>'Registro Incompleto'</i>.<br/>"
        "<b>Para resolverlo en 2 segundos:</b><br/>"
        "1. Haz clic en la <b>campanita</b> arriba a la derecha.<br/>"
        "2. Verás la alerta con el nombre del muchacho.<br/>"
        "3. Pulsa el botón que dice <b>[ 🌙 Cerrar 11:00 PM ]</b>.<br/>"
        "4. El sistema le pondrá la hora de salida a las 11:00 PM de esa noche y el problema quedará resuelto, evitando que el reloj siga corriendo al día siguiente.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 4: GESTIÓN Y PREVISUALIZACIÓN DE HORAS EXTRA (PIN 2322)
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 4: PREVISUALIZACIÓN Y APROBACIÓN DE HORAS EXTRA (PIN 2322)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Este capítulo es exclusivo para el <b>Jefe / Propietario</b> y para el <b>Administrador</b>. "
        "Aquí se audita, se previsualiza la evidencia biométrica y se autoriza o rechaza el pago de cualquier hora extra trabajada en el restaurante.",
        body_style
    ))

    story.append(Paragraph("4.1 Dónde se Revisan las Horas Extra", h2_style))
    story.append(Paragraph("1. En la barra de arriba, haz clic en la pestaña <b>'Nómina'</b>.", step_style))
    story.append(Paragraph("2. En los botones de abajo, haz clic en la segunda pestaña que dice <b>'Horas Extra'</b>.", step_style))
    story.append(Paragraph("3. Entrarás a la lista de <b>'Solicitudes Pendientes'</b> con un indicador que muestra cuántas solicitudes hay por resolver.", step_style))

    story.append(ui_mockup_box(
        "CÓMO SE VE LA FILA DE SOLICITUD PENDIENTE",
        [
            "👤 <b>Colaborador:</b> Xiomara Castillo • Cargo: Mesera / Atención",
            "📅 <b>Fecha del Turno:</b> Sábado 20 de Septiembre • <b>Horas Extra Solicitadas: +1.0 hrs</b>",
            "👁️ <b>BOTÓN [ Previsualizar ]:</b> Abre el cajón de auditoría biométrica y desglose completo del turno.",
            "✍️ <b>BOTÓN [ Evaluar ]:</b> Abre la previsualización y el formulario para aprobar o rechazar con el PIN 2322.",
            "⚠️ <b>ALERTA DE SEGURIDAD (Si aparece):</b> <code>[ >9h sem (Art. 58 CT) ]</code> avisa si la persona ya sobrepasó el límite legal de 9 horas semanales."
        ],
        "Toda hora extra cuenta con previsualización completa antes de tomar una decisión financiera."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4.2 La Nueva Previsualización Detallada (Antes de Aprobar o Rechazar)", h2_style))
    story.append(Paragraph(
        "Para que el Administrador o el Jefe nunca aprueben horas 'a ciegas', al pulsar <b>[ Previsualizar ]</b> o <b>[ Evaluar ]</b> "
        "se despliega un cajón completo dividido en 3 paneles claros:",
        body_style
    ))

    story.append(ui_mockup_box(
        "CAJÓN DE PREVISUALIZACIÓN DETALLADA DEL DÍA",
        [
            "🕒 <b>PANEL 1: MARCAJES EN KIOSCO (LÍNEA DE TIEMPO):</b> Muestra cada marcaje del día (Entrada 11:00 AM, Salida Comida 03:00 PM, Retorno Comida 04:00 PM, Salida 08:35 PM) con su <b>foto de verificación en miniatura</b> que puedes tocar para ver en pantalla completa.",
            "⏱️ <b>PANEL 2: ANÁLISIS DEL TURNO (BASE 8H):</b> Muestra el tiempo total en sitio, minutos de comida tomados, total de horas netas laboradas (ej. 8.6 hrs), jornada base ordinaria (8.0 hrs) y excedente bruto adicional (+0.6 hrs).",
            "⚖️ <b>PANEL 3: BOLSA DE HORAS & LIQUIDACIÓN:</b> Muestra si el colaborador tenía deudas por salidas tempranas previas que se saldaron automáticamente (ej. +1.0h bruto - 0.5h deuda = +0.5h a pago) y calcula el dinero estimado en Córdobas (tarifa ordinaria x 2 por ley)."
        ],
        "Esta previsualización te da 100% de certeza de que el colaborador realmente se quedó trabajando y cumplió su horario."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4.3 Paso a Paso para Aprobar o Rechazar con el PIN Maestro 2322", h2_style))
    story.append(Paragraph("<b>Paso 1: Tocar [ Evaluar ]:</b> En la fila del trabajador, presiona el botón <b>[ Evaluar ]</b>. Se abrirá la previsualización y el formulario de decisión.", step_style))
    story.append(Paragraph("<b>Paso 2: Ajustar las Horas si es Necesario:</b> El sistema sugiere las horas solicitadas (ej. 1.0 hr). Si el jefe considera que solo debió quedarse media hora, puede ajustar el número a <b>0.5</b>.", step_style))
    story.append(Paragraph("<b>Paso 3: Escribir Nota (Opcional) y Elegir Acción:</b>", step_style))
    story.append(Paragraph("   • Si las vas a autorizar: Pulsa el botón <b>[ Aprobar con PIN 2322 ]</b>.", bullet_style))
    story.append(Paragraph("   • Si no las autorizas (ej. se quedó esperando transporte y no laborando): Pulsa el botón <b>[ Rechazar Solicitud ]</b>.", bullet_style))
    story.append(Paragraph("<b>Paso 4: Ingresar el PIN Maestro 2322:</b> Se abrirá la ventana de seguridad confirmando el nombre del empleado y el resumen de marcajes del día. En tu teclado escribe <b>2322</b>. Al poner el último 2, el sistema confirma de inmediato y sin lag.", step_style))
    story.append(Paragraph("<b>Paso 5: Apertura Automática de la Boleta Oficial:</b> Si aprobaste la solicitud, en ese mismo instante se abrirá en tu pantalla la <b>Boleta Oficial de Horas Extra</b> lista para imprimir.", step_style))

    story.append(PageBreak())

    story.append(Paragraph("4.4 La Boleta Oficial de Horas Extra (Para Imprimir y Firmar)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Al aprobar una hora extra, el sistema genera de forma automática una <b>Boleta Oficial</b> con su propio número de folio único "
        "(ejemplo: <code>BHE-2026-0042</code>).",
        body_style
    ))

    story.append(ui_mockup_box(
        "ASÍ ES LA BOLETA OFICIAL DE HORAS EXTRA (BHE)",
        [
            "🏢 <b>ENCABEZADO:</b> Logotipo de El Bodegón, fecha de emisión y Número de Folio único.",
            "👤 <b>DATOS:</b> Nombre del colaborador, cargo y salario base por hora.",
            "⏱️ <b>AUDITORÍA:</b> Horas exactas que marcó en el Kiosco (Entrada y Salida del día).",
            "💰 <b>CÁLCULO DEL DINERO:</b> Horas autorizadas calculadas con el <b>100% de recargo (tarifa doble obligatoria por ley Art. 62 CT)</b> y monto exacto en Córdobas (C$).",
            "✍️ <b>FIRMAS:</b> Espacio para que firme el Administrador/Jefe y espacio para que firme el Colaborador.",
            "🖨️ <b>BOTÓN [ Imprimir ]:</b> En la esquina superior derecha de la boleta hay un botón que la manda directo a la impresora."
        ],
        "Guarda las boletas firmadas en la carpeta de nómina para respaldo contable y laboral de la empresa."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4.5 El Apartado 'Por Pagar' y el Cierre de Quincena", h2_style))
    story.append(Paragraph(
        "Una vez que apruebas una hora extra con el PIN 2322, esa solicitud desaparece de 'Pendientes' y se traslada "
        "a la sub-pestaña <b>'Por Pagar (Aprobadas)'</b>.<br/>"
        "Ahí se van acumulando todas las horas autorizadas de la quincena. El día 15 o el día 30 del mes:<br/>"
        "1. Entras a <b>'Por Pagar'</b>.<br/>"
        "2. Verás la lista de cada colaborador con el dinero total de horas extra acumulado.<br/>"
        "3. Pulsas el botón <b>[ Emitir Pago de Horas Extra ]</b> para generar el Recibo de Pago (RPHE).<br/>"
        "4. En ese momento, esas horas pasan a la pestaña <b>'Pagadas'</b> donde quedan archivadas de por vida en el historial.",
        body_style
    ))

    story.append(box_alert(
        "<b>Regla de Oro:</b> Si una hora extra no está aprobada formalmente en el sistema con el PIN 2322, <b>no se paga</b>. "
        "Esto garantiza que no se pague dinero de más ni tiempos no autorizados por la gerencia.",
        "POLÍTICA ESTRICTA DE CAJA",
        "danger"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 5: CUADRO DE NÓMINA Y REPORTES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 5: EL CUADRO DE NÓMINA GENERAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Cuadro de Nómina es la pantalla más completa del sistema. Para entrar, haz clic en la pestaña <b>'Nómina'</b> en el menú de arriba. "
        "Aquí puedes ver el resumen completo de todo el personal en cualquier rango de fechas.",
        body_style
    ))

    story.append(Paragraph("5.1 Herramientas Fáciles de Navegación", h2_style))
    story.append(Paragraph("• <b>Columna de Empleado Congelada (Sticky):</b> Cuando te muevas hacia la derecha para ver las columnas del cuadro, el nombre y cargo del muchacho se quedan fijos a la izquierda. Nunca te vas a perder de fila.", bullet_style))
    story.append(Paragraph("• <b>Encabezados y Totales Fijos:</b> Al bajar en la lista, los títulos de las columnas y la fila de totales del restaurante se quedan siempre a la vista arriba y abajo.", bullet_style))
    story.append(Paragraph("• <b>Botones de Filtro por Área:</b> Arriba del cuadro hay botones para ver solo a un grupo de trabajadores: <i>[Todos] [Cocina & Parrilla] [Salón & Servicio] [Caja & Barra] [Operaciones] [Gerencia]</i>.", bullet_style))
    story.append(Paragraph("• <b>Selector de Modo de Vista:</b> Puedes tocar <b>[Tabla Detallada]</b> para ver el cuadro completo en computadora, o tocar <b>[Vista Tarjetas]</b> para ver tarjetas individuales cómodas en el celular.", bullet_style))
    story.append(Paragraph("• <b>Botón de Quincena Rápida:</b> No tienes que escribir fechas a mano. Toca el botón <b>[Planilla Quincenal]</b> y elige <i>1ra Quincena</i> (del 1 al 15) o <i>2da Quincena</i> (del 16 al fin de mes).", bullet_style))

    story.append(Paragraph("5.2 Qué Significa Cada una de las Columnas del Cuadro", h2_style))
    col_help = [
        ("1. Empleado y Puesto", "El nombre completo del colaborador y su cargo en el restaurante (ej. Cocinero, Mesero, Bartender)."),
        ("2. Días Trabajados", "Los días en los que vino a trabajar y marcó entrada y salida en la quincena."),
        ("3. Días Libres", "Los días de descanso que tomó en la quincena."),
        ("4. Horas Ordinarias", "La suma de horas normales trabajadas (hasta 8 horas por turno)."),
        ("5. Feriados Trabajados", "Días de fiesta nacional que vino a trabajar. Muestra el letrero <b>+2d vac.</b> porque por ley se le acreditan 2 días de vacaciones."),
        ("6. Vacaciones Pagadas", "Días de vacaciones que se le han pagado en efectivo. Tiene un botón <b>[+]</b> para pagarle vacaciones hoy mismo."),
        ("7. H. Extra Aprobadas", "Horas extra que el Jefe ya autorizó con el PIN 2322. Muestra aviso de advertencia si rebasó las 9 horas semanales."),
        ("8. H. Extra por Aprobar", "Horas que los muchachos hicieron de más pero que el Jefe todavía no revisa. Si hay horas, sale un botón para ir a evaluarlas."),
        ("9. Horas Debidas (Bolsa)", "Horas que el muchacho le debe a la empresa por haber salido temprano de su turno de 8 horas."),
        ("10. Vacaciones Restantes", "Días de vacaciones disponibles que tiene acumulados para descansar o para pedir que se los paguen en dinero."),
    ]
    col_help_data = []
    for ct, cd in col_help:
        col_help_data.append([Paragraph(f"<b>{ct}</b>", body_bold), Paragraph(cd, body_style)])
    col_tbl = Table(col_help_data, colWidths=[140, 364])
    col_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), BW_GRAY_TINT),
        ('GRID', (0,0), (-1,-1), 0.5, BW_BLACK),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(col_tbl)
    story.append(Spacer(1, 6))

    story.append(Paragraph("5.3 Cómo Descargar la Planilla en Excel para Pagar", h2_style))
    story.append(Paragraph(
        "El día de pago, pulsa el botón blanco que dice <b>[Descargar Excel]</b> arriba del cuadro. "
        "En 2 segundos se descargará a tu computadora un archivo de Excel completo con el sueldo ordinario de cada quien, "
        "sus horas extra calculadas al doble, sus feriados y la retención del INSS laboral, listo para imprimir o hacer las transferencias bancarias.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 6: VACACIONES, PERMISOS Y FERIADOS LEGALES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 6: VACACIONES, PERMISOS Y FERIADOS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Bodegón Pass calcula los descansos respetando estrictamente el Código del Trabajo de Nicaragua. "
        "Ni la empresa ni el colaborador pierden un solo día.",
        body_style
    ))

    story.append(Paragraph("6.1 La Regla de Acumulación de Vacaciones", h2_style))
    story.append(Paragraph(
        "Por ley en Nicaragua:<br/>"
        "• Cada trabajador gana <b>15 días de vacaciones por cada 6 meses continuos de trabajo</b>.<br/>"
        "• Eso significa que por cada mes completo que trabaja, el sistema le suma automáticamente <b>2.5 días</b> a su cuenta.<br/>"
        "El sistema toma la <b>Fecha de Ingreso</b> del muchacho y calcula sus días ganados en tiempo real sin que tengas que sacar cuentas en calculadora.",
        body_style
    ))

    story.append(Paragraph("6.2 Cómo Revisar el Historial de Vacaciones de un Empleado", h2_style))
    story.append(Paragraph("1. En el Cuadro de Nómina, busca al colaborador.", step_style))
    story.append(Paragraph("2. En la última columna que dice <b>'Vacaciones Restantes'</b>, haz clic en el botón con el número de días.", step_style))
    story.append(Paragraph("3. Se abrirá una ventana limpia con 5 casillas claras:", step_style))
    story.append(Paragraph("   • <b>Días Ganados:</b> Todo lo que ha acumulado desde que entró a trabajar.", bullet_style))
    story.append(Paragraph("   • <b>Días Tomados en Descanso:</b> Días que se fue de vacaciones a pasear.", bullet_style))
    story.append(Paragraph("   • <b>Días Pagados en Dinero:</b> Días que pidió que se los liquidaran en efectivo.", bullet_style))
    story.append(Paragraph("   • <b>Ajuste Manual:</b> Si el Administrador le sumó o restó días por alguna razón justificada.", bullet_style))
    story.append(Paragraph("   • <b>Saldo Neto Disponible:</b> Lo que le queda libre el día de hoy.", bullet_style))

    story.append(Paragraph("6.3 Cómo Pagar Vacaciones en Efectivo Paso a Paso", h2_style))
    story.append(Paragraph(
        "Si un trabajador acuerda con el Jefe que no quiere descansar y prefiere que le paguen sus días en dinero:<br/>"
        "1. En el Cuadro de Nómina, busca al muchacho y presiona el botón <b>[ + ]</b> en la columna 'Vacaciones Pagadas'.<br/>"
        "2. La pantalla te dirá cuántos días tiene disponibles y cuánto gana por día.<br/>"
        "3. Escribe cuántos días le vas a pagar (por ejemplo: <b>2.0</b> días). El sistema calculará el dinero exacto en Córdobas.<br/>"
        "4. Presiona <b>[ Emitir Pago de Vacaciones ]</b>.<br/>"
        "5. Se generará de inmediato el <b>Recibo Oficial de Pago de Vacaciones</b> con su número único para que lo imprimas y te lo firme. En ese mismo instante el sistema le descuenta los 2 días de su saldo.",
        body_style
    ))

    story.append(Paragraph("6.4 Los Días Feriados Nacionales", h2_style))
    story.append(Paragraph(
        "En Nicaragua los feriados de ley son: 1 de Enero, Jueves y Viernes Santo, 1 de Mayo, 19 de Julio, "
        "1 y 10 de Agosto (en Managua), 14 y 15 de Septiembre, 8 y 25 de Diciembre.<br/>"
        "<b>¿Qué pasa cuando alguien trabaja en feriado en El Bodegón?</b><br/>"
        "El sistema detecta automáticamente que es feriado nacional. Si el colaborador labora al menos 7.5 horas de su jornada, "
        "le abona de forma automática <b>+2 días de vacaciones</b> a su saldo acumulado, cumpliendo exactamente con la compensación legal.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 7: REGISTRO DE EMPLEADOS Y CARNETS QR
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 7: REGISTRO DE EMPLEADOS NUEVOS Y CARNETS QR", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Cuando contratas a un nuevo mesero, cocinero, bartender o personal de limpieza, debes ingresarlo al sistema para que pueda empezar a marcar en la tablet.",
        body_style
    ))

    story.append(Paragraph("7.1 Cómo Crear el Expediente de un Empleado Nuevo", h2_style))
    story.append(Paragraph("1. En el menú de arriba, haz clic en <b>'Empleados'</b>.", step_style))
    story.append(Paragraph("2. Pulsa el botón que dice <b>[ + Nuevo Empleado ]</b>.", step_style))
    story.append(Paragraph("3. Escribe sus nombres, apellidos, número de cédula y teléfono.", step_style))
    story.append(Paragraph("4. Selecciona su <b>Cargo</b> (Cocinero, Mesero, Bartender, Limpieza, Cajero, etc.).", step_style))
    story.append(Paragraph("5. Elige su <b>Tipo de Turno</b> (Turno Corrido o Turno Quebrado con comida intermedia).", step_style))
    story.append(Paragraph("6. Escribe su <b>Tarifa por Hora (C$)</b>.", step_style))
    story.append(Paragraph("7. Pulsa <b>[ Guardar Empleado ]</b>.", step_style))
    story.append(Paragraph(
        "<i>Al guardar, el sistema genera de forma 100% automática su <b>Código QR Único</b>. El colaborador no necesita PIN personal.</i>",
        body_style
    ))

    story.append(Paragraph("7.2 Cómo Sacar los Carnets y Gafetes Oficiales con Código QR", h2_style))
    story.append(Paragraph(
        "Para que los muchachos anden identificados con su uniforme y puedan marcar en el Kiosco:<br/>"
        "1. En el menú de la izquierda o arriba, entra a <b>'Imprimir Carnets'</b>.<br/>"
        "2. La pantalla te mostrará los carnets diseñados con el logo de El Bodegón, nombre del colaborador, cargo y su <b>Código QR de alta definición</b>.<br/>"
        "3. Pulsa el botón <b>[ Imprimir Carnets ]</b> en papel cartulina u opalina y mételos en sus gafetes plásticos colgantes.<br/>"
        "4. <b>Opcional para el Celular:</b> También puedes tomarle foto al código QR de su carnet y mandárselo a su WhatsApp. El Kiosco lee el QR perfectamente desde la pantalla del teléfono.",
        body_style
    ))

    story.append(ui_mockup_box(
        "EL CARNET OFICIAL DE EL BODEGÓN PASS",
        [
            "🏢 <b>LOGOTIPO:</b> Emblema oficial de Restaurante & Bar El Bodegón.",
            "👤 <b>DATOS:</b> Nombre completo (ej. Xiomara Castillo) y puesto (Atención al Cliente / Mesera).",
            "📱 <b>CÓDIGO QR ÚNICO:</b> Código de seguridad encriptado exclusivo de cada trabajador.",
            "🔒 <b>SEGURIDAD:</b> Al escanear este QR en la tablet de la entrada, la cámara toma una fotografía instantánea para asegurar que nadie marque por otra persona."
        ],
        "Si un colaborador extravía su carnet, el Administrador puede reimprimirlo en cualquier momento sin perder sus horas."
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 8: BOLSA DE HORAS Y AMORTIZACIÓN
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 8: LA BOLSA DE HORAS (SALIDAS TEMPRANAS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "La Bolsa de Horas es la herramienta justa para que el restaurante no pierda tiempo de trabajo y para que el colaborador "
        "tenga la oportunidad de reponerlo o compensarlo.",
        body_style
    ))

    story.append(Paragraph("8.1 ¿Cómo se Genera una Deuda en la Bolsa?", h2_style))
    story.append(Paragraph(
        "Si un muchacho tiene un turno de 8 horas pero pide permiso para salir a las 6 horas (porque tenía que ir al banco o al médico):<br/>"
        "• Al marcar salida, el sistema detecta que faltaron <b>2.0 horas</b> para completar su meta.<br/>"
        "• Esas 2 horas se cargan automáticamente a su cuenta en la columna <b>'Horas Debidas (Bolsa)'</b>.<br/>"
        "• Al administrador le saldrá una alerta inmediata en la campanita para que esté enterado.",
        body_style
    ))

    story.append(Paragraph("8.2 Cómo se Amortiza una Deuda de Forma Automática", h2_style))
    story.append(Paragraph(
        "El sistema tiene una función inteligente: <b>Compensación Automática</b>.<br/>"
        "Si un muchacho debe 1.0 hora por haber salido temprano el martes, y el viernes se queda trabajando <b>1.5 horas extra</b>:<br/>"
        "1. Al marcar salida el viernes, el sistema detecta su deuda pendiente de 1.0 hora.<br/>"
        "2. Automáticamente amortiza 1.0 hora extra para saldar la deuda del martes.<br/>"
        "3. Deja el remanente de <b>0.5 horas extra</b> para pago en nómina.<br/>"
        "4. En la previsualización y en la boleta oficial se desglosa con total transparencia: <i>'Generó +1.5h, cubrió -1.0h de deuda del martes, neto a pagar: +0.5h'</i>.",
        body_style
    ))

    story.append(ui_mockup_box(
        "EJEMPLO DE COMPENSACIÓN EN LA BOLSA DE HORAS",
        [
            "• Martes 15: Salió a las 6h de turno ➔ Quedó debiendo <b>-2.0 horas</b>.",
            "• Sábado 19: Trabajó turno de 10 horas ➔ Generó <b>+2.0 horas extra brutas</b>.",
            "• El sistema cruza las horas automáticamente: <b>+2.0h extra - 2.0h deuda = 0.0 hrs de deuda</b>.",
            "• La deuda queda completamente saldada y el restaurante recuperó su tiempo sin descontar salario de forma injusta."
        ],
        "Todo queda registrado en el historial de compensaciones para que nadie tenga reclamos."
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULOS 9 Y 10: COMPRAS Y SEGURIDAD
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 9: CONTROL DE COMPRAS Y GASTOS (BODEGÓN CONTROL)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "En la pestaña <b>'Compras'</b> del menú superior, el Administrador puede anotar todos los gastos diarios del restaurante "
        "(compras de verduras, carnes, licores, hielo, gas, reparaciones):<br/>"
        "1. Pulsa <b>[ + Registrar Compra ]</b>.<br/>"
        "2. Escribe el nombre del proveedor (ej. Mercado Oriental, Distribuidora, Maxi Palí).<br/>"
        "3. Elige la categoría (Alimentos, Bebidas, Insumos de Limpieza, Mantenimiento).<br/>"
        "4. Escribe el monto en Córdobas (C$) y toma foto de la factura con el teléfono.<br/>"
        "5. Al final del día, el Jefe puede ver el total gastado en efectivo y contrastarlo con el dinero de la caja.",
        body_style
    ))
    story.append(Spacer(1, 10))

    story.append(Paragraph("CAPÍTULO 10: SEGURIDAD, RESPALDOS Y LIMPIEZA", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Toda la información de El Bodegón Pass está protegida y respaldada en la nube en tiempo real.<br/>"
        "• <b>¿Qué pasa si se va la luz o el internet?</b> La tablet del Kiosco guarda los marcajes en su memoria interna. En cuanto regresa el internet, sube todos los datos automáticamente sin perder ningún segundo.<br/>"
        "• <b>Respaldos de Nómina:</b> Se recomienda descargar el archivo de Excel quincenal y guardarlo en una memoria USB o en la computadora de gerencia.<br/>"
        "• <b>Auditoría de Acciones:</b> Cada vez que alguien aprueba una hora extra con el PIN 2322 o borra un registro, el sistema anota la hora exacta, el usuario y la dirección IP en la bitácora interna de seguridad.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 11: GUÍA RÁPIDA DE RESOLUCIÓN DE PROBLEMAS
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 11: ¿QUÉ HAGO SI...? (SOLUCIÓN A LOS 10 PROBLEMAS TÍPICOS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Guía de respuesta rápida para el Administrador de Turno cuando ocurra alguna situación inesperada:",
        body_style
    ))

    faq_matrix = [
        [Paragraph("Problema que Ocurre", table_th_style), Paragraph("¿Por qué pasó?", table_th_style), Paragraph("¿Qué hago para resolverlo?", table_th_style)],
        [
            Paragraph("La tablet no lee el código QR del carnet", table_td_style),
            Paragraph("El carnet está arrugado, tapado con los dedos o la cámara tiene grasa.", table_td_style),
            Paragraph("Sostén el carnet firme a 15-20 cm sin tapar el código. Si el carnet físico se dañó, muéstrale el QR desde su celular o imprímele uno nuevo en 'Empleados'.", table_td_style)
        ],
        [
            Paragraph("Alguien se quedó 15 minutos más y no le sale hora extra", table_td_style),
            Paragraph("Regla de umbral mínimo de 30 minutos.", table_td_style),
            Paragraph("No es un error: las horas extra solo empiezan a contar a partir de 30 minutos cumplidos después de las 8 horas normales de turno.", table_td_style)
        ],
        [
            Paragraph("Un colaborador se fue anoche y no marcó salida", table_td_style),
            Paragraph("Se le olvidó marcar por irse a la carrera.", table_td_style),
            Paragraph("Toca la campanita de alertas arriba a la derecha y pulsa el botón <b>[ 🌙 Cerrar 11:00 PM ]</b>.", table_td_style)
        ],
        [
            Paragraph("Un trabajador tiene horas en 'Horas Debidas / Bolsa'", table_td_style),
            Paragraph("Marcó salida antes de cumplir sus 8.0 horas.", table_td_style),
            Paragraph("Pregúntale el motivo. El sistema las compensará automáticamente cuando haga horas extra o el Jefe puede autorizar la justificación.", table_td_style)
        ],
        [
            Paragraph("Aprobé una hora extra sin querer y me equivoqué", table_td_style),
            Paragraph("Error involuntario al presionar el botón.", table_td_style),
            Paragraph("Ve a Nómina ➔ Horas Extra ➔ sub-pestaña 'Por Pagar'. Busca la fila y pulsa <b>[ Modificar ]</b> para corregirla.", table_td_style)
        ],
        [
            Paragraph("La tablet muestra la pantalla de la cámara en negro", table_td_style),
            Paragraph("El navegador bloqueó el permiso de la cámara.", table_td_style),
            Paragraph("Toca el candadito que sale arriba en la barra de internet y asegúrate de que el permiso de <b>Cámara</b> diga 'Permitir'.", table_td_style)
        ],
        [
            Paragraph("Un colaborador perdió su carnet físico", table_td_style),
            Paragraph("Extravío o deterioro de su gafete.", table_td_style),
            Paragraph("Entra a 'Empleados' ➔ 'Imprimir Carnets', busca su nombre y vuelve a imprimir su gafete oficial en 10 segundos.", table_td_style)
        ],
        [
            Paragraph("No coinciden las vacaciones de un empleado viejo", table_td_style),
            Paragraph("Su fecha de ingreso estaba mal escrita.", table_td_style),
            Paragraph("Entra a 'Empleados', edita su perfil y pon la <b>Fecha de Ingreso</b> real en que empezó a laborar en el restaurante.", table_td_style)
        ],
        [
            Paragraph("El archivo de Excel de la quincena no se descarga", table_td_style),
            Paragraph("Tu navegador tiene bloqueadas las descargas automáticas.", table_td_style),
            Paragraph("Permite las descargas en Google Chrome o Microsoft Edge en tu computadora.", table_td_style)
        ],
    ]
    faq_tbl = Table(faq_matrix, colWidths=[140, 160, 204])
    faq_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BW_GRAY_TINT),
        ('GRID', (0,0), (-1,-1), 0.5, BW_BLACK),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(faq_tbl)

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 12: LISTAS DE CHEQUEO DIARIAS Y QUINCENALES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 12: LISTA DE TAREAS DIARIAS Y QUINCENALES", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BW_BLACK, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("12.1 Lista de Tareas Diarias del Administrador de Turno", h2_style))
    checklist_admin = (
        "[ ] Al abrir el turno: Pasar un paño suave al lente de la tablet y comprobar que la pantalla esté encendida.<br/>"
        "[ ] Durante el turno: Entrar a 'Asistencia' con el PIN <b>4512</b> para verificar quién ya llegó y quién está comiendo.<br/>"
        "[ ] Al mediodía o tarde: Revisar la campanita de alertas por si alguien salió temprano o debe horas a la Bolsa.<br/>"
        "[ ] Al cerrar el restaurante: Verificar que nadie quede con turno abierto. Si alguien olvidó marcar salida, tocar <b>[ 🌙 Cerrar 11:00 PM ]</b>."
    )
    story.append(ui_mockup_box("RUTINA DIARIA DEL ADMINISTRADOR", [checklist_admin]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("12.2 Lista de Tareas Diarias y Quincenales del Jefe / Propietario", h2_style))
    checklist_jefe = (
        "[ ] Todos los días o cada 2 días: Entrar a Nómina ➔ Horas Extra ➔ 'Pendientes'.<br/>"
        "[ ] Tocar <b>[ Previsualizar ]</b> o <b>[ Evaluar ]</b> para revisar las horas reales marcadas y fotos de la tablet.<br/>"
        "[ ] Poner el PIN Maestro <b>2322</b> para aprobar o rechazar las horas de los muchachos.<br/>"
        "[ ] Imprimir la Boleta Oficial de Horas Extra (BHE) y archivarla con la firma del colaborador.<br/>"
        "[ ] Los días 15 y 30 del mes: Tocar <b>[ Planilla Quincenal ]</b> y presionar <b>[ Descargar Excel ]</b> para pagar los salarios."
    )
    story.append(ui_mockup_box("RUTINA DE CONTROL DEL JEFE", [checklist_jefe]))
    story.append(Spacer(1, 12))

    story.append(box_alert(
        "<b>¡Felicidades!</b> Siguiendo esta guía paso a paso, Restaurante & Bar El Bodegón cuenta con un sistema de nómina y asistencia "
        "impecable, legal, justo para los trabajadores y con control total del dinero de la empresa.",
        "SISTEMA OPERATIVO Y LISTO",
        "info"
    ))

    # Construir documento en dos pasadas
    doc.build(story, canvasmaker=NumberedCanvasBW)
    print(f"PDF generado exitosamente en: {output_path}")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    root_pdf = os.path.join(base_dir, '../../Manual_de_Usuario_El_Bodegon_Pass.pdf')
    public_pdf = os.path.join(base_dir, '../../frontend/public/manual_el_bodegon_pass.pdf')

    build_pdf_manual(root_pdf)
    build_pdf_manual(public_pdf)
