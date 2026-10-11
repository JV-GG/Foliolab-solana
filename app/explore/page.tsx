import type {Metadata} from 'next';
import {InvestorExplore} from '@/components/InvestorExplore';

export const metadata: Metadata = {title: 'Explore vaults — Folio Lab', description: 'Explore transparent curator-led tokenized stock portfolios.'};

export default function ExplorePage() { return <InvestorExplore />; }
