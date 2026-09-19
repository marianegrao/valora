export function toMinorUnits(amount: string): number {
  return Math.round(Number(amount) * 100)
}

export function toMajorUnits(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}
