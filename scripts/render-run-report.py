"""Render the educational dynamometer report with traceable model and data references."""

import csv
from datetime import datetime, timedelta, timezone
from html import escape
import io
import json
import math
import os
from pathlib import Path
import re
import sys

try:
    from reportlab.lib.colors import HexColor
    from reportlab.lib.enums import TA_JUSTIFY
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.platypus import Paragraph
    from reportlab.platypus.paraparser import ParaParser
except ModuleNotFoundError as error:
    if error.name != "reportlab":
        raise
    sys.exit("PDF reports require ReportLab in the simulator's Python environment.")


ROOT = Path(__file__).resolve().parents[1]
INK, GRID = "#000000", "#C6C6C6"
SIMULATED_TRACE, MEASURED_TRACE, TARGET_TRACE, SECONDARY_TRACE = "#245BB6", "#00796A", "#A04C12", "#59738A"
GUIDE_BAND = "#F6E6C8"
LEFT, RIGHT = 42, 553
MAJOR_GRID, MINOR_GRID = "#B5B5B5", "#DEDEDE"
M1_STEADY_DECELERATION_M_S2 = 5.8
BODY_SIZE = 9
HEADING_SIZE = 12
REPORT_TIMEZONE = timezone(timedelta(hours=2))


def tick_step(span, intervals):
    target = span / intervals
    magnitude = 10 ** math.floor(math.log10(target))
    return next(k * magnitude for k in (1, 2, 2.5, 3, 5, 10) if k * magnitude >= target)


