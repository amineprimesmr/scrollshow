"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../pricing/pricing.css";
export default function RecoverPage() {
  const [token,setToken]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  useEffect(()=>{setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || "");},[]);
  return <main className="ss-pricing"><nav className="ss-pricing__nav"><Link href="/">ScrollShow</Link><Link href="/signup?mode=signin">Connexion</Link></nav><header className="ss-pricing__hero"><h1>{token ? "Choisir un nouveau mot de passe" : "Retrouver ton accès"}</h1></header><section className="ss-pricing__grid ss-pricing__grid--single"><form className="ss-price-card" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setMessage("");
    try { const r=await fetch("/api/auth/recovery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(token ? {action:"reset",token,password}:{action:"request",email})});
      if (!r.ok) throw new Error("failed"); setMessage(token ? "Mot de passe modifié. Tu peux te reconnecter. Les anciennes sessions ont été révoquées." : "Si ce compte existe, tu recevras un lien de réinitialisation. Vérifie aussi tes courriers indésirables.");
    } catch {setMessage("Le lien est expiré ou le service est indisponible. Demande un nouveau lien ou contacte aminennasri@outlook.com.");} finally {setBusy(false);}
  }}>{token ? <label>Nouveau mot de passe<input className="ss-input" type="password" autoComplete="new-password" required minLength={8} maxLength={80} value={password} onChange={e=>setPassword(e.target.value)}/></label> : <label>Email<input className="ss-input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}<button className="ss-price-card__cta" disabled={busy}>{busy ? "…" : token ? "Enregistrer" : "Recevoir un lien"}</button><p role="status">{message}</p></form></section></main>;
}
