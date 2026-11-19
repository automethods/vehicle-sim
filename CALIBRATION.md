# Tesla Model 3 TUM dynamometer calibration

The WLTC experiment uses a bench profile for the 2020 Model 3 SR+ LFP. Its road load, drive losses and regen behavior come from TUM measured channels. The measured endpoints below stay out of the fit. [Rosenberger et al., 2024](https://doi.org/10.3390/wevj15060268), [TUM measurements, CC BY 4.0](https://doi.org/10.14459/2024mp1735494)

## Bench load and electrical losses

- The original model used TUM's test-track curve for WLTC. The new profile fits effective wheel load using 22 steady-speed runs from the 15 °C folders, after applying the existing 98% reduction-stage efficiency assumption. The effective force is `165.036 + 2.70455 v + 0.280036 v²` N with `v` in m/s. It includes the effective resistances that the motor saw on the bench. The paper's lower Appendix B numbers are the dynamometer controller settings, which account for the bench's own resistances when transferring the road load.
- Drive loss uses 180 motor-load recordings plus the 22 steady points. For positive traction, inverter input is shaft power times a speed-dependent multiplier, plus a speed-dependent coefficient times squared wheel force. The fit subtracts low-voltage loads assuming 92% DC/DC efficiency and 40 W overhead, and interpolates between nine speed points. The lower and upper endpoints hold outside the measured range. The shaft power estimate uses logged axle torque times axle angular speed, with the existing assumed reduction-stage efficiency kept explicit. The model treats this as an effective loss surface. TUM notes uncertainty in the onboard torque estimate and changes between software versions.
- The auxiliary load is 444 W from stationary samples in the 15 °C interurban file. The effective regen conversion is 97.46% before the reduction-stage loss, estimated from 3,592 negative-torque samples in that file. Regen current tapers over the final four SOC percentage points, giving about 12 kW available at 99.7% under warm conditions. The test also retains the pack voltage and current limits and the original temperature gates. The plug-in charge taper comes from the original plant.
- In 22 separate 30 °C steady-speed runs, effective load RMSE was **6.7 N**. Steady pack-power RMSE across those points fell from **3.85 kW** to **0.14 kW**. These runs cover the same bench and speed settings at another temperature.

## Driving checks

Positive net error means the simulation used more pack-terminal energy than TUM. The two recorded-speed checks use the measured speed as the setpoint for the same closed-loop driver.

| TUM comparison | Measured net pack kWh | Original net kWh | Calibrated net kWh | Original error | Calibrated error |
| --- | ---: | ---: | ---: | ---: | ---: |
| First WLTP pass vs WLTC target, estimated +9 s alignment | 3.092 | 3.728 | 2.882 | +20.6% | −6.8% |
| Later WLTP window, 1810–3610 s, recorded-speed setpoint | 3.034 | 3.641 | 2.902 | +20.0% | −4.3% |
| FTP-75 Part 2, 0–1800 s, recorded-speed setpoint | 1.847 | 2.290 | 1.813 | +23.9% | −1.9% |

On the first WLTP pass, discharge was **4.024 vs 4.039 kWh**, and energy into the pack was **1.142 vs 0.947 kWh**. Pack power RMSE over the aligned 1 Hz trace was **9.88 kW**, down from **10.51 kW**. Net consumption improved more than individual power samples. The biggest remaining issues are braking allocation and local speed differences between the published WLTC setpoint and TUM's run. The first pass keeps a single +9 s offset throughout. Both battery and vehicle energy balance residuals stayed below 0.001 J in each simulated run.

## EPA, PHEV and firmware references

- The US 2020 Model 3 SR+ label lists 24 kWh/100 mi (about 149 Wh/km) of AC recharge energy with label-cycle adjustments. The MY2021 SR+ certification workbook has raw DC energy and distance per UDDS and highway segment. Those are useful external checks after matching pack, vehicle, road-load settings and cycle. The TUM comparison measures DC at the pack during WLTP and FTP-75, which has a different boundary and procedure. [FuelEconomy.gov label](https://fueleconomy.gov/feg/Find.do?action=sbs&id=42278), [EPA test method](https://www.epa.gov/greenvehicles/fuel-economy-and-ev-range-testing), [Tesla EPA certification workbook](https://dis.epa.gov/otaqpub/display_file.jsp?docid=51461&flag=1)
- The shared `Test_PHEV_Data` folder contains Argonne tests for the 2013 and 2016 Chevrolet Volt and Toyota Prius PHV, with an extended Prius Prime dataset. These are candidates for their own hybrid calibrations, including engine-on decisions, EV-to-hybrid transitions, temperature and fuel use. [Argonne D³ program](https://www.energy.gov/sites/default/files/2014/03/f13/vssp_19_keller.pdf)
- The inspected Tesla workspace has measurement data and CAN documentation. The available ECU/BMU research archive in OBDII is Toyota-labelled, and the prior Ghidra image was a battery emulator. A verified matching controller image could clarify current limits, pedal maps and brake blending. The bench measurements supply the efficiency evidence for this profile.

## Reproduce

Run the comparison from this project. `TUM_STANDARD_DIR` can override the raw standard-drive folder.

```bash
node scripts/compare-tum.mjs
```

Generate the fit from the original TUM CSVs with NumPy, pandas and SciPy installed. Run this from the sibling `Vehicle_complete_prjct/Tesla` folder. The fit script prints JSON so it can be reviewed before replacing `simulator/tum_dyno.json`.

```bash
python3 simulator/calibrate_tum.py
```

## Pack voltage, cooling and DC charging

The dyno profile now uses an effective discharge equilibrium curve and a single polarization branch. The DC resistance is 55.2 mΩ, the polarization resistance is 44.5 mΩ, and its time constant is 40 s. The constrained fit used terminal voltage, smoothed current and state of charge from the TUM FTP-75 and 15 °C highway, interurban and urban traces. The effective curve describes discharge behavior in those runs. The underlying C/57 charge measurements describe a separate operating condition. The WLTC simulation initializes the polarization state from the first aligned measured voltage and current. It then advances that state from the simulated current. For the 1 Hz WLTC pass, terminal-voltage RMSE dropped from 5.67 V to 1.99 V. The single modeled pack temperature stayed between the measured coldest and warmest sensors throughout the pass.

The 2020 LFP test vehicle uses liquid cooling with a refrigerant chiller. The simulator models a chiller above 41 °C lumped pack temperature, with a 600 W/K gain, 4 kW thermal capacity and a coefficient of performance of 2.5. The threshold follows the onset observed during TUM fast charging, where the coldest sensor was around 40 °C. Cooling capacity, gain and efficiency are model parameters. Pack cooling electricity is part of the power balance and is supplied by the charge source while plugged in. The chiller stayed off in the WLTC comparison. [TUM study, § 3.4](https://doi.org/10.3390/wevj15060268)

The DC charging envelope samples the TUM `2_DC_FastCharging.csv` pack-power medians over 5-percentage-point SOC bands. The model interpolates between these points, ramps up over 8 s after precharge and tapers over the final two percentage points before the selected cutoff. Charging current, terminal voltage, temperature and source limits still apply. The startup ramp and cutoff taper model the lab session controls. [TUM measurements](https://doi.org/10.14459/2024mp1735494)
