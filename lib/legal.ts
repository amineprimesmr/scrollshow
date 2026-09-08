// Only the business contact details supplied by the owner are published.
export const LEGAL = {
  version: "2026-09-08", tradeName: "PROCESS", proprietor: "Amine Ennasri — Entrepreneur individuel",
  address: "9 Square Constant Margueritte, 35000 Rennes, France",
  siren: "931 945 273", siret: "931 945 273 00031", registry: "931 945 273 RCS Rennes",
  email: "aminennasri@outlook.com", telephone: "+33 7 82 63 77 20",
};
export function salesReady() {
  // Commercial switch only. This does not certify legal compliance.
  return process.env.SALES_ENABLED === "1";
}
