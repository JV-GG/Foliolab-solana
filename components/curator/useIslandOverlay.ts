'use client';

import {useEffect, useState} from 'react';

const RESOLUTION = 256;

export interface MapHolder {
  id: string;
  address: string | null;
  label: string;
  shares: string;
  valueUsd: string | null;
  current: boolean;
  kind: 'wallet' | 'residual';
}

export interface OverlayAsset {
  address: string;
  symbol: string;
  color: string;
  value: number;
}

export interface HolderMarker {
  holderIndex: number;
  x: number;
  y: number;
}

interface OverlayState {
  assetUrl: string | null;
  assetBoundaryUrl: string | null;
  highlightedAssetUrls: Record<string, string>;
  assetAt: Int16Array | null;
  boundaryUrl: string | null;
  territoryAt: Int16Array | null;
  markers: HolderMarker[];
  width: number;
  height: number;
}

const EMPTY: OverlayState = {
  assetUrl: null,
  assetBoundaryUrl: null,
  highlightedAssetUrls: {},
  assetAt: null,
  boundaryUrl: null,
  territoryAt: null,
  markers: [],
  width: RESOLUTION,
  height: RESOLUTION,
};

export function useIslandOverlay({maskUrl, assets, holders, totalSupply, seed}: {
  maskUrl: string;
  assets: OverlayAsset[] | null;
  holders: MapHolder[];
  totalSupply: string;
  seed: string;
}) {
  const [state, setState] = useState<OverlayState>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = RESOLUTION;
      maskCanvas.height = RESOLUTION;
      const maskContext = maskCanvas.getContext('2d', {willReadFrequently: true});
      if (!maskContext) return;
      maskContext.imageSmoothingEnabled = false;
      maskContext.clearRect(0, 0, RESOLUTION, RESOLUTION);
      maskContext.drawImage(image, 0, 0, RESOLUTION, RESOLUTION);
      const mask = maskContext.getImageData(0, 0, RESOLUTION, RESOLUTION).data;
      const land: number[] = [];
      for (let pixel = 0; pixel < RESOLUTION * RESOLUTION; pixel += 1) {
        if (mask[pixel * 4 + 3] > 127) land.push(pixel);
      }

      const territoryAt = allocateTerritories(land, holders, totalSupply, seed, RESOLUTION);
      const assetAt = new Int16Array(RESOLUTION * RESOLUTION);
      assetAt.fill(-1);
      const assetCanvas = document.createElement('canvas');
      assetCanvas.width = RESOLUTION;
      assetCanvas.height = RESOLUTION;
      const assetContext = assetCanvas.getContext('2d');
      const boundaryCanvas = document.createElement('canvas');
      boundaryCanvas.width = RESOLUTION;
      boundaryCanvas.height = RESOLUTION;
      const boundaryContext = boundaryCanvas.getContext('2d');
      const assetBoundaryCanvas = document.createElement('canvas');
      assetBoundaryCanvas.width = RESOLUTION;
      assetBoundaryCanvas.height = RESOLUTION;
      const assetBoundaryContext = assetBoundaryCanvas.getContext('2d');
      if (!assetContext || !boundaryContext || !assetBoundaryContext) return;

      if (assets && assets.length > 0) {
        for (let holderIndex = 0; holderIndex < holders.length; holderIndex += 1) {
          const territory = land.filter((pixel) => territoryAt[pixel] === holderIndex);
          assignAssetMix(assetAt, territory, assets, `${seed}:assets`, RESOLUTION);
        }
        const assetPixels = assetContext.createImageData(RESOLUTION, RESOLUTION);
        paintAssetLayer(assetPixels.data, land, assetAt, assets, null);
        assetContext.putImageData(assetPixels, 0, 0);
      }

      const assetBoundaryPixels = assetBoundaryContext.createImageData(RESOLUTION, RESOLUTION);
      paintAssetBoundaries(assetBoundaryPixels.data, land, assetAt, RESOLUTION);
      assetBoundaryContext.putImageData(assetBoundaryPixels, 0, 0);

      const boundaryPixels = boundaryContext.createImageData(RESOLUTION, RESOLUTION);
      paintBoundaries(boundaryPixels.data, land, territoryAt, RESOLUTION);
      boundaryContext.putImageData(boundaryPixels, 0, 0);
      const markers = markerPositions(land, territoryAt, holders, RESOLUTION);
      const highlightedAssetUrls: Record<string, string> = {};
      if (assets && assets.length > 0) {
        assets.forEach((asset, assetIndex) => {
          const highlightCanvas = document.createElement('canvas');
          highlightCanvas.width = RESOLUTION;
          highlightCanvas.height = RESOLUTION;
          const highlightContext = highlightCanvas.getContext('2d');
          if (!highlightContext) return;
          const highlightPixels = highlightContext.createImageData(RESOLUTION, RESOLUTION);
          paintAssetLayer(highlightPixels.data, land, assetAt, assets, assetIndex);
          highlightContext.putImageData(highlightPixels, 0, 0);
          highlightedAssetUrls[asset.address.toLowerCase()] = highlightCanvas.toDataURL('image/png');
        });
      }

      if (!cancelled) {
        setState({
          assetUrl: assets && assets.length > 0 ? assetCanvas.toDataURL('image/png') : null,
          assetBoundaryUrl: assets && assets.length > 1 ? assetBoundaryCanvas.toDataURL('image/png') : null,
          highlightedAssetUrls,
          assetAt,
          boundaryUrl: boundaryCanvas.toDataURL('image/png'),
          territoryAt,
          markers,
          width: RESOLUTION,
          height: RESOLUTION,
        });
      }
    };
    image.src = maskUrl;
    return () => {
      cancelled = true;
    };
  }, [assets, holders, maskUrl, seed, totalSupply]);

  return state;
}

