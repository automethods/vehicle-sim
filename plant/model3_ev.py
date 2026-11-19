"""Forward longitudinal simulation of a 2020 Model 3 SR+ LFP reference vehicle."""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
import json
import math
from pathlib import Path


GRAVITY = 9.80665
J_PER_KWH = 3_600_000.0
# Effective DC pack power envelope from TUM 2_DC_FastCharging.csv.
DC_CHARGE_POWER_KW = (
    (0.0, 130.0), (0.20, 134.0), (0.225, 135.0), (0.275, 114.0),
    (0.375, 110.0), (0.475, 105.0), (0.525, 100.0), (0.625, 85.0),
    (0.725, 70.0), (0.775, 62.0), (0.825, 54.0),
)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, value))


def require_range(name: str, value: float, low: float, high: float) -> None:
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} must be between {low} and {high}")


@dataclass(frozen=True)
class VehicleParameters:
    # Rosenberger et al. (2024), Table A1, Appendix B and sections 3.1–3.4.
    mass_kg: float = 1861.0
    wheel_radius_m: float = 0.3468
    reduction_ratio: float = 9.04
    road_a_n: float = 177.205
    road_b_n_per_m_s: float = 5.743
    road_c_n_per_m_s_squared: float = 0.254
    usable_capacity_ah: float = 161.6
    drive_torque_nm: float = 420.0  # Older dyno run peak, not a speed map.
    drive_shaft_limit_w: float = 239_000.0  # Table A1 rating.
    motor_speed_limit_rpm: float = 16_000.0
    regen_pack_limit_w: float = 66_900.0  # Observed test peak, used as a ceiling.
    ac_input_limit_w: float = 11_000.0  # Study's AC supply.
    motor_heating_w: float = 2_750.0
    pack_heat_capacity_j_k: float = 479_000.0
    pack_passive_ua_w_k: float = 22.2
    pack_chiller_setpoint_c: float = 41.0
    pack_chiller_gain_w_k: float = 600.0
    pack_chiller_limit_w: float = 4000.0
    pack_chiller_cop: float = 2.5
    # Figure 4a, new vehicle C/57 charge trace, rounded to 0.5 V.
    # Normalize the published 5 Ah plot offset and 161.6 Ah usable span.
    ocv_v_by_soc: tuple[tuple[float, float], ...] = (
        (0.0, 327.0), (0.01, 333.0), (0.025, 340.0), (0.05, 342.5),
        (0.10, 344.5), (0.20, 351.5), (0.30, 353.0), (0.50, 354.0),
        (0.60, 356.0), (0.70, 357.5), (0.95, 357.5), (0.99, 359.0), (1.0, 362.0),
    )

    # Starting assumptions to fit against traces for the selected vehicle.
    effective_rotating_mass_kg: float = 40.0
    rear_load_fraction: float = 0.53
    regen_torque_nm: float = 130.0
    gear_efficiency: float = 0.98
    motor_drive_efficiency: float = 0.92
    motor_regen_efficiency: float = 0.88
    full_torque_stall_loss_w: float = 1600.0
    pack_resistance_ohm: float = 0.055
    pack_polarization_ohm: float = 0.0
    pack_polarization_tau_s: float = 40.0
    minimum_terminal_v: float = 280.0
    maximum_terminal_v: float = 387.0
    max_discharge_a: float = 650.0
    max_charge_a: float = 450.0
    hv_aux_w: float = 500.0
    regen_soc_taper_fraction: float = 0.20
    drive_loss_by_speed: tuple[tuple[float, float, float], ...] = ()
    dc_input_limit_w: float = 150_000.0
    ac_charger_efficiency: float = 0.92
    dc_path_efficiency: float = 0.98
    motor_to_pack_heat_fraction: float = 0.75
    precharge_s: float = 0.50
    precharge_timeout_s: float = 2.0

    def road_load_n(self, speed_m_s: float) -> float:
        return (self.road_a_n + self.road_b_n_per_m_s * speed_m_s
                + self.road_c_n_per_m_s_squared * speed_m_s**2)

    def drive_loss_coefficients(self, speed_m_s: float) -> tuple[float, float]:
        """Return excess shaft-power ratio and quadratic force loss in W/N²."""
        rows = self.drive_loss_by_speed
        if not rows:
            return 1.0 / self.motor_drive_efficiency - 1.0, 0.0
        if speed_m_s <= rows[0][0]:
            return rows[0][1:]
        for (lo, a0, b0), (hi, a1, b1) in zip(rows, rows[1:]):
            if speed_m_s <= hi:
                fraction = (speed_m_s - lo) / (hi - lo)
                return a0 + (a1 - a0) * fraction, b0 + (b1 - b0) * fraction
        return rows[-1][1:]

    def open_circuit_v(self, soc: float) -> float:
        for (lo, vlo), (hi, vhi) in zip(self.ocv_v_by_soc, self.ocv_v_by_soc[1:]):
            if soc <= hi:
                return vlo + (vhi - vlo) * (soc - lo) / (hi - lo)
        return self.ocv_v_by_soc[-1][1]


