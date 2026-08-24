"use client";

import { useState } from "react";

export type DelayUnit = "minutes" | "hours" | "days";

interface AutomationDelayFieldProps {
  delayMinutes: number;
  onChange: (delayMinutes: number) => void;
  minMinutes?: number;
  maxMinutes?: number;
  presets?: Array<{ label: string; value: number }>;
}

export function AutomationDelayField({
  delayMinutes,
  onChange,
  minMinutes = 0,
  maxMinutes = 129_600,
  presets = [],
}: AutomationDelayFieldProps) {
  const [unit, setUnit] = useState<DelayUnit>(() =>
    preferredDelayUnit(delayMinutes)
  );
  const factor = unitFactor(unit);
  const amount = Math.round((delayMinutes / factor) * 100) / 100;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
        Enviar após
        <input
          type="number"
          min={roundForInput(minMinutes / factor)}
          max={roundForInput(maxMinutes / factor)}
          step={unit === "minutes" ? 1 : unit === "hours" ? 0.25 : 0.1}
          value={amount}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            onChange(
              Math.max(
                minMinutes,
                Math.min(maxMinutes, Math.round(value * factor))
              )
            );
          }}
          className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2"
        />
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as DelayUnit)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2"
          aria-label="Unidade do tempo de espera"
        >
          <option value="minutes">minutos</option>
          <option value="hours">horas</option>
          <option value="days">dias</option>
        </select>
      </label>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Atalhos de tempo">
          {presets.map((preset) => (
            <button
              type="button"
              key={`${preset.label}-${preset.value}`}
              onClick={() => {
                setUnit(preferredDelayUnit(preset.value));
                onChange(preset.value);
              }}
              className={`rounded-md border px-2 py-1 text-xs transition ${
                delayMinutes === preset.value
                  ? "border-brand-900 bg-brand-900 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function preferredDelayUnit(delayMinutes: number): DelayUnit {
  if (delayMinutes >= 1_440 && delayMinutes % 1_440 === 0) return "days";
  if (delayMinutes >= 60 && delayMinutes % 60 === 0) return "hours";
  return "minutes";
}

function unitFactor(unit: DelayUnit): number {
  return unit === "days" ? 1_440 : unit === "hours" ? 60 : 1;
}

function roundForInput(value: number): number {
  return Math.round(value * 100) / 100;
}
