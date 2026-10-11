import type {Metadata} from 'next';
import {CuratorConsole} from '@/components/curator/CuratorConsole';

export const metadata: Metadata = {
  title: 'Curator console — Folio Lab',
  description: 'Create, fund and publish the plan for a transparent tokenized-stock vault.',
};

export default function CuratorPage() {
  return <CuratorConsole />;
}