def tum_dyno_parameters() -> VehicleParameters:
    """Measurement-derived effective powertrain and load for the TUM driving bench."""
    calibration = json.loads(Path(__file__).with_name("tum_dyno.json").read_text(encoding="utf-8"))
    return VehicleParameters(
        **calibration["parameters"],
        **calibration.get("battery", {}),
        drive_loss_by_speed=tuple(map(tuple, calibration["drive_loss_by_speed"])),
    )


@dataclass(frozen=True)
class DriverInput:
    accelerator: float = 0.0
    brake: float = 0.0
    gear: str = "D"
    awake: bool = True
    grade_pct: float = 0.0
    road_mu: float = 0.9
    plug: str = "none"
    charger_kw: float = 0.0
    charge_target_soc: float = 0.8
    compensate_regen: bool = False
    hv_ok: bool = True
    precharge_ok: bool = True
    brake_force_fraction: float = 1.0

    def __post_init__(self) -> None:
        require_range("accelerator", self.accelerator, 0.0, 1.0)
        require_range("brake", self.brake, 0.0, 1.0)
        require_range("brake_force_fraction", self.brake_force_fraction, 0.0, 1.0)
        require_range("grade_pct", self.grade_pct, -30.0, 30.0)
        require_range("road_mu", self.road_mu, 0.0, 1.5)
        require_range("charger_kw", self.charger_kw, 0.0, 1000.0)
        require_range("charge_target_soc", self.charge_target_soc, 0.0, 1.0)
        if self.gear not in ("P", "N", "D") or self.plug not in ("none", "ac", "dc"):
            raise ValueError("Choose gear P, N or D and plug none, ac or dc")


