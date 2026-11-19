"""Add the voltage, smoothed current and temperature extrema for the aligned TUM pass."""

import csv
import json
import math
from pathlib import Path
import sys


if len(sys.argv) != 3:
    sys.exit("Usage: import-tum-pack.py TUM_WLTP.csv tum-wltp-first-pass.json")
reference = json.loads(Path(sys.argv[2]).read_text())
with Path(sys.argv[1]).open(newline="") as source:
    rows = {row["Time_s"]: row for row in csv.DictReader(source)}
for elapsed, point in enumerate(reference["points"]):
    time = reference["offsetS"] + elapsed
    timestamp = f"{time // 3600:02}:{time // 60 % 60:02}:{time % 60:02}.000"
    row = rows[timestamp]
    voltage, current, minimum, maximum = (float(row[key]) for key in (
        "BattVoltage_V", "SmoothBattCurrent_A", "BMSminPackTemperatur_Deg", "BMSmaxPackTemperatur_Deg",
    ))
    if not all(map(math.isfinite, (voltage, current, minimum, maximum))):
        raise ValueError(f"Non-finite pack telemetry at {timestamp}")
    if abs(voltage * current / 1000 - point["batteryKw"]) > 0.000006 or minimum > maximum:
        raise ValueError(f"Telemetry alignment check failed at {timestamp}")
    point.update(voltageV=voltage, currentA=current, minTempC=minimum, maxTempC=maximum)
print(json.dumps(reference, ensure_ascii=False, separators=(",", ":")))
