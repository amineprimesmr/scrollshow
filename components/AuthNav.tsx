import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import "./auth-nav.css";

export type AuthStage = "account" | "workspace" | "access";

const STEPS: { id: AuthStage; label: string }[] = [
  { id: "account", label: "Compte" },
  { id: "workspace", label: "Ton espace" },
  { id: "access", label: "Accès" },
];

/** Rail flottant des pages hors studio : rappelle les etapes avant le studio. */
export function AuthNav({ current, end }: { current: AuthStage; end?: React.ReactNode }) {
  const index = STEPS.findIndex(step => step.id === current);

  return (
    <header className="ss-anav">
      <div className="ss-anav__rail lg lg--flat">
        <Link className="ss-anav__brand" href="/" aria-label="ScrollShow, accueil">
          <BrandMark size={20} />
          <span>ScrollShow</span>
        </Link>

        <nav aria-label="Progression">
          <ol className="ss-anav__steps">
            {STEPS.map((step, position) => {
              const state = position < index ? "done" : position === index ? "current" : "todo";
              return (
                <li key={step.id} className="ss-anav__step" data-state={state}>
                  {position > 0 ? <span className="ss-anav__sep" aria-hidden /> : null}
                  <span className="ss-anav__pill">
                    {state === "current" ? <span className="ss-anav__spin" aria-hidden /> : null}
                    <span className="ss-anav__label" aria-current={state === "current" ? "step" : undefined}>
                      <span className="ss-anav__mark" aria-hidden>
                        {state === "done" ? "✓" : position + 1}
                      </span>
                      {step.label}
                      {state === "done" ? <span className="ss-anav__sr"> (terminé)</span> : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="ss-anav__end">{end}</div>
      </div>
    </header>
  );
}
