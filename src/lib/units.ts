// Unit conversion utilities

export type WeightUnit = 'lbs' | 'kg';

const LBS_TO_KG = 0.453592;
const KG_TO_LBS = 2.20462;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;

  if (from === 'lbs' && to === 'kg') {
    return Math.round(value * LBS_TO_KG * 10) / 10;
  }

  return Math.round(value * KG_TO_LBS * 10) / 10;
}

export function formatWeight(value: number, unit: WeightUnit): string {
  return `${value} ${unit}`;
}

export function getDefaultUnit(preferredUnit: 'imperial' | 'metric'): WeightUnit {
  return preferredUnit === 'metric' ? 'kg' : 'lbs';
}

// Common weight increments for plates
export const WEIGHT_INCREMENTS = {
  lbs: [2.5, 5, 10, 25, 35, 45],
  kg: [1.25, 2.5, 5, 10, 15, 20, 25],
};

export function roundToNearestIncrement(value: number, unit: WeightUnit): number {
  const increment = unit === 'lbs' ? 2.5 : 1.25;
  return Math.round(value / increment) * increment;
}
