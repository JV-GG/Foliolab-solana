import type {Metadata} from 'next';
import {VaultDetailsPage} from '@/components/VaultDetailsPage';

export const metadata: Metadata = {title: 'Vault details — Folio Lab', description: 'Inspect holdings, plans and your position in a Folio Lab vault.'};

export default async function VaultPage({params}: {params: Promise<{address: string}>}) {
  const {address} = await params;
  return <VaultDetailsPage address={address} />;
}