export function allocateTerritories(land: number[], holders: MapHolder[], totalSupplyRaw: string, seed: string, width: number) {
  const territoryAt = new Int16Array(width * width);
  territoryAt.fill(-1);
  if (land.length === 0 || holders.length === 0) return territoryAt;
  const totalSupply = BigInt(totalSupplyRaw);
  if (totalSupply <= BigInt(0)) return territoryAt;
  const counts = apportionBigInts(holders.map((holder) => BigInt(holder.shares)), totalSupply, land.length);
  const angle = hashString(`${seed}:territories`) / 0xffff_ffff * Math.PI * 2;
  const ordered = [...land].sort((left, right) => {
    const leftX = left % width;
    const leftY = Math.floor(left / width);
    const rightX = right % width;
    const rightY = Math.floor(right / width);
    const leftProjection = leftX * Math.cos(angle) + leftY * Math.sin(angle);
    const rightProjection = rightX * Math.cos(angle) + rightY * Math.sin(angle);
    return leftProjection - rightProjection || left - right;
  });
  let cursor = 0;
  counts.forEach((count, holderIndex) => {
    for (let offset = 0; offset < count && cursor < ordered.length; offset += 1, cursor += 1) {
      territoryAt[ordered[cursor]] = holderIndex;
    }
  });
  while (cursor < ordered.length) territoryAt[ordered[cursor++]] = holders.length - 1;
  return territoryAt;
}

function apportionBigInts(values: bigint[], total: bigint, units: number) {
  if (total <= BigInt(0) || units <= 0) return values.map(() => 0);
  const allocations = values.map((value, index) => {
    const bounded = value < BigInt(0) ? BigInt(0) : value > total ? total : value;
    const scaled = bounded * BigInt(units);
    return {index, count: Number(scaled / total), remainder: scaled % total, positive: bounded > BigInt(0)};
  });
  for (const allocation of allocations) {
    if (allocation.positive && allocation.count === 0) allocation.count = 1;
  }
  let assigned = allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  if (assigned > units) {
    for (const allocation of [...allocations].sort((a, b) => b.count - a.count || a.index - b.index)) {
      while (assigned > units && allocation.count > (allocation.positive ? 1 : 0)) {
        allocation.count -= 1;
        assigned -= 1;
      }
    }
  }
  let left = units - assigned;
  for (const allocation of [...allocations].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (left <= 0) break;
    allocation.count += 1;
    left -= 1;
  }
  if (left > 0 && allocations.length > 0) allocations[allocations.length - 1].count += left;
  return allocations.sort((a, b) => a.index - b.index).map((allocation) => allocation.count);
}

