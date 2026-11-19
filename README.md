# Vehicle testing on a roller dynamometer

A virtual roller dynamometer for driving, braking, road-load and charging experiments. The default vehicle is the 2020 Tesla Model 3 Standard Range Plus with an LFP pack and rear-wheel drive.

Open the browser lab at [AutoMethods](https://automethods.com/projects/vehicle-sim/). Each tab runs its own experiment. Sign in to your AutoMethods account to export results.

## Local development on Linux

With Node.js 22+ and Python 3.10+ installed, run this from the project folder.

```bash
bash run.sh
```

The launcher opens the local preview at [http://127.0.0.1:8794](http://127.0.0.1:8794) on a graphical Linux desktop when `curl` and `xdg-open` are available. Use `./run.sh --no-browser` for a terminal-only start. The launcher reuses a server with the same build and mode. If a different server is using the port, start on a free `PORT` or stop that server before relaunching. Press **Ctrl+C** in the terminal that started it to stop it. The bundled build runs without installing npm packages. A WebGL-capable browser enables the 3D scene. The controls and telemetry also work with the scene disabled.

The repository includes the built JavaScript and the Python plant under `plant/`. Set `TESLA_SIM_DIR` when the plant is elsewhere, `PYTHON` to choose a Python interpreter, or `PORT` to override the local port. One server instance runs one shared experiment.

## Experiments

| Experiment | Controls and signals |
| --- | --- |
| Manual driving | Set initial state of charge and pack temperature, then click **Reset**. Start the run, then hold W or ↑ for throttle, S or ↓ to brake, or Space for full brake. Esc pauses. The on-screen sliders are also available. |
| WLTC Class 3b | Run the full 1,800-second target with the calibrated TUM dyno profile. **Automatic** uses the existing speed-feedback driver. **Manual pedals** lets you follow the **Driver** display with the accelerator and brake. Changing driver mode while paused starts a fresh run. Use 1× for manual following or up to 50× for automatic playback. |
| Service brake test | Apply full friction braking in neutral from 50 km/h on level ground. Toggle **Reduced braking force (50%)** to compare stopping distance, stopping time and mean deceleration. |
| Coastdown test | Coast from 100 to 20 km/h in neutral on level ground to observe the effect of road load on deceleration. |
| DC fast charging | Start parked with no wheel movement. The scenario connects a 150 kW source and requests an 80% target. Pack acceptance, temperature and internal loads govern actual battery power. The default plot shows pack power, which tapers before the test stops at the selected target. The dashboard shows terminal voltage, charging current and accumulated energy into the pack. |
| CoC top speed | Start at 100% SOC and 23 °C. The simulator runs at full throttle for 90 s on level ground and measures the average speed over the final kilometre. Sampled speeds must stay within 1% of the average. [UN Regulation No. 68, Annex 3](https://unece.org/fileadmin/DAM/trans/main/wp29/wp29regs/r068a1e.pdf) |
| CoC electric range | Start at 100% SOC and 23 °C. The simulator repeats full WLTC Class 3b until a 1% pack reserve, with 400× playback available. The published WLTP procedure includes further test steps. [UN Regulation No. 154, Annex B8](https://eur-lex.europa.eu/eli/reg/2026/1130/oj/eng) |
| High-voltage fault | Enable **Inject HV fault** to simulate an interlock fault. Automated tests stop and display the simulated P0A0A code. In manual driving the friction brake stays available while the vehicle coasts. **Reset** clears the latched fault. |

**Driver** opens at the steering wheel. In manual driving the chamber monitor shows live vehicle speed. The chamber monitor visible through the windshield previews the next 60 seconds of target speed above a stationary **NOW** line, with actual speed and recent history below. **Full guide** enlarges the chart during WLTC. Its ±2 km/h band is guidance around the instantaneous setpoint. **Test cell → Driver eye** shows the same guide on the overhead-mounted monitor ahead of the windshield. The red line is the target, the amber lines are the limits, and the white trace is recent actual speed. A short green marker indicates current speed along the **NOW** line. **Control room** shows the rear-quarter cell camera, a central live driver monitor, test instruments and the full WLTC overview. **Test cell** also has 3D, side, and top cameras with **Battery** and **Rollers** cutaways. Drag to orbit, Shift-drag or right-drag to pan, and scroll to zoom. **Reset view** restores the current camera. **Model wall** shows the department emblem from My_books and the equations for longitudinal force balance, road load, grade, pack power and consumption.

Under **Run traces**, select **Vehicle speed** or **Pack power** to compare the full run with TUM. The vertical cursor and dot show the current simulation time and reading. **Export CSV** downloads the current run's 1 Hz trace, including the TUM pack-power samples for WLTC, simulated power, torque, HV state, SOC and energy-balance residuals. Positive pack power is discharge. Negative power is energy flowing into the pack.

## Run reports

**Run traces** offers PDF and CSV export once a run has data. The local preview enables downloads automatically. A finished test also shows a PDF button below the results. The PDF opens with an unnumbered institutional cover followed by linked contents. The vehicle report header above section 1 shows the actual test start in GMT+2. Page numbers appear in the footer. The PDF follows the UI language and includes dimensioned vehicle views, results, telemetry, numbered references and a mathematical model appendix. The TUM benchmark adds aligned measured pack voltage, smoothed current and minimum and maximum temperatures. A scheduled run in progress is marked **Partial cycle**.

AutoMethods serves the browser build through its existing Cloudflare Pages project. Its browser worker runs the same lab logic and Python model as the local test server, using Pyodide. The browser verifies the existing AutoMethods session before each export. The Pages Worker also protects the report renderer and fonts. Signed-out users can run tests and view charts.

PDF export uses ReportLab with `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` from the system directory `/usr/share/fonts/truetype/dejavu`. Set `REPORT_FONT_DIR` to the installed font directory on other systems. Pause before exporting multiple formats from a run in progress if all formats must capture the same instant.

**OBD-II and EV diagnostics** shows a virtual service 01 PID 0D reply for speed from the current run. It uses the one-byte convention demonstrated by `OBDII/Description_Sim/source`. The motor, pedal, regeneration and pack channels come from the EV model. Select channels in the diagnostics panel for a dedicated 1 Hz CSV or enable **Include selected signals and plots in PDF** for numbered time plots and the last, minimum and maximum values. The regular trace CSV keeps its existing columns.

**Test cell → Climate** shows the wall-mounted thermostat, hygrometer and barometer. General tests use a simulated chamber air temperature of 23 °C. WLTC with the TUM comparison retains the study run's 22.5 °C initialization. The displayed 50% relative humidity and 101.325 kPa pressure are simulated chamber settings recorded in the reports, with the existing road-load model used for vehicle dynamics.

## Model and data

- The TypeScript host runs the experiment, automatic driver, measurements and CSV export. The Python plant integrates the longitudinal dynamics, HV states, pack, regen and charging at 20 ms. The host updates vehicle controls every 100 ms. `src/plant.ts` defines the adapter boundary for additional models. Additional powertrains will need their own model, signals and tests.
- The 3D scene uses a cutaway inspired by HORIBA's center-motor 4WD bench. Table 1 specifies a 1,219.2 mm drum diameter and a 2,750 mm span between outside roller edges. The center gap (720 mm), deck and supports are schematic. Wheels and drums share the same interpolated travel and turn in opposite directions at equal surface speeds. [HORIBA test rig specifications, Table 1](https://static.horiba.com/fileadmin/Horiba/Company/About_HORIBA/Readout/R42E/R42E_12_076_01.pdf)
- Manual driving uses the original road-load curve. The WLTC calibration still uses the TUM measurements from a single-axle RENK dynamometer. The 3D bench represents synchronized rollers without independent inertia and tire-slip dynamics. [TUM Tesla study, Section 2.2.3](https://doi.org/10.3390/wevj15060268)
- `data/wltc-class-3b.csv` is copied from `My_books/vehickle_math_models/data/cycles/wltc3.csv` in the shared literature folder.
- `data/tum-wltp-first-pass.json` is derived from Nico Rosenberger et al.'s research data, licensed CC BY 4.0. It takes the first WLTP pass from `Dataset_article/3_Driving_Range/2_Standard_Driving/WLTP.csv`, aligns the trace at an estimated +9 s and resamples it at 1 Hz. Battery power uses measured voltage and smoothed current. The report also uses the source voltage, current and battery minimum and maximum temperatures. `scripts/import-tum-pack.py` checks sample timestamps and power before attaching those channels. The run initializes SOC, pack temperature (mean of the reported minimum and maximum), and ambient temperature from the first aligned sample. [TUM dataset](https://doi.org/10.14459/2024mp1735494), [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/), [companion paper](https://doi.org/10.3390/wevj15060268)
- The Tesla cutaway uses the TUM battery-pack STEP tessellation. See [vehicle geometry](models/README.md) for model sources, the Woodpecker crossbar and the SolidWorks assembly export.
- The browser bundle includes Three.js 0.186.1 under the [MIT license](public/vendor/three/LICENSE).

## Verification

```bash
npm ci
npm run check
npm run build
npm test
```

Tests cover pedal drive, HV fault and reset, stationary charging with cold-pack heating, and the complete WLTC with energy accounting. The calibrated WLTC completed 23.33 km at 1.15 km/h speed RMS error against the target. Net pack energy was 2.88 kWh simulated and 3.09 kWh measured, compared with 3.73 kWh in the original model. See the [TUM calibration report](CALIBRATION.md) for the fit, separate checks, and the remaining regen error.

## Cycle library and consumption

**Other tests** holds the 36 local traces from `Drive_cycles_prjct/Data/standardized_cycles` and two partial WLTC profiles. For the full Class 3b run the measured TUM pass is the reference in the plots and reports. **WLTC City · EV** runs the Low and Medium phases (1,022 s). **WLTC Class 3b · 3 phases** also runs High (1,477 s). The consecutive and shortened EV range procedures in Annex B8 combine driving schedules, battery depletion and recharge measurements. [UN Regulation No. 154, Annexes B1 and B8](https://eur-lex.europa.eu/eli/reg/2026/1130/oj/eng)

The archive variants retain their file-specific values and resolutions. The importer adds a zero-speed sample where the file starts at second 1, clamps 32 small negative speed artifacts to zero, joins the archived Japan 10–15 segments whose time column resets, and corrects the sign of the ten negative timestamps in the Grossglockner downhill file. Road slope angles in degrees become percent grade using `100 × tan(angle)`. The simulator runs the imported speed and grade schedules with its calibrated dyno profile. They use editable starting SOC and pack temperature. Separate conditioning and measurement procedures, such as the SC03 air-conditioning test, require additional models.

```bash
python3 scripts/import-cycles.py > data/drive-cycles.json
```

**Net pack consumption** uses DC terminal energy and the distance travelled. The calculation is `100 × (discharged kWh − returned kWh) / km`. It is blank during stationary charging and during the first 10 m of travel. Multiply kWh/100 km by 10 to obtain Wh/km. The TUM benchmark calculates reference consumption from the measured energy and measured distance. **Vehicle datasheet** in the header gives the vehicle specs, label reference and sources. [TUM test vehicle](https://doi.org/10.3390/wevj15060268), [EPA AC recharge measurement](https://www.epa.gov/greenvehicles/fuel-economy-and-ev-range-testing)

The reference Tesla is rear-wheel drive. **Roller setup** defaults to **Rear axle only**, with the front wheels stationary on a plate. **Four-wheel synchronized bench** turns the front tires via the dyno rollers. This switch shows the stand configuration and leaves the longitudinal calculation and rear-wheel drive model unchanged. [TUM test setup](https://doi.org/10.3390/wevj15060268), [HORIBA 2WD and 4WD dynamometers](https://www.horiba.com/usa/mobility/products/detail/action/show/Product/vulcan-series-5223/)

Ukrainian is selected on first visit if the browser requests Ukrainian or a locale associated with Ukraine. The language switch remembers the reader’s choice locally.