class EVSimulation:
    def __init__(self, *, dt_s: float = 0.02, initial_soc: float = 0.6,
                 initial_temp_c: float = 20.0, ambient_c: float = 20.0,
                 initial_speed_m_s: float = 0.0, params: VehicleParameters | None = None,
                 initial_terminal_v: float | None = None, initial_current_a: float = 0.0):
        require_range("dt_s", dt_s, 0.0005, 0.1)
        require_range("initial_soc", initial_soc, 0.0, 1.0)
        require_range("initial_temp_c", initial_temp_c, -50.0, 80.0)
        require_range("ambient_c", ambient_c, -50.0, 80.0)
        require_range("initial_speed_m_s", initial_speed_m_s, 0.0, 80.0)
        self.p = VehicleParameters() if params is None else params
        self.dt_s = dt_s
        self.ambient_c = ambient_c
        self.speed_m_s = initial_speed_m_s
        self.soc = initial_soc
        self.temp_c = initial_temp_c
        self.distance_m = 0.0
        self.hv_state = "OFF"
        self.mode = "OFF"
        ocv = self.p.open_circuit_v(self.soc)
        self.polarization_v = 0.0
        if initial_terminal_v is not None and self.p.pack_polarization_ohm > 0.0:
            self.polarization_v = ocv - self.p.pack_resistance_ohm * initial_current_a - initial_terminal_v
        self._initial_polarization_v = self.polarization_v
        self._tick = 0
        self._precharge_tick = 0
        self._initial_kinetic_j = 0.5 * self.effective_mass_kg * initial_speed_m_s**2
        self._energy_j = {key: 0.0 for key in (
            "battery_out", "battery_in", "battery_chemical_net", "battery_heat",
            "regen_into_battery", "source", "charger_loss", "auxiliary",
            "motor_heating", "pack_cooling_electric", "pack_heat_removed",
            "drivetrain_loss", "road_load", "friction_brake", "grade",
        )}
        self._last: dict[str, float | str] = {
            "gear": "N" if initial_speed_m_s > 0.0 else "P",
            "accelerator": 0.0, "brake": 0.0, "acceleration_m_s2": 0.0,
            "battery_ocv_v": ocv,
            "battery_voltage_v": ocv - self.polarization_v, "battery_current_a": 0.0,
            "battery_power_kw": 0.0, "battery_charge_limit_kw": 0.0,
            "battery_discharge_limit_kw": 0.0, "motor_torque_nm": 0.0,
            "motor_dc_kw": 0.0, "wheel_motor_kw": 0.0,
            "road_load_kw": self.p.road_load_n(initial_speed_m_s) * initial_speed_m_s / 1000.0,
            "regen_force_n": 0.0, "friction_force_n": 0.0, "source_kw": 0.0,
            "motor_heating_kw": 0.0, "pack_heating_kw": 0.0, "auxiliary_kw": 0.0,
            "pack_cooling_electric_kw": 0.0, "pack_heat_removed_kw": 0.0,
        }

    @property
    def time_s(self) -> float:
        return self._tick * self.dt_s

    @property
    def effective_mass_kg(self) -> float:
        return self.p.mass_kg + self.p.effective_rotating_mass_kg

    def _update_hv(self, control: DriverInput, requested: bool) -> None:
        if not requested:
            self.hv_state = "OFF"
        elif not control.hv_ok:
            self.hv_state = "FAULT"
        elif self.hv_state == "OFF":
            self.hv_state = "PRECHARGE"
            self._precharge_tick = self._tick
        elif self.hv_state == "PRECHARGE":
            elapsed = (self._tick - self._precharge_tick) * self.dt_s
            if elapsed >= self.p.precharge_timeout_s:
                self.hv_state = "FAULT"
            elif control.precharge_ok and elapsed >= self.p.precharge_s:
                self.hv_state = "READY"

    def _battery_limits_w(self, ocv: float, resistance: float, charge_target: float, charging: bool
                          ) -> tuple[float, float]:
        p = self.p
        coulombs_per_step = p.usable_capacity_ah * 3600.0 / self.dt_s
        discharge_factor = (clamp(self.soc / 0.08) * clamp((self.temp_c + 25.0) / 30.0)
                            * clamp((60.0 - self.temp_c) / 15.0))
        taper_fraction = 0.20 if charging else p.regen_soc_taper_fraction
        charge_factor = (clamp((1.0 - self.soc) / taper_fraction) * clamp((self.temp_c + 10.0) / 30.0)
                         * clamp((57.0 - self.temp_c) / 12.0))
        discharge_a = max(0.0, min(p.max_discharge_a * discharge_factor,
                                   (ocv - p.minimum_terminal_v) / resistance,
                                   ocv / (2.0 * resistance), self.soc * coulombs_per_step))
        charge_a = max(0.0, min(p.max_charge_a * charge_factor,
                                (p.maximum_terminal_v - ocv) / resistance,
                                (charge_target - self.soc) * coulombs_per_step))
        return ((ocv - resistance * discharge_a) * discharge_a,
                (ocv + resistance * charge_a) * charge_a)

    def _drive_forces(self, control: DriverInput, speed_bound: float, normal_n: float,
                      discharge_w: float, charge_w: float, auxiliary_w: float
                      ) -> tuple[float, float, float]:
        """Return motor force, friction compensation and quadratic loss in SI units."""
        p, speed = self.p, self.speed_m_s
        wheel_factor = p.reduction_ratio / p.wheel_radius_m
        rear_grip = control.road_mu * normal_n * p.rear_load_fraction
        regen_eff = p.gear_efficiency * p.motor_regen_efficiency
        coast_pedal = 0.10
        regen_request = (clamp((coast_pedal - control.accelerator) / coast_pedal)
                         * clamp(speed / 3.0) * p.regen_torque_nm * wheel_factor
                         / p.gear_efficiency)
        regen_budget = min(p.regen_pack_limit_w, charge_w)
        regen_force = 0.0
        if regen_budget > 0.0 and regen_request > 0.0:
            regen_force = min(regen_request, rear_grip,
                              (regen_budget + auxiliary_w) / (regen_eff * speed_bound))
        compensation = regen_request - regen_force if control.compensate_regen else 0.0
        pedal_drive = clamp((control.accelerator - coast_pedal) / (1.0 - coast_pedal))
        if pedal_drive == 0.0 or control.brake > 0.0:
            return -regen_force, compensation, 0.0

        peak_force = p.drive_torque_nm * wheel_factor * p.gear_efficiency
        speed_limit = p.motor_speed_limit_rpm * (2.0 * math.pi / 60.0) / wheel_factor
        speed_taper = clamp((speed_limit - speed_bound) / (0.05 * speed_limit))
        shaft_power_force = p.drive_shaft_limit_w * p.gear_efficiency / speed_bound
        force_request = min(pedal_drive * peak_force * speed_taper, rear_grip, shaft_power_force)
        excess_ratio, loss_per_force_squared = p.drive_loss_coefficients(speed)
        stall_coefficient = p.full_torque_stall_loss_w * clamp(1.0 - speed / 3.0) / peak_force**2
        quadratic = stall_coefficient + loss_per_force_squared
        dc_power_budget = max(0.0, discharge_w - auxiliary_w)
        linear = speed_bound * (1.0 + excess_ratio) / p.gear_efficiency
        # Solve linear * force + quadratic * force**2 <= DC budget.
        battery_force = 2.0 * dc_power_budget / (
            linear + math.sqrt(linear**2 + 4.0 * quadratic * dc_power_budget))
        force = min(force_request, battery_force)
        return force, 0.0, quadratic * force**2

    def _dc_charge_limit_w(self, target: float) -> float:
        power_kw = DC_CHARGE_POWER_KW[-1][1]
        for (lo, low_kw), (hi, high_kw) in zip(DC_CHARGE_POWER_KW, DC_CHARGE_POWER_KW[1:]):
            if self.soc <= hi:
                power_kw = low_kw + (high_kw - low_kw) * (self.soc - lo) / (hi - lo)
                break
        ready_s = (self._tick - self._precharge_tick) * self.dt_s - self.p.precharge_s
        ramp = clamp(ready_s / 8.0)
        # Square-root taper reaches the selected SOC in finite time at zero power.
        cutoff = math.sqrt(clamp((target - self.soc) / 0.02))
        return 1000.0 * power_kw * ramp * cutoff

    def step(self, control: DriverInput) -> dict[str, float | str]:
        p, dt, v = self.p, self.dt_s, self.speed_m_s
        plugged = control.plug != "none"
        parked_for_charge = plugged and control.gear == "P" and v == 0.0
        self._update_hv(control, parked_for_charge if plugged else control.awake)
        ready = self.hv_state == "READY"
        driving = ready and not plugged and control.gear == "D"
        charging = ready and parked_for_charge
        self.mode = "DRIVE" if driving else self.hv_state

        ocv = p.open_circuit_v(self.soc)
        # Implicit midpoint equivalent circuit. The RC branch changes both the
        # available terminal power and stored electrical energy.
        alpha = dt / (2.0 * p.pack_polarization_tau_s)
        effective_v = ocv - self.polarization_v / (1.0 + alpha)
        resistance = p.pack_resistance_ohm + alpha * p.pack_polarization_ohm / (1.0 + alpha)
        target = control.charge_target_soc if charging else 1.0
        discharge_w, charge_w = (self._battery_limits_w(effective_v, resistance, target, charging)
                                 if ready else (0.0, 0.0))
        auxiliary_w = min(p.hv_aux_w, discharge_w)
        requested_cooling_w = min(p.pack_chiller_limit_w,
                                  p.pack_chiller_gain_w_k * max(0.0, self.temp_c - p.pack_chiller_setpoint_c))
        cooling_electric_w = min(requested_cooling_w / p.pack_chiller_cop, discharge_w - auxiliary_w)
        source_w = charger_dc_w = heating_w = 0.0
        if charging:
            complete = self.soc >= target - 1e-12
            self.mode = "CHARGE_COMPLETE" if complete else "CHARGE_" + control.plug.upper()
            dc = control.plug == "dc"
            input_limit = p.dc_input_limit_w if dc else p.ac_input_limit_w
            efficiency = p.dc_path_efficiency if dc else p.ac_charger_efficiency
            available_dc = min(input_limit, 1000.0 * control.charger_kw) * efficiency
            auxiliary_w = min(p.hv_aux_w, available_dc)
            if dc:
                charge_w = min(charge_w, self._dc_charge_limit_w(target))
            if dc and not complete and self.temp_c < 40.0:
                heating_w = min(p.motor_heating_w, available_dc - auxiliary_w)
            cooling_electric_w = min(requested_cooling_w / p.pack_chiller_cop,
                                     available_dc - auxiliary_w - heating_w)
            charger_dc_w = min(available_dc, auxiliary_w + heating_w + cooling_electric_w
                               + (0.0 if complete else charge_w))
            source_w = charger_dc_w / efficiency

        angle = math.atan(control.grade_pct / 100.0)
        normal_n = p.mass_kg * GRAVITY * math.cos(angle)
        grade_n = p.mass_kg * GRAVITY * math.sin(angle)
        speed_bound = v + dt * (control.road_mu * normal_n + max(0.0, -grade_n) + 1.0) / self.effective_mass_kg
        motor_n = compensation_n = force_loss_w = 0.0
        if driving:
            motor_n, compensation_n, force_loss_w = self._drive_forces(
                control, speed_bound, normal_n, discharge_w, charge_w, auxiliary_w + cooling_electric_w)
        grip_n = control.road_mu * normal_n
        regen_n = max(0.0, -motor_n)
        friction_n = min(control.brake * grip_n + compensation_n, max(0.0, grip_n - regen_n))
        friction_n *= control.brake_force_fraction
        road_n = p.road_load_n(v)
        acceleration = (motor_n - friction_n - road_n - grade_n) / self.effective_mass_kg
        next_v = max(0.0, v + acceleration * dt)
        moving_time = dt
        if next_v == 0.0 and acceleration < 0.0:
            moving_time = min(dt, v / -acceleration)
        if control.gear == "P" and v == 0.0:
            next_v = moving_time = 0.0
        travel = 0.5 * (v + next_v) * moving_time
        mean_v = travel / dt

        motor_wheel_w = motor_n * mean_v
        if motor_n >= 0.0:
            excess_ratio, _ = p.drive_loss_coefficients(v)
            motor_dc_w = motor_wheel_w * (1.0 + excess_ratio) / p.gear_efficiency + force_loss_w
            motor_torque = motor_n * p.wheel_radius_m / (p.reduction_ratio * p.gear_efficiency)
        else:
            motor_dc_w = motor_wheel_w * p.gear_efficiency * p.motor_regen_efficiency
            motor_torque = motor_n * p.wheel_radius_m * p.gear_efficiency / p.reduction_ratio
        battery_w = auxiliary_w + cooling_electric_w + heating_w + motor_dc_w - charger_dc_w
        current = 2.0 * battery_w / (
            effective_v + math.sqrt(effective_v**2 - 4.0 * resistance * battery_w))
        voltage = effective_v - current * resistance
        heat_w = current**2 * p.pack_resistance_ohm
        if p.pack_polarization_ohm > 0.0:
            polarization_mid_v = (self.polarization_v + alpha * p.pack_polarization_ohm * current) / (1.0 + alpha)
            heat_w += polarization_mid_v**2 / p.pack_polarization_ohm
            self.polarization_v = 2.0 * polarization_mid_v - self.polarization_v
        pack_heating_w = heating_w * p.motor_to_pack_heat_fraction
        chiller_heat_w = cooling_electric_w * p.pack_chiller_cop
        cooling_w = p.pack_passive_ua_w_k * (self.temp_c - self.ambient_c) + chiller_heat_w
        self.soc = clamp(self.soc - current * dt / (p.usable_capacity_ah * 3600.0))
        self.temp_c += dt * (heat_w + pack_heating_w - cooling_w) / p.pack_heat_capacity_j_k
        self.distance_m += travel
        self.speed_m_s = next_v
        self._tick += 1

        for key, power in {
            "battery_out": max(0.0, battery_w), "battery_in": max(0.0, -battery_w),
            "battery_chemical_net": ocv * current, "battery_heat": heat_w,
            "regen_into_battery": max(0.0, -motor_dc_w - auxiliary_w - cooling_electric_w),
            "source": source_w, "charger_loss": source_w - charger_dc_w, "auxiliary": auxiliary_w,
            "motor_heating": heating_w, "drivetrain_loss": motor_dc_w - motor_wheel_w,
            "pack_cooling_electric": cooling_electric_w, "pack_heat_removed": chiller_heat_w,
            "road_load": road_n * mean_v, "friction_brake": friction_n * mean_v,
            "grade": grade_n * mean_v,
        }.items():
            self._energy_j[key] += power * dt
        self._last = {
            "gear": control.gear, "accelerator": control.accelerator, "brake": control.brake,
            "acceleration_m_s2": (next_v - v) / dt, "battery_ocv_v": ocv,
            "battery_voltage_v": voltage, "battery_current_a": current,
            "battery_power_kw": battery_w / 1000.0, "battery_charge_limit_kw": charge_w / 1000.0,
            "battery_discharge_limit_kw": discharge_w / 1000.0, "motor_torque_nm": motor_torque,
            "motor_dc_kw": motor_dc_w / 1000.0, "wheel_motor_kw": motor_wheel_w / 1000.0,
            "road_load_kw": road_n * mean_v / 1000.0, "regen_force_n": regen_n,
            "friction_force_n": friction_n, "source_kw": source_w / 1000.0,
            "motor_heating_kw": heating_w / 1000.0, "pack_heating_kw": pack_heating_w / 1000.0,
            "auxiliary_kw": auxiliary_w / 1000.0,
            "pack_cooling_electric_kw": cooling_electric_w / 1000.0,
            "pack_heat_removed_kw": chiller_heat_w / 1000.0,
        }
        return self.snapshot()

    def snapshot(self) -> dict[str, float | str]:
        energy = self._energy_j
        battery_net = energy["battery_out"] - energy["battery_in"]
        delta_kinetic = 0.5 * self.effective_mass_kg * self.speed_m_s**2 - self._initial_kinetic_j
        accounted = delta_kinetic + sum(energy[key] for key in (
            "grade", "road_load", "friction_brake", "drivetrain_loss",
            "auxiliary", "motor_heating", "pack_cooling_electric", "charger_loss",
        ))
        polarization_delta_j = 0.0
        if self.p.pack_polarization_ohm > 0.0:
            capacitance = self.p.pack_polarization_tau_s / self.p.pack_polarization_ohm
            polarization_delta_j = 0.5 * capacitance * (self.polarization_v**2 - self._initial_polarization_v**2)
        return {
            "time_s": self.time_s, "mode": self.mode, "hv_state": self.hv_state,
            "speed_kph": 3.6 * self.speed_m_s, "distance_km": self.distance_m / 1000.0,
            "soc_pct": self.soc * 100.0, "battery_temp_c": self.temp_c,
            "motor_rpm": (self.speed_m_s * self.p.reduction_ratio / self.p.wheel_radius_m
                          * 60.0 / (2.0 * math.pi)),
            **self._last,
            **{f"energy_{key}_kwh": value / J_PER_KWH for key, value in energy.items()},
            "vehicle_energy_residual_j": battery_net + energy["source"] - accounted,
            "battery_energy_residual_j": (energy["battery_chemical_net"] - battery_net
                                          - energy["battery_heat"] - polarization_delta_j),
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenario", choices=("drive", "regen", "coastdown", "charge-ac", "charge-dc"))
    parser.add_argument("--duration-s", type=float)
    parser.add_argument("--step-s", type=float, default=0.02, help="Maximum integration step (default: 0.02)")
    parser.add_argument("--soc", type=float, help="Initial battery state of charge in percent")
    parser.add_argument("--temp-c", type=float, help="Initial battery temperature")
    parser.add_argument("--ambient-c", type=float, default=20.0)
    parser.add_argument("--charger-kw", type=float, help="Input power available from the charger")
    parser.add_argument("--charge-target", type=float, default=80.0, help="Target state of charge in percent")
    parser.add_argument("--compensate-regen", action="store_true")
    parser.add_argument("--trace", type=Path, help="Write a CSV trace with one row per step")
    args = parser.parse_args()

    plug = args.scenario.removeprefix("charge-") if args.scenario.startswith("charge-") else "none"
    charge = plug != "none"
    initial_speed = 100.0 if args.scenario == "coastdown" else 75.0 if args.scenario == "regen" else 0.0
    duration = args.duration_s if args.duration_s is not None else 900.0 if charge else 30.0
    initial_soc = args.soc if args.soc is not None else 20.0 if charge else 60.0
    temp = args.temp_c if args.temp_c is not None else 15.0 if plug == "dc" else 20.0
    source_kw = args.charger_kw if args.charger_kw is not None else 150.0 if plug == "dc" else 11.0
    try:
        require_range("duration_s", duration, 0.001, math.inf)
        require_range("step_s", args.step_s, 0.001, 0.1)
        count = max(1, math.ceil(duration / args.step_s - 1e-12))
        sim = EVSimulation(dt_s=duration / count, initial_soc=initial_soc / 100.0,
                           initial_temp_c=temp, ambient_c=args.ambient_c,
                           initial_speed_m_s=initial_speed / 3.6)
        if charge:
            control = DriverInput(gear="P", plug=plug, charger_kw=source_kw,
                                  charge_target_soc=args.charge_target / 100.0)
        elif args.scenario == "coastdown":
            control = DriverInput(gear="N", awake=False)
        else:
            control = DriverInput(compensate_regen=args.compensate_regen)
    except ValueError as exc:
        parser.error(str(exc))

    trace = args.trace.open("w", newline="", encoding="utf-8") if args.trace else None
    try:
        result = sim.snapshot()
        if trace:
            writer = csv.DictWriter(trace, fieldnames=list(result))
            writer.writeheader()
            writer.writerow(result)
        for _ in range(count):
            if args.scenario == "drive":
                t = sim.time_s
                if t < 9.0:
                    control = DriverInput(accelerator=0.42)
                elif t < 16.0:
                    control = DriverInput(accelerator=0.16)
                else:
                    control = DriverInput(brake=0.22 if t >= 20.0 else 0.0,
                                          compensate_regen=args.compensate_regen)
            result = sim.step(control)
            if trace:
                writer.writerow(result)
    finally:
        if trace:
            trace.close()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
