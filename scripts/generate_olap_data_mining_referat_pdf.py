from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "referat-olap-data-mining.pdf"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Room9Regular", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("Room9Bold", FONT_BOLD))


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleRoom",
            fontName="Room9Bold",
            fontSize=20,
            leading=26,
            alignment=TA_CENTER,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubtitleRoom",
            fontName="Room9Regular",
            fontSize=10.5,
            leading=15,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#333333"),
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1Room",
            fontName="Room9Bold",
            fontSize=13.5,
            leading=18,
            spaceBefore=9,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2Room",
            fontName="Room9Bold",
            fontSize=10.8,
            leading=14,
            spaceBefore=6,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyRoom",
            fontName="Room9Regular",
            fontSize=9.5,
            leading=13.3,
            alignment=TA_LEFT,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableHead",
            fontName="Room9Bold",
            fontSize=7.6,
            leading=9.8,
            textColor=colors.white,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableCell",
            fontName="Room9Regular",
            fontSize=7.4,
            leading=9.6,
        )
    )
    return styles


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def page_decorator(canvas, doc):
    canvas.saveState()
    width, _ = doc.pagesize
    canvas.setFont("Room9Regular", 7)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawString(doc.leftMargin, 10 * mm, "Реферат | OLAP, сховище даних, вітрина даних, Data Mining")
    canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"Сторінка {doc.page}")
    canvas.restoreState()


def bullets(items, styles):
    return [p(f"• {item}", styles["BodyRoom"]) for item in items]


