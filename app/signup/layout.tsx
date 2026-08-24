import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your ScrollShow account, then choose a plan. 3-day trial on every offer.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
