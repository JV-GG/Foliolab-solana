'use client';

import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {Address} from 'viem';
import type {VaultView} from '@/lib/contracts/hooks';
import {shortAddress, tokenAmount} from '@/lib/domain/format';
import crescentIsland from './art/vault-island-art-crescent.png';
import crescentMask from './art/vault-island-art-crescent-land-mask.png';
import sampleIsland from './art/vault-island-art-sample.png';
import sampleMask from './art/vault-island-art-sample-land-mask.png';
import {assetMix, sharePartsPerMillion} from './capitalMapModel';
import {useIslandOverlay, type MapHolder, type OverlayAsset} from './useIslandOverlay';

const DESKTOP_VIEW_WIDTH = 1080;
const ART_SIZE = 430;
const SAMPLE_SIZE = 500;
const MAX_COLUMNS = 2;
const ART_VARIANTS = [
  {image: sampleIsland.src, mask: sampleMask.src},
  {image: crescentIsland.src, mask: crescentMask.src},
] as const;

const subscribeViewport = (callback: () => void) => {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
};

const compactViewport = () => window.innerWidth < 768;
const desktopServerSnapshot = () => false;

interface Props {
  vaults: VaultView[];
  selectedAddress: Address | null;
  connectedAddress?: Address;
  artSample?: boolean;
  demo?: boolean;
  holdersByVault?: Record<string, MapHolder[]>;
  onSelect: (address: Address) => void;
}

interface Pan {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startPan: Pan;
  unitsX: number;
  unitsY: number;
}

interface TerritoryDetail {
  vault: VaultView;
  holder: MapHolder;
}

type MapView = 'terrain' | 'distribution';

interface HoveredAsset {
  address: string;
  symbol: string;
  percent: number;
  color: string;
}

