import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "ScrollShow : 29 € par mois ou 99 € à vie. Accès après paiement.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
