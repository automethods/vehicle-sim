"""Adapt the shared Tesla plant to the lab's JSON-lines process boundary."""
import json
import sys
from pathlib import Path

if __name__ == "__main__":
    model_dir = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(model_dir))
from model3_ev import DriverInput, EVSimulation, tum_dyno_parameters

sim = None
def exchange(line):
    global sim
    try:
        request = json.loads(line)
        if request["op"] == "reset":
            config = request["config"]
            dyno = config["scenario"] in ("wltc", "cycle", "coc-range") and config.get("profile") != "legacy"
            initial_pack = config.get("initialPack") or {}
            sim = EVSimulation(
                dt_s=request["dt_s"],
                initial_soc=config["socPct"] / 100,
                initial_temp_c=config["temperatureC"],
                ambient_c=config["ambientC"],
                initial_speed_m_s=config.get("initialSpeedKph", 0.0) / 3.6,
                params=tum_dyno_parameters() if dyno else None,
                initial_terminal_v=initial_pack.get("voltageV"),
                initial_current_a=initial_pack.get("currentA", 0.0),
            )
        elif request["op"] == "step" and sim is not None:
            ticks = request["ticks"]
            if type(ticks) is not int or not 1 <= ticks <= 300:
                raise ValueError("The plant accepts 1 to 300 ticks per request.")
            control = DriverInput(**request["inputs"])
            for _ in range(ticks):
                sim.step(control)
        else:
            raise ValueError("Reset the vehicle before stepping.")
        return json.dumps({"ok": True, "state": sim.snapshot()}, allow_nan=False)
    except (ValueError, TypeError, KeyError) as error:
        return json.dumps({"ok": False, "error": str(error)})


if __name__ == "__main__":
    for line in sys.stdin:
        print(exchange(line), flush=True)
