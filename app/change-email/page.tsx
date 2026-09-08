"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../pricing/pricing.css";
export default function ChangeEmailPage() {
  const [token,setToken]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  useEffect(()=>{setToken(new URLSearchParams(window.location.hash.slice(1)).get("token")||"");},[]);
  return <main className="ss-pricing"><nav className="ss-pricing__nav"><Link href="/app/settings">Réglages</Link><Link href="/signup?mode=signin">Connexion</Link></nav><header className="ss-pricing__hero"><h1>Changer d’adresse email</h1><p>Confirmation requise sur l’ancienne et la nouvelle adresse. Les sessions, clés API et la connexion Google seront révoquées. Si tu utilises uniquement Google, crée d’abord un mot de passe dans les réglages.</p></header><section className="ss-pricing__grid ss-pricing__grid--single"><form className="ss-price-card" onSubmit={async e=>{
    e.preventDefault();setBusy(true);
    try {const r=await fetch("/api/auth/email-change",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(token?{action:"confirm",token}:{action:"request",email,password})}); const j=await r.json(); if(!r.ok)throw new Error();setMessage(j.result==="complete"?"Adresse modifiée. Reconnecte-toi avec ta nouvelle adresse et ton mot de passe.":j.result==="pending"?"Confirmation enregistrée. Confirme aussi le lien reçu sur l’autre adresse.":"Liens envoyés aux deux adresses. Ils expirent dans 30 minutes.");}
    catch {setMessage("Impossible de valider : vérifie ton mot de passe, ta connexion et les liens reçus. L’adresse demandée peut être indisponible.");}finally{setBusy(false);}
  }}>{!token&&<><label>Nouvel email<input className="ss-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Mot de passe actuel<input className="ss-input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label></>}<p role="status">{message}</p><button className="ss-price-card__cta" disabled={busy}>{busy?"…":token?"Confirmer":"Envoyer les confirmations"}</button></form></section></main>;
}
