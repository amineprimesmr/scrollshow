// Generated from useprocess/website/src/affiliate/us-guide.js — keep in sync.
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

export type UsChecklistItem = { id: string; fr: string; en: string };
export type UsChecklistGroup = { id: string; fr: string; en: string; items: UsChecklistItem[] };

export const US_CHECKLIST: UsChecklistGroup[] = [
  {
    id: "phone",
    fr: "Téléphone US dédié",
    en: "Dedicated US phone",
    items: [
      { id: "phone_reset", fr: "Téléphone dédié, neuf ou reset usine", en: "Dedicated phone, new or factory-reset" },
      { id: "phone_lang", fr: "English (United States), région United States, clavier US", en: "English (United States), region United States, US keyboard" },
      { id: "phone_tz", fr: "Fuseau New York ou Los Angeles, automatique OFF", en: "Timezone New York or Los Angeles, automatic OFF" },
      { id: "phone_loc", fr: "Localisation OFF en global", en: "Location OFF globally" },
      { id: "phone_sim", fr: "Aucune SIM, Wi-Fi uniquement", en: "No SIM, Wi-Fi only" },
      { id: "phone_apple", fr: "Apple ID US neuf (ZIP 10001 / 90001, paiement None)", en: "Fresh US Apple ID (ZIP 10001 / 90001, payment None)" },
    ],
  },
  {
    id: "server",
    fr: "Serveur Outline",
    en: "Outline server",
    items: [
      { id: "srv_hetzner", fr: "Compte Hetzner Cloud + token API Read & Write", en: "Hetzner Cloud account + Read & Write API token" },
      { id: "srv_agent", fr: "Prompt agent lancé, serveur Ashburn créé, JSON récupéré", en: "Agent prompt run, Ashburn server created, JSON retrieved" },
      { id: "srv_manager", fr: "Outline Manager : serveur Online (vert)", en: "Outline Manager: server Online (green)" },
      { id: "srv_key", fr: "Clé iPhone-TikTok créée (QR / ss://)", en: "iPhone-TikTok key created (QR / ss://)" },
    ],
  },
  {
    id: "account",
    fr: "Compte TikTok",
    en: "TikTok account",
    items: [
      { id: "acc_client", fr: "Outline Client installé depuis l’App Store US, connecté", en: "Outline Client installed from the US App Store, connected" },
      { id: "acc_ip", fr: "whatismyipaddress.com = United States", en: "whatismyipaddress.com = United States" },
      { id: "acc_tiktok", fr: "TikTok réinstallé VPN ON, nouveau compte country = United States", en: "TikTok reinstalled with VPN ON, new account country = United States" },
      { id: "acc_scrollshow", fr: "Compte connecté à ScrollShow depuis l’iPhone US, VPN ON", en: "Account connected to ScrollShow from the US phone, VPN ON" },
    ],
  },
  {
    id: "content",
    fr: "Contenu et warm-up",
    en: "Content and warm-up",
    items: [
      { id: "ct_bio", fr: "Username, bio, langue de l’app en anglais", en: "Username, bio, app language in English" },
      { id: "ct_tz", fr: "Fuseau du scheduler America/New_York", en: "Scheduler timezone America/New_York" },
      { id: "ct_day1", fr: "Jour 1 : 3 carrousels EN postés à la main", en: "Day 1: 3 EN carousels posted by hand" },
      { id: "ct_week", fr: "Jours 2 à 7 : 1 carrousel / jour, créneau ET", en: "Days 2 to 7: 1 carousel a day, ET window" },
    ],
  },
];

export const US_CHECKLIST_IDS = new Set(US_CHECKLIST.flatMap((g) => g.items.map((i) => i.id)));