class Report:
    def __init__(self, run, output=None):
        self.run = run
        self.uk = run["lang"] == "uk"
        self.page = Canvas(sys.stdout.buffer if output is None else output, pagesize=A4)
        started_at = run.get("startedAt")
        self.test_start = (
            datetime.fromisoformat(started_at.replace("Z", "+00:00")).astimezone(REPORT_TIMEZONE)
            if started_at else None
        )
        self.title = self.t("Theoretical dynamometer test report",
                            "Звіт про теоретичне випробування на динамометричному стенді")
        self.page.setTitle(self.title)
        self.spec = json.loads((ROOT / "data/vehicle.json").read_text())
        self.vehicle_label = f"Tesla, Model 3, (Standard Range Plus, № {self.spec['plate']}, 2020, LFP, RWD)"
        self.sources = json.loads((ROOT / "data/references.json").read_text())
        self.samples = list(csv.DictReader(io.StringIO(run["traceCsv"])))
        self.recording = run.get("benchmark", {}).get("points", [])
        self.diagnostics = run.get("diagnostics")
        fonts = Path(os.environ.get("REPORT_FONT_DIR", "/usr/share/fonts/truetype/dejavu"))
        self.font, self.bold = "Report", "ReportBold"
        pdfmetrics.registerFont(TTFont(self.font, str(fonts / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont(self.bold, str(fonts / "DejaVuSans-Bold.ttf")))
        self.math_font = self.font
        italic = fonts / "DejaVuSans-Oblique.ttf"
        if (fonts / "DejaVuSerif.ttf").is_file() and (fonts / "DejaVuSerif-Italic.ttf").is_file():
            self.math_font = "ReportMath"
            pdfmetrics.registerFont(TTFont(self.math_font, str(fonts / "DejaVuSerif.ttf")))
            italic = fonts / "DejaVuSerif-Italic.ttf"
        math_italic = self.math_font
        if italic.is_file():
            math_italic = "ReportMathItalic"
            pdfmetrics.registerFont(TTFont(math_italic, str(italic)))
        pdfmetrics.registerFontFamily(self.math_font, normal=self.math_font, italic=math_italic)
        self.equation_style = ParagraphStyle("Equation", fontName=self.math_font, fontSize=11)
        self.math_note_style = ParagraphStyle("Math note", fontName=self.font, fontSize=BODY_SIZE,
                                              leading=12, alignment=TA_JUSTIFY)

    def t(self, en, uk):
        return uk if self.uk else en

    def text(self, x, y, text, size=BODY_SIZE, bold=False, align="left"):
        font = self.bold if bold else self.font
        self.page.setFont(font, size)
        self.page.setFillColor(HexColor(INK))
        draw = {"left": self.page.drawString, "center": self.page.drawCentredString, "right": self.page.drawRightString}
        draw[align](x, y, str(text))

    def para(self, y, text, x=LEFT, width=RIGHT-LEFT, size=BODY_SIZE, line=13):
        def draw_line(value, baseline):
            self.text(x, baseline, value, size)
            for match in re.finditer(r"\[(\d+)\]", value):
                index = int(match[1]) - 1
                if 0 <= index < len(self.sources):
                    start = x + pdfmetrics.stringWidth(value[:match.start()], self.font, size)
                    end = start + pdfmetrics.stringWidth(match[0], self.font, size)
                    self.page.linkURL(self.sources[index]["url"], (start, baseline-2, end, baseline+size), relative=0)

        row = ""
        for word in text.split():
            candidate = (row + " " + word).strip()
            if row and pdfmetrics.stringWidth(candidate, self.font, size) > width:
                draw_line(row, y)
                row = word
                y -= line
            else:
                row = candidate
        if row:
            draw_line(row, y)
        return y - line

    def rule(self, y, color=GRID):
        self.page.setStrokeColor(HexColor(color))
        self.page.setLineWidth(0.65)
        self.page.line(LEFT, y, RIGHT, y)

    def header(self, title, section=None):
        self.text(LEFT, 764 if section else 742, title, HEADING_SIZE, bold=True)
        if section:
            self.text(LEFT, 742, section, HEADING_SIZE)
        self.rule(730)
        self.rule(48)
        self.text(LEFT, 32, self.t("Educational simulation report", "Навчальний звіт про симуляцію"))
        self.text(RIGHT, 32, self.page.getPageNumber(), HEADING_SIZE, align="right")

    def caption(self, y, number, title):
        self.text((LEFT+RIGHT)/2, y, f"{self.t('Figure', 'Рисунок')} {number}. {title}.", align="center")

    def equation(self, top, number, *terms):
        # Each part is inline math or a (numerator, denominator) pair.
        def math_line(markup):
            markup = markup.replace("<sub>", '<sub rise="2.5">').replace("<super>", '<super rise="4">')
            _, fragments, _ = ParaParser().parse(markup, self.equation_style)
            runs = []
            end = 0
            for fragment in fragments:
                # A superscript immediately after a subscript shares its origin.
                start = runs[-1][1] if runs and runs[-1][0].rise < 0 < fragment.rise else end
                runs.append((fragment, start))
                end = max(end, start + pdfmetrics.stringWidth(fragment.text, fragment.fontName, fragment.fontSize))
            return runs, end

        def draw_line(line, x, y):
            runs, _ = line
            text = self.page.beginText(x, y)
            for run, start in runs:
                text.setTextOrigin(x + start, y)
                text.setFont(run.fontName, run.fontSize)
                text.setRise(run.rise)
                text.textOut(run.text)
            self.page.drawText(text)

        blocks = [tuple(math_line(term) for term in (part if isinstance(part, tuple) else (part,))) for part in terms]
        widths = [max(width for _, width in lines) + (4 if len(lines) == 2 else 0) for lines in blocks]
        has_fraction = any(len(lines) == 2 for lines in blocks)
        y = top - (17 if has_fraction else 10)
        x = (LEFT + RIGHT - sum(widths)) / 2
        self.page.setFillColor(HexColor(INK))
        self.page.setStrokeColor(HexColor(INK))
        self.page.setLineWidth(0.6)
        for lines, width in zip(blocks, widths):
            if len(lines) == 2:
                numerator, denominator = lines
                draw_line(numerator, x + (width - numerator[1]) / 2, y + 8)
                self.page.line(x, y + 3, x + width, y + 3)
                draw_line(denominator, x + (width - denominator[1]) / 2, y - 9)
            else:
                draw_line(lines[0], x, y)
            x += width
        self.text(RIGHT, y, f"({number})", align="right")
        return y - (17 if has_fraction else 9)

    def math_note(self, top, markup):
        def citation(match):
            links = []
            for number in match[1].split(", "):
                url = escape(self.sources[int(number) - 1]["url"], quote=True)
                links.append(f'<link href="{url}">{number}</link>')
            return "[" + ", ".join(links) + "]"

        markup = re.sub(r"<math>(.*?)</math>", rf'<font name="{self.math_font}">\1</font>', markup)
        markup = markup.replace("<sub>", '<sub rise="2">')
        markup = re.sub(r"\[(\d+(?:, \d+)*)\]", citation, markup)
        note = Paragraph(markup, self.math_note_style)
        _, height = note.wrap(RIGHT - LEFT, A4[1])
        note.drawOn(self.page, LEFT, top - height)
        return top - height - 4

    def table(self, top, titles, rows, edges, height=23):
        self.rule(top)
        for row_index, cells in enumerate([titles, *rows]):
            y = top - height * (row_index + 1)
            for ci, value in enumerate(cells):
                self.text(edges[ci] + 8, y + 8, value, bold=row_index == 0)
            self.rule(y)

    def dimension(self, axis, start, end, fixed, extension, value):
        page = self.page
        page.setStrokeColor(HexColor(INK))
        page.setLineWidth(0.6)
        line = (lambda a,b,c,d: page.line(a,b,c,d)) if axis == "h" else (lambda a,b,c,d: page.line(b,a,d,c))
        for endpoint in (start, end):
            line(endpoint, fixed - 4, endpoint, extension)
        midpoint = (start + end) / 2
        gap = (pdfmetrics.stringWidth(value, self.font, 8) + 10) / 2
        line(start, fixed, midpoint-gap, fixed)
        line(midpoint+gap, fixed, end, fixed)
        for tip, direction in ((start, 1), (end, -1)):
            line(tip, fixed, tip+4*direction, fixed+2.3)
            line(tip, fixed, tip+4*direction, fixed-2.3)
        if axis == "h":
            self.text(midpoint, fixed-2.5, value, align="center")
        else:
            page.saveState()
            page.translate(fixed+2, midpoint)
            page.rotate(90)
            self.text(0, 0, value, align="center")
            page.restoreState()

    def experiment_title(self):
        run = self.run
        titles_uk = {
            "wltc": "WLTC класу 3b",
            "coc-speed": "Максимальна швидкість за CoC",
            "coc-range": "Запас ходу електромобіля за CoC",
            "charge-dc": "Швидке заряджання постійним струмом",
            "brake": "Випробування робочих гальм",
            "coastdown": "Випробування вибігом",
            "manual": "Ручне керування",
        }
        return self.t(run["title"], titles_uk.get(run["scenario"], run["title"]))

    def cover_page(self):
        t = self.t
        center = A4[0] / 2
        self.text(center, 775, t("Ministry of Education and Science of Ukraine", "Міністерство освіти і науки України"),
                  HEADING_SIZE, align="center")
        self.text(center, 754, t("Polissia National University", "Поліський національний університет"),
                  HEADING_SIZE, bold=True, align="center")
        self.text(center, 733, t("Department of Agricultural Engineering and Technical Service",
                                  "Кафедра агроінженерії та технічного сервісу"),
                  HEADING_SIZE, align="center")
        self.text(center, 702, t("Zhytomyr Agrotechnical Professional College", "Житомирський агротехнічний фаховий коледж"),
                  HEADING_SIZE, bold=True, align="center")
        self.text(center, 681, t("Department of Automotive Transport", "Кафедра «Автомобільний транспорт»"),
                  HEADING_SIZE, align="center")
        for path, offset, width in (
            ("models/report-polissia.png", -99, 64),
            ("models/report-college.png", -12, 49),
            ("public/department.png", 89, 99),
        ):
            self.page.drawImage(str(ROOT / path), center + offset - width / 2, 607, width, 49,
                                mask="auto", preserveAspectRatio=True)

        self.text(center, 564, self.title, HEADING_SIZE, bold=True, align="center")
        self.text(center, 528, self.experiment_title(), HEADING_SIZE, align="center")
        self.text(center, 506, self.vehicle_label, HEADING_SIZE, align="center")

        fields = [
            (315, 62, 158, 533, t("Student", "ПІБ студента")),
            (283, 62, 122, 197, t("Group", "Група")),
            (283, 219, 287, 352, t("Signature", "Підпис")),
            (283, 375, 419, 533, t("Date", "Дата")),
            (236, 62, 158, 533, t("Checked by", "Перевірив(ла)")),
            (204, 62, 122, 197, t("Grade", "Оцінка")),
            (204, 219, 287, 352, t("Signature", "Підпис")),
            (204, 375, 419, 533, t("Date", "Дата")),
        ]
        self.page.setStrokeColor(HexColor(INK))
        self.page.setLineWidth(0.55)
        for y, left, start, end, label in fields:
            self.text(left, y, label, HEADING_SIZE)
            self.page.line(start, y-1, end, y-1)

        country = t("Ukraine", "Україна")
        self.text(center, 71, f"{country}, {self.test_start.year}" if self.test_start else country,
                  HEADING_SIZE, align="center")
        self.page.showPage()

    def contents_page(self, sections):
        self.header(self.t("Contents", "Зміст"))
        first_section = self.page.getPageNumber() + 1
        for index, (anchor, title, _) in enumerate(sections):
            y = 691 - 28 * index
            self.text(LEFT, y, title, HEADING_SIZE)
            self.text(RIGHT, y, first_section + index, HEADING_SIZE, align="right")
            self.page.linkRect("", anchor, (LEFT, y - 5, RIGHT, y + HEADING_SIZE), relative=0, thickness=0)
        self.page.showPage()

    def vehicle_page(self, heading):
        t, spec, run = self.t, self.spec, self.run
        self.text(LEFT, 802, t("Vehicle test report", "Звіт про випробування автомобіля"), HEADING_SIZE, bold=True)
        self.text(LEFT, 782, self.vehicle_label, HEADING_SIZE)
        if self.test_start:
            self.text(LEFT, 762, t("Test start", "Початок випробування")
                      + f" {self.test_start:%Y-%m-%d %H:%M:%S} (GMT+2)", HEADING_SIZE)
        self.header(heading)
        self.para(710, t("The vehicle’s Certificate of Conformity (CoC) values are reported in Table 1.1 [1].",
                         "Дані сертифіката відповідності (CoC) автомобіля наведено в таблиці 1.1 [1]."))
        y = self.para(691, self.experiment_title(), line=15)
        status = {"Cycle complete": t("Cycle complete", "Цикл завершено"),
                  "Partial cycle": t("Partial cycle", "Неповний цикл"),
                  "Test complete": t("Test complete", "Випробування завершено"),
                  "Test ended": t("Test ended", "Випробування припинено"),
                  "Test in progress": t("Test in progress", "Випробування триває"),
                  "Recorded segment": t("Recorded segment", "Записаний відрізок")}[run["status"]]
        if run["driver"]:
            status += " · " + (t("Automatic", "Автоматичне") if run["driver"] == "Automatic"
                              else t("Manual pedals", "Ручне керування педалями"))
        elapsed = f'{run["elapsedS"]:.1f}' + (f' / {run["targetTime"]}' if run["targetTime"] else "")
        self.text(LEFT, y-2, f'{status} · {elapsed} '+t("s", "с"), bold=True)
        self.para(642, t("Figure 1.1 shows the vehicle projections, with dimensions in millimetres [2].",
                         "На рисунку 1.1 наведено проєкції автомобіля з розмірами в міліметрах [2]."))
        label = lambda key: str(round(spec[key] * 1000))
        image = lambda name, x, y, w, h: self.page.drawImage(
            str(ROOT / "models" / f"model3-{name}.png"), x, y, width=w, height=h, mask="auto")
        image("side", 61, 523, 287, 79)
        self.text(61, 615, t("Side", "Збоку"), bold=True)
        self.dimension("h", 61, 348, 488, 521, label("lengthM"))
        self.dimension("h", 112, 288, 505, 527, label("wheelbaseM"))
        image("front", 391, 523, 133, 79)
        self.text(391, 615, t("Front", "Спереду"), bold=True)
        self.dimension("v", 523, 602, 544, 517, label("heightM"))
        self.dimension("h", 398, 517, 505, 521, label("widthM"))
        image("top", 61, 337, 287, 133)
        self.text(381, 454, t("Top", "Зверху"), bold=True)
        self.para(432, t("Body width excludes mirrors. Axle track is 1580 mm [2]. The projections illustrate the car’s shape.",
                         "Ширина кузова без дзеркал. Колія — 1580 мм [2]. Проєкції ілюструють форму кузова."),
                  x=381, width=166)
        self.caption(322, "1.1", t("Dimensioned projections of the test vehicle [2, 7]", "Габаритні проєкції випробуваного автомобіля [2, 7]"))
        self.text(LEFT, 306, t("Table 1.1. Published vehicle data.", "Таблиця 1.1. Опубліковані дані автомобіля."), bold=True)
        self.table(291, [t("Parameter", "Параметр"), t("Published value", "Опубліковане значення")], [
            (t("Tyres / nominal pack energy [1]", "Шини / номінальна енергія батареї [1]"), "235/45 R18 98Y / 58 " + t("kWh", "кВт·год")),
            (t("CoC actual mass [1]", "Фактична маса за CoC [1]"), "1861 " + t("kg", "кг")),
            (t("Peak / 30 min motor power [1]", "Пікова / 30-хв. потужність двигуна [1]"), "239 / 100 " + t("kW", "кВт")),
            (t("CoC top speed / WLTP range [1]", "Макс. швидкість / запас ходу WLTP за CoC [1]"),
             "225 " + t("km/h", "км/год") + " / 440 " + t("km", "км")),
        ], [LEFT, 362, RIGHT])
        self.text(LEFT, 149, t("Run conditions", "Умови випробування"), HEADING_SIZE, bold=True)
        chamber = run.get("chamber")
        air = t("Simulated chamber air", "Змодельоване повітря в камері") + f' {run["ambient"]:.1f} °C'
        if chamber:
            air += ("   ·   " + t("Relative humidity", "Відн. вологість") + f' {chamber["humidityPct"]:g} %   ·   '
                    + t("Pressure", "Тиск") + f' {chamber["pressureKpa"]:.3f} ' + t("kPa", "кПа"))
        self.text(LEFT, 127, air, 9)
        self.text(LEFT, 110, t("Pack", "Батарея") + f' {run["initialTemp"]:.1f} → {run["finalTemp"]:.1f} °C   ·   SOC ' +
                  f'{run["initialSoc"]:.1f} → {run["finalSoc"]:.1f} %', 9)
        trace_hz = 10 if run.get("scenario") == "brake" else 1
        self.para(90, t(f"The plant integrates every 20 ms. Controls update every 100 ms and the trace is recorded at {trace_hz} Hz.",
                         f"Модель інтегрується з кроком 20 мс. Керування оновлюється кожні 100 мс, сигнали записано з частотою {trace_hz} Гц."))
        self.page.showPage()

    def plot(self, number, caption, quantity, bottom, height, signals, include_zero=False, interval=None, milestones=()):
        p = self.page
        t = self.t
        elapsed = self.run["elapsedS"]
        left, right = 87, RIGHT - 16
        top = bottom + height
        series = [(name, color, dash, points) for name, color, dash, points in signals if points]
        self.text(LEFT, top+12, quantity, bold=True)
        self.caption(bottom-39, number, caption)
        values = [value for _, _, _, points in series for _, value in points]
        if not values:
            self.text(left, bottom + height/2, t("No samples", "Немає даних"))
            return
        if interval:
            values.extend(value for edge in interval for _, value in edge)
        lo, hi = min(values), max(values)
        if include_zero:
            lo, hi = min(0, lo), max(0, hi)
        if lo == hi:
            padding = max(abs(lo) * 0.02, 0.1)
            hi += padding
            if not include_zero:
                lo -= padding
        step_y = tick_step(hi-lo, 5 if height > 120 else 3)
        lo = min(0, lo) if interval else math.floor(lo / step_y) * step_y
        hi = math.ceil(hi / step_y) * step_y
        step_x = tick_step(elapsed, 6)
        x_at = lambda time: left+(right-left)*time/elapsed
        y_at = lambda value: bottom+height*(value-lo)/(hi-lo)

        legend = [(name, color, dash) for name, color, dash, _ in series if name]
        if interval:
            legend.append((t("Guide band", "Межі підказки"), GUIDE_BAND, None))
            lower, upper = interval
            polygon = p.beginPath()
            for i, (time, value) in enumerate(lower + upper[::-1]):
                (polygon.moveTo if i == 0 else polygon.lineTo)(x_at(time), y_at(value))
            polygon.close()
            p.setFillColor(HexColor(GUIDE_BAND))
            p.drawPath(polygon, fill=1, stroke=0)
        x = right
        for name, color, dash in reversed(legend):
            width = pdfmetrics.stringWidth(name, self.font, 9)
            self.text(x, top+12, name, align="right")
            if dash is None:
                p.setFillColor(HexColor(color))
                p.rect(x-width-20, top+12, 14, 5, stroke=0, fill=1)
            else:
                p.setStrokeColor(HexColor(color))
                p.setDash(dash)
                p.setLineWidth(1.4)
                p.line(x-width-20, top+14, x-width-6, top+14)
            x -= width + 30

        for minor in (True, False):
            p.setStrokeColor(HexColor(MINOR_GRID if minor else MAJOR_GRID))
            p.setLineWidth(0.32 if minor else 0.58)
            p.setDash([1.6, 1.6] if minor else [])
            subdivisions = 4 if height > 120 else 2
            divisor = subdivisions if minor else 1
            unit_y, unit_x = step_y/divisor, step_x/divisor
            lower_tick = math.ceil(lo/unit_y - 1e-8)
            upper_tick = math.floor(hi/unit_y + 1e-8)
            for i in range(lower_tick, upper_tick+1):
                if not minor or i % subdivisions:
                    y = y_at(i * unit_y)
                    p.line(left, y, right, y)
            for i in range(math.floor(elapsed/unit_x + 1e-8)+1):
                if not minor or i % subdivisions:
                    x = x_at(i * unit_x)
                    p.line(x, bottom, x, top)

        p.setDash()
        p.setStrokeColor(HexColor(INK))
        p.setLineWidth(0.75)
        p.line(left, bottom, right+8, bottom)
        p.line(left, bottom, left, top+8)
        p.lines([(right+8,bottom,right+2,bottom+2.3), (right+8,bottom,right+2,bottom-2.3),
                 (left,top+8,left-2.3,top+2), (left,top+8,left+2.3,top+2)])
        for i in range(math.ceil(lo/step_y - 1e-8), math.floor(hi/step_y + 1e-8)+1):
            value = i * step_y
            y = y_at(value)
            p.line(left-3.5, y, left, y)
            self.text(left-6, y-3, f"{value:g}", align="right")
        for i in range(math.floor(elapsed/step_x + 1e-8)+1):
            time = i * step_x
            x = x_at(time)
            p.line(x, bottom-3.5, x, bottom)
            self.text(x, bottom-13, f"{time:g}", align="center")
        self.text((left+right)/2, bottom-25, t("Time, s", "Час, с"), align="center")

        for name, color, dash, points in series:
            p.setStrokeColor(HexColor(color))
            p.setLineWidth(1.4 if not dash else 1.0 if name else 0.7)
            p.setDash(dash)
            if len(points) == 1:
                time, value = points[0]
                p.setFillColor(HexColor(color))
                p.circle(x_at(time), y_at(value), 1.6, fill=1, stroke=0)
            else:
                path = p.beginPath()
                for i, (time, value) in enumerate(points):
                    (path.moveTo if i == 0 else path.lineTo)(x_at(time), y_at(value))
                p.drawPath(path)
        p.setDash()
        for point in milestones:
            time, speed = point["timeS"], point["speedKph"]
            if time is None:
                continue
            x, y = x_at(time), y_at(speed)
            p.setStrokeColor(HexColor(TARGET_TRACE))
            p.setLineWidth(0.7)
            p.setDash([2, 2])
            p.line(x, bottom, x, y)
            p.setDash()
            p.setFillColor(HexColor(TARGET_TRACE))
            p.circle(x, y, 2.5, fill=1, stroke=0)
            label = f"{speed:g} " + t("km/h", "км/год") + f" · {time:.1f} " + t("s", "с")
            self.text(x+5, y+7, label)

    def sampled(self, key):
        return [(float(row["time_s"]), float(row[key])) for row in self.samples if row.get(key) not in ("", None)]

    def measured(self, key):
        return [(index, row[key]) for index, row in enumerate(self.recording[:int(self.run["elapsedS"])+1])
                if row.get(key) is not None]

    def results_page(self, heading):
        t, run = self.t, self.run
        scenario, coc = run.get("scenario"), run.get("coc") or {}
        charging = scenario == "charge-dc"
        roller = run.get("rollerTest")
        subtitle = (t("Level-road simulation", "Моделювання рівної дороги") if roller
                    else t("Method and energy at the pack terminals", "Методика та енергія на клемах батареї"))
        self.header(heading, subtitle)
        if scenario == "coc-speed":
            note = t("The 90 s full-throttle simulation applies level-road resistance, including aerodynamic drag [1]. The motor-speed limit constrains the plateau. Acceleration times include precharge. The result uses the mean speed over the final kilometre, with samples within 1% of the mean. See UN Regulation No. 68 for the road procedure [8].",
                     "Випробування триває 90 с за повного натискання акселератора з опором рівної дороги та повітря [1]. Сталу швидкість обмежує частота обертання двигуна. Час розгону враховує попереднє заряджання. Результат – середня швидкість на останньому кілометрі, якщо відхилення відліків не перевищує 1 %. Дорожню методику наведено в Правилах ООН № 68 [8].")
        elif charging:
            note = t("The stationary vehicle uses a DC source rated at 150 kW. The pack power envelope follows the TUM charging record [6]. The simulation tapers charging power near the selected 80% cutoff.",
                     "Нерухомий автомобіль заряджається від джерела постійного струму потужністю до 150 кВт. Межа потужності батареї відтворює запис TUM [6]. Біля заданої межі 80 % модель плавно знижує потужність.")
        elif scenario == "brake":
            note = t("The simulated vehicle starts at 50 km/h. Full friction braking is applied in neutral on level ground. The fault setting scales total friction brake force to 50% of nominal.",
                     "Задано початкову швидкість 50 км/год. На рівній дорозі в нейтральному режимі застосовано повне фрикційне гальмування. За внесеної несправності сумарна гальмівна сила становить 50 % номінальної.")
        elif scenario == "coastdown":
            note = t("The simulated vehicle coasts in neutral from 100 to 20 km/h on level ground. The speed-dependent road-load force represents resistance to motion [1].",
                     "Змодельовано вибіг у нейтральному режимі від 100 до 20 км/год на рівній дорозі. Опір руху задано силою, що залежить від швидкості [1].")
        elif run["cycleId"] in ("wltc", "wltc-city", "wltc-3b-three-phase"):
            note = t("The Worldwide Harmonized Light Vehicles Test Procedure (WLTP) specifies the Worldwide Light-duty Test Cycle (WLTC). Annex B1 of UN Regulation No. 154 defines the cycle and Annex B8 describes electric energy and range testing [5].",
                     "Всесвітня гармонізована процедура випробування легких транспортних засобів (WLTP) визначає всесвітній їздовий цикл для легких транспортних засобів (WLTC). Цикл наведено в додатку B1, а випробування витрат енергії та запасу ходу – у додатку B8 Правил ООН № 154 [5].")
        elif run["cycleId"]:
            note = t(f'The simulation follows the selected {run["title"]} speed profile.',
                     f'Модель відтворює заданий профіль швидкості випробування «{run["title"]}».')
        else:
            note = t("Figure 2.1 shows the vehicle speed for the recorded run under the selected controls.",
                     "На рисунку 2.1 наведено швидкість автомобіля за заданого керування.")
        y = self.para(710, note, line=11)
        if run["cycleId"] in ("wltc", "wltc-city", "wltc-3b-three-phase"):
            y = self.para(y-2, t(
                "The general Class 3 threshold is rated power divided by mass in running order less 75 kg, greater than 34 W/kg. For the four-phase procedure, Annex B1 also treats vehicles tested under Annex B8 as Class 3 [5]. Class 3b requires at least 120 km/h [5]. The Tesla’s published maximum is 225 km/h [1].",
                "Загальна межа класу 3 – понад 34 Вт/кг для відношення номінальної потужності до маси в спорядженому стані без 75 кг. У чотирифазній процедурі додаток B1 також відносить автомобілі, випробувані за додатком B8, до класу 3 [5]. Для підкласу 3b межа становить 120 км/год [5]. Опублікована максимальна швидкість Tesla становить 225 км/год [1]."), line=11)
        if scenario == "coc-range":
            y = self.para(y-2, t("The simulation repeats Class 3b until 1% battery charge. Annex B8 describes the full published range procedure [5].",
                                 "Модель повторює цикл класу 3b до 1 % заряду батареї. Повну опубліковану процедуру визначення запасу ходу наведено в додатку B8 [5]."), line=11)
        target = self.sampled("target_kph")
        limits = self.run["guideBandKph"]
        lower = [(time, value-limits) for time,value in target]
        upper = [(time, value+limits) for time,value in target]
        if target:
            y = self.para(y-2, t(f"Figure 2.1 shows speed tracking. The shaded band is the instantaneous driver guide (±{limits:g} km/h).",
                                 f"На рисунку 2.1 зафарбовано миттєві межі підказки водієві (±{limits:g} км/год)."), line=11)
        speed = [(t("Simulated", "Симуляція"), SIMULATED_TRACE, [], self.sampled("speed_kph")),
                 (t("TUM measured", "Вимірювання TUM"), SECONDARY_TRACE, [2, 2], self.measured("speedKph")),
                 (t("Target", "Завдання"), TARGET_TRACE, [4, 2], target),
                 ("", TARGET_TRACE, [1, 2], lower), ("", TARGET_TRACE, [1, 2], upper)]
        plot_bottom = 449
        height = min(151, y - 22 - plot_bottom)
        if charging:
            signals = [(t("DC source", "Джерело"), SECONDARY_TRACE, [3, 2], self.sampled("source_kw")),
                       (t("Into pack", "До батареї"), SIMULATED_TRACE, [],
                        [(time, -power) for time, power in self.sampled("battery_power_kw")])]
            self.plot("2.1", t("DC source and pack charging power", "Потужність джерела та заряджання батареї"),
                      t("Power, kW", "Потужність, кВт"), plot_bottom, height, signals, include_zero=True)
        else:
            self.plot("2.1", t("Vehicle speed over the test", "Швидкість автомобіля впродовж випробування"),
                      t("Speed, km/h", "Швидкість, км/год"), plot_bottom, height, speed,
                      include_zero=True, interval=(lower, upper) if target else None,
                      milestones=run.get("accelerationTimes", ()))
        if target:
            errors = [abs(float(row["speed_kph"])-float(row["target_kph"]))
                      for row in self.samples if float(row["time_s"])>0 and row["target_kph"]]
            if errors:
                guide_hits = sum(error <= limits for error in errors)
                error = run["targetRmse"]
                comment = t("Within instantaneous guide limits", "У миттєвих межах підказки")
                text = f"{comment}: {guide_hits} / {len(errors)} ({guide_hits / len(errors):.1%})"
                if error is not None:
                    text += "   ·   " + t("Target speed RMSE", "СКП швидкості") + f' {error:.2f} ' + t("km/h", "км/год")
                self.text(LEFT, 390, text)

        if roller:
            self.roller_results(roller)
            self.page.showPage()
            return
        self.text(LEFT, 364, t("Table 2.1. Comparison of the run results.", "Таблиця 2.1. Порівняння результатів випробування."), bold=True)
        ref = run["comparison"] or {}
        kwh, km = t("kWh", "кВт·год"), t("km", "км")
        rows = [
            (t("Distance", "Відстань") + f" ({km})", "distance", 3, "—"),
            (t("Discharged energy", "Енергія розряду") + f" ({kwh})", "out", 3, "—"),
            (t("Returned energy", "Повернена енергія") + f" ({kwh})", "into", 3, "—"),
            (t("Net DC pack energy", "Чиста енергія батареї") + f" ({kwh})", "net", 3, "—"),
            (t("Net pack consumption (kWh/100 km)", "Чисті витрати батареї (кВт·год/100 км)"), "consumption", 2, "—"),
        ]
        cells = [(name, self.fmt(run.get(key), precision), self.fmt(ref.get(key), precision), published)
                 for name, key, precision, published in rows]
        if scenario == "coc-speed":
            cells.append((t("Top speed (km/h)", "Макс. швидкість (км/год)"), self.fmt(coc.get("value"), 1), "—",
                          f'{coc["reference"]} [1]'))
            for point in run.get("accelerationTimes", ()):
                speed_label = f'0–{point["speedKph"]:g} '
                cells.append((speed_label + t("km/h (s)", "км/год (с)"), self.fmt(point["timeS"], 1), "—", "—"))
            cells.append((t("Final road-load power (kW)", "Потужність опору наприкінці (кВт)"),
                          self.fmt(run.get("roadLoadKw"), 1), "—", "—"))
        elif not charging:
            cells.append((t("WLTP range (km)", "Запас ходу WLTP (км)"),
                          self.fmt(coc.get("value"), 1) if scenario == "coc-range" else "—", "—", "440 [1]"))
            cells.append((t("U.S. AC label (kWh/100 km)", "Етикетка США, AC (кВт·год/100 км)"), "—", "—", "14.9 [3, 4]"))
        if run["sourceEnergy"] is not None:
            cells.append((t("DC source energy", "Енергія джерела") + f" ({kwh})", self.fmt(run["sourceEnergy"], 3), "—", "—"))
        if run.get("coolingEnergy", 0) > 0:
            cells.extend([
                (t("Pack cooling electricity", "Електроенергія охолодження") + f" ({kwh})", self.fmt(run["coolingEnergy"], 3), "—", "—"),
                (t("Active heat removal", "Відведено тепла") + f" ({kwh})", self.fmt(run["heatRemoved"], 3), "—", "—"),
            ])
        row_height = 19
        self.table(351, [t("Metric", "Показник"), t("Live run", "Симуляція"), t("TUM reference [6]", "Еталон TUM [6]"),
                         t("Published", "Опубліковано")], cells,
                   [LEFT, 267, 346, 454, RIGHT], height=row_height)
        y = 351-row_height*(len(cells)+1)-17
        if run["consumption"] is not None:
            y = self.para(y, t("Net pack consumption in Table 2.1 is calculated using equation (2.1),",
                               "Чисті витрати батареї в таблиці 2.1 розраховано за формулою (2.1),"), line=12)
            y = self.equation(y+5, "2.1", "<i>C</i><sub>100</sub> = 100 × ",
                              ("<i>E</i><sub>out</sub> − <i>E</i><sub>in</sub>", "<i>d</i>"), ",")
            y = self.math_note(y, t(
                "where <math><i>C</i><sub>100</sub></math> is consumption, kWh/100 km, <math><i>E</i><sub>out</sub></math> and "
                "<math><i>E</i><sub>in</sub></math> are discharged and returned pack energy, kWh, and <math><i>d</i></math> is distance, km.",
                "де <math><i>C</i><sub>100</sub></math> – витрати, кВт·год/100 км, <math><i>E</i><sub>out</sub></math> і "
                "<math><i>E</i><sub>in</sub></math> – енергія розряду й повернення на клемах батареї, кВт·год, а <math><i>d</i></math> – відстань, км.")) - BODY_SIZE
        if scenario != "coc-speed" and not charging:
            y = self.para(y, t("The published range and U.S. label come from separate tests [1, 3–5].",
                               "Опубліковані запас ходу й показник етикетки США отримано в окремих випробуваннях [1, 3–5]."), line=11)
        if ref:
            y = self.para(y-3, t("RMSE against TUM", "СКП відносно TUM") +
                          f': {ref["speedRmse"]:.2f} '+t("km/h speed", "км/год швидкості")+
                          f', {ref["powerRmse"]:.2f} '+t("kW pack power [6].", "кВт потужності батареї [6]."))
        reason = {
            "unstable-speed": t("The final kilometre did not meet the steady-speed criterion.", "Останній кілометр не відповідає критерію сталої швидкості."),
            "time-limit": t("The test reached the 24 h time limit.", "Досягнуто обмеження тривалості випробування у 24 год."),
        }.get(coc.get("end"))
        if run.get("faultCode"):
            fault = run["faultCode"]
            heading = t("Test stopped", "Випробування зупинено") if run.get("abortReason") else t("Fault recorded", "Зареєстровано несправність")
            y = self.para(y-3, heading + " · " + fault + " " + t("High-voltage interlock circuit (simulated) [10].",
                                                                  "Коло блокування високовольтної системи (симуляція) [10]."))
        elif reason:
            y = self.para(y-3, reason)
        self.para(y-3, t("Energy-balance residuals", "Нев’язки енергобалансу") +
                  f': {run["vehicleResidual"]:.2e} '+t("J vehicle", "Дж автомобіля")+
                  f', {run["batteryResidual"]:.2e} '+t("J pack.", "Дж батареї."))
        self.page.showPage()

    def roller_results(self, roller):
        t, run = self.t, self.run
        self.text(LEFT, 364, t("Table 2.1. Roller test results.", "Таблиця 2.1. Результати випробування на роликах."), bold=True)
        rows = [
            (t("Initial speed (km/h)", "Початкова швидкість (км/год)"), self.fmt(roller["initialSpeedKph"], 1)),
            (t("Final speed (km/h)", "Кінцева швидкість (км/год)"), self.fmt(roller["finalSpeedKph"], 1)),
            (t("Elapsed time (s)", "Тривалість (с)"), self.fmt(run["elapsedS"], 1)),
            (t("Distance (m)", "Відстань (м)"), self.fmt(1000 * run["distance"], 1)),
            (t("Mean deceleration (m/s²)", "Середнє сповільнення (м/с²)"), self.fmt(roller["meanDeceleration"], 2)),
        ]
        braking = roller["brakeForcePct"] is not None
        deceleration = None
        if braking:
            if run["status"] == "Test complete":
                deceleration = self.steady_braking_deceleration(roller["initialSpeedKph"])
            rows.extend([
                (t("Friction brake force setting (%)", "Налаштування фрикційної гальмівної сили (%)"),
                 self.fmt(roller["brakeForcePct"], 0)),
                (t("Steady-braking estimate (m/s²)", "Оцінка усталеного сповільнення (м/с²)"),
                 self.fmt(deceleration, 2)),
                (t("Passenger-car deceleration reference (m/s²)", "Орієнтир сповільнення легкового автомобіля (м/с²)"),
                 self.fmt(M1_STEADY_DECELERATION_M_S2, 2)),
            ])
        self.table(351, [t("Parameter", "Параметр"), t("Value", "Значення")],
                   rows, [LEFT, 381, RIGHT], height=20)
        if not braking:
            return

        y = 351 - 20 * (len(rows) + 1)
        self.text(LEFT, y-19, t("Simulated verdict", "Висновок симуляції"), HEADING_SIZE, bold=True)
        if deceleration is None:
            self.text(LEFT, y-34, t("A complete braking trace is required for assessment.",
                                   "Для оцінювання потрібен повний запис гальмування."), bold=True)
            return

        failed = deceleration < M1_STEADY_DECELERATION_M_S2
        verdict = (t("Unsatisfactory service brakes. Repair and reinspection required.",
                     "Несправні робочі гальма. Потрібні ремонт і повторна перевірка.")
                   if failed else t("Braking meets the educational reference.",
                                    "Гальмування відповідає навчальному критерію."))
        self.text(LEFT, y-34, verdict, bold=True)
        y = self.para(y-53, t("The estimate uses 80% to 10% of initial speed [12]. Sweden’s alternative test starts at 40–50 km/h. Below 5.8 m/s² is a grade 2 defect for the Personbil (2012) category [13]. Ukraine’s road test starts at 35–45 km/h and requires two stops in opposite directions [11].",
                              "Оцінку визначено в межах від 80 % до 10 % початкової швидкості [12]. У Швеції альтернативне випробування починають з 40–50 км/год. Сповільнення нижче 5,8 м/с² відповідає несправності категорії 2 для групи Personbil (2012) [13]. В Україні випробування починають з 35–45 км/год і виконують два гальмування у протилежних напрямках [11]."),
                      line=11)
        self.para(y-4, t("The verdict applies to this simulated case.", "Висновок стосується змодельованого випадку."),
                  line=11)

    def steady_braking_deceleration(self, initial_speed_kph):
        samples = [(float(row["speed_kph"]), 1000 * float(row["distance_km"])) for row in self.samples]
        high, low = 0.8 * initial_speed_kph, 0.1 * initial_speed_kph
        crossing_distances = []
        for target in (high, low):
            for (v0, s0), (v1, s1) in zip(samples, samples[1:]):
                if v0 > v1 and v0 >= target >= v1:
                    fraction = (v0 - target) / (v0 - v1)
                    crossing_distances.append(s0 + fraction * (s1 - s0))
                    break
        if len(crossing_distances) != 2:
            return None
        distance = crossing_distances[1] - crossing_distances[0]
        return (high**2 - low**2) / (2 * 3.6**2 * distance) if distance > 0 else None

    @staticmethod
    def fmt(value, precision):
        return "—" if value is None else f"{value:.{precision}f}"

    def telemetry_page(self, heading):
        t = self.t
        if self.run.get("rollerTest"):
            braking = self.run["scenario"] == "brake"
            self.header(heading,
                        t("Friction braking and road load", "Фрикційне гальмування й опір руху") if braking
                        else t("Road load during neutral coastdown", "Опір руху під час вибігу"))
            if braking:
                self.plot("3.1", t("Total friction brake force", "Сумарна сила фрикційного гальмування"),
                          t("Force, N", "Сила, Н"), 490, 165,
                          [(t("Simulated", "Симуляція"), SIMULATED_TRACE, [], self.sampled("friction_force_n"))], include_zero=True)
            self.plot("3.2" if braking else "3.1", t("Road-load power [1]", "Потужність опору руху [1]"),
                      t("Power, kW", "Потужність, кВт"), 235 if braking else 470, 170,
                      [(t("Simulated", "Симуляція"), MEASURED_TRACE, [], self.sampled("road_load_kw"))], include_zero=True)
            self.page.showPage()
            return
        self.header(heading,
                    t("Positive power and current indicate discharge", "Додатні потужність і струм відповідають розряду"))
        if self.recording:
            self.para(712, t("Figures 3.1–3.4 include reference measured data from the Technical University of Munich (TUM) [6].",
                             "Рисунки 3.1–3.4 містять еталонні виміряні дані Мюнхенського технічного університету (TUM) [6]."), line=10)
        else:
            self.para(712, t("Figures 3.1–3.4 show the simulated pack terminal and temperature signals.",
                             "На рисунках 3.1–3.4 наведено змодельовані величини на клемах і температуру батареї."), line=10)
        sim, tum = t("Simulated", "Симуляція"), t("TUM [6]", "TUM [6]")
        definitions = [
            (t("DC power at the pack terminals", "Потужність постійного струму на клемах батареї"),
             t("Power, kW", "Потужність, кВт"), "battery_power_kw", "batteryKw", True),
            (t("Voltage at the pack terminals", "Напруга на клемах батареї"),
             t("Voltage, V", "Напруга, В"), "battery_voltage_v", "voltageV", False),
            (t("Current at the pack terminals", "Струм на клемах батареї"),
             t("Current, A", "Струм, А"), "battery_current_a", "currentA", True),
            (t("Battery pack temperature", "Температура тягової батареї"),
             t("Temperature, °C", "Температура, °C"), "battery_temp_c", None, False),
        ]
        for index, (title, quantity, key, ref, zero) in enumerate(definitions, 1):
            signals = [(sim, SIMULATED_TRACE, [], self.sampled(key))]
            if ref:
                signals.append((tum, MEASURED_TRACE, [3, 2], self.measured(ref)))
            else:
                signals += [(t("TUM min. [6]", "TUM мін. [6]"), MEASURED_TRACE, [3,2], self.measured("minTempC")),
                            (t("TUM max. [6]", "TUM макс. [6]"), SECONDARY_TRACE, [2,2], self.measured("maxTempC"))]
            self.plot(f"3.{index}", title + (" [6]" if self.recording else ""), quantity, 609 - (index-1)*146,
                      76, signals, include_zero=zero)
        if self.recording:
            offset = self.run["benchmark"]["offsetS"]
            self.para(107, t(f"TUM reference starts +{offset} s into the recording. Current is smoothed in the source. The model reports one pack temperature, compared with the measured minimum and maximum [1, 6].",
                             f"Дані TUM зміщено на +{offset} с. Струм згладжено у вихідному записі. Єдина температура моделі порівнюється з виміряними мінімумом і максимумом [1, 6]."), line=11)
        self.page.showPage()

    def references_page(self, heading):
        t = self.t
        self.header(heading,
                    t("Regulations, published data and vehicle geometry", "Нормативні документи, опубліковані дані та геометрія автомобіля"))
        y = 706
        included = list(range(1, 8))
        if self.run.get("scenario") == "coc-speed":
            included.append(8)
        if self.diagnostics and self.diagnostics["speedReply"]:
            included.append(9)
        if self.run.get("faultCode"):
            included.append(10)
        if self.run["scenario"] == "brake":
            included.extend((11, 12, 13))
        for index in included:
            entry = self.sources[index-1]
            number = f"[{index}]"
            self.text(LEFT, y, number, bold=True)
            self.page.linkURL(entry["url"], (LEFT, y-2, LEFT+18, y+9), relative=0)
            title = entry["title"]
            y = self.para(y, t(title, entry.get("titleUk", title)), x=LEFT+22, width=RIGHT-LEFT-22, line=13)
            if license := entry.get("license"):
                self.text(LEFT+22, y, license["title"])
                width = pdfmetrics.stringWidth(license["title"], self.font, 9)
                self.page.linkURL(license["url"], (LEFT+22, y-2, LEFT+22+width, y+8), relative=0)
                y -= 13
            y -= 7
        self.page.showPage()

    def model_page(self, heading):
        t = self.t
        self.header(heading, t("Equations used in the simulator", "Рівняння моделі симулятора"))

        def subheading(y, label):
            self.text(LEFT, y - HEADING_SIZE, label, HEADING_SIZE, bold=True)
            return y - 21

        y = subheading(716, t("A.1 Longitudinal motion", "А.1 Поздовжній рух"))
        y = self.equation(y, "A.1", "<i>m</i><sub>eff</sub> ",
                          ("d<i>v</i>", "d<i>t</i>"),
                          " = <i>F</i><sub>m</sub> − <i>F</i><sub>f</sub> − <i>F</i><sub>road</sub> − <i>F</i><sub>grade</sub>,")
        y = self.math_note(y, t(
            "where <math><i>m</i><sub>eff</sub></math> is the effective mass including rotating parts, kg, "
            "<math><i>v</i></math> is speed, m/s, and <math><i>t</i></math> is time, s. The forces "
            "<math><i>F</i><sub>m</sub></math>, <math><i>F</i><sub>f</sub></math>, "
            "<math><i>F</i><sub>road</sub></math> and <math><i>F</i><sub>grade</sub></math> are motor, friction brake, "
            "road-load and grade forces, respectively, in N. Motor force is negative during regeneration.",
            "де <math><i>m</i><sub>eff</sub></math> – зведена маса з урахуванням обертових частин, кг, "
            "<math><i>v</i></math> – швидкість, м/с, <math><i>t</i></math> – час, с. Сили "
            "<math><i>F</i><sub>m</sub></math>, <math><i>F</i><sub>f</sub></math>, "
            "<math><i>F</i><sub>road</sub></math> і <math><i>F</i><sub>grade</sub></math> відповідно описують дію двигуна, "
            "фрикційних гальм, опір руху та дію ухилу, Н. Під час рекуперації сила двигуна від’ємна."))
        y = self.equation(y, "A.2", "<i>F</i><sub>road</sub> = <i>A</i> + <i>Bv</i> + <i>Cv</i><super>2</super>,"
                          "  <i>F</i><sub>grade</sub> = <i>mg</i> sin <i>α</i>,")
        y = self.math_note(y, t(
            "where <math><i>A</i></math>, <math><i>B</i></math> and <math><i>C</i></math> are road-load coefficients in N, "
            "N·s/m and N·s²/m² [1, 6]. Vehicle mass <math><i>m</i></math> is in kg, gravitational acceleration "
            "<math><i>g</i></math> in m/s², and road angle <math><i>α</i></math> in rad. Level-road tests use <math><i>α</i> = 0</math>.",
            "де <math><i>A</i></math>, <math><i>B</i></math> і <math><i>C</i></math> – коефіцієнти опору руху в Н, "
            "Н·с/м і Н·с²/м² [1, 6]. Масу автомобіля <math><i>m</i></math> подано в кг, прискорення вільного падіння "
            "<math><i>g</i></math> – у м/с², кут нахилу дороги <math><i>α</i></math> – у рад. Для рівної дороги <math><i>α</i> = 0</math>."))

        y = subheading(y - 4, t("A.2 Drive and pack power", "А.2 Потужність привода й батареї"))
        y = self.equation(y, "A.3", "<i>P</i><sub>m,dc</sub> = ",
                          ("<i>F</i><sub>m</sub> <i>v̄</i> [1 + <i>a</i>(<i>v</i>)]", "<i>η</i><sub>g</sub>"),
                          " + <i>b</i><sub>eff</sub>(<i>v</i>) <i>F</i><sub>m</sub><super>2</super>,")
        y = self.math_note(y, t(
            "where <math><i>P</i><sub>m,dc</sub></math> is the motor’s DC input during traction, W, "
            "<math><i>v̄</i></math> is mean speed over the integration step, m/s, and "
            "<math><i>η</i><sub>g</sub></math> is gearbox efficiency. The dimensionless <math><i>a</i>(<i>v</i>)</math> "
            "and <math><i>b</i><sub>eff</sub>(<i>v</i>)</math>, in W/N², describe drive losses. The latter includes low-speed losses.",
            "де <math><i>P</i><sub>m,dc</sub></math> – потужність, яку двигун споживає від шини постійного струму в режимі тяги, Вт, "
            "<math><i>v̄</i></math> – середня швидкість за крок інтегрування, м/с, "
            "<math><i>η</i><sub>g</sub></math> – ККД редуктора. Безрозмірний коефіцієнт <math><i>a</i>(<i>v</i>)</math> "
            "і <math><i>b</i><sub>eff</sub>(<i>v</i>)</math> у Вт/Н² описують втрати привода. Другий враховує втрати на малих швидкостях."))
        y = self.equation(y, "A.4", "<i>P</i><sub>m,dc</sub> = <i>F</i><sub>m</sub> <i>v̄</i> <i>η</i><sub>g</sub> <i>η</i><sub>reg</sub>,")
        y = self.math_note(y, t(
            "where <math><i>η</i><sub>reg</sub></math> is regeneration efficiency. The negative motor force makes "
            "<math><i>P</i><sub>m,dc</sub></math> negative as the motor returns energy to the DC bus.",
            "де <math><i>η</i><sub>reg</sub></math> – ККД рекуперації. Коли двигун повертає енергію в шину постійного струму, "
            "від’ємна сила двигуна дає від’ємну потужність <math><i>P</i><sub>m,dc</sub></math>."))
        y = self.equation(y, "A.5", "<i>P</i><sub>pack</sub> = <i>VI</i> = <i>P</i><sub>aux</sub> + <i>P</i><sub>cool</sub>"
                          " + <i>P</i><sub>heat</sub> + <i>P</i><sub>m,dc</sub> − <i>P</i><sub>chg</sub>,")
        y = self.math_note(y, t(
            "where <math><i>P</i><sub>pack</sub></math> is net pack power, W, <math><i>V</i></math> is terminal voltage, V, "
            "and <math><i>I</i></math> is pack current, A. The auxiliary <math><i>P</i><sub>aux</sub></math>, cooling "
            "<math><i>P</i><sub>cool</sub></math>, heating <math><i>P</i><sub>heat</sub></math> and charger input "
            "<math><i>P</i><sub>chg</sub></math> are all in W. Pack power and current are positive during discharge.",
            "де <math><i>P</i><sub>pack</sub></math> – чиста потужність батареї, Вт, <math><i>V</i></math> – напруга на клемах, В, "
            "<math><i>I</i></math> – струм батареї, А. Потужності допоміжних агрегатів <math><i>P</i><sub>aux</sub></math>, "
            "охолодження <math><i>P</i><sub>cool</sub></math>, нагрівання <math><i>P</i><sub>heat</sub></math> і зарядного пристрою "
            "<math><i>P</i><sub>chg</sub></math> подано у Вт. Потужність батареї та струм додатні під час розряду."))

        y = subheading(y - 4, t("A.3 Pack voltage and state of charge", "А.3 Напруга та ступінь зарядженості батареї"))
        y = self.equation(y, "A.6", "<i>V</i> = <i>U</i><sub>oc</sub>(<i>s</i>) − <i>IR</i><sub>0</sub> − <i>U</i><sub>p</sub>,  <i>τ</i> ",
                          ("d<i>U</i><sub>p</sub>", "d<i>t</i>"), " = <i>R</i><sub>p</sub><i>I</i> − <i>U</i><sub>p</sub>,")
        y = self.math_note(y, t(
            "where <math><i>U</i><sub>oc</sub></math> and <math><i>U</i><sub>p</sub></math> are open-circuit and "
            "polarization voltages, V, and <math><i>R</i><sub>0</sub></math> and <math><i>R</i><sub>p</sub></math> are series "
            "and polarization resistances, Ω. The calibrated TUM profile uses a polarization branch with time constant "
            "<math><i>τ</i></math> in s [1, 6]. The simulator integrates this branch with the implicit midpoint method.",
            "де <math><i>U</i><sub>oc</sub></math> і <math><i>U</i><sub>p</sub></math> – напруги розімкненого кола та поляризації, В, "
            "<math><i>R</i><sub>0</sub></math> і <math><i>R</i><sub>p</sub></math> – послідовний і поляризаційний опори, Ом. "
            "Калібрований профіль TUM використовує гілку поляризації зі сталою часу <math><i>τ</i></math>, с [1, 6]. "
            "Симулятор інтегрує стан цієї гілки неявним методом середньої точки."))
        y = self.equation(y, "A.7", ("d<i>s</i>", "d<i>t</i>"), " = −",
                          ("<i>I</i>", "3600 <i>Q</i><sub>Ah</sub>"), ",")
        y = self.math_note(y, t(
            "where <math><i>s</i></math> is the state of charge as a fraction and <math><i>Q</i><sub>Ah</sub></math> "
            "is usable capacity, A·h. The factor 3600 converts hours to seconds.",
            "де <math><i>s</i></math> – частка заряду, а <math><i>Q</i><sub>Ah</sub></math> – доступна ємність, А·год. "
            "Множник 3600 переводить години в секунди."))

        y = subheading(y - 4, t("A.4 Pack heat balance", "А.4 Тепловий баланс батареї"))
        y = self.equation(y, "A.8", "<i>C</i><sub>th</sub> ", ("d<i>T</i>", "d<i>t</i>"),
                          " = <i>I</i><super>2</super><i>R</i><sub>0</sub> + ",
                          ("<i>U</i><sub>p</sub><super>2</super>", "<i>R</i><sub>p</sub>"),
                          " + <i>f</i><sub>heat</sub><i>P</i><sub>heat</sub> − <i>UA</i>(<i>T</i> − <i>T</i><sub>air</sub>)"
                          " − COP <i>P</i><sub>cool</sub>,")
        self.math_note(y, t(
            "where <math><i>C</i><sub>th</sub></math> is pack heat capacity, J/K, <math><i>UA</i></math> is the passive heat-transfer "
            "coefficient, W/K, and <math><i>T</i></math> and <math><i>T</i><sub>air</sub></math> are pack and chamber air temperatures, °C. "
            "The heating fraction <math><i>f</i><sub>heat</sub></math> is the share of heating power delivered to the pack. "
            "Polarization heat is zero when the branch is inactive. The coefficient of performance (COP) converts electrical cooling "
            "power to heat removed. Cooling demand rises above 41 °C and is limited by available power and chiller capacity [1, 6].",
            "де <math><i>C</i><sub>th</sub></math> – теплоємність батареї, Дж/К, <math><i>UA</i></math> – коефіцієнт пасивного "
            "теплообміну, Вт/К, <math><i>T</i></math> і <math><i>T</i><sub>air</sub></math> – температури батареї та повітря, °C. "
            "<math><i>f</i><sub>heat</sub></math> – частка потужності нагрівання, що надходить до батареї. "
            "За вимкненої гілки поляризаційні втрати дорівнюють нулю. Коефіцієнт перетворення (COP) пов’язує електричну "
            "потужність охолодження з відведеним теплом. Потреба в охолодженні зростає після 41 °C і обмежується доступною "
            "потужністю та можливостями чилера [1, 6]."))
        self.page.showPage()

    def diagnostics_page(self, heading):
        t = self.t
        log = self.diagnostics
        self.header(heading,
                    t("Selected channels from the dynamometer recording", "Вибрані сигнали із запису роликового стенда"))
        interval = 0.1 if self.run["scenario"] == "brake" else 1
        self.para(708, t(f'{log["samples"]} samples, nominal interval {interval:g} s. Last sample at {log["lastTimeS"]:g} s.',
                         f'{log["samples"]} відліків, номінальний інтервал {interval:g} с. Останній відлік на {log["lastTimeS"]:g} с.'))
        units_uk = {"km/h": "км/год", "rpm": "об/хв", "N·m": "Н·м", "N": "Н", "V": "В", "A": "А", "kW": "кВт"}
        rows = []
        charts = []
        for index, signal in enumerate(log["stats"]):
            unit = t(signal["unit"], units_uk.get(signal["unit"], signal["unit"]))
            name = t(signal["label"], signal["uk"])
            label = f"{name} ({unit})"
            obd = signal["id"] == "speed"
            source = "OBD-II 01 0D" if obd else t("EV model", "Модель ЕМ")
            rows.append((label, source, *(self.fmt(signal[key], signal["digits"]) for key in ("last", "min", "max"))))
            points = [(row["timeS"], row["values"][index]) for row in log.get("rows", [])]
            caption = name + (" (PID 0D) [9]" if obd else "")
            series = [(t("Simulated OBD-II reply", "Змодельована відповідь OBD-II") if obd else source,
                       MEASURED_TRACE if obd else SIMULATED_TRACE, [4, 2] if obd else [], points)]
            charts.append((f"B.{index+1}", caption, f"{name}, {unit}", series))
        self.text(LEFT, 685, t("Table B.1. Summary of the selected signals.", "Таблиця B.1. Підсумок за вибраними сигналами."), bold=True)
        self.table(674, [t("Signal", "Сигнал"), t("Source", "Джерело"), t("Last", "Останнє"), t("Min", "Мін."), t("Max", "Макс.")],
                   rows, [LEFT, 264, 356, 424, 492, RIGHT])
        y = 639 - 23 * len(rows)
        if log["speedReply"]:
            reply = log["speedReply"]
            speed = int(reply.split()[-1], 16)
            y = self.para(y, t(f'At the last sample, OBD-II request 01 0D (service 1, PID 13 in decimal) returned {reply} ({speed} km/h). The last hexadecimal byte gives the speed [9].',
                               f'На останньому відліку запит OBD-II 01 0D (сервіс 1, PID 13 у десятковій системі) дав відповідь {reply} ({speed} км/год). Останній шістнадцятковий байт містить швидкість [9].'), line=11)
        figure_range = "B.1" if len(charts) == 1 else f"B.1–B.{len(charts)}"
        self.para(y-2, t(f"Time histories are shown in {('Figure' if len(charts) == 1 else 'Figures')} {figure_range}. EV model channels are recorded from the simulation.",
                             f"Зміну сигналів у часі наведено на {('рисунку' if len(charts) == 1 else 'рисунках')} {figure_range}. Сигнали моделі електромобіля записано під час симуляції."), line=11)
        for (number, title, quantity, series), bottom in zip(charts[:2], (237, 97)):
            self.plot(number, title, quantity, bottom, 74, series)
        self.page.showPage()
        for index in range(2, len(charts), 4):
            self.header(heading,
                        t("Selected channel traces continued", "Продовження графіків вибраних сигналів"))
            for (number, title, quantity, series), bottom in zip(charts[index:index+4], (604, 449, 294, 139)):
                self.plot(number, title, quantity, bottom, 87, series)
            self.page.showPage()

    def save(self):
        t = self.t
        if self.run.get("rollerTest"):
            results = t("2 Roller test method and results", "2 Методика та результати")
            telemetry = t("3 Roller test telemetry", "3 Сигнали випробування на роликах")
        else:
            results = (t("2 Charging procedure and results", "2 Методика та результати заряджання")
                       if self.run["scenario"] == "charge-dc"
                       else t("2 Driving schedule and results", "2 Їздовий цикл і результати"))
            telemetry = t("3 Pack telemetry", "3 Сигнали батареї")
        sections = [
            ("vehicle", t("1 Test vehicle and conditions", "1 Автомобіль та умови випробування"), self.vehicle_page),
            ("results", results, self.results_page),
            ("telemetry", telemetry, self.telemetry_page),
            ("references", t("References", "Список джерел"), self.references_page),
            ("model", t("Appendix A. Mathematical model", "Додаток А. Математична модель"), self.model_page),
        ]
        if self.diagnostics:
            sections.append(("diagnostics", t("Appendix B. Diagnostic signals", "Додаток B. Діагностичні сигнали"),
                             self.diagnostics_page))
        self.cover_page()
        self.contents_page(sections)
        for anchor, title, render in sections:
            self.page.bookmarkPage(anchor)
            self.page.addOutlineEntry(title, anchor)
            render(title)
        self.page.save()


def render_pdf(payload):
    output = io.BytesIO()
    Report(json.loads(payload), output).save()
    return output.getvalue()


if __name__ == "__main__":
    Report(json.load(sys.stdin)).save()