export function AssetMap({
  vaults,
  selectedAddress,
  connectedAddress,
  artSample = false,
  demo = false,
  holdersByVault,
  onSelect,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({x: 0, y: 0});
  const [mapView, setMapView] = useState<MapView>('distribution');
  const [showTerritories, setShowTerritories] = useState(true);
  const [territoryDetail, setTerritoryDetail] = useState<TerritoryDetail | null>(null);
  const [hoveredAsset, setHoveredAsset] = useState<HoveredAsset | null>(null);
  const drag = useRef<DragState | null>(null);
  const compact = useSyncExternalStore(subscribeViewport, compactViewport, desktopServerSnapshot);
  const singleIsland = artSample || demo;
  const visibleVaults = singleIsland
    ? vaults.filter((vault) => vault.address === selectedAddress).slice(0, 1)
    : vaults;
  const columns = singleIsland || compact ? 1 : Math.min(MAX_COLUMNS, Math.max(1, visibleVaults.length));
  const rows = Math.max(1, Math.ceil(visibleVaults.length / columns));
  const viewWidth = compact ? 620 : DESKTOP_VIEW_WIDTH;
  const viewHeight = singleIsland
    ? 630
    : compact
      ? Math.max(560, 30 + rows * 480)
      : Math.max(620, 50 + rows * 480);
  const selectedVault = visibleVaults.find((vault) => vault.address === selectedAddress) ?? visibleVaults[0] ?? null;

  function resetView() {
    setZoom(1);
    setPan({x: 0, y: 0});
  }

  function selectVault(address: Address) {
    setTerritoryDetail(null);
    onSelect(address);
  }

  function startDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (event.target as Element).closest('[data-map-control]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: pan,
      unitsX: viewWidth / bounds.width,
      unitsY: viewHeight / bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPan({
      x: drag.current.startPan.x + (event.clientX - drag.current.startX) * drag.current.unitsX / zoom,
      y: drag.current.startPan.y + (event.clientY - drag.current.startY) * drag.current.unitsY / zoom,
    });
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#090a0b] font-mono text-[#e8e9e5]">
      <div className="relative z-30 flex min-h-[58px] flex-wrap items-center gap-2 border-b border-[#3b3f41] bg-[#0b0c0d]/98 px-3 py-2 sm:px-4">
        <div className="mr-auto w-full min-w-0 sm:w-auto sm:min-w-[155px]">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[12px] text-[#65e2c5]">&gt;</span>
            <h2 className="text-[13px] font-[800] tracking-[0.08em] text-[#f4f4ef] sm:text-[15px]">CAPITAL_ARCHIPELAGO</h2>
            <span className="border border-[#4a504e] bg-[#171a19] px-2 py-1 text-[7px] font-[800] tracking-[0.12em] text-[#65e2c5]">
              [ {demo ? 'VISUAL_DEMO' : artSample ? 'ART_SAMPLE' : 'VAULT_ISLANDS'} ]
            </span>
          </div>
          <p className="mt-1 text-[8px] tracking-[0.08em] text-[#858b88] sm:text-[9px]">
            :: {String(visibleVaults.length).padStart(2, '0')} VAULT_{visibleVaults.length === 1 ? 'ISLAND' : 'ISLANDS'} / SELECT LAND TO INSPECT
          </p>
        </div>

        <MapViewToggle value={mapView} onChange={(value) => {
          setMapView(value);
          if (value === 'terrain') setHoveredAsset(null);
        }} />
        <LayerToggle active={showTerritories} label="User territories" shortLabel="USERS" onClick={() => setShowTerritories((value) => !value)} />
        <div className="ml-1 flex items-center gap-1.5 border-l border-[#3b3f41] pl-2">
          <MapButton label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>−</MapButton>
          <span className="w-9 text-center font-mono text-[8px] text-[#91a2b8]">{Math.round(zoom * 100)}%</span>
          <MapButton label="Zoom in" disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}>+</MapButton>
          <button type="button" onClick={resetView} className="h-8 border border-[#555b58] bg-[#111314] px-2 text-[7px] font-[800] tracking-[0.12em] text-[#c2c6c3] hover:border-[#8c9490] hover:bg-[#1a1d1c] hover:text-white">[ RESET ]</button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0d0f10]">
        {visibleVaults.length === 0 ? (
          <EmptyMap />
        ) : (
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label="Interactive map of managed vault islands"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              <pattern id="ocean-pixels" width="24" height="24" patternUnits="userSpaceOnUse">
                <rect width="24" height="24" fill="#0d0f10" />
                <rect width="12" height="12" fill="#121516" opacity="0.72" />
                <rect x="12" y="12" width="12" height="12" fill="#090b0c" opacity="0.7" />
              </pattern>
              <pattern id="ascii-field" width="64" height="40" patternUnits="userSpaceOnUse">
                <text x="7" y="13" fill="#aeb6b1" fillOpacity="0.1" fontSize="8" fontFamily="ui-monospace, monospace">.</text>
                <text x="42" y="31" fill="#d5dad6" fillOpacity="0.07" fontSize="8" fontFamily="ui-monospace, monospace">+</text>
              </pattern>
              <filter id="island-shadow" x="-30%" y="-30%" width="160%" height="170%">
                <feDropShadow dx="0" dy="10" stdDeviation="5" floodColor="#000000" floodOpacity="0.8" />
              </filter>
              <filter id="selected-island" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="#f1c75b" floodOpacity="0.95" />
              </filter>
              <filter id="terrain-monochrome" colorInterpolationFilters="sRGB">
                <feColorMatrix type="saturate" values="0" />
                <feComponentTransfer>
                  <feFuncR type="linear" slope="0.82" intercept="0.08" />
                  <feFuncG type="linear" slope="0.82" intercept="0.08" />
                  <feFuncB type="linear" slope="0.82" intercept="0.08" />
                </feComponentTransfer>
              </filter>
            </defs>
            <rect width={viewWidth} height={viewHeight} fill="url(#ocean-pixels)" />
            <rect width={viewWidth} height={viewHeight} fill="url(#ascii-field)" />
            <OceanTexture width={viewWidth} height={viewHeight} />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {visibleVaults.map((vault, index) => {
                const slotWidth = viewWidth / columns;
                const size = singleIsland ? SAMPLE_SIZE : ART_SIZE;
                const x = index % columns * slotWidth + (slotWidth - size) / 2;
                const y = (singleIsland ? 15 : 25) + Math.floor(index / columns) * 480;
                const variant = singleIsland ? ART_VARIANTS[0] : ART_VARIANTS[hashString(vault.address.toLowerCase()) % ART_VARIANTS.length];
                return (
                  <ArtVaultIsland
                    key={vault.address}
                    vault={vault}
                    x={x}
                    y={y}
                    size={size}
                    imageUrl={variant.image}
                    maskUrl={variant.mask}
                    selected={vault.address === selectedAddress}
                    connectedAddress={connectedAddress}
                    holdersOverride={holdersByVault?.[vault.address.toLowerCase()]}
                    showAssets={mapView === 'distribution'}
                    showTerritories={showTerritories}
                    hoveredAssetAddress={hoveredAsset?.address ?? null}
                    zoom={zoom}
                    onSelect={() => selectVault(vault.address)}
                    onTerritory={(holder) => {
                      selectVault(vault.address);
                      setTerritoryDetail({vault, holder});
                    }}
                    onAssetHover={(asset) => setHoveredAsset((current) => {
                      if (!current && !asset) return current;
                      if (current && asset && current.address === asset.address && current.percent === asset.percent) return current;
                      return asset;
                    })}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {territoryDetail && showTerritories && (
          <TerritoryDetailCard detail={territoryDetail} onClose={() => setTerritoryDetail(null)} />
        )}
        {hoveredAsset && mapView === 'distribution' && <AssetHoverCard asset={hoveredAsset} />}
      </div>

      <MapLegend vault={selectedVault} mapView={mapView} showTerritories={showTerritories} demo={demo} />
    </div>
  );
}

function ArtVaultIsland({
  vault,
  x,
  y,
  size,
  imageUrl,
  maskUrl,
  selected,
  connectedAddress,
  holdersOverride,
  showAssets,
  showTerritories,
  hoveredAssetAddress,
  zoom,
  onSelect,
  onTerritory,
  onAssetHover,
}: {
  vault: VaultView;
  x: number;
  y: number;
  size: number;
  imageUrl: string;
  maskUrl: string;
  selected: boolean;
  connectedAddress?: Address;
  holdersOverride?: MapHolder[];
  showAssets: boolean;
  showTerritories: boolean;
  hoveredAssetAddress: string | null;
  zoom: number;
  onSelect: () => void;
  onTerritory: (holder: MapHolder) => void;
  onAssetHover: (asset: HoveredAsset | null) => void;
}) {
  const mix = useMemo(() => assetMix(vault.holdings), [vault.holdings]);
  const assets = useMemo<OverlayAsset[] | null>(
    () => mix.status === 'ready' ? mix.assets : null,
    [mix],
  );
  const holders = useMemo(
    () => holdersOverride ?? realHolders(vault, connectedAddress),
    [connectedAddress, holdersOverride, vault],
  );
  const overlay = useIslandOverlay({
    maskUrl,
    assets,
    holders,
    totalSupply: vault.totalSupply,
    seed: vault.address.toLowerCase(),
  });
  const labelHeight = mix.status === 'unpriced' ? 61 : 49;
  const highlightedAssetUrl = hoveredAssetAddress
    ? overlay.highlightedAssetUrls[hoveredAssetAddress.toLowerCase()] ?? null
    : null;
  const shownAssetUrl = highlightedAssetUrl ?? overlay.assetUrl;
  const dimWholeAssetLayer = Boolean(hoveredAssetAddress && !highlightedAssetUrl);

  function imagePixel(event: ReactMouseEvent<SVGRectElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const localX = Math.floor((point.x - x) / size * overlay.width);
    const localY = Math.floor((point.y - y) / size * overlay.height);
    if (localX < 0 || localY < 0 || localX >= overlay.width || localY >= overlay.height) return null;
    return localY * overlay.width + localX;
  }

  function selectTerritory(event: ReactMouseEvent<SVGRectElement>) {
    event.stopPropagation();
    onSelect();
    if (!showTerritories || !overlay.territoryAt) return;
    const pixel = imagePixel(event);
    if (pixel === null) return;
    const holderIndex = overlay.territoryAt[pixel];
    const holder = holders[holderIndex];
    if (holder) onTerritory(holder);
  }

  function hoverAsset(event: ReactMouseEvent<SVGRectElement>) {
    if (!showAssets || !overlay.assetAt || mix.status !== 'ready') return onAssetHover(null);
    const pixel = imagePixel(event);
    if (pixel === null) return onAssetHover(null);
    const asset = mix.assets[overlay.assetAt[pixel]];
    if (!asset) return onAssetHover(null);
    const total = mix.assets.reduce((sum, entry) => sum + entry.value, 0);
    onAssetHover({address: asset.address.toLowerCase(), symbol: asset.symbol, percent: asset.value / total * 100, color: asset.color});
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select vault ${vault.name}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect();
      }}
      className="cursor-pointer outline-none"
      data-interactive="vault"
      data-vault-address={vault.address}
      data-selected={selected ? 'true' : 'false'}
    >
      <g filter={selected ? 'url(#selected-island)' : 'url(#island-shadow)'}>
        <image
          href={imageUrl}
          x={x}
          y={y}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
          imageRendering="pixelated"
          filter="url(#terrain-monochrome)"
        />
        {showAssets && shownAssetUrl && (
          <image href={shownAssetUrl} x={x} y={y} width={size} height={size} imageRendering="pixelated" opacity={dimWholeAssetLayer ? 0.3 : 1} pointerEvents="none" />
        )}
        {showAssets && overlay.assetBoundaryUrl && (
          <image href={overlay.assetBoundaryUrl} x={x} y={y} width={size} height={size} imageRendering="pixelated" pointerEvents="none" />
        )}
        {showTerritories && overlay.boundaryUrl && (
          <image href={overlay.boundaryUrl} x={x} y={y} width={size} height={size} imageRendering="pixelated" pointerEvents="none" />
        )}
        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          fill="transparent"
          onClick={selectTerritory}
          onMouseMove={hoverAsset}
          onMouseLeave={() => onAssetHover(null)}
        />
      </g>

      {showTerritories && overlay.markers.map((marker) => {
        const holder = holders[marker.holderIndex];
        return (
          <g
            key={holder.id}
            transform={`translate(${x + marker.x * size} ${y + marker.y * size}) scale(${1 / zoom})`}
            role="button"
            tabIndex={0}
            aria-label={`Open territory details for ${holder.label}`}
            data-map-control="wallet-marker"
            onClick={(event) => {
              event.stopPropagation();
              onTerritory(holder);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onTerritory(holder);
            }}
          >
            <InvestorMarker current={holder.current} label={holder.current ? 'YOU' : holder.label} />
          </g>
        );
      })}

      <g transform={`translate(${x + size / 2} ${y + size - 13}) scale(${1 / zoom})`} data-map-control="label" pointerEvents="none">
        <rect x="-105" y="0" width="210" height={labelHeight} rx="0" fill="#090a0b" fillOpacity="0.98" stroke={selected ? '#f1c75b' : '#5d6360'} strokeWidth={selected ? 1.4 : 1} />
        <text x="0" y="17" textAnchor="middle" fill="#f2f3ef" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="800">[ {truncate(vault.name.toUpperCase(), 22)} ]</text>
        <text x="0" y="33" textAnchor="middle" fill={stateColor(vault.state)} fontSize="8" fontFamily="ui-monospace, monospace">{vault.state} · {vault.totalValueUsd === null ? 'VALUATION UNAVAILABLE' : `$${Number(vault.totalValueUsd).toLocaleString('en-US', {maximumFractionDigits: 0})}`}</text>
        {mix.status === 'unpriced' && <text x="0" y="49" textAnchor="middle" fill="#dccb76" fontSize="8" fontFamily="ui-monospace, monospace">Asset ratio unavailable</text>}
      </g>
    </g>
  );
}

function TerritoryDetailCard({detail, onClose}: {detail: TerritoryDetail; onClose: () => void}) {
  const ppm = sharePartsPerMillion(detail.holder.shares, detail.vault.totalSupply);
  const percent = ppm === null ? null : Number(ppm) / 10_000;
  return (
    <div className="absolute bottom-3 right-3 z-30 w-[min(300px,calc(100%-24px))] border border-[#5b625e] bg-[#0a0b0c]/96 p-3 shadow-[8px_8px_0_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[8px] font-[800] tracking-[1px] text-[#65e2c5]">[ {detail.holder.kind === 'wallet' ? 'INVESTOR_TERRITORY' : 'UNRESOLVED_TERRITORY'} ]</p>
          <p className="mt-1 break-all text-[11px] font-[700] text-white">{detail.holder.address ?? detail.holder.label}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-6 w-6 shrink-0 place-items-center border border-[#555b58] text-[12px] text-[#aeb4b0] hover:border-[#e6e8e3] hover:text-white">×</button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px]">
        <div><dt className="text-[#6f849e]">Shares</dt><dd className="mt-1 text-[#dce6f1]">{tokenAmount(detail.holder.shares, 18, 6)}</dd></div>
        <div><dt className="text-[#6f849e]">Vault share</dt><dd className="mt-1 text-[#dce6f1]">{percent === null ? 'Unavailable' : `${formatPercent(percent)}%`}</dd></div>
        <div className="col-span-2"><dt className="text-[#6f849e]">Estimated position value</dt><dd className="mt-1 text-[#dce6f1]">{detail.holder.valueUsd === null ? 'Valuation unavailable' : `$${Number(detail.holder.valueUsd).toLocaleString('en-US', {maximumFractionDigits: 2})}`}</dd></div>
      </dl>
      {detail.holder.kind === 'residual' && <p className="mt-3 border-t border-[#24394d] pt-2 text-[9px] leading-[1.5] text-[#8295ad]">The current API does not identify wallets inside this remainder. It may include other investors or locked/system shares.</p>}
    </div>
  );
}

function AssetHoverCard({asset}: {asset: HoveredAsset}) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 border border-[#646b67] bg-[#090a0b]/96 px-3 py-2 shadow-[6px_6px_0_rgba(0,0,0,0.3)] backdrop-blur">
      <span className="h-3 w-3 border border-white/30" style={{backgroundColor: asset.color}} />
      <span className="text-[11px] font-[800] text-white">{asset.symbol}</span>
      <span className="font-mono text-[9px] text-[#bfc4c0]">:: {formatPercent(asset.percent)}% OF VAULT VALUE</span>
    </div>
  );
}

function MapLegend({vault, mapView, showTerritories, demo}: {vault: VaultView | null; mapView: MapView; showTerritories: boolean; demo: boolean}) {
  const mix = useMemo(() => assetMix(vault?.holdings ?? []), [vault?.holdings]);
  const total = mix.assets.reduce((sum, asset) => sum + asset.value, 0);
  return (
    <div className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#3b3f41] bg-[#0a0b0c] px-3 py-2 font-mono text-[8px] leading-[1.4] text-[#989e9a] sm:px-4 sm:text-[9px]">
      {mix.status === 'ready' && <span className="font-[800] tracking-[0.08em] text-[#d7dad6]">[ ASSET_LEGEND ]</span>}
      {mix.status === 'ready' && mix.assets.map((asset) => (
        <span key={asset.address} className="inline-flex items-center gap-1.5 text-[#c7cbc8]">
          <span className="h-2.5 w-2.5 border border-white/25" style={{backgroundColor: asset.color}} />
          {asset.symbol} {formatPercent(asset.value / total * 100)}%
        </span>
      ))}
      {mix.status === 'unpriced' && <span className="text-[#d4c477]">Asset ratio unavailable · natural terrain retained</span>}
      {mix.status === 'ready' && <span className="text-[#6f849c]">{mapView === 'distribution' ? 'Asset distribution view' : 'Natural terrain view'}</span>}
      {showTerritories && <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-[#deebda]" /> Dashed = wallet share territory</span>}
      {!showTerritories && <span>User territories hidden</span>}
      <span className="ml-auto">{demo ? 'Static visual demo · no transactions' : 'Island size and terrain are decorative · not TVL or yield'}</span>
    </div>
  );
}

function realHolders(vault: VaultView, connectedAddress?: Address): MapHolder[] {
  const total = BigInt(vault.totalSupply);
  if (total <= BigInt(0)) return [];
  const requestedShares = vault.position === null ? BigInt(0) : BigInt(vault.position.shares);
  const currentShares = requestedShares > total ? total : requestedShares;
  const holders: MapHolder[] = [];
  if (connectedAddress && vault.position !== null && currentShares > BigInt(0)) {
    holders.push({
      id: connectedAddress.toLowerCase(),
      address: connectedAddress,
      label: shortAddress(connectedAddress),
      shares: currentShares.toString(),
      valueUsd: vault.position.valueUsd,
      current: true,
      kind: 'wallet',
    });
  }
  const remainder = total - currentShares;
  if (remainder > BigInt(0)) {
    holders.push({
      id: `${vault.address.toLowerCase()}:residual`,
      address: null,
      label: vault.position === null ? 'Share data unavailable' : 'Other / locked shares',
      shares: remainder.toString(),
      valueUsd: estimatedValue(vault.totalValueUsd, remainder, total),
      current: false,
      kind: 'residual',
    });
  }
  return holders;
}

function estimatedValue(totalValueUsd: string | null, shares: bigint, totalSupply: bigint) {
  if (totalValueUsd === null || totalSupply <= BigInt(0)) return null;
  return (Number(totalValueUsd) * Number(shares * BigInt(1_000_000) / totalSupply) / 1_000_000).toString();
}

function InvestorMarker({current, label}: {current: boolean; label: string}) {
  const shownLabel = truncate(label, 8);
  const labelWidth = Math.max(24, shownLabel.length * 5.4 + 10);
  return (
    <g className="cursor-pointer" data-investor-marker="true">
      <rect x="-10" y="8" width="20" height="4" fill="#000" opacity="0.55" />
      <rect x="-16" y="-18" width="32" height="32" fill="#090a0b" fillOpacity="0.9" stroke={current ? '#65e2c5' : '#f1c75b'} strokeWidth="2" />
      <rect x="-3" y="-3" width="6" height="15" fill="#c2c5c2" />
      <rect x="-11" y="-11" width="9" height="9" fill={current ? '#2b9d89' : '#9b8034'} />
      <rect x="2" y="-13" width="10" height="10" fill={current ? '#54cbb2' : '#caa845'} />
      <rect x="-5" y="-19" width="10" height="10" fill={current ? '#8cf0d8' : '#f1c75b'} />
      <rect x={-labelWidth / 2} y="18" width={labelWidth} height="15" fill="#070809" fillOpacity="0.96" stroke={current ? '#65e2c5' : '#8d793d'} strokeWidth="0.8" />
      <text x="0" y="28.5" textAnchor="middle" fill={current ? '#a5f3df' : '#f6da83'} stroke="#070809" strokeWidth="2.4" paintOrder="stroke" fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="800">[ {shownLabel} ]</text>
    </g>
  );
}

function MapViewToggle({value, onChange}: {value: MapView; onChange: (value: MapView) => void}) {
  return (
    <div role="group" aria-label="Map view" className="flex h-8 overflow-hidden border border-[#555b58] bg-[#111314]">
      <button
        type="button"
        aria-pressed={value === 'terrain'}
        onClick={() => onChange('terrain')}
        className={`px-2 font-mono text-[7px] font-[800] tracking-[0.1em] sm:px-2.5 ${value === 'terrain' ? 'bg-[#e4e6e2] text-[#0b0c0d]' : 'text-[#8f9692] hover:bg-[#1b1e1c] hover:text-white'}`}
      >
        <span className="sm:hidden">NATURE</span><span className="hidden sm:inline">Natural terrain</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'distribution'}
        onClick={() => onChange('distribution')}
        className={`border-l border-[#555b58] px-2 font-mono text-[7px] font-[800] tracking-[0.1em] sm:px-2.5 ${value === 'distribution' ? 'bg-[#21483f] text-[#8ff2dc]' : 'text-[#8f9692] hover:bg-[#1b1e1c] hover:text-white'}`}
      >
        <span className="sm:hidden">ASSETS</span><span className="hidden sm:inline">Asset distribution</span>
      </button>
    </div>
  );
}

function LayerToggle({active, label, shortLabel, onClick}: {active: boolean; label: string; shortLabel: string; onClick: () => void}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`h-8 border px-2 font-mono text-[7px] font-[800] tracking-[0.1em] transition sm:px-2.5 ${active ? 'border-[#5ecbb5] bg-[#17372f] text-[#8ff2dc]' : 'border-[#555b58] bg-[#111314] text-[#858c88]'}`}
    >
      <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function EmptyMap() {
  return (
    <div className="absolute inset-0 grid place-items-center p-8 text-center">
      <div>
        <pre aria-hidden="true" className="text-[12px] leading-4 text-[#727a76]">{'   /\\\n _/  \\_\n/______\\'}</pre>
        <p className="mt-5 text-[13px] font-[800] tracking-[0.08em] text-[#e0e3df]">[ NO_VAULTS_MAPPED ]</p>
        <p className="mt-2 max-w-[360px] text-[11px] leading-[1.6] text-[#858c88]">CONNECT MANAGER WALLET OR CREATE THE FIRST VAULT. DECORATIVE ISLANDS ARE NEVER INSERTED.</p>
      </div>
    </div>
  );
}

function OceanTexture({width, height}: {width: number; height: number}) {
  const waves = Array.from({length: Math.max(14, Math.floor(height / 42))}, (_, index) => ({
    x: 25 + index * 179 % Math.max(1, width - 100),
    y: 36 + index * 109 % Math.max(1, height - 70),
    length: 16 + index % 3 * 7,
  }));
  return (
    <g opacity="0.24" aria-hidden="true" pointerEvents="none">
      {waves.map((wave, index) => (
        <g key={index}>
          <path d={`M${wave.x} ${wave.y}h${wave.length / 3}m3 0h${wave.length / 3}`} fill="none" stroke="#8c9490" strokeWidth="1" />
          {index % 2 === 0 && <text x={wave.x + 4} y={wave.y + 10} fill="#69706d" fontSize="7" fontFamily="ui-monospace, monospace">~</text>}
        </g>
      ))}
    </g>
  );
}

function MapButton({label, disabled, onClick, children}: {label: string; disabled: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-8 w-8 place-items-center border border-[#555b58] bg-[#111314] text-[15px] text-[#d1d4d0] hover:border-[#8c9490] hover:bg-[#1a1d1c] hover:text-white disabled:cursor-not-allowed disabled:opacity-35">{children}</button>;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value >= 0.01 && value < 99.99 ? value.toFixed(2).replace(/\.00$/, '') : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function stateColor(state: VaultView['state']) {
  if (state === 'ACTIVE') return '#65e2c5';
  if (state === 'PAUSED') return '#f1c75b';
  if (state === 'CLOSED') return '#ef7f85';
  return '#b8bdb9';
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