function assignAssetMix(target: Int16Array, pixels: number[], assets: OverlayAsset[], seed: string, width: number) {
  if (pixels.length === 0 || assets.length === 0) return;
  const total = assets.reduce((sum, asset) => sum + asset.value, 0);
  if (!(total > 0)) return;
  const counts = apportionNumbers(assets.map((asset) => asset.value), total, pixels.length);
  const phase = hashString(seed) / 0xffff_ffff * Math.PI * 2;
  const ordered = [...pixels].sort((left, right) => organicScore(left, width, phase) - organicScore(right, width, phase) || left - right);
  let cursor = 0;
  counts.forEach((count, assetIndex) => {
    for (let offset = 0; offset < count && cursor < ordered.length; offset += 1, cursor += 1) {
      target[ordered[cursor]] = assetIndex;
    }
  });
}

function paintAssetLayer(
  target: Uint8ClampedArray,
  land: number[],
  assetAt: Int16Array,
  assets: OverlayAsset[],
  highlightedIndex: number | null,
) {
  for (const pixel of land) {
    const assetIndex = assetAt[pixel];
    const asset = assets[assetIndex];
    if (!asset) continue;
    const [red, green, blue] = hexToRgb(asset.color);
    const offset = pixel * 4;
    target[offset] = red;
    target[offset + 1] = green;
    target[offset + 2] = blue;
    target[offset + 3] = highlightedIndex === null ? 126 : assetIndex === highlightedIndex ? 178 : 24;
  }
}

function paintAssetBoundaries(target: Uint8ClampedArray, land: number[], assetAt: Int16Array, width: number) {
  const landSet = new Set(land);
  for (const pixel of land) {
    const asset = assetAt[pixel];
    if (asset < 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [x + 1 < width ? pixel + 1 : -1, y + 1 < width ? pixel + width : -1];
    if (!neighbors.some((neighbor) => neighbor >= 0 && landSet.has(neighbor) && assetAt[neighbor] >= 0 && assetAt[neighbor] !== asset)) continue;
    const offset = pixel * 4;
    target[offset] = 18;
    target[offset + 1] = 20;
    target[offset + 2] = 20;
    target[offset + 3] = 155;
  }
}

function apportionNumbers(values: number[], total: number, units: number) {
  const allocations = values.map((value, index) => {
    const exact = Math.max(0, value) / total * units;
    return {index, count: Math.floor(exact), remainder: exact - Math.floor(exact)};
  });
  let left = units - allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  for (const allocation of [...allocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left <= 0) break;
    allocation.count += 1;
    left -= 1;
  }
  return allocations.sort((a, b) => a.index - b.index).map((allocation) => allocation.count);
}

function organicScore(pixel: number, width: number, phase: number) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  return (
    Math.sin(x * 0.071 + phase) * 0.46 +
    Math.cos(y * 0.063 - phase * 0.7) * 0.34 +
    Math.sin((x + y) * 0.035 + phase * 1.6) * 0.2
  );
}

function paintBoundaries(target: Uint8ClampedArray, land: number[], territoryAt: Int16Array, width: number) {
  const landSet = new Set(land);
  for (const pixel of land) {
    const territory = territoryAt[pixel];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [x + 1 < width ? pixel + 1 : -1, y + 1 < width ? pixel + width : -1];
    if (!neighbors.some((neighbor) => neighbor >= 0 && landSet.has(neighbor) && territoryAt[neighbor] !== territory)) continue;
    if ((x + y) % 7 > 3) continue;
    const offset = pixel * 4;
    target[offset] = 232;
    target[offset + 1] = 235;
    target[offset + 2] = 231;
    target[offset + 3] = 205;
  }
}

function markerPositions(land: number[], territoryAt: Int16Array, holders: MapHolder[], width: number): HolderMarker[] {
  return holders.flatMap((holder, holderIndex) => {
    if (holder.kind !== 'wallet' || BigInt(holder.shares) <= BigInt(0)) return [];
    const territory = land.filter((pixel) => territoryAt[pixel] === holderIndex);
    if (territory.length === 0) return [];
    const centerX = territory.reduce((sum, pixel) => sum + pixel % width, 0) / territory.length;
    const centerY = territory.reduce((sum, pixel) => sum + Math.floor(pixel / width), 0) / territory.length;
    const best = territory.reduce((selected, pixel) => {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const distance = (x - centerX) ** 2 + (y - centerY) ** 2;
      return distance < selected.distance ? {pixel, distance} : selected;
    }, {pixel: territory[0], distance: Number.POSITIVE_INFINITY});
    return [{holderIndex, x: (best.pixel % width + 0.5) / width, y: (Math.floor(best.pixel / width) + 0.5) / width}];
  });
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
