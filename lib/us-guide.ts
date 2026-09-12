// US_LINKS et US_AGENT_PROMPT viennent de useprocess/website/src/affiliate/us-guide.js
// — garder les deux en phase. Le reste (kit, étapes, cases à cocher) est propre à
// ScrollShow : le portail affiliés n'a pas de progression par utilisateur.
export const US_LINKS = {
  "hetzner": "https://www.hetzner.com/cloud",
  "hetznerConsole": "https://console.hetzner.cloud/",
  "outlineGetStarted": "https://getoutline.org/get-started/",
  "outlineIos": "https://apps.apple.com/us/app/outline-app/id1356177741",
  "outlineAndroid": "https://play.google.com/store/apps/details?id=org.outline.android.client",
  "ipCheck": "https://whatismyipaddress.com/",
  "appleId": "https://appleid.apple.com/",
  "textnow": "https://www.textnow.com/"
} as const;

export const US_AGENT_PROMPT: { fr: string; en: string } = {
  fr: "# Setup VPN TikTok US — Hetzner Ashburn + Outline\n\nTu es un agent autonome (Cursor / Claude Code) avec accès shell. Tu fais TOUT le serveur toi-même. N'explique pas les commandes : exécute-les. Ne demande pas à l'humain de copier-coller du SSH si tu peux SSH.\n\n## Ce que l'humain a DÉJÀ fait — ne le refais pas, ne le demande pas\n- Téléphone dédié reset, langue English (United States), région United States\n- Fuseau New York ou Los Angeles, automatique OFF\n- GPS / Location Services OFF\n- Aucune SIM, Wi-Fi only\n- Email neuf + Apple ID / Google US (ZIP 10001 ou 90001, paiement None)\n- Compte Hetzner Cloud vérifié avec CB\n\nToi tu ne touches PAS au téléphone. Uniquement le VPS + Outline.\n\n## Contraintes dures — une violation = tu t'arrêtes\n- Location Hetzner : Ashburn, VA uniquement. Code location `ash`. Jamais Falkenstein, Nuremberg, Helsinki, ni aucune région EU.\n- Image : ubuntu-22.04\n- Type : cx22\n- Cloud-init User Data EXACTEMENT (une ligne) :\n  #include get.docker.com\n- VPN : script officiel Jigsaw Outline uniquement. Pas WireGuard, pas OpenVPN, pas Nord/Express, pas Vultr.\n- Firewall Hetzner obligatoire : TCP 22 + port API Outline (TCP) + port d'accès Outline (TCP et UDP)\n- Ne crée pas le compte TikTok. Ne poste rien.\n\n## Procédure\n\n### 0. Token Hetzner\nSi `HCLOUD_TOKEN` ou un contexte `hcloud` existe déjà, continue.\nSinon : cherche dans l'env / `~/.config/hcloud/cli.toml`. Si rien, demande UNE fois le token (Read & Write, créé dans console.hetzner.cloud → Security → API Tokens).\nInstalle le CLI si besoin : `brew install hcloud` (Mac) ou le binaire officiel.\n\n### 1. Clé SSH\nUtilise `~/.ssh/id_ed25519.pub` ou `id_rsa.pub`. Importe-la dans Hetzner (`hcloud ssh-key create`) si elle n'y est pas encore.\n\n### 2. Serveur\n```\nhcloud server create \\\n  --name tiktok-us \\\n  --type cx22 \\\n  --location ash \\\n  --image ubuntu-22.04 \\\n  --ssh-key <nom-de-la-cle> \\\n  --user-data $'#include get.docker.com\\n'\n```\nAttends le statut `running`. Récupère l'IPv4 publique.\n\n### 3. SSH\n`ssh -o StrictHostKeyChecking=accept-new root@IP`\n\nAttends ~90 secondes que cloud-init installe Docker, puis `docker --version`.\n\n### 4. Update + Outline\n```\napt update && apt upgrade -y\nsudo bash -c \"$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)\"\n```\nSi le script demande Docker ? → y. Durée : 1 à 3 minutes.\n\nÀ « CONGRATULATIONS! », copie le JSON COMPLET entre `{` et `}` (`apiUrl` + `certSha256`) et note les DEUX ports affichés.\n\n### 5. Firewall\nCrée un firewall `tiktok-us` avec :\n- TCP 22\n- TCP <port API Outline>\n- TCP + UDP <port d'accès Outline>\nAttache-le au serveur. Vérifie que tu peux encore SSH.\n\n### 6. Recap final — affiche UNIQUEMENT ça à la fin\n\n```\nSERVER_IP: x.x.x.x\nOUTLINE_JSON:\n{\"apiUrl\":\"...\",\"certSha256\":\"...\"}\n\nPORTS: 22 / API=xxxx / ACCESS=xxxx (tcp+udp)\n\nTOI ENSUITE (humain, pas l'agent) :\n1. PC : Outline Manager → https://getoutline.org/get-started/ → Set up Outline anywhere → colle le JSON → Online vert\n2. + une clé (ex. iPhone-TikTok) → QR / ss://\n3. Téléphone US : Outline Client (App Store / Play Store US) → scan QR → Connect → icône clé\n4. Safari : https://whatismyipaddress.com/ = United States\n5. VPN ON → désinstalle TikTok → réinstalle → nouveau compte United States\n6. Chaque session : Wi-Fi (pas de SIM) → Outline Connect → IP USA → ENSUITE TikTok\n\nRègle d'or : une ouverture TikTok sans VPN peut brûler le compte.\n```\n\n## Fallback sans token\nSi pas de token : demande IP + mot de passe root (serveur déjà créé à Ashburn, Ubuntu 22.04, CX22, user data `#include get.docker.com`). Puis SSH et reprends à l'étape 3.\n\n## Stop\nSi Hetzner n'a pas Ashburn, si Outline échoue après 1 retry, ou si tu n'as ni token ni IP : arrête et dis exactement ce qui bloque. Ne bricole pas un VPN EU.\n",
  en: "# US TikTok VPN setup — Hetzner Ashburn + Outline\n\nYou are an autonomous agent (Cursor / Claude Code) with shell access. Do the ENTIRE server yourself. Do not explain commands: run them. Do not ask the human to paste SSH if you can SSH.\n\n## What the human ALREADY did — do not redo it, do not ask\n- Dedicated factory-reset phone, language English (United States), region United States\n- Timezone New York or Los Angeles, automatic OFF\n- GPS / Location Services OFF\n- No SIM, Wi-Fi only\n- Fresh email + US Apple ID / Google (ZIP 10001 or 90001, payment None)\n- Hetzner Cloud account verified with a card\n\nYou do NOT touch the phone. VPS + Outline only.\n\n## Hard constraints — one violation = stop\n- Hetzner location: Ashburn, VA only. Location code `ash`. Never Falkenstein, Nuremberg, Helsinki, or any EU region.\n- Image: ubuntu-22.04\n- Type: cx22\n- Cloud-init User Data EXACTLY (one line):\n  #include get.docker.com\n- VPN: official Jigsaw Outline script only. No WireGuard, no OpenVPN, no Nord/Express, no Vultr.\n- Hetzner firewall required: TCP 22 + Outline API port (TCP) + Outline access port (TCP and UDP)\n- Do not create the TikTok account. Do not post anything.\n\n## Procedure\n\n### 0. Hetzner token\nIf `HCLOUD_TOKEN` or a `hcloud` context already exists, continue.\nOtherwise: look in env / `~/.config/hcloud/cli.toml`. If nothing, ask ONCE for the token (Read & Write, created in console.hetzner.cloud → Security → API Tokens).\nInstall the CLI if needed: `brew install hcloud` (Mac) or the official binary.\n\n### 1. SSH key\nUse `~/.ssh/id_ed25519.pub` or `id_rsa.pub`. Import it into Hetzner (`hcloud ssh-key create`) if it is not there yet.\n\n### 2. Server\n```\nhcloud server create \\\n  --name tiktok-us \\\n  --type cx22 \\\n  --location ash \\\n  --image ubuntu-22.04 \\\n  --ssh-key <key-name> \\\n  --user-data $'#include get.docker.com\\n'\n```\nWait until status is `running`. Grab the public IPv4.\n\n### 3. SSH\n`ssh -o StrictHostKeyChecking=accept-new root@IP`\n\nWait ~90 seconds for cloud-init to install Docker, then `docker --version`.\n\n### 4. Update + Outline\n```\napt update && apt upgrade -y\nsudo bash -c \"$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)\"\n```\nIf the script asks Docker? → y. Takes 1–3 minutes.\n\nAt “CONGRATULATIONS!”, copy the FULL JSON between `{` and `}` (`apiUrl` + `certSha256`) and note the TWO ports it printed.\n\n### 5. Firewall\nCreate a firewall `tiktok-us` with:\n- TCP 22\n- TCP <Outline API port>\n- TCP + UDP <Outline access port>\nAttach it to the server. Confirm you can still SSH.\n\n### 6. Final recap — print ONLY this at the end\n\n```\nSERVER_IP: x.x.x.x\nOUTLINE_JSON:\n{\"apiUrl\":\"...\",\"certSha256\":\"...\"}\n\nPORTS: 22 / API=xxxx / ACCESS=xxxx (tcp+udp)\n\nYOU NEXT (human, not the agent):\n1. PC: Outline Manager → https://getoutline.org/get-started/ → Set up Outline anywhere → paste the JSON → Online green\n2. + a key (e.g. iPhone-TikTok) → QR / ss://\n3. US phone: Outline Client (US App Store / Play Store) → scan QR → Connect → key icon\n4. Safari: https://whatismyipaddress.com/ = United States\n5. VPN ON → uninstall TikTok → reinstall → new United States account\n6. Every session: Wi-Fi (no SIM) → Outline Connect → US IP → THEN TikTok\n\nGolden rule: one TikTok open without VPN can burn the account.\n```\n\n## Fallback without a token\nIf there is no token: ask for IP + root password (server already created in Ashburn, Ubuntu 22.04, CX22, user data `#include get.docker.com`). Then SSH and resume at step 3.\n\n## Stop\nIf Hetzner has no Ashburn, if Outline fails after 1 retry, or if you have neither token nor IP: stop and say exactly what blocked you. Do not improvise an EU VPN.\n",
};



