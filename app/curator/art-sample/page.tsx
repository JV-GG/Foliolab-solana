import type {Metadata} from 'next';
import {CuratorConsole} from '@/components/curator/CuratorConsole';

export const metadata: Metadata = {
  title: 'Island art sample — Folio Lab',
  description: 'Local-only terrain art direction sample for the curator capital map.',
};

export default function CuratorArtSamplePage() {
  return <CuratorConsole artSample />;
}
