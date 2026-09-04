import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VerdictX — Autonomous Court for the Agent Economy',
  description: 'Resolve agent-to-agent disputes with verifiable evidence, intelligent contracts, and on-chain settlement.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}