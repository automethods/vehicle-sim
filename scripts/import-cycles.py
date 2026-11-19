"""Normalize the local Drive_cycles_prjct catalog without changing the originals."""

import argparse
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Drive_cycles_prjct/Data/standardized_cycles"
GROUPS = {
    "WLTP_Europe": "Europe",
    "EPA": "EPA archive",
    "Asia": "Asia",
    "Artemis": "Artemis / CADC",
    "Special": "Grade tests",
}
FILES = {
    "WLTP_Europe": {
        "WLTC.csv": "WLTC · archive trace",
        "WLTC_Class_1_v1.4.csv": "WLTC Class 1 · archive v1.4",
        "WLTC_Class_2_v1.4.csv": "WLTC Class 2 · archive v1.4",
        "WLTC_Class_3_v53.csv": "WLTC Class 3 · archive v53",
        "NEDC.csv": "NEDC",
    },
    "EPA": {
        "FTP75.csv": "FTP-75 · local variant",
        "ftpcol.csv": "FTP-75 · EPA archive",
        "ftp10hz_flat.csv": "FTP-75 · 10 Hz",
        "uddscol.csv": "UDDS",
        "HWFET.csv": "HWFET · local variant",
        "hwycol.csv": "HWFET · EPA archive",
        "hwy10hz.csv": "HWFET × 2 · 10 Hz",
        "US06.csv": "US06 · local variant",
        "us06col.csv": "US06 · EPA archive",
        "SFTP_us06col.csv": "US06 · SFTP file",
        "sc03col.csv": "SC03 · speed trace",
        "epa-new-york-city-cycle.csv": "New York City Cycle",
        "im240col.csv": "IM240",
        "la92col.csv": "LA-92 · Class 3 HD",
        "la92dds.csv": "LA-92 · Unified",
        "la92shortdds.csv": "LA-92 · Short",
        "ececol.scv": "ECE-15 · urban segment",
        "eudccol.csv": "EUDC · extra-urban segment",
    },
    "Asia": {
        "CLTC_P.csv": "CLTC-P",
        "JC08.csv": "JC08",
        "EPA_j1015col.csv": "Japan 10–15 · archived sequence",
        "EPA_jpn10col.csv": "Japan 10 Mode",
        "EPA_jpn15col.csv": "Japan 15 Mode",
    },
    "Artemis": {
        "Artemis_Urban.csv": "Artemis Urban",
        "Artemis_Rural.csv": "Artemis Rural",
        "Artemis_HW130.csv": "Artemis Motorway 130",
        "Artemis_HW150.csv": "Artemis Motorway 150",
        "Artemis_Urban_Road_HW130.csv": "Artemis Combined 130",
        "Artemis_Urban_Road_HW150.csv": "Artemis Combined 150",
    },
    "Special": {
        "Grossglockner_upHilldrive.csv": "Grossglockner Uphill",
        "Grossglockner_downHilldrive.csv": "Grossglockner Downhill",
    },
}
PHASES_3B = [("Low", 589), ("Medium", 1022), ("High", 1477), ("Extra-high", 1800)]


def phases(rows, phase_index):
    if phase_index is None:
        return []
    phases = []
    last = rows[0][phase_index].strip()
    for index, row in enumerate(rows[1:], 1):
        label = row[phase_index].strip()
        if label != last:
            phases.append((last, index - 1))
            last = label
    return phases + [(last, len(rows) - 1)]


def read_schedule(source, relative, title, group):
    with (source / relative).open(encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.reader(handle)
                if any(value.strip() for value in row) and not row[0].lstrip().startswith(("#", ";"))]
    header = [cell.strip() for cell in rows.pop(0)]
    if header[:2] != ["Time (sec)", "Vehicle speed (km/h)"]:
        raise ValueError(f"{relative}: unexpected units or layout")
    phase_index = header.index("Phase") if "Phase" in header else None
    grade_index = header.index("Slope (alpha)") if "Slope (alpha)" in header else None
    times = [float(row[0]) for row in rows]
    speed = [float(row[1]) for row in rows]
    grade = [round(100 * math.tan(math.radians(float(row[grade_index]))), 7) if grade_index is not None else 0
             for row in rows]
    step = 0.1 if relative.name in ("ftp10hz_flat.csv", "hwy10hz.csv") else 1
    offset = times[0]
    for i, t in enumerate(times):
        if relative.name == "Grossglockner_downHilldrive.csv":
            t = abs(t)
        if relative.name == "EPA_j1015col.csv" and i and t == 1 and times[i - 1] > 1:
            offset = 1 - i
        if not math.isclose(t - offset, step * i, abs_tol=1e-7):
            raise ValueError(f"{relative}: unexpected timestamp {times[i]} at sample {i}")
    if times[0] == 1:
        speed.insert(0, 0)
        grade.insert(0, grade[0])
    elif times[0] != 0:
        raise ValueError(f"{relative}: unexpected initial time")
    if any(not math.isfinite(v) or v < -0.2 for v in speed) or any(not -30 <= g <= 30 for g in grade):
        raise ValueError(f"{relative}: out-of-range speed or grade")
    speed = [max(0.0, v) for v in speed]
    boundaries = phases(rows, phase_index)
    if relative.name in ("WLTC.csv", "WLTC_Class_3_v53.csv"):
        boundaries = PHASES_3B
    return schedule(str(relative).rsplit(".", 1)[0].lower().replace("/", "-"),
                    title, group, str(relative), speed, step, boundaries, grade)


def schedule(key, title, group, source, speed, step=1, boundaries=(), grade=()):
    result = dict(id=key, title=title, group=group, source=source, stepS=step,
                  durationS=round((len(speed) - 1) * step, 7),
                  phases=[dict(title=name, endS=end) for name, end in boundaries], speedKph=speed)
    if any(grade):
        result["gradePct"] = grade
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=SOURCE)
    args = parser.parse_args()
    expected = {Path(folder) / name for folder, files in FILES.items() for name in files}
    actual = {file.relative_to(args.source) for file in args.source.glob("*/*")
              if file.suffix.lower() in (".csv", ".scv")}
    if actual != expected:
        raise ValueError(f"Catalog mismatch. Missing {expected - actual}. Extra {actual - expected}.")
    target = [float(row[1]) for row in
              list(csv.reader((ROOT / "data/wltc-class-3b.csv").read_text().splitlines()))[2:]]
    cycles = [
        schedule("wltc-city", "WLTC City · EV", "WLTP partial cycles", "UN R154 Annex B1 §3.5", target[:1023],
                 boundaries=PHASES_3B[:2]),
        schedule("wltc-3b-three-phase", "WLTC Class 3b · 3 phases", "WLTP partial cycles", "UN R154 Annex B1 §3.4",
                 target[:1478], boundaries=PHASES_3B[:3]),
    ]
    for folder, files in FILES.items():
        cycles.extend(read_schedule(args.source, Path(folder) / name, title, GROUPS[folder])
                      for name, title in files.items())
    print(json.dumps(cycles, ensure_ascii=False, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
