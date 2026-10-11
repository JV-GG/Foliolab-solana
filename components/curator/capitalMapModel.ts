import type {Holding} from '@/lib/contracts/hooks';

const COLORS = ['#4de5ca', '#a893ff', '#f1b94f', '#63adff', '#ef7898', '#ed8358', '#79d995', '#d47ee0'];
const KNOWN_COLORS: Record<string, string> = {
  '0x55d398326f99059ff775485246999027b3197955': '#4de5ca',
  '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4': '#a893ff',
  '0xa9ee28c80f960b889dfbd1902055218cba016f75': '#f1b94f',
  '0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3': '#63adff',
};

export const SHARE_SCALE = BigInt(1_000_000);

export interface MixAsset {
  address: string;
  symbol: string;
  color: string;
  value: number;
}

export type TerrainKind = 'sand' | 'grass' | 'forest' | 'mountain';

export interface TerrainCell {
  column: number;
  row: number;
  terrain: TerrainKind;
  shade: number;
}

export interface IslandTerrain {
  width: number;
  height: number;
  land: TerrainCell[];
  shallowWater: {column: number; row: number; depth: 1 | 2 | 3}[];
}

export type AssetMix =
  | {status: 'ready'; assets: MixAsset[]}
  | {status: 'unpriced'; assets: MixAsset[]}
  | {status: 'empty'; assets: MixAsset[]};

// A token receives the same deterministic color in every vault.
export function assetColor(address: string): string {
  const normalized = address.toLowerCase();
  const known = KNOWN_COLORS[normalized];
  if (known) return known;
  return COLORS[hashString(normalized) % COLORS.length];
}

// Missing prices on any non-zero holding make the entire value mix unavailable.
export function assetMix(holdings: Holding[]): AssetMix {
  const nonZero = holdings.filter((holding) => BigInt(holding.amount) > BigInt(0));
  const assets = nonZero.map((holding) => ({
    address: holding.asset,
    symbol: holding.symbol,
    color: assetColor(holding.asset),
    value: holding.valueUsd === null ? 0 : Number(holding.valueUsd),
  }));
  if (assets.length === 0) return {status: 'empty', assets};
  if (nonZero.some((holding) => holding.valueUsd === null)) return {status: 'unpriced', assets};
  if (assets.reduce((sum, asset) => sum + asset.value, 0) <= 0) return {status: 'unpriced', assets};
  return {status: 'ready', assets};
}

// Exact share ratio scaled to one million, calculated before conversion to drawing numbers.
export function sharePartsPerMillion(sharesRaw: string, totalSupplyRaw: string): bigint | null {
  const shares = BigInt(sharesRaw);
  const supply = BigInt(totalSupplyRaw);
  if (supply <= BigInt(0)) return null;
  const bounded = shares < BigInt(0) ? BigInt(0) : shares > supply ? supply : shares;
  return bounded * SHARE_SCALE / supply;
}

// Assigns a contiguous territory using raw integer shares; one pixel is the minimum visible unit.
export function territoryCellCount(sharesRaw: string, totalSupplyRaw: string, totalCells: number): number {
  if (totalCells <= 0) return 0;
  const shares = BigInt(sharesRaw);
  const supply = BigInt(totalSupplyRaw);
  if (shares <= BigInt(0) || supply <= BigInt(0)) return 0;
  const bounded = shares > supply ? supply : shares;
  const roundedDown = Number(bounded * BigInt(totalCells) / supply);
  return Math.min(totalCells, Math.max(1, roundedDown));
}

// Builds stable exact-count, contiguous color bands. Each territory calls this separately so its
// ground repeats the same portfolio mix without turning the island into a random checkerboard.
export function assetAssignments(mix: AssetMix, cellCount: number, seed: string): string[] | null {
  if (mix.status !== 'ready' || cellCount <= 0) return null;
  const totalValue = mix.assets.reduce((sum, asset) => sum + asset.value, 0);
  const allocations = mix.assets.map((asset, index) => {
    const exact = asset.value / totalValue * cellCount;
    return {index, count: Math.floor(exact), remainder: exact - Math.floor(exact)};
  });
  let left = cellCount - allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  for (const allocation of [...allocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left <= 0) break;
    allocation.count += 1;
    left -= 1;
  }
  const colors = allocations.flatMap((allocation) =>
    Array.from({length: allocation.count}, () => mix.assets[allocation.index].color),
  );
  if (colors.length < 2) return colors;
  const offset = hashString(seed) % colors.length;
  return [...colors.slice(offset), ...colors.slice(0, offset)];
}