/* Une seule méthode : un téléphone dédié, sans SIM, derrière ton propre VPN
   américain. C'est la seule qui donne un compte réellement enregistré aux
   États-Unis. L'ancienne « méthode A » (organique sans VPN) a été retirée.

   La page n'est qu'une liste d'étapes. Pas d'introduction, pas de tableau
   comparatif, pas de liste d'achats : chaque coût et chaque lien apparaît dans
   l'étape qui en a besoin, au moment où on en a besoin.

   Les identifiants de tâche sont persistés par utilisateur (User.usChecklist) :
   ne jamais les renommer, sinon la progression enregistrée est perdue. */

export type UsBit = { fr: string; en: string };

/** Une case à cocher : une action, faite ou pas. Le détail tient sur une ligne. */
export type UsTask = UsBit & { detailFr?: string; detailEn?: string; id: string };

export type UsLink = { href: string; fr: string; en: string };

export type UsStep = UsBit & {
  id: string;
  minutes: number;
  tasks: UsTask[];
  links?: UsLink[];
  /** L'étape porte le prompt à copier pour l'agent. */
  agentPrompt?: boolean;
};

/** Le seul chiffre affiché hors des étapes. */
export const US_COST: UsBit = {
  fr: "≈ 1 h de setup · 5 € / mois · + un téléphone dédié",
  en: "≈ 1 h of setup · €5 / month · + a dedicated phone",
};

