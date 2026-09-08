"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../pricing/pricing.css";
export default function VerifyEmailPage() {
  const [token,setToken]=useState(""); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [done,setDone]=useState(false);
  useEffect(()=>{setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || "");},[]);
  async function submit() {
    setBusy(true); setMessage("");
    try {
      const r=await fetch("/api/auth/verification", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(token ? {action:"confirm",token} : {action:"request"})});
      if (!r.ok) throw new Error("failed");
      setDone(Boolean(token)); setMessage(token ? "Adresse confirmée. Tes anciennes sessions ont été révoquées." : "Un nouveau lien a été envoyé. Vérifie aussi les courriers indésirables.");
      if (token) window.history.replaceState(null,"",window.location.pathname);
    } catch {setMessage("Lien expiré, connexion requise ou email indisponible. Connecte-toi pour demander un nouveau lien.");} finally {setBusy(false);}
  }
  return <main className="ss-pricing"><nav className="ss-pricing__nav"><Link href="/">ScrollShow</Link><Link href="/signup?mode=signin">Connexion</Link></nav><header className="ss-pricing__hero"><h1>Confirme ton adresse email</h1><p>Cette confirmation protège ton compte avant tout paiement ou utilisation du studio.</p></header><section className="ss-pricing__grid ss-pricing__grid--single"><div className="ss-price-card"><p role="status">{message || "Utilise le lien reçu par email, ou demande un nouveau lien ci-dessous."}</p>{done ? <Link className="ss-price-card__cta" href="/app">Continuer</Link> : <button className="ss-price-card__cta" disabled={busy} onClick={()=>void submit()}>{busy ? "…" : token ? "Confirmer mon adresse" : "Renvoyer un lien"}</button>}</div></section></main>;
}
