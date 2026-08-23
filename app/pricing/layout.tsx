import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Starter 29,99 €, Creator 49,99 €, Pro 99,99 €. 3 jours d’essai offerts.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
