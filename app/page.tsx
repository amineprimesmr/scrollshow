import { GoogleOneTap } from "@/components/GoogleOneTap";
import { Landing } from "@/components/Landing";
import { hasSession } from "@/lib/auth";
import "./landing.css";
import "./landing-navigation.css";
import "./liquid-glass.css";

export default async function HomePage() {
  const signedIn = await hasSession();
  return (
    <>
      <Landing signedIn={signedIn} />
      {signedIn ? null : <GoogleOneTap />}
    </>
  );
}