// Generates a stable, address-specific island with bays, peninsulas and layered terrain.
export function generateIslandTerrain(address: string, width = 60, height = 42): IslandTerrain {
  const seed = hashString(address.toLowerCase());
  const phaseA = seed / 0xffff_ffff * Math.PI * 2;
  const phaseB = (seed >>> 8) / 0x00ff_ffff * Math.PI * 2;
  const bayAngle = (seed >>> 4) / 0x0fff_ffff * Math.PI * 2;
  const secondBayAngle = bayAngle + Math.PI * (0.72 + (seed % 19) / 31);
  const peninsulaAngle = bayAngle + Math.PI * (1.16 + (seed % 23) / 61);
  const landSet = new Set<string>();

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = (column - (width - 1) / 2) / (width * 0.405);
      const y = (row - (height - 1) / 2) / (height * 0.385);
      const radius = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      const coastNoise = smoothField(seed, column, row) * 0.075;
      let edge = 1 + Math.sin(angle * 3 + phaseA) * 0.12 + Math.sin(angle * 5 + phaseB) * 0.065;
      const bayDistance = angleDistance(angle, bayAngle);
      if (bayDistance < 0.42 && radius > 0.38) edge -= (0.42 - bayDistance) * 0.92;
      const secondBayDistance = angleDistance(angle, secondBayAngle);
      if (secondBayDistance < 0.25 && radius > 0.62) edge -= (0.25 - secondBayDistance) * 0.52;
      const peninsulaDistance = angleDistance(angle, peninsulaAngle);
      if (peninsulaDistance < 0.34) edge += (0.34 - peninsulaDistance) * 0.9;
      if (radius < edge + coastNoise) landSet.add(cellKey(column, row));
    }
  }

  const ridgeAngle = phaseB * 0.72 + 0.4;
  const ridgeOffset = (coordinateNoise(seed, 71, 19) - 0.5) * 0.25;
  const forestCenters = Array.from({length: 3}, (_, index) => ({
    x: (coordinateNoise(seed ^ 0x5f356495, index * 17 + 3, 11) - 0.5) * 1.18,
    y: (coordinateNoise(seed ^ 0x2c9277b5, index * 13 + 7, 29) - 0.5) * 1.05,
    radius: 0.22 + coordinateNoise(seed ^ 0x165667b1, index * 23 + 5, 41) * 0.18,
  }));
  const land: TerrainCell[] = [];
  const shallowWater = new Map<string, {column: number; row: number; depth: 1 | 2 | 3}>();
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (!landSet.has(cellKey(column, row))) continue;
      const exposed = CARDINAL.some(([dx, dy]) => !landSet.has(cellKey(column + dx, row + dy)));
      const normalizedX = (column - width / 2) / (width * 0.42);
      const normalizedY = (row - height / 2) / (height * 0.4);
      const alongRidge = -normalizedX * Math.sin(ridgeAngle) + normalizedY * Math.cos(ridgeAngle);
      const acrossRidge = Math.abs(normalizedX * Math.cos(ridgeAngle) + normalizedY * Math.sin(ridgeAngle) - ridgeOffset);
      const ridgeTexture = smoothField(seed ^ 0x9e3779b9, column * 0.72, row * 0.72);
      const mountain = acrossRidge < 0.105 + Math.max(0, ridgeTexture) * 0.045 && Math.abs(alongRidge) < 0.72;
      const forestStrength = Math.max(...forestCenters.map((center) => {
        const distance = (normalizedX - center.x) ** 2 + (normalizedY - center.y) ** 2;
        return Math.exp(-distance / (center.radius * center.radius));
      }));
      const forest = forestStrength + smoothField(seed ^ 0x85ebca6b, column * 0.8, row * 0.8) * 0.16 > 0.43;
      const terrain: TerrainKind = exposed
        ? 'sand'
        : mountain
          ? 'mountain'
          : forest
            ? 'forest'
            : 'grass';
      land.push({column, row, terrain, shade: (smoothField(seed ^ 0xc2b2ae35, column, row) + 1) / 2});

      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const waterColumn = column + dx;
          const waterRow = row + dy;
          const key = cellKey(waterColumn, waterRow);
          const depth = Math.max(Math.abs(dx), Math.abs(dy)) as 1 | 2 | 3;
          if (
            depth > 0 && depth <= 3 &&
            waterColumn >= 0 && waterColumn < width &&
            waterRow >= 0 && waterRow < height &&
            !landSet.has(key)
          ) {
            const existing = shallowWater.get(key);
            if (!existing || depth < existing.depth) shallowWater.set(key, {column: waterColumn, row: waterRow, depth});
          }
        }
      }
    }
  }
  return {width, height, land, shallowWater: [...shallowWater.values()]};
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const CARDINAL = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

function cellKey(column: number, row: number) {
  return `${column}:${row}`;
}

function coordinateNoise(seed: number, column: number, row: number) {
  let value = seed ^ Math.imul(column + 1, 374761393) ^ Math.imul(row + 1, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 0xffff_ffff;
}

function smoothField(seed: number, column: number, row: number) {
  const phaseA = (seed >>> 0) / 0xffff_ffff * Math.PI * 2;
  const phaseB = ((seed ^ 0x9e3779b9) >>> 0) / 0xffff_ffff * Math.PI * 2;
  return (
    Math.sin(column * 0.19 + phaseA) * Math.cos(row * 0.17 + phaseB) * 0.52 +
    Math.sin(column * 0.083 - row * 0.071 + phaseB) * 0.31 +
    Math.cos(column * 0.047 + row * 0.059 + phaseA) * 0.17
  );
}

function angleDistance(left: number, right: number) {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}
