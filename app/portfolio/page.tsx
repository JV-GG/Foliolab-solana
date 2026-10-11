import type {Metadata} from 'next';
import {PortfolioDashboard} from '@/components/PortfolioDashboard';

export const metadata: Metadata = {title: 'Your portfolio — Folio Lab', description: 'Review your Folio Lab vault shares and confirmed activity.'};

export default function PortfolioPage() { return <PortfolioDashboard />; }
