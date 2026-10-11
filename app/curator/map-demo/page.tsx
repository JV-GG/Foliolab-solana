import type {Metadata} from 'next';
import {CapitalMapDemo} from '@/components/curator/CapitalMapDemo';

export const metadata: Metadata = {
  title: 'Capital map visual demo — Folio Lab',
  description: 'An isolated visual demonstration of vault asset colors and investor share territories.',
};

export default function CapitalMapDemoPage() {
  return <CapitalMapDemo />;
}
