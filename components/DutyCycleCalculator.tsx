"use client";

import { useEffect, useMemo, useState } from "react";

const DUTY_DATA = {
  MIG: {
    "120V": { rated: { duty: 40, amps: 100 }, continuous: 75, maxAmps: 140 },
    "240V": { rated: { duty: 25, amps: 200 }, continuous: 115, maxAmps: 220 },
  },
  TIG: {
    "120V": { rated: { duty: 40, amps: 125 }, continuous: 90, maxAmps: 125 },
    "240V": { rated: { duty: 30, amps: 175 }, continuous: 105, maxAmps: 175 },
  },
  Stick: {
    "120V": { rated: { duty: 40, amps: 80 }, continuous: 60, maxAmps: 80 },
    "240V": { rated: { duty: 25, amps: 175 }, continuous: 100, maxAmps: 175 },
  },
} as const;

type Process = keyof typeof DUTY_DATA;
type Voltage = "120V" | "240V";

type DutyCycleCalculatorProps = {
  process?: Process;
  voltage?: Voltage;
  amps?: number;
};

const PROCESSES: Process[] = ["MIG", "TIG", "Stick"];
const VOLTAGES: Voltage[] = ["120V", "240V"];
const ACCENT = "#f59e0b";

function clampAmps(value: number, maxAmps: number): number {
  return Math.min(Math.max(value, 30), maxAmps);
}

export default function DutyCycleCalculator({
  process: initialProcess = "MIG",
  voltage: initialVoltage = "240V",
  amps: initialAmps = 200,
}: DutyCycleCalculatorProps) {
  const [process, setProcess] = useState<Process>(initialProcess);
  const [voltage, setVoltage] = useState<Voltage>(initialVoltage);
  const [amps, setAmps] = useState(initialAmps);

  const config = DUTY_DATA[process][voltage];
  const { rated, continuous, maxAmps } = config;

  useEffect(() => {
    setAmps((current) => clampAmps(current, maxAmps));
  }, [maxAmps]);

  const interpretation = useMemo(() => {
    const weldMinutes = rated.duty / 10;
    const restMinutes = 10 - weldMinutes;
    const nearRated = amps >= rated.amps - 5;

    if (amps > rated.amps) {
      return {
        tone: "red" as const,
        title: "Above rated output",
        body: "Exceeds the manual's specified range.",
        restCycle: null,
      };
    }

    if (amps <= continuous) {
      return {
        tone: "green" as const,
        title: "Continuous welding",
        body: "No rest needed at this current.",
        restCycle: null,
      };
    }

    return {
      tone: "amber" as const,
      title: "Near rated limit",
      body: "Work in shorter bursts.",
      restCycle: nearRated
        ? `Weld ${weldMinutes} min, rest ${restMinutes} min per 10-minute window`
        : null,
    };
  }, [amps, continuous, rated.amps, rated.duty]);

  const toneStyles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    red: "border-red-200 bg-red-50 text-red-900",
  }[interpretation.tone];

  return (
    <div className="w-full max-w-[480px] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="bg-slate-800 px-5 py-4">
        <h3 className="text-sm font-semibold tracking-wide text-white uppercase">
          Duty Cycle Calculator
        </h3>
        <p className="mt-1 text-xs text-slate-300">
          Vulcan OmniPro 220 — rated &amp; continuous limits (page 7)
        </p>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Process
          </p>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {PROCESSES.map((option) => {
              const active = process === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setProcess(option)}
                  className="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={
                    active
                      ? { backgroundColor: ACCENT, color: "#1a1a1a" }
                      : { color: "#475569" }
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Input Voltage
          </p>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {VOLTAGES.map((option) => {
              const active = voltage === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setVoltage(option)}
                  className="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={
                    active
                      ? { backgroundColor: ACCENT, color: "#1a1a1a" }
                      : { color: "#475569" }
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Amperage
            </p>
            <p className="text-lg font-semibold text-slate-900 tabular-nums">
              {amps}
              <span className="ml-0.5 text-sm font-normal text-slate-500">A</span>
            </p>
          </div>
          <input
            type="range"
            min={30}
            max={maxAmps}
            step={1}
            value={amps}
            onChange={(e) => setAmps(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#f59e0b]"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-400 tabular-nums">
            <span>30 A</span>
            <span>{maxAmps} A</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">Rated:</span>{" "}
            {rated.duty}% @ {rated.amps}A
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-900">Continuous (100%):</span>{" "}
            {continuous}A
          </p>
        </div>

        <div className={`rounded-lg border px-4 py-3 ${toneStyles}`}>
          <p className="font-semibold">
            {interpretation.tone === "green" &&
              "✓ Continuous welding — no rest needed at this current"}
            {interpretation.tone === "amber" &&
              "Near rated limit — work in shorter bursts"}
            {interpretation.tone === "red" &&
              "⚠ Above rated output — exceeds the manual's specified range"}
          </p>
          {interpretation.tone === "amber" && (
            <p className="mt-1 text-sm">{interpretation.body}</p>
          )}
          {interpretation.restCycle && (
            <p className="mt-2 text-sm font-medium">
              At {rated.duty}% duty: {interpretation.restCycle}
            </p>
          )}
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          The manual specifies duty cycle only at the rated and continuous points
          (page 7). Values between are not published.
        </p>
      </div>
    </div>
  );
}