def make_table(rows, styles, col_widths):
    data = []
    for i, row in enumerate(rows):
        style = styles["TableHead"] if i == 0 else styles["TableCell"]
        data.append([p(str(cell), style) for cell in row])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.black),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#777777")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def build_pdf() -> None:
    register_fonts()
    styles = make_styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Реферат: OLAP, сховище даних, вітрина даних, Data Mining",
        author="ROOM_9",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin + 6 * mm, doc.width, doc.height - 4 * mm, id="portrait")
    doc.addPageTemplates([PageTemplate(id="portrait", frames=[frame], onPage=page_decorator)])

    story = []
    story.append(Spacer(1, 7 * mm))
    story.append(p("РЕФЕРАТ", styles["TitleRoom"]))
    story.append(p("Теми: формати даних OLAP, використання сховища даних, вітрина даних, задачі Data Mining", styles["SubtitleRoom"]))

    story.append(p("Вступ", styles["H1Room"]))
    story.append(
        p(
            "У сучасних інформаційних системах накопичується велика кількість операційних даних: транзакції, дії користувачів, продажі, бронювання, перегляди, прослуховування, події та технічні журнали. "
            "Для прийняття управлінських рішень недостатньо просто зберігати ці дані в робочій базі. Їх потрібно очищати, інтегрувати, агрегувати та аналізувати. Саме для цього використовуються OLAP-технології, сховища даних, вітрини даних і методи Data Mining.",
            styles["BodyRoom"],
        )
    )

    story.append(p("1. Формати даних OLAP", styles["H1Room"]))
    story.append(
        p(
            "OLAP (Online Analytical Processing) - це технологія багатовимірного аналізу даних, призначена для швидкого отримання аналітичних зрізів, підсумків і порівнянь. На відміну від OLTP-систем, які обслуговують поточні операції, OLAP орієнтований на аналіз історичних і агрегованих даних.",
            styles["BodyRoom"],
        )
    )
    story.append(p("Основні поняття OLAP:", styles["H2Room"]))
    story.extend(
        bullets(
            [
                "<b>Факт</b> - числовий показник, який аналізується: кількість продажів, сума платежів, кількість прослуховувань, кількість бронювань.",
                "<b>Вимір</b> - ознака, за якою аналізуються факти: час, місто, користувач, жанр, подія, товар.",
                "<b>Міра</b> - конкретне значення факту: revenue, play_count, booking_count, average_rating.",
                "<b>Куб даних</b> - багатовимірна структура, у якій факти розглядаються через різні виміри.",
            ],
            styles,
        )
    )
    story.append(p("Основні формати / підходи зберігання OLAP-даних:", styles["H2Room"]))
    rows = [
        ["Формат", "Сутність", "Переваги", "Недоліки"],
        ["MOLAP", "Дані зберігаються у багатовимірних кубах.", "Висока швидкість агрегованих запитів; зручність для бізнес-аналітики.", "Може потребувати багато пам'яті; менш гнучкий для дуже детальних даних."],
        ["ROLAP", "OLAP-аналіз виконується поверх реляційної БД.", "Добре масштабується; використовує SQL; зручно для великих сховищ.", "Запити можуть бути повільнішими, якщо немає правильних індексів та агрегатів."],
        ["HOLAP", "Поєднання MOLAP і ROLAP.", "Баланс швидкості та масштабованості.", "Складніша архітектура та адміністрування."],
        ["Columnar / Parquet", "Колонкове зберігання для аналітики та data lake.", "Ефективне стискання; швидке читання потрібних колонок.", "Потребує окремих інструментів обробки та керування файлами."],
    ]
    story.append(make_table(rows, styles, [26 * mm, 48 * mm, 53 * mm, 54 * mm]))
    story.append(
        p(
            "На практиці OLAP-дані часто моделюються за схемою «зірка» або «сніжинка». У центрі знаходиться таблиця фактів, а навколо неї - таблиці вимірів. Наприклад, для музичної платформи фактом може бути прослуховування треку, а вимірами - час, DJ, жанр, країна та тип користувача.",
            styles["BodyRoom"],
        )
    )

    story.append(p("2. Використання сховища даних", styles["H1Room"]))
    story.append(
        p(
            "Сховище даних (Data Warehouse) - це централізована база, призначена для зберігання інтегрованих, очищених, історичних і структурованих даних з різних джерел. Основна мета сховища даних - підтримка аналітики, звітності та прийняття управлінських рішень.",
            styles["BodyRoom"],
        )
    )
    story.append(p("Класичні властивості сховища даних:", styles["H2Room"]))
    story.extend(
        bullets(
            [
                "<b>Предметна орієнтованість</b> - дані організовані навколо бізнес-напрямів: продажі, користувачі, бронювання, музика, події.",
                "<b>Інтегрованість</b> - дані з різних систем приводяться до спільних форматів, довідників і правил.",
                "<b>Незмінність</b> - після завантаження історичні дані зазвичай не редагуються, а доповнюються новими записами.",
                "<b>Прив'язка до часу</b> - зберігається історія змін і подій, що дозволяє аналізувати динаміку.",
            ],
            styles,
        )
    )
    story.append(
        p(
            "Типова архітектура включає джерела даних, staging area, ETL/ELT-процеси, центральне сховище, вітрини даних і BI/OLAP-інструменти. ETL означає Extract, Transform, Load: дані витягуються з джерел, очищаються, трансформуються і завантажуються в сховище. ELT відрізняється тим, що трансформації виконуються вже всередині сховища або хмарної аналітичної платформи.",
            styles["BodyRoom"],
        )
    )
    story.append(p("Приклади використання сховища даних:", styles["H2Room"]))
    story.extend(
        bullets(
            [
                "аналіз продажів, доходів і фінансових показників;",
                "оцінка ефективності маркетингових кампаній;",
                "аналіз поведінки користувачів у цифрових продуктах;",
                "контроль якості бізнес-процесів;",
                "прогнозування попиту та навантаження;",
                "побудова управлінських dashboard-звітів.",
            ],
            styles,
        )
    )

    story.append(p("3. Вітрина даних", styles["H1Room"]))
    story.append(
        p(
            "Вітрина даних (Data Mart) - це тематично обмежена частина сховища даних, яка створюється для конкретного підрозділу, ролі або аналітичної задачі. Якщо сховище даних охоплює всю організацію, то вітрина концентрується на окремому напрямі: фінансах, маркетингу, продажах, користувацькій активності або продуктивності сервісу.",
            styles["BodyRoom"],
        )
    )
    story.append(p("Типи вітрин даних:", styles["H2Room"]))
    story.extend(
        bullets(
            [
                "<b>Залежна вітрина</b> - формується з центрального сховища даних. Це найбільш контрольований і узгоджений варіант.",
                "<b>Незалежна вітрина</b> - створюється напряму з джерел даних для швидкого вирішення локальної задачі.",
                "<b>Гібридна вітрина</b> - поєднує дані зі сховища та окремих операційних систем.",
            ],
            styles,
        )
    )
    story.append(
        p(
            "Наприклад, у системі на кшталт ROOM_9 можна створити окремі вітрини: «Аналітика DJ», «Бронювання», «Прослуховування треків», «Події та стріми». Вітрина «Аналітика DJ» може містити кількість переглядів профілю, кількість прослуховувань, популярні треки, кількість заявок і коефіцієнт прийнятих бронювань.",
            styles["BodyRoom"],
        )
    )
    rows2 = [
        ["Критерій", "Сховище даних", "Вітрина даних"],
        ["Масштаб", "Охоплює всю організацію або всю систему.", "Охоплює один напрям або групу задач."],
        ["Користувачі", "Аналітики, менеджмент, BI-команди.", "Конкретний відділ або роль."],
        ["Складність", "Більш складна модель та інтеграція.", "Простіша структура, швидший доступ."],
        ["Приклад", "Усі дані платформи: користувачі, платежі, події, музика.", "Тільки dashboard для DJ або тільки фінансова аналітика."],
    ]
    story.append(make_table(rows2, styles, [37 * mm, 72 * mm, 72 * mm]))

    story.append(p("4. Задачі Data Mining", styles["H1Room"]))
    story.append(
        p(
            "Data Mining - це процес виявлення прихованих закономірностей, залежностей і корисних знань у великих масивах даних. На відміну від звичайної звітності, Data Mining не тільки відповідає на питання «що сталося?», а й допомагає зрозуміти «чому це сталося?» та «що може статися далі?».",
            styles["BodyRoom"],
        )
    )
    rows3 = [
        ["Задача", "Сутність", "Приклад"],
        ["Класифікація", "Віднесення об'єкта до одного з наперед відомих класів.", "Визначити, чи буде заявка на бронювання прийнята або відхилена."],
        ["Кластеризація", "Групування об'єктів без наперед заданих класів.", "Знайти групи слухачів зі схожими музичними вподобаннями."],
        ["Регресія", "Прогнозування числового значення.", "Спрогнозувати кількість прослуховувань треку або очікуваний дохід."],
        ["Асоціативні правила", "Пошук правил виду «якщо A, то часто B».", "Користувачі, які слухають techno, часто зберігають industrial DJ."],
        ["Виявлення аномалій", "Пошук нетипових або підозрілих записів.", "Виявити різкий штучний сплеск прослуховувань або підозрілу платіжну активність."],
        ["Прогнозування часових рядів", "Передбачення майбутніх значень за історичною динамікою.", "Прогноз активності подій, сезонності бронювань або навантаження на платформу."],
    ]
    story.append(make_table(rows3, styles, [39 * mm, 67 * mm, 75 * mm]))
    story.append(
        p(
            "У бізнесі Data Mining застосовується для персоналізації рекомендацій, сегментації клієнтів, прогнозування попиту, виявлення шахрайства, оптимізації цін і підтримки стратегічних рішень. У цифрових музичних сервісах ці методи особливо важливі для рекомендацій треків, підбору артистів, аналізу аудиторії та планування подій.",
            styles["BodyRoom"],
        )
    )

    story.append(p("Висновок", styles["H1Room"]))
    story.append(
        p(
            "OLAP, сховище даних, вітрини даних і Data Mining є взаємопов'язаними елементами сучасної аналітичної інфраструктури. OLAP забезпечує швидкий багатовимірний аналіз, сховище даних створює надійну історичну основу, вітрини даних надають зручні тематичні зрізи, а Data Mining дозволяє знаходити приховані закономірності та будувати прогнози. Разом ці підходи перетворюють накопичені дані на практичні знання для управління системою, бізнесом або цифровою платформою.",
            styles["BodyRoom"],
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUT)