export const US_STEPS: UsStep[] = [
  {
    id: "phone",
    fr: "Le téléphone",
    en: "The phone",
    minutes: 25,
    tasks: [
      {
        id: "phone_reset",
        fr: "Téléphone dédié, remis à zéro",
        en: "Dedicated phone, factory-reset",
        detailFr: "Pas ton téléphone de tous les jours.",
        detailEn: "Not your everyday phone.",
      },
      {
        id: "phone_lang",
        fr: "Langue et région United States",
        en: "Language and region United States",
        detailFr: "Dès l'écran de configuration, clavier US compris.",
        detailEn: "Right on the setup screen, US keyboard included.",
      },
      {
        id: "phone_tz",
        fr: "Fuseau New York, réglage auto désactivé",
        en: "New York timezone, automatic setting off",
        detailFr: "Réglages › Général › Date et heure.",
        detailEn: "Settings › General › Date & Time.",
      },
      {
        id: "phone_loc",
        fr: "Localisation désactivée",
        en: "Location services off",
        detailFr: "Réglages › Confidentialité.",
        detailEn: "Settings › Privacy.",
      },
      {
        id: "phone_sim",
        fr: "Aucune SIM. Wi‑Fi seulement",
        en: "No SIM. Wi‑Fi only",
        detailFr: "Une SIM annonce ton vrai pays, même VPN activé.",
        detailEn: "A SIM announces your real country, even with the VPN on.",
      },
    ],
  },
  {
    id: "appleid",
    fr: "L'Apple ID américain",
    en: "The US Apple ID",
    minutes: 10,
    tasks: [
      {
        id: "phone_apple",
        fr: "Apple ID pays United States",
        en: "Apple ID with country United States",
        detailFr: "Email neuf, paiement None, code postal 10001.",
        detailEn: "Fresh email, payment None, ZIP 10001.",
      },
    ],
    links: [
      { href: US_LINKS.appleId, fr: "Créer l'Apple ID", en: "Create the Apple ID" },
      { href: US_LINKS.textnow, fr: "Numéro US gratuit", en: "Free US number" },
    ],
  },
  {
    id: "server",
    fr: "Le serveur américain",
    en: "The US server",
    minutes: 15,
    agentPrompt: true,
    tasks: [
      {
        id: "srv_hetzner",
        fr: "Compte Hetzner + jeton API",
        en: "Hetzner account + API token",
        detailFr: "Security › API Tokens › Generate, en Read & Write. ≈ 5 € / mois.",
        detailEn: "Security › API Tokens › Generate, Read & Write. ≈ €5 / month.",
      },
      {
        id: "srv_agent",
        fr: "Prompt collé dans Cursor ou Claude Code",
        en: "Prompt pasted into Cursor or Claude Code",
        detailFr: "L'agent monte le serveur et te rend un JSON.",
        detailEn: "The agent builds the server and hands you a JSON.",
      },
      {
        id: "srv_manager",
        fr: "JSON collé dans Outline Manager",
        en: "JSON pasted into Outline Manager",
        detailFr: "Le serveur doit passer Online.",
        detailEn: "The server must turn Online.",
      },
      {
        id: "srv_key",
        fr: "Une clé créée, nommée iPhone-TikTok",
        en: "One key created, named iPhone-TikTok",
        detailFr: "Elle donne le QR code que le téléphone va scanner.",
        detailEn: "It gives the QR code the phone will scan.",
      },
    ],
    links: [
      { href: US_LINKS.hetznerConsole, fr: "Console Hetzner", en: "Hetzner console" },
      { href: US_LINKS.outlineGetStarted, fr: "Outline Manager", en: "Outline Manager" },
    ],
  },
  {
    id: "connect",
    fr: "Le VPN sur le téléphone",
    en: "The VPN on the phone",
    minutes: 10,
    tasks: [
      {
        id: "acc_client",
        fr: "Outline installé et connecté",
        en: "Outline installed and connected",
        detailFr: "Scanne le QR code, puis Connect.",
        detailEn: "Scan the QR code, then Connect.",
      },
      {
        id: "acc_ip",
        fr: "L'IP affiche United States",
        en: "The IP shows United States",
        detailFr: "Si ce n'est pas le cas, ne va pas plus loin.",
        detailEn: "If it does not, do not go further.",
      },
    ],
    links: [
      { href: US_LINKS.outlineIos, fr: "Outline iPhone", en: "Outline iPhone" },
      { href: US_LINKS.outlineAndroid, fr: "Outline Android", en: "Outline Android" },
      { href: US_LINKS.ipCheck, fr: "Vérifier l'IP", en: "Check the IP" },
    ],
  },
  {
    id: "tiktok",
    fr: "Le compte TikTok",
    en: "The TikTok account",
    minutes: 10,
    tasks: [
      {
        id: "acc_tiktok",
        fr: "VPN activé, TikTok réinstallé, nouveau compte",
        en: "VPN on, TikTok reinstalled, new account",
        detailFr: "Le pays se fige à l'inscription : c'est le seul moment qui compte.",
        detailEn: "Country is frozen at signup: the only moment that counts.",
      },
      { id: "ct_bio", fr: "Nom, bio et langue de l'app en anglais", en: "Name, bio and app language in English" },
      {
        id: "acc_scrollshow",
        fr: "Compte connecté à ScrollShow depuis ce téléphone",
        en: "Account connected to ScrollShow from this phone",
      },
      { id: "ct_tz", fr: "Calendrier réglé sur America/New_York", en: "Calendar set to America/New_York" },
    ],
    links: [
      { href: "/app/integrations", fr: "Connecter le compte", en: "Connect the account" },
      { href: "/app/settings", fr: "Régler le fuseau", en: "Set the timezone" },
    ],
  },
  {
    id: "warmup",
    fr: "Les 7 premiers jours",
    en: "The first 7 days",
    minutes: 15,
    tasks: [
      {
        id: "ct_day1",
        fr: "Jour 1 : 3 carrousels postés à la main",
        en: "Day 1: 3 carousels posted by hand",
        detailFr: "Depuis le téléphone, VPN activé.",
        detailEn: "From the phone, VPN on.",
      },
      {
        id: "ct_week",
        fr: "Jours 2 à 7 : 1 par jour, 11 h – 14 h à New York",
        en: "Days 2 to 7: 1 a day, 11am – 2pm New York",
        detailFr: "17 h – 20 h à Paris. Jamais 5 posts par jour sur un compte neuf.",
        detailEn: "5pm – 8pm in Paris. Never 5 posts a day on a new account.",
      },
    ],
    links: [{ href: "/app", fr: "Ouvrir le calendrier", en: "Open the calendar" }],
  },
];

export const US_CHECKLIST_IDS = new Set(US_STEPS.flatMap((step) => step.tasks.map((task) => task.id)));

export const US_TASK_TOTAL = US_STEPS.reduce((total, step) => total + step.tasks.length, 0);

/** La seule phrase de la page qui ne soit pas une case à cocher. */
export const US_GOLDEN_RULE: UsBit = {
  fr: "Chaque session : Wi‑Fi sans SIM → Outline → vérifier l'IP → TikTok. Une seule ouverture sans VPN grille le compte.",
  en: "Every session: Wi‑Fi with no SIM → Outline → check the IP → TikTok. A single open without the VPN burns the account.",
};
