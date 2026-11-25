# Journal de refactorisation

Suivi, étape par étape, du chantier « standardisation UI, Redux allégé, performance ».
Ordre convenu : **B0 → B3 → B4 → B2**, puis B1, B5 (migration des panneaux) et B6 (audit README) en parallèle.

Règles du chantier :

- Aucune fonction retirée, sauf FLUX 1 / Nunchaku et WAN 2.2 (brique B1, liste soumise avant suppression).
- Format enregistré des presets et de la Library inchangé ; graphes ComfyUI et valeurs par défaut inchangés.
- Jamais de génération GPU pour valider : ComfyUI est simulé dans les harnais.
- Build de vérification vers un dossier temporaire, jamais vers `dist`.
- Mes modifications restent **non indexées** (`git add` non exécuté) pour ne pas se mélanger aux 47 fichiers déjà indexés dans l'arbre de travail au début du chantier.

---

## B0 — Filet de sécurité et diagnostic du gel

### 2026-11-19 — Étape 1 : référence avant toute modification

Commit de départ : `aaa7071` (branche `main`), avec 47 fichiers modifiés ou ajoutés déjà indexés (travail en cours de l'utilisateur, non touché).
Environnement : Node v25.2.1, npm 11.6.2. Serveur Vite actif sur le port 3000 et Electron en cours d'exécution pendant les mesures.

| Vérification | Résultat de référence |
| --- | --- |
| Tests `node --test` | 75 fichiers, 911 tests : **895 réussis, 2 en échec, 14 ignorés** |
| Build Vite (dossier temporaire) | Réussi en 6,11 s ; plus gros fichiers : WASM 32 232 kB, JS 3 535 kB (avertissement de taille de chunk) |
| `tsc --noEmit` | **18 erreurs dans 9 fichiers** |

Les deux tests en échec existaient avant le chantier. Ce sont des pannes du harnais de test, pas du code applicatif : chaque test compile un fichier TypeScript vers une URL `data:` et un import relatif ajouté depuis ne peut plus être résolu.

- `services/characterResults.test.mjs` : import `../services/mossWorkflow` non résolu.
- `services/swapPersonWorkflow.test.mjs` : import `./qwen21Workflow` non résolu.

Erreurs TypeScript de référence, par fichier : `services/geminiService.ts` (6), `components/ImageGeneratorHeader.tsx` (3), `services/libraryService.ts` (2), `services/ttsDialogueService.ts` (2), `components/ClothesExtractorPanel.tsx` (1), `components/OutpaintPanel.tsx` (1), `components/Qwen21CharacterSheetPanel.tsx` (1), `components/Qwen21RemoveBackgroundPanel.tsx` (1), `components/SwapPersonPanel.tsx` (1).

Écart par rapport au plan : le plan citait 43 diagnostics TypeScript (note de mémoire plus ancienne). La mesure réelle est 18 ; c'est ce chiffre qui sert de référence.

### 2026-11-19 — Étape 2 : scripts npm

Fichier touché : `package.json` (section `scripts` seulement).

| Script | Rôle |
| --- | --- |
| `npm test` | Tous les tests `node --test` (components, services, utils, electron) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:locks` | Harnais navigateur : les contrôles se libèrent-ils après chaque fin d'opération ? |
| `npm run check:tabs` | Audit navigateur : listbox désactivés et requêtes relancées par onglet |
| `npm run check:tab-jobs` | Harnais navigateur (ajouté à l'étape 6 de B3) : un travail survit-il au changement d'onglet ? |
| `npm run check:ui` | Harnais navigateur (ajouté en B4) : listbox, prompt et champs du kit UI |
| `npm run profile:renders` | Mesure navigateur (ajoutée en B2) : re-rendus de l'application pour des mises à jour typiques du store |

Les deux scripts navigateur demandent le serveur Vite (port 3000) et Playwright. Playwright n'est pas une dépendance du dépôt : il est lu dans `%TEMP%\scene-variation-browser` (variable `LAWIZ_PLAYWRIGHT_DIR` pour un autre emplacement). Aucune dépendance n'a été ajoutée.

### 2026-11-19 — Étape 3 : harnais navigateur

Fichiers créés :

- `scripts/browser/lock-release-check.mjs` — monte `OutpaintPanel` (un consommateur typique de `executeWorkflow`) avec un ComfyUI simulé, lance dix scénarios dans une page neuve chacun, puis vérifie que le verrou global `generation.isLoading` est relâché, que les 10 listbox du panneau sont activés et que le bouton de génération est disponible.
- `scripts/browser/tab-switch-audit.mjs` — charge l'application réelle (mode navigateur, ComfyUI simulé), visite deux fois les 13 onglets principaux et compte les listbox visibles, désactivés ou vides, les requêtes ComfyUI et les mises à jour du store.

### 2026-11-19 — Étape 4 : diagnostic du gel

Résultat de `check:locks` avant correction :

| Scénario | Résultat | État final |
| --- | --- | --- |
| Au repos | Réussi | 0 / 10 listbox désactivés |
| Génération réussie | Réussi | Contrôles libérés |
| Génération réussie : le WebSocket est fermé | **Échec** | 1 socket resté ouvert |
| Prompt refusé (HTTP 400) | Réussi | Contrôles libérés |
| Événement `execution_error` | Réussi | Contrôles libérés |
| Stop | Réussi | Contrôles libérés |
| Connexion au serveur perdue pendant le travail | **Échec** | Verrou global actif, **10 / 10 listbox désactivés, définitivement** |
| Stop pendant que le serveur ne répond plus | **Échec** | Verrou global actif, **10 / 10 listbox désactivés, définitivement** |
| Changement d'onglet après une génération | Réussi | Contrôles libérés |
| Travail terminé pendant que l'onglet est masqué | Réussi | Contrôles libérés |

Causes prouvées, toutes dans `executeWorkflow` de `services/comfyUIService.ts` (transport utilisé par une vingtaine de workflows : Image Generator, Character, Outpaint, panneaux Qwen 2.1, Scene Variation, Swap, LTX Director, TTS, Upscale) :

1. **Connexion perdue = promesse jamais résolue.** `ws.onclose` nettoie mais ne rejette pas. Si la connexion se ferme sans événement d'erreur pendant un travail (arrêt ou redémarrage de ComfyUI, coupure par un intermédiaire), l'appelant attend indéfiniment, son `finally` ne s'exécute jamais et `generation.isLoading` reste vrai. Tout ce qui dépend de ce verrou reste désactivé : Image Generator, Character et les onze panneaux qui lisent `generation.isLoading`. Le bouton Stop ne peut plus rien faire, car l'exécution courante a été oubliée. Seul un rechargement de l'application débloque. Le harnais simule une fermeture sans événement d'erreur ; je n'ai pas vérifié quel événement un plantage réel de ComfyUI produit dans Electron.
2. **Stop sans serveur = promesse jamais rejetée.** `cancelComfyUIExecution` ne rejette le travail que si la requête `/interrupt` réussit. Si elle échoue, l'erreur est seulement journalisée, puis l'exécution courante est oubliée : les clics suivants sur Stop ne font plus rien.
3. **Fuite de WebSocket après chaque réussite.** Le socket n'est fermé en cas de succès que pour les workflows avec aperçu (MOSS). Pour les autres, il reste ouvert (mesuré par le harnais). D'après la lecture du code, son gestionnaire continue alors de recevoir les diffusions `status` de ComfyUI et d'appeler le rappel de progression du travail déjà terminé ; dans Image Generator, ce rappel met à jour le store, donc relance un rendu complet de `App`. L'ampleur réelle n'a pas été mesurée.

Constats de conception liés, non corrigés à cette étape :

- Le verrou `generation.isLoading` est un simple booléen partagé ; il ne sait pas qui le détient (prévu en B2).
- `cancelComfyUIExecution` ne connaît que la dernière exécution lancée et envoie un `/interrupt` global, qui arrête n'importe quel travail en cours sur le serveur, y compris celui d'un autre panneau.
- Plusieurs panneaux annulent leur travail dans le nettoyage d'un effet de montage (`BlazingFastCharacterPanel`, `ClothesSwitcherPanel`, analyses de `CharacterScenePanel` et `Qwen21MultiPanel`, Ollama dans `ClothesExtractorPanel` et `PromptGeneratorPanel`). Avec `React.Activity`, ce nettoyage s'exécute quand l'onglet est masqué : changer d'onglet annule donc l'opération en cours dans ces panneaux. Réponse de l'utilisateur : non voulu ; corrigé à l'étape 6 de B3.

Résultat de `check:tabs` (mode navigateur, au repos) :

- Démarrage : 4 requêtes ComfyUI dont 2 `/object_info` complets (l'effet de montage s'exécute deux fois en développement).
- Aucun listbox désactivé ou vide à tort sur les 13 onglets, à la première visite comme au retour. Les trois listbox désactivés de Scene Variation (Lighting, Camera angle, Season) sont normaux tant qu'aucune analyse n'existe.
- Requêtes relancées à chaque retour sur l'onglet : TTS (2 `/object_info` à chaque visite). Style Gallery en fait 3 à la première visite seulement.
- Listbox visibles par défaut : Character 35, Scene Variation 12, Image Gen 11, Video 8, Library 6, Style Gallery 5, TTS 3, Models/LoRAs 3 (menus personnalisés).

État des hypothèses du plan :

| Hypothèse | État |
| --- | --- |
| H1 — verrou global jamais relâché | **Confirmée** (causes 1 et 2 ci-dessus) |
| H2 — effets relancés au retour d'onglet | Confirmée comme coût (TTS, et par lecture du code : Blazing, Ripple, Character Swap, inventaire des modèles) ; aucun gel permanent observé |
| H3 — valeur absente des options | Non observée au repos |
| H4 — lecteurs de catalogue incompatibles | Non observée avec le catalogue simulé ; reste à traiter en B3 (lecteur unique) |
| H5 — overlay résiduel | Non observée |
| H6 — re-rendus de `App` | Mécanisme confirmé par la fuite de sockets (cause 3) ; ampleur non mesurée |

Limites de ce diagnostic :

- Le gel signalé après une génération **réussie** et après un simple **changement d'onglet** n'est pas reproduit par ces harnais. Les harnais tournent en mode navigateur : les chemins propres à Electron (lecture de l'inventaire des modèles par IPC, boîtes de dialogue natives) ne sont pas couverts.
- Le harnais de verrou ne couvre qu'un panneau. Les transports plus récents (`executeComfyGraph`, H3, Audio-Sync) surveillent l'historique avec des délais d'expiration ; ils n'ont pas été testés ici.
- Point ouvert pour l'utilisateur : dans quel onglet et après quelle opération le gel survient-il le plus souvent une fois les corrections ci-dessous en place ?

Suite : les trois causes prouvées sont corrigées au début de B3 (transport), où les trois scénarios en échec doivent passer au vert.

**B0 est terminé**, avec une réserve : le gel après une génération réussie ou un simple changement d'onglet reste à reproduire (voir les limites ci-dessus).

---

## B3 — Catalogue ComfyUI unique et appels asynchrones

### 2026-11-19 — Étape 1 : transport `executeWorkflow` (les trois causes de B0)

Fichiers touchés : `services/comfyUIService.ts` (`executeWorkflow`, `cancelComfyUIExecution`), `scripts/browser/lock-release-check.mjs` (quatre scénarios ajoutés).

Ce qui change :

- **Règlement unique.** La promesse est résolue ou rejetée une seule fois, et le socket est toujours fermé à ce moment-là, y compris après une réussite (fin de la fuite). Les messages reçus ensuite sont ignorés.
- **Reprise par l'historique.** Si le socket se ferme avant la fin, le travail n'est plus abandonné en silence : son résultat est lu dans `/history/{id}` toutes les 2 secondes. Travail terminé : le résultat est récupéré normalement. Travail en erreur : l'erreur est remontée. Serveur injoignable ou travail absent de l'historique et de la file d'attente trois fois de suite : erreur explicite et contrôles libérés. Tant que le travail est encore dans la file du serveur, l'attente continue et Stop reste utilisable.
- **Stop garanti.** `cancelComfyUIExecution` libère toujours l'appelant, même si `/interrupt` échoue ou ne répond pas (délai de 5 secondes). Le message d'erreur « Operation was cancelled by the user. » est inchangé, car `App` s'en sert pour reconnaître une annulation.
- **Interruption d'un autre travail ignorée.** ComfyUI diffuse `execution_interrupted` à tous les clients. Un travail en attente dans la file n'est plus annulé à tort quand un autre travail est interrompu : l'identifiant du travail est comparé.
- Le code de collecte des sorties (images, vidéo, audio) a été déplacé tel quel dans une fonction interne pour servir aux deux chemins (événement en direct et reprise).

Changement de comportement à connaître : une erreur de socket survenant après la mise en file ne produit plus immédiatement « WebSocket connection failed » ; l'application tente d'abord la reprise par l'historique.

Résultat de `check:locks` après correction : **13 scénarios sur 13 réussis** (les trois rouges de B0 sont verts ; les quatre nouveaux couvrent la reprise réussie, le serveur injoignable, le travail inconnu après redémarrage et l'interruption d'un autre travail).

### 2026-11-19 — Étape 2 : service de catalogue

Fichiers créés : `services/comfyCatalog.ts`, `services/comfyCatalog.test.mjs` (12 tests).

Le service ne dépend d'aucun autre module. Il offre :

- `loadComfyCatalog(base, options)` — catalogue complet (`/object_info`). Les appels simultanés partagent une seule requête. Un catalogue inchangé garde la même identité d'objet, donc les listes qui en dérivent ne sont pas reconstruites, et les abonnés ne sont prévenus que si le contenu change réellement.
- `loadComfyNodes(base, noms, options)` — schémas de quelques nœuds seulement. Servis depuis le catalogue complet s'il est assez récent, sinon par une requête par nœud, partagée et mise en cache.
- `maxAgeMs` (âge accepté du cache), `force` (redemander au serveur, sauf si une requête est déjà en cours), `signal` (annule l'attente de l'appelant, jamais la requête partagée).
- `invalidateComfyCatalog`, `cachedComfyCatalog`, `subscribeComfyCatalog`.
- `comfyChoices` / `comfyWidgetChoices` — lecteur unique des choix d'un widget pour les deux encodages de ComfyUI : `[[...]]` et `['COMBO', { options: [...] }]`.
- Un cache par URL de serveur ; un échec n'est jamais mis en cache.

### 2026-11-19 — Étape 3 : premiers branchements

Fichiers touchés : `services/comfyUIService.ts`, `App.tsx`.

- `getComfyUIObjectInfo()` passe par le service avec une fenêtre de fraîcheur de 10 secondes. Les vérifications avant génération voient donc toujours l'état courant du serveur, comme avant, mais les appels rapprochés d'une même opération ne refont plus la requête. Aucun des quelque 25 appelants n'a été modifié.
- `getComfyUIObjectInfo(true)` force une lecture fraîche ; utilisé à la connexion et à la reconnexion.
- `subscribeComfyUIObjectInfo` : quand une lecture fraîche révèle un catalogue différent (nouveau modèle ou LoRA), `App` met à jour le store. Les listes de l'interface suivent donc le serveur sans reconnexion manuelle.
- Pendant B3, le catalogue reste aussi dans le store Redux pour ne casser aucun appelant ; sa sortie du store est prévue en B2.

Mesure `check:tabs` : au démarrage, `/object_info` complet passe de 2 requêtes à 1.

### 2026-11-19 — Étape 4 : lecteurs de catalogue

Constat : l'application contient au moins 15 fonctions locales qui lisent les choix d'un widget. Douze ne comprenaient que l'ancien encodage `[[...]]` ; pour un nœud qui répond en `['COMBO', { options }]`, elles renvoyaient une liste vide. Le listbox ne proposait alors que la valeur courante et ne pouvait plus être changé.

Fichiers corrigés sur place, sans nouvel import (plusieurs tests compilent ces fichiers isolément) : `components/OptionsPanel.tsx`, `components/SamplerSettingsPanel.tsx`, `components/groupPhotoFusion/GroupPhotoFusionPanel.tsx`, `components/pastForward/PastForwardPanel.tsx`, `components/StyliseAnythingPanel.tsx`, `components/SwapAnythingPanel.tsx`, `components/ZImageCreativeUpscalePanel.tsx`, `components/LTXDirectorPanel.tsx`, `components/PromptGeneratorPanel.tsx`, `components/CivitaiInventoryPanel.tsx`, `services/civitaiService.ts`, `services/ltxDirectorWorkflow.ts`.

Je n'ai pas pu vérifier quels nœuds de l'installation de l'utilisateur répondent dans le nouvel encodage ; la correction est sans effet sur l'ancien. Le remplacement de ces copies par le lecteur unique `comfyChoices` se fera panneau par panneau en B5, avec leurs tests.

### 2026-11-19 — Vérification après les étapes 1 à 4

| Vérification | Référence B0 | Après |
| --- | --- | --- |
| Tests `npm test` | 911 tests : 895 réussis, 2 en échec, 14 ignorés | 923 tests : **907 réussis, 2 en échec (les deux mêmes), 14 ignorés** |
| `npm run typecheck` | 18 erreurs | **18 erreurs, liste identique** |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,99 s |
| `npm run check:locks` | 3 échecs sur 10 | **13 réussis sur 13** |
| `npm run check:tabs` | 2 `/object_info` au démarrage | 1 au démarrage ; aucun listbox désactivé ou vide à tort ; aucune erreur de page |

Non vérifié : aucune exécution dans Electron ni contre un vrai serveur ComfyUI. Le serveur Vite de l'utilisateur recharge les fichiers modifiés à chaud ; l'application ouverte utilise donc déjà ce code.

### 2026-11-19 — Étape 5 : réparation des deux tests en échec depuis B0

Demande de l'utilisateur : réparer les deux tests avant de poursuivre.

Fichiers touchés : `services/characterResults.test.mjs`, `services/swapPersonWorkflow.test.mjs` (harnais de test seulement, aucun code de l'application).

Causes :

- Les deux harnais compilent des fichiers TypeScript isolément et réécrivent leurs imports. Des imports ajoutés depuis dans le code (`mossWorkflow`, `mossPhotoWorkflow`, `krea2EditWorkflow`, `qwen21Workflow`) n'étaient pas réécrits : le fichier ne se chargeait plus et tous ses tests étaient comptés comme un seul échec.
- Une fois le chargement réparé, un échec réel jusque-là masqué est apparu dans `characterResults` : le test de sauvegarde en bibliothèque n'injectait pas `imageGalleryStyleTag`, que `ImageGrid` appelle maintenant. Le test utilise désormais la vraie fonction de `services/libraryTags.ts`.

Résultat : 26 tests sur 26 réussis dans ces deux fichiers (ils comptaient avant pour 2 échecs).

### 2026-11-19 — Étape 6 : changer d'onglet n'annule plus l'opération en cours

Demande de l'utilisateur : ce comportement n'est pas voulu, à corriger.

Cause : les onglets restent montés grâce à `React.Activity`, mais React exécute le nettoyage des effets quand un onglet est masqué. Les panneaux qui annulaient leur travail dans ce nettoyage l'annulaient donc à chaque changement d'onglet.

Fichier créé : `components/useUnmountCleanup.ts`. Le hook n'exécute le nettoyage que si l'élément racine du panneau a réellement été retiré de la page. Un onglet masqué garde son élément dans la page ; un panneau fermé ou réinitialisé le perd. Si aucun élément n'est attaché, l'ancien comportement s'applique.

Panneaux modifiés (l'annulation est conservée à la fermeture réelle du panneau et par les boutons Cancel / Stop) :

| Fichier | Opération qui survit maintenant au changement d'onglet |
| --- | --- |
| `components/BlazingFastCharacterPanel.tsx` | Génération Blazing Fast |
| `components/ClothesSwitcherPanel.tsx` | Génération et export Clothes Switcher |
| `components/CharacterScenePanel.tsx` | Analyse des images |
| `components/Qwen21MultiPanel.tsx` | Analyse des références |
| `components/ClothesExtractorPanel.tsx` | Requête Ollama |
| `components/PromptGeneratorPanel.tsx` | Requête Ollama |
| `components/MinimaxH3Panel.tsx` | Copie de la dernière image vers Picture 1 |
| `components/VideoOutputFrames.tsx` | Extraction d'une image de la vidéo (la lecture est toujours mise en pause) |
| `components/AudioExtractorPanel.tsx` | Décodage et extraction audio (la lecture est toujours arrêtée) |

Correction liée dans `AudioExtractorPanel` : le contexte audio était fermé à chaque changement d'onglet sans être recréé. D'après la lecture du code, la lecture audio échouait donc au retour sur l'onglet ; il n'est maintenant fermé qu'à la fermeture réelle du panneau. Ce point n'a pas été testé dans un navigateur.

Tests adaptés : `BlazingFastCharacterPanel.test.mjs`, `ClothesSwitcherPanel.test.mjs`, `AudioExtractorPanel.test.mjs`, `VideoOutputFrames.test.mjs` (une ligne chacun : ces tests retirent les imports du composant et doivent fournir le nouveau hook).

Preuve : nouveau harnais `scripts/browser/tab-switch-job-check.mjs` (`npm run check:tab-jobs`), qui monte `ClothesSwitcherPanel` en mode strict avec un ComfyUI simulé.

| Scénario | Ancien nettoyage (témoin) | Après correction |
| --- | --- | --- |
| Travail terminé pendant que l'onglet est masqué : résultat affiché au retour | **Échec** (travail annulé) | Réussi, 0 annulation envoyée |
| Aller-retour d'onglet pendant un travail : il continue jusqu'au résultat | **Échec** (travail annulé) | Réussi, 0 annulation envoyée |
| Retrait réel du panneau : le travail est annulé | Réussi | Réussi, 1 annulation envoyée |
| Bouton « Cancel this job » | Réussi | Réussi, 1 annulation envoyée |

Le témoin est le même harnais lancé avec `LAWIZ_LEGACY_CLEANUP=1`, qui remplace le hook par l'ancien comportement.

Limites :

- Seul `ClothesSwitcherPanel` est exercé dans un navigateur. Les huit autres panneaux utilisent le même hook mais n'ont pas de scénario propre.
- Un panneau retiré pendant que son onglet est masqué (déconnexion, par exemple) n'annule plus son travail : React ne rappelle pas le nettoyage dans ce cas. Le travail se termine sur le serveur et le verrou global est relâché normalement.
- Non modifiés : les fenêtres modales `ImagePromptModal` et `VideoReferenceEditor` (elles couvrent l'écran, on ne peut pas changer d'onglet pendant leur opération) et l'import de photos de `ReferenceMakerPanel` (lecture locale très courte, toujours abandonnée au changement d'onglet).
- Les effets qui rechargent des listes (`/object_info`) sont toujours interrompus puis relancés au retour sur l'onglet ; l'étape 7 les sert depuis un cache.

### 2026-11-19 — Étape 7 : schémas de nœuds partagés et mis en cache

Constat : cinq panneaux rechargeaient un par un les schémas de leurs nœuds (`/object_info/{nœud}`) à chaque affichage de leur onglet : Blazing Fast, Clothes Switcher, Creation Suite, LTX Audio-Sync, LTX Ripple. Seul H3 avait un cache (`loadH3Catalog`).

Fichiers touchés : `services/blazingFastCharacterService.ts`, `services/clothesSwitcherService.ts`, `services/creationSuiteService.ts`, `services/ltxAudioSyncService.ts`, `services/ltxRippleService.ts`, les cinq panneaux correspondants (une ligne chacun), `App.tsx`, `services/clothesSwitcherService.test.mjs` (un test ajouté).

Ce qui change :

- Les cinq chargeurs passent par le cache existant `loadH3Catalog`, que ces services importaient déjà (aucun harnais de test à adapter). Un nœud commun à plusieurs panneaux n'est demandé qu'une fois.
- Affichage de l'onglet : les listes viennent du cache, sans requête.
- « Check workflow », export API et génération : lecture fraîche forcée, comme avant. Les validations voient donc toujours l'état réel du serveur.
- Quand le catalogue complet change (nouveau modèle ou LoRA détecté), `App` vide ce cache ; les listes sont relues au prochain affichage.

Changement de comportement à connaître : dans ces cinq panneaux, un fichier ajouté à la main dans ComfyUI n'apparaît plus dès le retour sur l'onglet, mais après « Check workflow », une génération, ou une reconnexion.

Écart par rapport au plan : le plan prévoyait de brancher ces chargeurs sur `loadComfyNodes` (`services/comfyCatalog.ts`). J'ai gardé `loadH3Catalog` pour ne pas réécrire ses tests ni les cinq harnais ; il reste donc deux caches (catalogue complet et schémas par nœud), reliés par l'invalidation ci-dessus. Leur fusion est reportée à B2, quand le catalogue sortira du store.

Non modifié : `CharacterSwapPanel` (ses lectures de schémas ne se font qu'à la vérification et au lancement, pas à l'affichage).

Non couvert par un test : le vidage du cache par `App` quand le catalogue change, et les quatre panneaux autres que Clothes Switcher dans un navigateur (leurs tests de service passent).

Mesure (`check:tab-jobs`, Clothes Switcher) : 18 requêtes de schémas au premier affichage, **0 au retour sur l'onglet** (18 avant), 18 à chaque génération (inchangé).

### 2026-11-19 — Vérification après les étapes 5 à 7

| Vérification | Après les étapes 1 à 4 | Après les étapes 5 à 7 |
| --- | --- | --- |
| Tests `npm test` | 923 tests : 907 réussis, 2 en échec, 14 ignorés | 948 tests : **934 réussis, 0 en échec, 14 ignorés** |
| `npm run typecheck` | 18 erreurs | **18 erreurs, mêmes fichiers** |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,78 s |
| `npm run check:locks` | 13 réussis sur 13 | 13 réussis sur 13 |
| `npm run check:tabs` | Aucun listbox désactivé ou vide à tort | Résultat identique |
| `npm run check:tab-jobs` | — | **5 réussis sur 5** (témoin de l'étape 6 : 2 échecs attendus) |

Non vérifié : aucune exécution dans Electron ni contre un vrai serveur ComfyUI.

### 2026-11-19 — Étape 8 : inventaire des modèles lu une seule fois

Constat (lecture du code, chemin propre à Electron) : neuf composants utilisent `useModelInventory`, et chacun redemandait l'inventaire complet au processus principal à chaque affichage de son onglet. Pendant cette lecture, l'état « chargement » désactivait tous les contrôles de Blazing Fast et les sélecteurs de style (Image, H3, Video Prompt). Si l'inventaire enregistré est vide, cette lecture reparcourt en plus les dossiers de modèles. C'est un candidat sérieux pour le gel signalé après un changement d'onglet et pour les « rescans de répertoires ».

Fichiers touchés : `components/useModelInventory.ts`, `services/styleLibrary.test.mjs` (un test ajouté).

Ce qui change : l'inventaire n'est relu automatiquement que s'il est encore vide. Une fois chargé, il reste à jour par les actions de l'onglet Models/LoRAs (scan, téléchargement, reclassement), qui le mettent déjà à jour directement. Le bouton « Refresh My Library » du gestionnaire de styles force toujours une relecture.

Non vérifié : ce chemin n'existe que dans Electron ; seul le test unitaire le couvre. Je n'ai pas mesuré la durée réelle de cette lecture chez l'utilisateur.

### 2026-11-19 — Étape 9 : dernières lectures directes du catalogue

Fichiers touchés : `services/comfyUIService.ts`, `components/CivitaiPanel.tsx`, `utils/seedVr2Models.test.mjs`, `services/comfyCatalog.test.mjs` (un test ajouté).

- **Voix TTS** (`getTtsReferenceVoices`) : les deux panneaux TTS faisaient chacun une requête à chaque visite. Ils partagent maintenant une réponse valable 30 secondes, servie par le catalogue déjà chargé quand il est récent. Les deux encodages de liste sont acceptés. Mesure `check:tabs` : 2 requêtes par visite → 0.
- **SeedVR2 Upscale et Z-Image Creative Upscale** : passent par `getComfyUIObjectInfo()` au lieu d'une lecture directe. Le message d'erreur en cas de serveur injoignable change (« Failed to fetch ComfyUI object info » au lieu de « Could not inspect the installed ComfyUI nodes »).
- **Après un téléchargement, un déplacement ou une suppression de modèle** : `CivitaiPanel` relit le catalogue ComfyUI quand la liste des fichiers de l'inventaire change. Les listes de tous les onglets suivent alors sans reconnexion. Ce déclencheur n'est pas couvert par un test.

### 2026-11-19 — Étape 10 : écriture des brouillons après une pause

Constat : Blazing Fast, Clothes Switcher et Creation Suite réécrivaient tout leur brouillon dans IndexedDB à chaque frappe, images sources comprises.

Fichier créé : `components/useDraftAutosave.ts`. Fichiers touchés : les trois panneaux et leurs trois tests (une ligne chacun).

Ce qui change : le brouillon est écrit 400 ms après la dernière modification (même délai que Video). Une écriture en attente est faite immédiatement quand l'onglet est masqué ou le panneau fermé. Revenir sur l'onglet ne réécrit plus un brouillon inchangé.

Limite : si l'application est fermée moins de 400 ms après une frappe, cette dernière modification n'est pas enregistrée.

Mesure (`check:tab-jobs`, Clothes Switcher) : 15 frappes → **1 écriture** (15 avant) ; l'écriture en attente est bien faite au masquage de l'onglet.

### 2026-11-19 — Étape 11 : points examinés sans modification

- **Polling** (Florence2 1 s, Audio-Sync 2 s, H3 3 s, Character Swap 4 s) : ces lectures n'existent que pendant un travail en cours. Au repos, aucune requête n'est émise (confirmé par `check:tabs`). Celle de Character Swap s'arrête déjà quand l'onglet est masqué. Je n'ai pas touché à ces transports, qui ont des tests détaillés, faute de gain mesurable.
- **Écritures d'inventaire Electron** : les mises à jour d'aperçus sont déjà groupées (300 ms). Les autres écritures correspondent chacune à une action de l'utilisateur. Rien à changer sans mesure dans Electron.

### 2026-11-19 — Vérification finale de B3

| Vérification | Référence B0 | Fin de B3 |
| --- | --- | --- |
| Tests `npm test` | 911 tests : 895 réussis, 2 en échec, 14 ignorés | 950 tests : **936 réussis, 0 en échec, 14 ignorés** |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,72 s |
| `npm run check:locks` | 3 échecs sur 10 | 13 réussis sur 13 |
| `npm run check:tabs` | 2 `/object_info` au démarrage, 2 requêtes par visite de TTS | 1 au démarrage, 0 par visite ; aucun listbox désactivé ou vide à tort |
| `npm run check:tab-jobs` | — | 6 réussis sur 6 |

**B3 est terminé**, avec deux réserves : rien n'a été exécuté dans Electron ni contre un vrai serveur ComfyUI, et la fusion des deux caches (`loadH3Catalog`, `loadComfyNodes`) est reportée à B2.

### Suivi des points prévus dans B3

1. ~~Chargeurs par nœud~~ Fait à l'étape 7 pour les cinq panneaux. Reste : fusionner `loadH3Catalog` et `loadComfyNodes` (reporté à B2).
2. ~~Lectures directes de `/object_info` (SeedVR2, Z-Image) et requêtes TTS~~ Fait à l'étape 9.
3. ~~Rafraîchir le catalogue après un téléchargement ou un déplacement de modèle~~ Fait à l'étape 9.
4. Polling : examiné à l'étape 11, aucune modification.
5. ~~Délai avant l'écriture des brouillons~~ Fait à l'étape 10.
6. Écritures d'inventaire Electron : examiné à l'étape 11, aucune modification. La relecture de l'inventaire à chaque onglet est corrigée à l'étape 8.

---

## B4 — Kit UI standard

### 2026-11-19 — Étape 1 : le kit (`components/ui/`)

Fichiers créés :

| Fichier | Contenu |
| --- | --- |
| `components/ui/styles.ts` | Classes communes (libellé, contrôle, aide, erreur, section, boutons). Couleurs du thème uniquement. |
| `components/ui/Select.tsx` | `Select`, le listbox unique, en deux variantes. |
| `components/ui/PromptBox.tsx` | `PromptBox`, le champ de prompt unique, et `promptParts` (coloration par défaut). |
| `components/ui/Accordion.tsx` | Section repliable ; son contenu n'est monté que lorsqu'elle est ouverte. |
| `components/ui/fields.tsx` | `Button`, `NumberField`, `SeedField`, `SamplerFields`, `ModelFields`, `LoraSlots`. |
| `components/ui/SettingsLayout.tsx` | Disposition standard : réglages à gauche, prompt / Generate / résultats à droite. |
| `components/ui/compileForTest.mjs` | Aide de test : compile le kit pour les tests qui chargent un composant isolé. |
| `components/ui/ui.test.mjs` | 8 tests de rendu. |
| `scripts/browser/ui-kit-check.mjs` | Harnais navigateur (`npm run check:ui`), 12 scénarios. |

`Select` :

- Variante `native` (listes courtes) : un `<select>` stylé. Variante `search` (modèles, LoRA, samplers) : bouton + liste avec champ de filtre dès qu'il y a plus de 8 entrées.
- **Jamais de repli silencieux.** Une valeur absente de la liste reste affichée : « fichier (not listed) ». Une valeur vide absente de la liste affiche « Select... ». Avant, un `<select>` affichait la première option alors que la valeur réelle était autre ; il était alors impossible de choisir cette première option (aucun changement n'était émis).
- Liste longue : seules les lignes visibles sont dans la page (20 lignes pour 3000 options).
- La liste est rendue hors de son panneau : elle n'est plus coupée par un conteneur, s'ouvre vers le haut près du bas de la fenêtre, et conserve la couleur d'accent de l'onglet.
- Clavier : flèches, Page précédente / suivante, Début / Fin (listes courtes), Entrée, Échap ; les entrées désactivées sont sautées.
- Elle se ferme quand l'onglet est masqué, et refuse un clic tardif si les réglages ont été verrouillés pendant qu'elle était ouverte.

`PromptBox` :

- Code couleur par rôle : positif (vert), négatif (rouge), instruction (accent), lecture seule (bordure pointillée), neutre. Les couleurs viennent du thème.
- Coloration de la syntaxe derrière le texte : balises LoRA, jetons de référence (`<Picture 1>`), poids `(mot:1.2)`, wildcards, `BREAK`. Seul le fond est teinté ; le texte garde la couleur du thème et reste lisible dans tous les thèmes. Une fonction peut remplacer la coloration par défaut.
- Nom accessible explicite et stable, emplacement pour des boutons (Library), boutons Copy et Clear en option.

`SettingsLayout` impose l'ordre Models → LoRAs → Sampler → Advanced. Les champs composés (`SamplerFields`, `ModelFields`, `LoraSlots`, `SeedField`) prennent le nom du workflow pour que les noms accessibles restent uniques, puisque tous les onglets sont montés en même temps.

### 2026-11-19 — Étape 2 : les trois composants existants deviennent des enveloppes

Fichiers touchés : `components/InputComponents.tsx` (`SelectInput`, `TextInput`), `components/MenuSelect.tsx`, et trois tests qui compilent `InputComponents` isolément (`InputComponents.test.mjs`, `BlazingFastCharacterPanel.test.mjs`, `services/styleSampling.test.mjs`). Aucun appelant n'a été modifié.

Ce que l'utilisateur verra dès maintenant, sans migration de panneau :

- **Toutes les listes `SelectInput`** (Image Generator, Character, samplers, LoRA) : une valeur enregistrée qui n'existe plus dans la liste s'affiche « … (not listed) ». Les listes désactivées sont grisées.
- **Champs de prompt `TextInput`** (Image Generator, MOSS, Qwen 2.1, KREA2 Edit, Stylise / Swap Anything) : bord coloré selon le rôle, déduit du libellé (« Negative… » → négatif, « …Prompt » → positif, « …Instructions » → instruction). La coloration de la syntaxe n'est pas activée dans ces champs ; elle le sera panneau par panneau en B5.
- **Listes `MenuSelect`** (Models/LoRAs, Civitai, ArchiveCivit) : navigation au clavier, filtre au-delà de 8 entrées, liste qui n'est plus coupée par sa carte.

### 2026-11-19 — Vérification de B4

| Vérification | Fin de B3 | Fin de B4 |
| --- | --- | --- |
| Tests `npm test` | 950 tests : 936 réussis, 0 en échec, 14 ignorés | 958 tests : **944 réussis, 0 en échec, 14 ignorés** |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,84 s |
| `npm run check:locks` | 13 sur 13 | 13 sur 13 |
| `npm run check:tab-jobs` | 6 sur 6 | 6 sur 6 |
| `npm run check:tabs` | Aucun listbox désactivé ou vide à tort | Résultat identique, mêmes nombres de listbox, aucune erreur de page, aucune valeur « not listed » avec les réglages par défaut |
| `npm run check:ui` | — | **12 sur 12**, avec le thème sombre par défaut et avec le thème clair |

Le harnais `check:ui` couvre : fenêtre de lignes sur 3000 options, filtre, clavier, clic extérieur, valeur absente, conteneur qui coupe, ouverture vers le haut, onglet masqué, réglages verrouillés, alignement de la coloration du prompt (frappe, retour à la ligne, défilement), champs composés, et les trois enveloppes. Captures d'écran vérifiées à l'œil dans les deux thèmes, ainsi que les onglets Image Gen et Models/LoRAs de l'application réelle.

Défauts trouvés par le harnais et corrigés avant usage :

- Filtrer une liste déjà défilée n'affichait aucune ligne (la position de défilement mémorisée dépassait la liste filtrée).
- Ma première page d'essai n'appliquait aucun thème : la liste s'affichait sans fond. L'application définit toujours un thème ; le harnais en applique maintenant un, au choix (`LAWIZ_THEME`).

Constat à traiter plus tard (non corrigé) : dans cette application, une opacité appliquée à une couleur du thème n'a aucun effet. Mesuré : `bg-accent/10` donne un fond transparent. 187 classes de ce type existent dans 51 fichiers (`border-accent/25`, `bg-accent/10`…) ; je n'ai mesuré que celle-là. Le kit n'en utilise aucune. À vérifier et corriger pendant B5.

Limites :

- Rien n'a été exécuté dans Electron.
- `SettingsLayout`, `ModelFields`, `SamplerFields`, `LoraSlots` et `SeedField` ne sont encore utilisés par aucun panneau. Leur interface sera confirmée ou ajustée à la première migration (B5).
- Le bouton Copy de `PromptBox` n'est pas exercé par le harnais (presse-papiers indisponible en mode sans affichage).
- Touche Échap dans une fenêtre modale : comme avant, la fenêtre peut se fermer en même temps que la liste.

**B4 est terminé**, avec ces réserves. Aucun panneau n'a été migré : c'est l'objet de B5.

---

## Correctif Library — dossier de projet après un redémarrage

### 2026-11-19

Signalé par l'utilisateur : à l'ouverture de la Library après un redémarrage, le message « Failed to execute 'getFileHandle' on 'FileSystemDirectoryHandle': The request is not allowed by the user agent or the platform in the current context. Changes are preserved locally. Use Save now to retry, or make a JSON backup. »

Cause (lecture du code) : au démarrage, `startLibraryProjectSync` lisait le dossier de projet sans vérifier l'autorisation d'accès. Or le navigateur retire cette autorisation à chaque redémarrage et ne la redonne que pendant une action de l'utilisateur. La lecture échouait donc à chaque démarrage, et l'échec était affiché comme une erreur. La sauvegarde automatique avait le même défaut : elle demandait l'autorisation hors de toute action de l'utilisateur.

Fichiers touchés : `services/libraryProjectService.ts`, `services/directoryHandleService.ts` (`hasDirectoryPermission`, qui interroge sans demander), `services/libraryProject.test.mjs` (7 tests ajoutés).

Ce qui change :

- **Plus d'erreur au démarrage.** Sans accès, la synchronisation se met en pause (nouvel état `paused`, message ambre : « The project folder must be reconnected after a restart. Changes are kept locally. Use Project > Save now to reconnect. »). Le dossier n'est pas lu, rien n'est écrit, les changements restent dans la Library locale.
- **Reconnexion automatique dans l'application de bureau.** Au premier clic ou à la première touche, l'application redemande l'accès puis reprend la sauvegarde. Une seule tentative automatique par pause.
- **« Save now »** reconnecte le dossier puis sauvegarde, dans le navigateur comme dans l'application de bureau.
- Une sauvegarde automatique qui perd l'accès se met en pause au lieu d'afficher une erreur.
- Les protections existantes sont conservées : un dossier modifié hors de l'application est toujours refusé après la reconnexion ; un refus d'accès lors d'un « Save now » reste une erreur explicite.
- L'état `paused` ne bloque pas la fermeture de l'application (les changements sont déjà enregistrés localement).

Vérification : 32 tests sur 32 dans `libraryProject.test.mjs` ; suite complète 965 tests, 951 réussis, 0 en échec, 14 ignorés ; `tsc` 18 erreurs inchangées.

Non vérifié : le comportement dans Electron. La reconnexion silencieuse au premier clic suppose qu'Electron accorde l'accès sans fenêtre de confirmation (son comportement par défaut d'après sa documentation, non testé ici). Si ce n'est pas le cas, le message ambre restera affiché jusqu'à « Save now » — sans l'erreur rouge.

---

## B2 — Redux allégé

### 2026-11-19 — Étape 0 : mesure de référence

Fichier créé : `scripts/browser/app-render-profile.mjs` (`npm run profile:renders`). Il monte l'application réelle sous un profileur React (ComfyUI simulé) et mesure, pour une série de mises à jour du store, le nombre de rendus validés, le temps de rendu et le temps pendant lequel la page est bloquée.

Mesure avant toute modification (build de développement : les valeurs se comparent entre elles, elles ne sont pas absolues) :

| Mise à jour | Rendu par mise à jour | Page bloquée pour la série |
| --- | --- | --- |
| Progression d'une génération (50 ticks) | 5,5 à 6,3 ms | environ 1350 ms |
| Frappe dans le prompt d'Image Gen (20) | 7 à 9 ms | environ 475 à 540 ms |

Cause : `App` (plus de 2000 lignes, tous les onglets montés) lisait tout `state.generation`. Chaque tick de progression relançait donc le rendu de toute l'application. S'y ajoutait la progression par image, tenue dans l'état local de `App`, avec le même effet. La mesure de référence ne contient que le premier des deux ; le coût réel avant correction était donc au moins celui-là.

### 2026-11-19 — Étape 1 : la progression ne re-rend plus toute l'application

Fichiers créés : `store/generationJobs.ts` (petit magasin hors Redux pour la progression par image et l'aperçu en direct), `components/GenerationProgress.tsx` (`GenerationProgress`, `ImageGridWithJobs`, `GenerationLivePreview`, chacun abonné à ce qu'il affiche).

Fichier touché : `App.tsx`.

- `App` ne lit plus le texte ni la valeur de progression ; son sélecteur de génération ne réagit qu'aux autres champs.
- La progression par image (Image Generator et Character) et l'aperçu MOSS en direct ne sont plus dans l'état de `App`.
- Aucun changement d'affichage : la barre de progression, les tuiles par image et l'aperçu sont les mêmes composants qu'avant, alimentés autrement.

Mesure après (même harnais, le tick inclut maintenant aussi la progression par image) :

| Mise à jour | Avant | Après |
| --- | --- | --- |
| Tick de progression — rendu | 5,5 à 6,3 ms | **2,1 à 2,9 ms** |
| 50 ticks — page bloquée | environ 1350 ms | **environ 75 ms** |
| Frappe dans le prompt — rendu | 7 à 9 ms | 7,2 à 7,9 ms (inchangé, comme prévu) |

Le harnais vérifie aussi que la barre de progression et la tuile de l'image suivent bien les ticks.

Deux pièges de mesure rencontrés et corrigés dans le harnais :

- Vite sert un fichier modifié pendant la session sous une adresse horodatée. Le harnais importait une seconde copie, déconnectée, du magasin de progression : sa première mesure « après » ne passait pas par le bon chemin, et sa vérification d'affichage a échoué, ce qui a révélé le problème. Le harnais lit maintenant l'adresse réellement utilisée par l'application. Le compteur de mises à jour de `check:tabs` avait le même défaut ; il est corrigé.
- La première série de re-rendus complets est deux à trois fois plus lente que les suivantes. Sans échauffement, la ligne « frappe dans le prompt » semblait avoir régressé. Le harnais fait maintenant un échauffement non mesuré.

Les lignes « compteur de jetons » et « message de synchronisation Drive » varient d'une exécution à l'autre (7 à 20 ms) ; je ne les utilise pas comme preuve.

### 2026-11-19 — Étape 2 : sélecteurs trop larges dans les panneaux masqués

Fichiers touchés : `components/CharacterScenePanel.tsx`, `components/groupPhotoFusion/GroupPhotoFusionPanel.tsx`, `components/pastForward/PastForwardPanel.tsx`.

- `CharacterScenePanel` lisait tout `state.generation` : il se re-rendait à chaque tick de progression et à chaque frappe dans un prompt, même masqué. Il ne s'abonne plus qu'au verrou ; les options sont lues au moment de l'enregistrement d'un résultat.
- `GroupPhotoFusionPanel` et `PastForwardPanel` lisaient tout `state.app` pour trois champs : ils se re-rendaient à chaque ouverture de fenêtre, message de synchronisation ou compteur de jetons. Ils lisent maintenant ces trois champs seulement.

Non mesuré séparément.

### 2026-11-19 — Étape 3 : rafraîchissement de la Library

Fichiers touchés : `store/librarySlice.ts`, `services/libraryProject.test.mjs` (un test ajouté).

À chaque rafraîchissement de la Library (8 points d'appel), les vidéos LTX sans vignette étaient rechargées et décodées pour reconstruire leur vignette. Quand la reconstruction échouait, elle était retentée à chaque rafraîchissement. Une vidéo dont la vignette ne peut pas être reconstruite n'est plus retentée pendant la session. Les autres opérations de cette boucle ne s'exécutent déjà qu'une fois par élément.

Écart par rapport au plan : le plan parlait d'une « migration une fois par projet ». À la lecture, seule la reconstruction de vignette en échec se répétait ; je n'ai donc corrigé que cela.

### 2026-11-19 — Vérification après les étapes 0 à 3

| Vérification | Fin de B4 | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 958 tests : 944 réussis, 0 en échec, 14 ignorés | 966 tests : **952 réussis, 0 en échec, 14 ignorés** |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,92 s |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Aucun listbox désactivé ou vide à tort | Résultat identique |
| `profile:renders` | — | Affichage de la progression vérifié ; mesures ci-dessus |

Non vérifié : aucune exécution dans Electron ; aucune génération réelle. La progression par image n'est exercée que par le harnais (mises à jour simulées), pas par un travail ComfyUI complet dans Image Generator.

### 2026-11-19 — Étape 4 : verrou de génération par propriétaire (2e)

Fichiers touchés : `types.ts`, `store/generationSlice.ts`, `App.tsx`, les panneaux qui prennent le verrou (Blazing Fast, Character Scene, Clothes Switcher, Creation Suite, Outpaint, Qwen 2.1 Character Sheet, Qwen 2.1 Multi, Qwen 2.1 Remove Background), `services/characterResults.test.mjs` (un test ajouté).

- Le verrou global retient maintenant qui l'a pris (`loadingOwner`). Chaque panneau donne son nom en le prenant et en le rendant.
- Une libération venant d'un autre propriétaire est ignorée, de même qu'une prise pendant que le verrou appartient à quelqu'un d'autre. Un panneau ne peut donc plus déverrouiller l'opération d'un autre.
- Un appel sans nom garde l'ancien comportement.

### 2026-11-19 — Étape 5 : une seule fenêtre Library ouverte à la fois (2c)

Fichiers créés : `components/LibraryPickerHost.tsx`, `components/LibraryPickerHost.test.mjs` (4 tests). Fichiers touchés : `types.ts`, `store/appSlice.ts`, `App.tsx`.

- Les booléens `is…PickerOpen` du store (31 utilisés, 6 qui ne l'étaient plus par aucune fenêtre) sont remplacés par un seul champ `activePicker`.
- Les appels existants `setModalOpen({ modal: 'is…PickerOpen', isOpen })` fonctionnent sans changement. Ouvrir une fenêtre ferme la précédente ; une fermeture tardive d'une fenêtre qui n'est plus ouverte est ignorée.
- Les 31 fenêtres Library sortent de `App.tsx` et vont dans `LibraryPickerHost`, qui ne s'abonne qu'à la fenêtre ouverte. `App` ne se re-rend plus à l'ouverture ou à la fermeture d'une fenêtre. Seule la fenêtre d'Upscale, tenue par un état local, reste dans `App`.
- Cinq sélecteurs inutilisés sont retirés de `App`, et celui de l'Extractor ne lit plus que 12 champs.
- Un test vérifie que chaque fenêtre déclarée a exactement une fenêtre dans l'hôte et au moins un bouton qui l'ouvre.

### 2026-11-19 — Étape 6 : effets de bord hors des reducers (2f)

Fichiers touchés : `store/appSlice.ts`, `store/store.ts`, `components/LibraryPickerHost.test.mjs` (un test ajouté).

- Quatre reducers écrivaient dans le stockage du navigateur (utilisateur courant, nom du projet, taille de police, dossier Drive). Ces écritures sont faites par un middleware du store, après la mise à jour de l'état. Mêmes clés, mêmes valeurs.
- L'identifiant d'un transfert vers LTX était tiré au hasard dans le reducer. Il est créé avec l'action.
- Le harnais vérifie dans le navigateur que les quatre préférences sont toujours écrites et effacées.

### 2026-11-19 — Étape 7 : les onglets masqués ne sont plus re-rendus à chaque mise à jour (2g, partie performance)

Fichier créé : `components/TabActivity.tsx`. Fichiers touchés : `App.tsx` (les 27 conteneurs d'onglets et de sous-onglets), `components/ToolsNavigation.test.mjs` (deux repères de texte suivent le renommage), `scripts/browser/lock-release-check.mjs` et `tab-switch-job-check.mjs` (ils montent leurs panneaux dans le vrai conteneur).

**Correction d'un diagnostic précédent.** J'avais écrit qu'une frappe dans un prompt coûtait 7 à 9 ms de rendu et que seul le découpage de `App.tsx` réduirait ce coût. C'était inexact, pour deux raisons trouvées en affichant chaque rendu séparément :

- La moyenne mélangeait deux choses : le rendu visible (environ 2 ms par frappe) et le re-rendu de tous les onglets masqués, que React fait en arrière-plan après chaque mise à jour de `App` (90 à 300 ms par rafale, relancé à chaque frappe).
- En développement, React capture une pile d'appels pour les 10 000 premiers éléments créés chaque seconde. Le même rendu coûtait donc 2 ms ou 12 ms selon ce qui avait été créé juste avant. Le harnais neutralise maintenant cette capture ; les chiffres ci-dessous sont pris ainsi. Les mesures des étapes 0 et 1 ont été prises avec cette capture active : leurs valeurs absolues sont surestimées, mais la conclusion de l'étape 1 tient, puisque `App` ne se re-rend plus du tout pendant la progression (0,4 à 0,9 ms par tick aujourd'hui).

Le coût réel était donc le re-rendu des onglets masqués, pas le rendu de l'onglet visible.

**Correction.** Un onglet masqué garde son dernier rendu tant qu'il reste masqué. Il est mis à jour au moment où il est affiché. Ce qui continue de fonctionner pendant qu'il est masqué : ses propres changements d'état (un travail en cours qui se termine) et un Reset (les cinq panneaux de Fun sont toujours réinitialisés ensemble).

Mesure dans la même session, d'abord avec les onglets masqués re-rendus comme avant (témoin), puis avec la correction. Séries de 20 mises à jour :

| Mise à jour | Témoin : rendu total / page occupée | Après : rendu total / page occupée |
| --- | --- | --- |
| Frappe dans un prompt | 153 ms / 286 ms | **49 à 73 ms / 24 à 29 ms** |
| Compteur de jetons | 312 ms / 593 ms | **50 à 97 ms / 22 à 44 ms** |
| Message de synchronisation Drive | 328 ms / 616 ms | **49 à 80 ms / 15 à 28 ms** |
| Modification puis changement d'onglet | 231 ms / 457 ms | 156 à 167 ms / 311 à 350 ms |

Le rendu visible d'une frappe reste à environ 2 ms dans les deux cas. Le changement d'onglet n'est pas plus lent : son rendu le plus long est du même ordre dans les deux cas (27 à 28 ms). Le témoin a été mesuré une fois, la correction cinq fois.

Vérifications ajoutées au harnais `profile:renders` :

- Un champ modifié pendant que son onglet est masqué est à jour dès que l'onglet est affiché (application réelle).
- Le conteneur seul : une mise à jour du parent attend, l'état propre du panneau continue de s'afficher, un Reset s'applique tout de suite, l'onglet est à jour à l'affichage. Contrôle négatif fait : sans la règle du Reset, cette vérification échoue.
- `check:tabs` donne exactement le même relevé des 13 onglets (première visite et retour) avec et sans la correction.

Le harnais affiche aussi, avec `LAWIZ_PROFILE_COMMITS=1`, la durée de chaque rendu et les composants qui y ont passé du temps.

### 2026-11-19 — Décisions sur 2d et sur le reste de 2g

**2d — catalogue ComfyUI hors du store : non fait, volontairement.** Le catalogue garde déjà la même identité tant qu'il ne change pas, les contrôles coûteux du store sont désactivés, et les panneaux qui l'affichent doivent de toute façon se re-rendre quand il change. Le déplacer toucherait `selectIsReadyToGenerate` (des tests lisent son texte), `App`, deux panneaux et cinq ou six harnais de test, sans gain mesurable. Faisable si souhaité.

**2g — découpage de `App.tsx` : la partie performance est faite, le découpage du fichier ne l'est pas.** Avec la correction de l'étape 7, une frappe coûte environ 2 ms de rendu ; découper le fichier n'apporterait plus de gain mesurable. Il reste un intérêt de lisibilité (le fichier fait environ 2000 lignes). Ce découpage déplacerait le code des onglets Image Generator, Character et Library, que plusieurs tests lisent comme texte, et que B5 va de toute façon réécrire avec le kit. Proposition : le faire pendant B5, onglet par onglet, plutôt que deux fois. Décision à prendre par l'utilisateur.

### 2026-11-19 — Vérification finale de B2

| Vérification | Après les étapes 0 à 3 | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 966 tests : 952 réussis, 0 en échec, 14 ignorés | 972 tests : **958 réussis, 0 en échec, 14 ignorés** |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,98 s |
| `check:locks` | 13/13 | 13/13, panneau monté dans `TabActivity` |
| `check:tab-jobs` | 6/6 | 6/6, panneau monté dans `TabActivity` ; le contrôle négatif échoue toujours comme prévu (2 scénarios) |
| `check:ui` | 12/12 | 12/12 sur 19 exécutions ; 3 exécutions anormales sur 22 (voir « À régler », point 3) |
| `check:tabs` | Aucun listbox désactivé ou vide à tort | Relevé identique |
| `profile:renders` | Progression vérifiée | 5 vérifications réussies ; mesures ci-dessus |

Non vérifié : aucune exécution dans Electron ; aucune génération réelle. Le comportement des onglets masqués n'est vérifié que dans le navigateur, avec ComfyUI simulé.

### État de B2

| Élément du plan | État |
| --- | --- |
| 2a — sélecteurs par champ | **Fait** pour ce qui coûtait : génération dans `App`, trois panneaux, fenêtres Library. `App` lit encore le compteur de jetons et les messages Drive ; cela coûte environ 2 ms de rendu par mise à jour depuis l'étape 7. |
| 2b — progression hors du rendu de `App` | **Fait** (étape 1). |
| 2c — `activePicker` unique | **Fait** (étape 5). |
| 2d — catalogue ComfyUI hors du store | **Non fait, volontairement** (voir ci-dessus). |
| 2e — verrou par propriétaire | **Fait** (étape 4). |
| 2f — effets de bord hors des reducers | **Fait** (étape 6). |
| 2g — découper `App.tsx` | Performance : **fait** (étape 7). Découpage du fichier : **non fait**, proposé pendant B5. |
| 2h — rafraîchissement de la Library | **Fait** pour la partie qui se répétait (étape 3). |

Décisions de l'utilisateur (2026-11-19) : le découpage du fichier `App.tsx` se fera pendant B5, onglet par onglet ; 2d est abandonné. **B2 est clos.**

---

## B1 — Code mort, retrait de FLUX 1 / Nunchaku et de WAN 2.2

### 2026-11-19 — Étape 1 : rapport d'atteignabilité (aucune suppression)

Méthode : graphe des imports à partir de `index.tsx`, `vite.config.ts` et de l'entrée Electron, tests et scripts exclus (248 fichiers source, 223 atteints), puis recherche de chaque nom dans tout le dépôt, tests compris.

**A. Fichiers que rien n'importe** (tous suivis par git, donc récupérables) :

| Fichier | Constat |
| --- | --- |
| `components/ApiKeyModal.tsx`, `DirectoryPickerModal.tsx`, `HistoryPanel.tsx`, `LocalPathModal.tsx`, `ResultsDisplay.tsx` | Vides (0 octet) |
| `services/fileSystemLibraryService.ts`, `historyService.ts`, `userService.ts` | Vides (0 octet) |
| `.env.local.tsx` | Vide (0 octet) |
| `components/FeatureAnalysisModal.tsx`, `featureAnalysis.json` | Fenêtre jamais affichée ; son seul lecteur est ce fichier JSON, périmé |
| `assets/styleReferences.ts` | Aucun import |
| `components/groupPhotoFusion/icons.tsx` | Les panneaux du dossier importent `../icons` |
| `components/pastForward/Footer.tsx`, `components/pastForward/ui/draggable-card.tsx` | Aucun import |
| `components/pastForward/PolaroidCard.tsx`, `utils/cn.ts` | Aucun import ; `cn.ts` n'a que ce fichier pour utilisateur. `LICENSING.md` cite `PolaroidCard.tsx` (en-tête Apache-2.0) : à mettre à jour si le fichier part |
| `services/swapPersonService.ts` | Non utilisé par l'application ; un test (`swapPersonWorkflow.test.mjs`) l'exerce. Analyse automatique d'une personne et calcul de masque : fonction débranchée ou jamais branchée |

À conserver bien que non importés : `components/ui/Accordion.tsx`, `SettingsLayout.tsx`, `fields.tsx` (kit, pour B5), `components/ui/compileForTest.mjs` (tests), `electron/dev.cjs` (script npm), `metadata.json` (lu par Electron).

**B. Fichiers à la racine, hors code** :

| Fichier | Constat |
| --- | --- |
| `[full_path_of_file_1]`, `[full_path_of_file_2]` | 14 octets illisibles chacun ; ignorés par git, donc non récupérables |
| `.build-check/` | Sortie de build du 2026-10-14, 35 Mo. `index.html` est suivi par git ; les 4 autres fichiers sont ignorés. Rien n'y fait référence |
| `commit_message.txt` | Suivi par git ; aucun usage par le code |
| `reddit-post-draft.txt` | Brouillon personnel, ignoré par git, donc non récupérable |

**C. WAN 2.2 vidéo : déjà inatteignable.** `generateComfyUIVideo` n'a aucun appelant. Code mort qui en dépend : cette fonction, les modèles `COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE` et `COMFYUI_WAN22_T2I_WORKFLOW_TEMPLATE`, les constantes `WAN_VIDEO_PROMPT_BLOCKS`, `WAN_T2V_ASPECT_RATIO_OPTIONS`, `COMFYUI_T2I_WORKFLOWS`, `COMFYUI_I2I_WORKFLOWS` (aucun lecteur), environ 57 champs `comfyVid*` dans `types.ts` et 48 valeurs par défaut dans `generationSlice.ts`, et dans `videoSlice.ts` : `generatedVideoUrl`, `generationOptionsForSave`, `selectIsVideoReady`, `setVideoStartFrame`, `setVideoEndFrame`.

**D. Famille FLUX 1 dans Image Generator :**

| Workflow | Dans le sélecteur de modèles | Atteignable autrement |
| --- | --- | --- |
| FLUX (FLUX 1 standard) | **Oui** | Bouton « utiliser dans le générateur » de Models/LoRAs pour un modèle de famille FLUX |
| Nunchaku Kontext, Nunchaku Flux Image | Non | Seulement en rechargeant un ancien élément de Library ou un preset |
| FLUX Krea | Non | Idem |
| WAN 2.2 image | Non | Idem |

Code concerné : 5 modèles de workflow dans `constants.ts`, les branches correspondantes de `getImageWorkflow` (`comfyUIService.ts`), `OptionsPanel.tsx`, `LoraSettingsPanel.tsx`, `SamplerSettingsPanel.tsx`, `App.tsx`, `ImageGeneratorHeader.tsx`, `ImageGrid.tsx`, la ligne FLUX des diagnostics d'installation, et les champs `comfyNunchaku*` (18), `comfyWan*` (16), `comfyFlux*` (22) de `types.ts`. Tests qui nomment ces familles : `civitaiService.test.mjs`, `imagePromptImport.test.mjs`, `h3Style.test.mjs`, `imagePromptService.test.mjs`, `mossStyle.test.mjs`. Documentation : `README.md` (1 mention), `docs/features/images-and-characters.md` (1), `COMFYUI_REQUIRED_NODES.txt` (22).

Ce qui reste en place dans tous les cas : la famille FLUX dans l'inventaire Models/LoRAs ; l'affichage des anciens éléments de Library et presets (y compris leurs réglages FLUX 1) ; le type de prompt `wan-video` de la Library.

**E. Prompt Generator :** il propose des formats de prompt FLUX, Nunchaku, FLUX Krea et WAN 2.2, et une catégorie « WAN video ». Ce sont des textes, sans workflow. Hors du périmètre décidé (« débrancher FLUX 1 / Nunchaku et WAN 2.2 vidéo ») tant que l'utilisateur ne le demande pas.

### 2026-11-19 — Décisions de l'utilisateur sur le rapport

- A : tout supprimer, y compris `PolaroidCard.tsx` + `utils/cn.ts` (avec mise à jour de `LICENSING.md`) et `swapPersonService.ts` (avec la partie du test qui l'exerce).
- B : supprimer `[full_path_of_file_1]`, `[full_path_of_file_2]`, `.build-check/` et `commit_message.txt`. **Garder `reddit-post-draft.txt`.**
- D : retirer les quatre workflows d'Image Generator (FLUX 1, Nunchaku, FLUX Krea, WAN 2.2 image).
- E : retirer aussi du Prompt Generator les formats FLUX, Nunchaku, FLUX Krea, WAN 2.2 et la catégorie « WAN video ».

### 2026-11-19 — Étape 2 : suppression des fichiers morts

Supprimés (21 fichiers et un dossier) : les 9 fichiers vides, `components/FeatureAnalysisModal.tsx`, `featureAnalysis.json`, `assets/styleReferences.ts`, `components/groupPhotoFusion/icons.tsx`, `components/pastForward/Footer.tsx`, `components/pastForward/PolaroidCard.tsx`, `components/pastForward/ui/draggable-card.tsx` (et le dossier `ui` devenu vide), `utils/cn.ts`, `services/swapPersonService.ts`, `commit_message.txt`, `[full_path_of_file_1]`, `[full_path_of_file_2]`, et le dossier `.build-check/` (5 fichiers, 35 Mo).

Fichiers touchés : `LICENSING.md` (ne cite plus `PolaroidCard.tsx`), `services/swapPersonWorkflow.test.mjs` (3 tests retirés : ils n'exerçaient que le service supprimé ; les 13 autres réussissent).

Conséquence : les dépendances `clsx` et `tailwind-merge` de `package.json` n'avaient plus aucun utilisateur dans le code. Elles ont été désinstallées plus tard, avec l'accord de l'utilisateur (voir « Documentation, diagnostics et dépendances »).

Non supprimables par git : les deux fichiers `[full_path_of_file_…]` et les 4 fichiers ignorés de `.build-check/` ne sont pas récupérables. `.build-check/index.html` et les autres fichiers le sont (`git restore`).

### 2026-11-19 — Étape 3 : code mort de WAN 2.2 vidéo

Fichiers touchés : `services/comfyUIService.ts`, `constants.ts`, `types.ts`, `store/generationSlice.ts`, `store/videoSlice.ts`.

- `generateComfyUIVideo` (aucun appelant) et ses deux modèles de workflow sont supprimés.
- Constantes sans lecteur supprimées : `WAN_VIDEO_PROMPT_BLOCKS`, `WAN_T2V_ASPECT_RATIO_OPTIONS`, `COMFYUI_T2I_WORKFLOWS`, `COMFYUI_I2I_WORKFLOWS`.
- 57 champs `comfyVid*` retirés du type des options, et leurs 49 valeurs par défaut. Le champ `comfyVidWanI2VPositivePrompt` reste dans le type : la Library l'affiche pour les anciens éléments.
- `videoSlice` : 4 champs d'état, 6 actions et un sélecteur, tous sans utilisateur, sont retirés. Les outils vidéo (onglet Tools) ne sont pas touchés.

Effet sur les données : un nouveau preset ou élément de Library ne contient plus ces champs. Les anciens, qui les contiennent, se chargent comme avant ; les champs en trop sont ignorés.

Vérification : 969 tests (955 réussis, 0 en échec, 14 ignorés ; 3 de moins qu'avant, ceux retirés à l'étape 2), typecheck à 18 erreurs dans les mêmes fichiers, aucune occurrence restante des noms supprimés.

### 2026-11-19 — Étape 4 : retrait de FLUX 1, Nunchaku, FLUX Krea et WAN 2.2 image d'Image Generator

Fichiers touchés : `constants.ts`, `services/comfyUIService.ts`, `types.ts`, `store/generationSlice.ts`, `App.tsx`, `components/ImageGeneratorHeader.tsx`, `components/OptionsPanel.tsx`, `components/LoraSettingsPanel.tsx`, `components/SamplerSettingsPanel.tsx`, `components/ImageGrid.tsx`, `components/CivitaiInventoryPanel.tsx`, `services/civitaiService.ts`, `services/installationDiagnostics.ts`, `services/characterResults.test.mjs` et `services/civitaiService.test.mjs` (un test ajouté dans chacun).

Ce qui est retiré :

- La famille « FLUX » du sélecteur de modèles.
- Les cinq modèles de workflow et leurs branches de construction ; les sections correspondantes du panneau d'options (162 lignes), des LoRA et du sampler.
- 46 champs d'options devenus sans lecteur (`comfyNunchaku*`, `comfyWan*`, FLUX Krea, CLIP et VAE de FLUX 1) et les deux types Nunchaku.
- La ligne « FLUX » des diagnostics d'installation et la lecture du chargeur Nunchaku.

Ce que fait maintenant l'application devant un ancien élément :

| Situation | Comportement |
| --- | --- |
| Preset ou élément de Library ComfyUI enregistré avec un workflow retiré, chargé dans le générateur | Rien n'est chargé ; un message « Workflow removed » explique que l'élément reste disponible dans la Library |
| Élément d'un fournisseur cloud qui porte seulement, dans ses réglages, le nom d'un workflow retiré | Chargé normalement ; le type de workflow ComfyUI revient à celui par défaut |
| Affichage de ces éléments dans la Library (réglages FLUX 1 compris) | Inchangé |
| Bouton « Use » de Models/LoRAs sur un modèle FLUX 1 | Message : le workflow FLUX 1 a été retiré. Sans cette règle, le modèle serait retombé sur le workflow SD 1.5 |
| Demande de génération avec un workflow retiré (chemin inattendu) | Erreur explicite, aucun envoi à ComfyUI |

Conservé : le type `ComfyModelType` garde les anciennes valeurs, que portent les éléments enregistrés ; la famille FLUX reste dans l'inventaire Models/LoRAs (dossiers, filtres, téléchargements) ; les champs `comfyFluxGuidance` et `comfyFluxLora*` restent dans le type parce que la Library les affiche.

Écart de méthode à signaler : les grosses suppressions mécaniques ont été confiées à des agents auxiliaires, avec une liste exacte, puis vérifiées par moi. L'un d'eux s'est arrêté sans rapport, en laissant deux fichiers de test en échec au chargement (un import ajouté dans `generationSlice.ts`, que ces tests compilent isolément). Je l'ai trouvé par la suite de tests, corrigé, et j'ai terminé moi-même la partie Models/LoRAs.

Reste à trancher : dans `OptionsPanel.tsx`, une expression régulière accepte encore le préfixe `Flux` pour les champs de LoRA ; elle est sans effet et je l'ai laissée.

### 2026-11-19 — Vérification après les étapes 2 à 4

| Vérification | Fin de B2 | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | 971 tests : **957 réussis, 0 en échec, 14 ignorés** (3 retirés, 2 ajoutés) |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,86 s |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Relevé de référence | Relevé identique ligne pour ligne, aucune erreur de page |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Taille des fichiers après B1 (lignes) : `constants.ts` 909, `comfyUIService.ts` 2912, `OptionsPanel.tsx` 1812, `types.ts` 1093.

Non vérifié : aucune exécution dans Electron ; aucune génération réelle ; le message « Workflow removed » n'a pas été déclenché à la main avec un vrai élément de Library (il est couvert par un test du store et par la lecture du code des trois points de chargement).

### 2026-11-19 — Étape 5 : formats de prompt et destinations

Fichiers touchés : `utils/promptDestination.ts`, `components/PromptGeneratorPanel.tsx`, `utils/imagePromptStyle.ts`, `services/ollamaService.ts`, `services/imagePromptService.test.mjs`, `utils/imagePromptImport.test.mjs`, `services/characterResults.test.mjs`.

- **Oubli de l'étape 4 corrigé** : la fenêtre « Use Prompt In… » (Prompt Generator et Library) proposait encore la destination « FLUX », qui basculait le générateur sur le workflow retiré. Elle est retirée, et le test des workflows retirés vérifie maintenant aussi cette liste.
- Prompt Generator : le format « Descriptive (FLUX) » est retiré. Restent « Narrative », « Prompt Segment (FLUX2) », « Sentence (SDXL) » et « Keywords (SD1.5) ».
- Les styles d'instruction propres à FLUX 1, Nunchaku et FLUX Krea sont retirés des deux services de rédaction de prompt.
- Constat : la catégorie « WAN video » et le format « WAN 2.2 » n'étaient déjà plus proposés dans le Prompt Generator ; il n'en restait que des types et une couleur de vignette, retirés.

Conservé volontairement : le type de prompt `wan-video` de la Library. Malgré son nom, c'est le type sous lequel l'onglet Video enregistre et relit ses prompts vidéo ; le retirer rendrait ces éléments illisibles.

### 2026-11-19 — Documentation, diagnostics et dépendances

Fichiers touchés : `README.md`, `docs/features/images-and-characters.md`, `docs/reference/comfyui-workflows.md`, `COMFYUI_REQUIRED_NODES.txt`, `services/installationDiagnostics.ts`, `package.json`, `package-lock.json`.

- `README.md` : les lignes de remerciement de ComfyUI-nunchaku et de VRGameDevGirl Custom Nodes sont retirées, ces paquets n'étant plus utilisés.
- `docs/` : la liste des workflows locaux et la section « Legacy Flux and Qwen » (devenue « Legacy Qwen ») ne citent plus les workflows retirés.
- `COMFYUI_REQUIRED_NODES.txt` : 12 classes de nœuds qui ne servaient qu'aux workflows retirés sont supprimées de l'inventaire (vérifié : elles n'apparaissent plus dans aucun workflow du code, et figuraient dans les modèles supprimés). Les paquets [03] ComfyUI-nunchaku et [16] VRGameDevGirl sont marqués « no longer required » plutôt que renumérotés. Les mentions « Used by » de GGUF, KJNodes, VideoHelperSuite et rgthree décrivent leurs usages actuels. Les totaux passent à 51 natifs, 34 externes, 22 dépôts, par soustraction : **aucun nouvel audit complet n'a été fait** (cela reste pour B6), et la note du fichier le dit.
- Diagnostics d'installation : les mêmes 12 classes sont retirées des listes vérifiées. Le tableau de bord ne signale donc plus comme manquants des nœuds dont l'application n'a plus besoin.
- Dépendances `clsx` et `tailwind-merge` désinstallées (accord de l'utilisateur).

### 2026-11-19 — Vérification finale de B1

| Vérification | Fin de B2 | Fin de B1 |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | 971 tests : **957 réussis, 0 en échec, 14 ignorés** (3 retirés, 2 ajoutés) |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,99 s, après la désinstallation des deux dépendances |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Relevé de référence | Relevé identique ligne pour ligne (26 visites), aucune erreur de page |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Non vérifié : aucune exécution dans Electron ; aucune génération réelle ; le message « Workflow removed » et l'alerte de Models/LoRAs ne sont couverts que par des tests, pas par un essai à la main avec de vrais éléments.

**B1 est clos.** Reste noté pour plus tard : l'expression régulière `Flux|` sans effet dans `OptionsPanel.tsx` ; l'audit complet de `COMFYUI_REQUIRED_NODES.txt` (B6).

---

## B5 — Migration des panneaux vers le kit

Règle de disposition appliquée à chaque panneau migré : à gauche, les images source puis quatre sections repliables dans cet ordre — Models, LoRAs, Sampler, Advanced ; à droite, le prompt, le bouton de génération et le résultat.

### 2026-11-19 — B5e (onglet Fun), étape 1 : harnais de comparaison

Fichier créé : `scripts/browser/panel-controls-audit.mjs` (`npm run check:panels`).

Ces panneaux n'avaient presque aucun test de leur interface. Le harnais ouvre l'application réelle (ComfyUI simulé), visite chaque panneau d'un groupe, déplie toutes ses sections et relève chaque contrôle : nom, type, valeur, choix, état désactivé. Il sert à trois choses :

- enregistrer un relevé avant une migration (`LAWIZ_AUDIT_OUT`) et le comparer après (`LAWIZ_AUDIT_BASELINE`) ;
- vérifier que chaque listbox et chaque champ numérique accepte une nouvelle valeur et l'affiche encore après le re-rendu (`LAWIZ_AUDIT_EXERCISE=1`) ;
- prendre une capture de chaque panneau (`LAWIZ_SCREENSHOT_DIR`).

Limite : le relevé « avant » de Swap Anything et de Stylise Anything ne contient pas leurs réglages avancés, que le harnais ne savait pas déplier (bouton sans état accessible). Pour ces deux panneaux, la comparaison porte sur les contrôles visibles ; les réglages avancés ont été repris un à un depuis le code.

### 2026-11-19 — B5e, étape 2 : Swap a Person, Swap Anything, Stylise Anything

Fichiers touchés : `components/SwapPersonPanel.tsx`, `components/SwapAnythingPanel.tsx`, `components/StyliseAnythingPanel.tsx`.

Ce qui change pour l'utilisateur dans ces trois panneaux :

- **Disposition standard.** Le bouton « FLUX2 settings » ou « Advanced » de l'en-tête disparaît ; les réglages sont dans les sections Models, LoRAs, Sampler et Advanced de la colonne de gauche, sous les images source.
- **Listes de modèles, LoRA et samplers** : listbox du kit avec recherche. Un modèle par défaut absent de l'installation s'affiche « (not listed) » au lieu d'apparaître comme un choix disponible.
- **Réglages numériques** : curseur avec champ de saisie manuelle, comme avant (voir l'étape 4 ci-dessous : une première version les avait remplacés par de simples champs numériques).
- **Seed** : champ du kit avec bouton « Random » et case « New seed for every run ». La case cochée correspond à l'ancienne valeur `-1` ; les workflows reçoivent la même chose qu'avant.
- **Prompts** : boîtes du kit avec le code couleur (prompt, instruction, lecture seule pour le prompt du résultat de Swap a Person, avec bouton Copy).
- Boutons et cases aux styles du kit.

Ce qui ne change pas : les valeurs par défaut, les bornes et les pas de chaque réglage, les libellés, les noms et identifiants des champs d'image, la logique de génération et d'enregistrement (code inchangé), les options envoyées aux workflows.

Autres points :

- `StyliseAnythingPanel` ne s'abonne plus à toutes les options de génération ; il les lit au montage et au moment de générer.
- Opacité sur couleur du thème (constat de B4) : les 3 classes de `StyliseAnythingPanel` sont remplacées. L'aspect est le même, ces classes n'ayant aucun effet.
- Dans Swap a Person, les listes de modèles ne mélangent plus la valeur courante aux choix du catalogue ; même comportement « (not listed) » que ci-dessus.

Comparaison avec le relevé d'avant (Swap a Person, les deux workflows) : même nombre de listbox (10 et 7), de curseurs (9 et 7) et de champs numériques (10 et 8), mêmes valeurs par défaut, mêmes champs de texte et cases ; seule la case de la seed s'ajoute.

### 2026-11-19 — B5e, étape 3 : l'onglet Fun sort de `App.tsx`

Fichier créé : `components/FunTab.tsx`. Fichier touché : `App.tsx` (2005 → 1984 lignes ; la barre de sous-onglets tenait sur une ligne de 2000 caractères).

`FunTab` contient la barre des cinq sous-onglets, leurs couleurs d'accent et les cinq panneaux, chacun dans son `TabActivity`. Le sous-onglet actif reste dans `App`, qui s'en sert pour l'en-tête et le bouton Reset. Même rendu, mêmes clés de réinitialisation.

### 2026-11-19 — B5e, étape 4 : les curseurs restent (décision de l'utilisateur)

Fichiers touchés : `components/ui/fields.tsx`, `components/ui/ui.test.mjs`, `scripts/browser/ui-kit-check.mjs`, `scripts/browser/panel-controls-audit.mjs`, les trois panneaux migrés.

La première version de l'étape 2 remplaçait les curseurs des réglages par de simples champs numériques, comme le kit le faisait. L'utilisateur veut garder les curseurs avec l'ajustement manuel. **Règle du kit, valable pour toute la suite de B5 : un réglage numérique borné est un curseur accompagné d'un champ de saisie ; seuls les nombres sans bornes utiles (seed) restent un champ seul.**

- `NumberField` accepte `slider` : curseur à gauche, champ à droite, les deux synchronisés. Le champ garde le nom accessible du réglage ; le curseur porte le même nom suivi de « slider ».
- `SamplerFields` (steps, CFG, denoise) et `LoraSlots` (force) utilisent ce curseur.
- Dans les trois panneaux, tous les réglages qui étaient des curseurs le sont de nouveau, avec les mêmes bornes et les mêmes pas.
- Les harnais vérifient le curseur : `check:ui` (le champ suit le curseur et inversement), `check:panels` (chaque curseur bouge et garde sa valeur).

### 2026-11-19 — Vérification de B5e, étapes 1 à 4

| Vérification | Fin de B1 | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 971 tests : 957 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,99 s |
| `check:panels` avec exercice | — | 6 relevés sur 6 : tous les listbox, curseurs et champs numériques acceptent et affichent une nouvelle valeur (28 et 22 dans Swap a Person, 26 dans Swap Anything, 13 dans Stylise Anything, 26 dans Past Forward), aucune erreur de page |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Relevé de référence | Relevé identique, aucune erreur de page |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues : Swap a Person avec les curseurs ; Swap Anything et Stylise Anything avant le retour des curseurs seulement.

Non vérifié : aucune génération, même simulée, n'a été lancée depuis ces trois panneaux après la migration ; le code de génération n'a pas changé, mais le trajet « réglage modifié → requête envoyée » n'est couvert que jusqu'à l'affichage de la valeur. Aucune exécution dans Electron.

### 2026-11-19 — B5e, étape 5 : Photo Fusion

Fichiers touchés : `components/groupPhotoFusion/GroupPhotoFusionPanel.tsx`, `ImagePreview.tsx`, `PoseSelector.tsx`, `QualitySelector.tsx` (même dossier).

**Écart assumé à la règle de disposition.** Photo Fusion n'a pas de prompt : c'est un parcours par étapes (photos, arrière-plan, pose, qualité, réglages, nombre d'images, génération). Ce parcours est conservé tel quel. Seuls les réglages FLUX2 et QWEN-Edit prennent la forme standard : un titre suivi des sections repliables Models, LoRAs, Sampler et Advanced, fermées au départ, à la place du bloc unique « Advanced Settings ».

- Listes de modèles, LoRA, samplers et schedulers : listbox du kit avec recherche ; même comportement « (not listed) » qu'à l'étape 2.
- Réglages numériques bornés : curseur avec champ de saisie, mêmes bornes et mêmes pas. Le nombre d'images à générer (1 à 4) devient lui aussi un curseur avec champ.
- Seed : champ « Seed (-1 = random) », liste Seed Control et curseur Seed Step affiché seulement pour Increment et Decrement, comme avant.
- Boutons du préréglage Lightning (4 et 8 étapes) conservés.
- Barre du moteur (modèle, taille et niveau de réflexion Gemini, modèle Mammouth) et choix de l'expression de chaque sujet : listbox du kit, noms accessibles inchangés.
- Opacité sur couleur du thème : 7 classes remplacées. Une conséquence visible : le détail d'une erreur de génération, jusqu'ici invisible, s'affiche en rouge.

Comparaison avec le relevé d'avant, pour les quatre moteurs : même nombre de contrôles (28, 25, 12 et 10), mêmes noms, mêmes valeurs, même nombre de curseurs ; seul le type des listes change (liste native → listbox du kit).

### 2026-11-19 — B5e, étape 6 : Past Forward

Fichiers touchés : `components/pastForward/PastForwardPanel.tsx`, `scripts/browser/panel-controls-audit.mjs`.

Même écart et même traitement que Photo Fusion : la disposition « 1. Source & Theme » à gauche, résultats par décennie à droite, est conservée.

- Les blocs « FLUX2 Advanced Settings » et « QWEN-Edit Advanced Settings » deviennent un titre suivi des sections standard : Models, Sampler et Advanced pour FLUX2 (ce panneau n'a jamais eu de LoRA FLUX2, aucune n'est ajoutée) ; Models, LoRAs, Sampler et Advanced pour QWEN-Edit. La case « Enable Lightning LoRA » est dans la section LoRAs ; CacheDiT est dans Advanced.
- Le préréglage Lightning de QWEN-Edit est maintenant visible sans déplier de bloc.
- Mêmes valeurs par défaut, mêmes bornes et mêmes pas pour les dix réglages numériques, tous en curseur avec champ.
- Barre du moteur : listbox du kit, noms accessibles inchangés, indicateurs de chargement conservés.
- Les six groupes de listes par décennie (coiffure, événement historique, vêtements, lieu, type de photo, plan et angle) : listbox du kit, noms accessibles inchangés. Chaque ligne est un `div` au lieu d'un `label` ; cliquer sur « 1950s » ne donne donc plus le focus à la liste.
- Opacité sur couleur du thème : 9 classes remplacées. Deux conséquences visibles : le texte d'erreur d'une décennie en échec, jusqu'ici invisible, s'affiche en rouge ; le cadre des cartes de résultat actives prend la couleur d'accent au lieu du blanc par défaut (c'est ce que le code demandait).
- Retirés : l'état `advancedOpen`, la fonction `withCurrent`, les imports `NumberSlider` et `SelectInput`.

Harnais : une variante peut enchaîner des clics (boutons, cases). Past Forward a six relevés : les quatre moteurs, puis « woman reimagined » et « historical », qui font apparaître les listes conditionnelles.

Comparaison avec le relevé d'avant, pour les quatre moteurs : même nombre de contrôles (36, 38, 10 et 8), mêmes valeurs, même nombre de curseurs (5 et 5) ; les 12 listes de vêtements et de lieux ont les mêmes noms, valeurs et nombres de choix. Limite : les listes de coiffure, d'événement historique, de type de photo et de plan n'ont pas de relevé « avant » (les variantes qui les affichent ont été ajoutées après la migration). Elles sont vérifiées par l'exercice et par relecture du code.

### 2026-11-19 — Vérification finale de B5e

| Vérification | Étapes 1 à 4 | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 971 tests : 957 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,83 s |
| `check:panels` avec exercice | 6 relevés sur 6 | 14 relevés sur 14 : Photo Fusion 22, 20, 6 et 5 contrôles modifiés ; Past Forward 26, 28, 3, 1, 44 et 32 ; Swap Anything 26 ; Swap a Person 28 et 22 ; Stylise Anything 13 |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Relevé identique | Relevé identique (26 lignes de visite, 0 différence) |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Les deux remplacements de classe dans `PoseSelector.tsx` et `QualitySelector.tsx` ont été faits après ces passages ; le typecheck a été relancé ensuite (18 erreurs, mêmes fichiers).

Captures relues : Photo Fusion (FLUX2), Past Forward (QWEN-Edit et « woman reimagined »), Swap Anything et Stylise Anything avec les curseurs. Dans le ComfyUI simulé, le sampler par défaut de Swap Anything (`ddim`) s'affiche « (not listed) » parce que le catalogue simulé ne le contient pas.

Non vérifié : aucune génération, même simulée, n'a été lancée depuis les cinq panneaux après la migration ; le code de génération n'a pas changé, mais le trajet « réglage modifié → requête envoyée » n'est couvert que jusqu'à l'affichage de la valeur. Les états en cours de génération, les cartes de résultat remplies et les messages d'erreur n'ont pas été vus à l'écran. Aucune exécution dans Electron.

### État de B5e

**Terminé.** Les cinq panneaux de l'onglet Fun utilisent le kit : plus aucun `select` brut ni composant de `InputComponents` pour les listes et les curseurs (`TextInput` reste utilisé dans Swap Anything et Stylise Anything), plus aucune classe d'opacité sur couleur du thème dans ces fichiers.

Reste de B5, dans l'ordre prévu : B5a Image Generator, B5b Character, B5c Scene Variation, B5d Video, B5f Tools, B5g Library / Models / Settings.

### 2026-11-19 — B5a (Image Generator), étape 1 : relevé de référence

Fichier touché : `scripts/browser/panel-controls-audit.mjs`.

- Nouveau groupe `image` (`LAWIZ_AUDIT_GROUP=image`) : 22 variantes, une par workflow (SD 1.5 T2I, Refine, I2I ; SDXL ; QWEN T2I et Edit ; QWEN 2.1 T2I et Turbo ; Z-Image ; FLUX2 Simple et Edit ; KREA2 Simple, RAW et Edit ; MOSS Image et PHOTO) et par fournisseur cloud (Mammouth et Gemini, T2I et I2I, Inpaint, Compose).
- Le relevé contient maintenant les bornes et le pas de chaque curseur et de chaque champ numérique.
- Le catalogue simulé propose deux modèles valides par famille. Un listbox passe l'exercice dès qu'un autre choix est conservé (voir le constat ci-dessous).
- Relevé pris avant toute modification : `%TEMP%\lawiz-image-controls-before.json`, captures dans `%TEMP%\lawiz-image-shots-before`.

Constat (existant, non modifié) : dans Image Generator, la liste des modèles propose tous les fichiers du type (par exemple tous les GGUF), mais un effet du panneau remet aussitôt un modèle de la famille du workflow si on en choisit un d'une autre famille. La liste offre donc des choix qui ne peuvent pas être gardés. À décider : filtrer la liste, ou laisser choisir librement.

### 2026-11-19 — B5a, étape 2 : tous les anciens curseurs passent au kit

Fichiers touchés : `components/InputComponents.tsx`, `components/ui/fields.tsx`, `services/styleSampling.test.mjs`.

`NumberSlider` et `CheckboxSlider` deviennent des enveloppes du curseur du kit, comme `SelectInput`, `TextInput` et `MenuSelect` depuis B4. **Effet dans tous les onglets, y compris ceux qui ne sont pas encore migrés** : chaque curseur a son champ de saisie manuelle (beaucoup n'en avaient pas), le même style, et un nom accessible (le champ porte le nom du réglage, le curseur le même nom suivi de « slider »). Le libellé n'affiche plus la valeur (« Steps: 10 » devient « Steps »), puisque le champ la montre.

Bornes, pas, valeurs par défaut et fonctions appelées : inchangés. Le test `styleSampling` lisait « Steps: 10 » dans le balisage ; il lit maintenant la valeur du curseur.

### 2026-11-19 — B5a, étape 3 : disposition standard d'Image Generator

Fichiers touchés : `App.tsx`, `components/OptionsPanel.tsx`, `components/LoraSettingsPanel.tsx`, `components/SamplerSettingsPanel.tsx`, `components/Qwen21SettingsPanel.tsx`, `components/MossSettingsPanel.tsx`, `components/Krea2EditSettingsPanel.tsx`, `components/ActionControlPanel.tsx`, `components/ImageGeneratorHeader.tsx`, et trois tests (`styleSampling`, `krea2Style`, `civitaiService`).

Ce qui change pour l'utilisateur :

- **Colonne de gauche** : image source, puis les sections repliables Models, LoRAs, Sampler et Advanced, dans cet ordre. Les panneaux LoRA et Sampler, qui étaient à droite sous les résultats, sont maintenant à gauche. Ils restent ouverts par défaut comme avant ; Models et Advanced restent fermés comme avant.
- **Colonne de droite** : une carte « Prompt » (prompts, bouton Import Library Prompt, exemples de prompts, « Generate Prompt from Source »), puis la barre Generate, puis les résultats. Les prompts étaient à gauche.
- **Listes de modèles, LoRA, samplers et schedulers** : listbox du kit avec recherche. Un modèle absent de l'installation s'affiche « (not listed) ».
- **Barre Generate** : format, résolution et nombre d'images sont des contrôles du kit avec leur libellé ; le nombre d'images, les mégapixels de Z-Image et de FLUX2 Edit ont un curseur et un champ.
- **Refine** (SD 1.5, SDXL, QWEN, Z-Image) : Denoise Strength et Megapixels ont un curseur et un champ.
- **Liste des presets** de l'en-tête : listbox du kit.
- **KREA2 Edit, MOSS Image, QWEN 2.1** : même découpage (Models, LoRAs, Sampler, Advanced à gauche ; prompts à droite). Dans KREA2 Edit, le constructeur de prompt est dans la carte Prompt. Tous leurs `select` bruts passent au kit.
- **Cloud (Mammouth, Gemini)** : le prompt, l'instruction d'édition, la tâche d'inpainting et les instructions de composition sont dans la carte Prompt ; le modèle, le masque et les images d'éléments restent à gauche.

Écarts assumés, à confirmer par l'utilisateur :

1. **FLUX2 Edit garde sa disposition** : instruction d'édition à gauche ; style, source, références et LoRA additionnels dans l'espace de travail de droite. Un test existant décrit cette disposition comme voulue (`flux2Style` : « i2i keeps the editing prompt on the left… »). Seuls ses réglages passent en sections Models / Sampler / Advanced.
2. **MOSS PHOTO n'est pas migré** : ce panneau a sa propre structure guidée et un test qui en vérifie l'ordre. Ses curseurs sont au kit (étape 2), ses 5 `select` bruts et ses champs numériques restent à faire.
3. Les quatre panneaux QWEN 2.1 I2I (Multi Images, Consistency, Turbo, Remove Background) sont affichés dans Image Generator mais appartiennent à B5c dans le plan ; ils ne sont pas touchés.

Détails techniques :

- `OptionsPanel` reçoit `promptContainer` (élément de la colonne de droite qui reçoit la carte Prompt par portail, même mécanisme que l'espace de travail FLUX2 Edit) et `settingsSlot` (sections LoRAs et Sampler, placées entre Models et Advanced). Sans ces propriétés, l'onglet Character garde exactement son rendu.
- `Qwen21SettingsPanel`, `MossSettingsPanel` et `Krea2EditSettingsPanel` acceptent les sections `models`, `prompt` et `advanced` en plus de `main`, `loras` et `sampler`.
- Trois tests lisaient l'ancien balisage : `styleSampling` (valeur du scheduler), `krea2Style` (composants fournis au panneau LoRA ; le titre ne dit plus « right-hand »), `civitaiService` (composants fournis aux branches MOSS et QWEN). Leurs vérifications de comportement sont inchangées.

Comparaison avec le relevé d'avant, sans exercice, sur les 22 variantes : aucun contrôle nommé manquant, aucune valeur différente, tous les curseurs retrouvés avec les mêmes bornes, le même pas et la même valeur. Différences, toutes expliquées : le nombre d'images et les mégapixels de FLUX2 Edit gagnent un curseur ; les listes sans nom (preset, format, résolution) ont maintenant un nom ; le checkpoint SD 1.5 a une valeur parce que le catalogue simulé en propose désormais ; une liste de modèles vide affiche « Select a model » au lieu de « Select... » (BBOX et SAM) ; la case CacheDiT de FLUX2 Edit apparaît parce que le harnais sait maintenant déplier la section Advanced.

### 2026-11-19 — Vérification de B5a, étapes 1 à 3

| Vérification | Fin de B5e | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 971 tests : 957 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,85 s |
| `check:panels` Image Generator, avec exercice | — | 22 variantes sur 22, aucune erreur de page |
| `check:panels` Fun, avec exercice | 14/14 | 14/14 |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Relevé de référence | Seules les deux lignes d'Image Gen changent : 11 listes natives → 3 natives + 8 du kit (10 → 3 + 7 au retour), aucune désactivée ni vide. Nouvelle référence enregistrée |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues : SDXL, KREA2 Edit, FLUX2 Edit, Gemini Inpaint. Après ces captures, Steps et CFG de la section Sampler sont passés sur toute la largeur (ils étaient à l'étroit côte à côte) ; ce dernier ajustement n'a pas été revu en capture.

Non vérifié : aucune génération, même simulée, n'a été lancée depuis Image Generator après ces changements ; le code de génération n'a pas été modifié, mais le trajet « réglage modifié → requête envoyée » n'est couvert que jusqu'à l'affichage de la valeur. Chargement d'un preset, « Generate Prompt from Source », exemples de prompts et import d'un prompt de la Library : non exercés dans le navigateur. Les captures des 18 autres variantes n'ont pas été relues. Aucune exécution dans Electron.

### 2026-11-19 — B5a, étape 4 : décisions de l'utilisateur sur les trois écarts

Décisions : (1) FLUX2 Edit s'aligne sur la règle ; (2) toujours filtrer les listes quand c'est possible, surtout les LoRA ; (3) MOSS PHOTO garde son ordre, seuls ses contrôles changent. Les écarts 1 et 2 de l'étape 3 sont donc levés.

Fichiers touchés : `components/OptionsPanel.tsx`, `App.tsx`, `services/styleLibrary.ts`, `components/LoraSettingsPanel.tsx`, `components/Qwen21SettingsPanel.tsx`, `components/MossSettingsPanel.tsx`, `components/Krea2EditSettingsPanel.tsx`, `components/MossPhotoSettingsPanel.tsx`, les cinq panneaux Fun, et quatre tests (`flux2Style`, `krea2Style`, `mossPhotoWorkflow`, `styleLibrary`).

**1. FLUX2 Edit à la disposition standard.** À gauche : style, image source et références, puis Models, LoRAs (les deux LoRA additionnels), Sampler, Advanced. À droite : la carte Prompt avec l'instruction d'édition, puis Generate et les résultats. L'espace de travail séparé de droite n'existe plus (`flux2EditWorkspaceContainer` retiré). Le test `flux2Style` qui décrivait l'ancienne disposition est réécrit : il vérifie maintenant l'ordre des sections et que l'instruction va dans la carte Prompt.

**2. Listes filtrées par famille.** Nouvelle fonction partagée `familyFiles(fichiers, famille, inventaire)` dans `services/styleLibrary.ts`. Un fichier appartient à la famille si My Library le dit (famille choisie par l'utilisateur, dossier, modèle de base) ou si son nom la porte. Pour FLUX2, les fichiers reconnus comme l'autre variante (4B quand le modèle choisi est 9B, et inversement) sont retirés. **Si aucun fichier ne peut être attribué à la famille, la liste complète reste proposée** : une liste n'est jamais vidée par le filtre. La valeur déjà choisie reste toujours affichée.

| Liste | Avant | Maintenant |
| --- | --- | --- |
| LoRA d'Image Generator (SD 1.5, SDXL, QWEN, Z-Image, FLUX2 Simple, KREA2) | Filtre par nom seulement ; liste vide si aucun nom ne correspond | `familyFiles` : nom ou My Library, variante FLUX2, jamais vide |
| LoRA de QWEN 2.1, MOSS Image, MOSS PHOTO, KREA2 Edit | Tous les LoRA | Famille du workflow |
| LoRA de Swap a Person (les deux workflows), Photo Fusion (FLUX2 et Lightning), Past Forward (Lightning) | Tous les LoRA | FLUX2 de la variante du modèle choisi, ou QWEN |
| LoRA de Swap Anything | Filtre par nom, vide si aucun | `familyFiles` |
| Modèle de diffusion d'Image Generator | Tous les fichiers du type ; le panneau remettait ensuite un modèle de la famille | Exactement les modèles que le panneau accepte (même liste que celle de la réparation automatique) ; FLUX2 : famille FLUX2 |
| Modèle de diffusion de QWEN 2.1, MOSS, KREA2 Edit et des cinq panneaux Fun | Tous les fichiers du type | Famille du workflow |

Non filtrées : les listes CLIP / encodeur de texte et VAE. Leurs noms ne suivent pas la famille (FLUX2 Klein utilise un encodeur nommé « qwen »), donc un filtre par nom cacherait des fichiers valides. Les LoRA additionnels de FLUX2 Edit gardaient déjà leur filtre strict par variante (inchangé).

Règle pour la suite de B5 : toute liste de modèles de diffusion ou de LoRA passe par `familyFiles`.

**3. MOSS PHOTO.** Même structure, mêmes sections, même ordre (le test d'ordre passe sans changement de ses vérifications). Les `select` bruts deviennent des listbox du kit (avec recherche pour les modèles et les LoRA), les champs numériques et de texte prennent le style du kit, le prompt négatif devient une boîte de prompt du kit. Les noms accessibles sont inchangés. Les champs numériques restent de simples champs : ce panneau n'avait pas de curseurs et leurs bornes viennent du catalogue ComfyUI. Les longs noms de paramètres passent à la ligne dans leur colonne.

Dans `OptionsPanel`, la liste des modèles acceptés par workflow (`workflowModels`) est calculée une seule fois et sert à la fois à la réparation automatique et à l'affichage.

### 2026-11-19 — Vérification de B5a, étape 4

| Vérification | Après l'étape 3 | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 971 tests : 957 réussis, 0 en échec, 14 ignorés | 972 tests : 958 réussis, 0 en échec, 14 ignorés (un test ajouté pour `familyFiles`) |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,83 s |
| `check:panels` Image Generator, avec exercice | 22/22 | 22/22, aucune erreur de page |
| `check:panels` Fun, avec exercice | 14/14 | 14/14 (exécuté après les filtres, avant le dernier ajustement d'affichage de MOSS PHOTO) |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Nouvelle référence | Identique à la référence |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Comparaison avec le relevé d'avant B5a, sans exercice : aucun contrôle manquant, mêmes valeurs, mêmes bornes de curseurs. Seules différences : celles déjà expliquées à l'étape 3, et le libellé « Str » des LoRA devenu « Strength ».

Captures relues : FLUX2 Edit et MOSS PHOTO.

Non vérifié : le filtre par My Library n'a été exercé que par le test unitaire ; dans le navigateur, l'inventaire est vide et seul le filtre par nom agit. FLUX2 Edit n'a pas été vu avec des images de référence chargées (la ligne d'une référence est maintenant dans une colonne plus étroite). Aucune génération lancée, aucune exécution dans Electron.

### Reste à faire dans B5a

| Élément | État |
| --- | --- |
| Disposition standard, sections, listes, curseurs, barre Generate, en-tête | **Faits** |
| FLUX2 Edit à la disposition standard | **Fait** (étape 4) |
| Listes filtrées par famille | **Fait** (étape 4) |
| MOSS PHOTO : contrôles du kit, ordre conservé | **Fait** (étape 4) |
| Sortir l'onglet Image Generator de `App.tsx` | **Fait** (étape 5) |
| Classes d'opacité sans effet dans `OptionsPanel` | **Fait** (étape 5) |
| `CloudImageProviderBar` : utilisé par Extractor et Logo, pas par Image Generator ; déplacé dans B5f | Reporté |

### 2026-11-19 — B5a, étape 5 : l'onglet sort de `App.tsx`, classes d'opacité

Fichier créé : `components/ImageGeneratorTab.tsx`. Fichiers touchés : `App.tsx` (1984 → 1766 lignes), `components/OptionsPanel.tsx`, `components/ImageStyleControl.tsx`, et trois tests (`flux2Style`, `libraryTags`, `LibraryPickerHost`).

**L'onglet sort de `App.tsx`.** `ImageGeneratorTab` contient l'en-tête, les quatre panneaux QWEN 2.1 I2I et la disposition à deux colonnes. `App` garde les options, les résultats et les fonctions de génération, et les lui passe. L'état propre à l'onglet (génération du prompt depuis la source, emplacement de la carte Prompt, référence du panneau Multi Images) vit maintenant dans l'onglet. Le relevé des contrôles des 22 variantes est identique, octet pour octet, à celui pris juste avant le déplacement. Les trois tests qui lisaient ce balisage dans `App.tsx` lisent le nouveau fichier.

**Classes d'opacité.** Mesure faite dans l'application avant de remplacer : un fond avec opacité sur une couleur du thème est transparent ; une bordure avec opacité retombe sur un gris clair par défaut (rgb 229, 231, 235), donc une ligne claire et vive sur le thème sombre, ce qui n'était pas voulu. Les 12 classes de `OptionsPanel` et celle de `ImageStyleControl` sont remplacées :

- fonds : classe retirée (aspect inchangé) ;
- trait sous les titres de section, cadre d'une sortie désactivée : couleur de bordure du thème. **Visible** : le trait gris clair sous les titres devient un trait discret ;
- cadre d'avertissement et cadre du LoRA de style actif : couleur d'avertissement / d'accent pleine.

Ces classes touchent aussi les sections Character d'`OptionsPanel` (même fichier).

Vérification : 972 tests (958 réussis, 0 en échec, 14 ignorés) ; typecheck 18 erreurs, mêmes fichiers ; build réussi ; `check:panels` Image Generator 22/22 avec exercice ; `check:locks` 13/13, `check:tab-jobs` 6/6, `check:ui` 12/12 ; `check:tabs` identique ; `profile:renders` 5 vérifications réussies.

Non vérifié : aucune capture relue après le changement des bordures ; aucune génération lancée ; aucune exécution dans Electron.

### État de B5a

**Terminé**, sauf `CloudImageProviderBar` (reporté dans B5f) et les quatre panneaux QWEN 2.1 I2I (B5c, comme prévu au plan).

### 2026-11-19 — B5b (Character), étape 1 : relevé de référence

Fichier touché : `scripts/browser/panel-controls-audit.mjs`. Nouveau groupe `character` (`LAWIZ_AUDIT_GROUP=character`) : 7 variantes — QWEN, FLUX2 Character Angles, FLUX2 Blazing Fast, QWEN 2.1 Character Sheet, QWEN 2.1 Create Character, Mammouth, Gemini. Le bloc « Advanced » est ouvert dans le relevé d'avant, donc tous ses réglages y figurent. Relevé : `%TEMP%\lawiz-character-controls-before.json`, captures dans `%TEMP%\lawiz-character-shots-before`.

L'onglet Character avait déjà la bonne disposition : source et options à gauche ; Generate, résultats et les huit sorties (angle, pose, expression) à droite. Il n'a pas de prompt à déplacer. Un test existant fixe l'ordre de la colonne de droite ; il n'est pas touché.

### 2026-11-19 — B5b, étape 2 : sections standard dans les options Character

Fichiers touchés : `components/OptionsPanel.tsx`, `components/InputComponents.tsx`.

Ce qui change pour l'utilisateur, dans QWEN, FLUX2 Character Angles et QWEN 2.1 Create Character :

- **Le bouton « Advanced +/− » et son gros bloc unique disparaissent.** À la place, quatre sections repliables dans l'ordre standard : Models, LoRAs, Sampler, Advanced. Elles sont fermées au départ, comme l'était le bloc.
- **Listes de modèles, LoRA, samplers et schedulers** : listbox du kit avec recherche.
- **Listes filtrées par famille** (règle de l'étape 4 de B5a) : LoRA et modèle de diffusion de QWEN Edit, de QWEN 2.1 et de FLUX2 (variante 9B ou 4B du modèle choisi pour les LoRA). Avant, les trois workflows proposaient tous les LoRA installés.
- **Sorties FLUX2** : la liste « Prompt mode » et le prompt complet d'une sortie utilisent le kit.
- **Listes Camera Angle, Pose et Facial Expression** des huit sorties : `PresetTextInput` devient une enveloppe du listbox du kit (même liste, même option « Custom... », même champ de saisie libre). Ce composant sert aussi ailleurs dans l'application.
- `border-border-secondary` n'est pas une couleur du thème : les quatre cadres qui l'utilisaient dans `OptionsPanel` avaient une bordure claire et vive ; ils prennent la bordure du thème.

Répartition des réglages (aucun retiré, mêmes valeurs par défaut, mêmes bornes) :

| Workflow | Models | LoRAs | Sampler | Advanced |
| --- | --- | --- | --- | --- |
| QWEN | UNET, CLIP, VAE | Lightning, Multiple Angles, LoRA additionnel | Sampler, Scheduler, Steps, CFG | AuraFlow Shift, Source Megapixels |
| FLUX2 Character Angles | modèle, CLIP, VAE | case + LoRA 1 et 2 | Sampler, Steps, CFG | Source Megapixels, CacheDiT |
| QWEN 2.1 Create Character | modèle, dtype, CLIP, device, VAE, cache, attention | LoRA 1 à 4 | Sampler, Scheduler, Steps, CFG, Denoise | Encoder Resolution, Negative Prompt |

Comparaison avec le relevé d'avant, sans exercice, sur les 7 variantes : **aucune différence** — mêmes contrôles (56, 57, 54, 33, 65, 38, 40), mêmes noms, mêmes valeurs, mêmes états désactivés, mêmes bornes et pas.

### 2026-11-19 — Vérification de B5b, étapes 1 et 2

| Vérification | Fin de B5a | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,91 s |
| `check:panels` Character, avec exercice | — | 7/7, aucune erreur de page |
| `check:panels` Image Generator et Fun, avec exercice | 22/22, 14/14 | 22/22, 14/14 |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Identique |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues : FLUX2 Character Angles et QWEN 2.1 Create Character, sections dépliées.

Non vérifié : aucune génération lancée ; aucune exécution dans Electron ; le filtre par My Library n'agit pas dans le navigateur de test (inventaire vide) ; les captures QWEN, Mammouth et Gemini n'ont pas été relues ; le mode « Full workflow prompt » d'une sortie FLUX2 n'a pas été affiché.

Constat (existant, non modifié) : dans QWEN 2.1 Create Character, le titre « General Settings » s'affiche sans rien dessous.

### 2026-11-19 — B5b, étape 3 : Character Sheet, Blazing Fast et sortie de l'onglet

Fichiers touchés : `components/Qwen21CharacterSheetPanel.tsx`, `components/BlazingFastCharacterPanel.tsx`, `components/CharacterTab.tsx` (nouveau), `App.tsx`, et trois tests adaptés (`components/BlazingFastCharacterPanel.test.mjs`, `services/characterResults.test.mjs`, `components/LibraryPickerHost.test.mjs`).

**QWEN 2.1 Character Sheet**

- Sections repliables du kit dans l'ordre standard : Models, Sampler, Advanced (l'ancien « Reference Settings »). Fermées au départ, comme avant.
- Les onze listes venant de ComfyUI ont la recherche ; le modèle de diffusion est filtré sur la famille QWEN 2.1. Separator, Orientation, Size et View Count restent des listes courtes du kit.
- Les quatre blocs du prompt, le prompt négatif et le prompt combiné utilisent la boîte à prompt du kit (repère vert, rouge, cadre pointillé en lecture seule avec bouton Copy).
- **Déplacement** : le prompt négatif quitte la section Sampler et s'affiche à droite sous les quatre blocs, toujours visible (règle : les prompts à droite).
- Une valeur enregistrée absente de ComfyUI s'affiche maintenant « (not listed) » au lieu d'être glissée en tête de liste comme si elle était installée.
- Curseurs conservés tels quels (Steps, CFG, Denoise, Resolution Steps, Encoder Resolution, Split).

**Blazing Fast character** — structure et ordre conservés (ses tests les fixent, comme MOSS PHOTO)

- Les quatre champs de modèle étaient des zones de texte avec suggestions ; ce sont des listbox avec recherche. Le modèle de diffusion est filtré sur la famille FLUX2. **Conséquence** : on ne peut plus taper un nom de fichier libre ; un nom enregistré absent de la liste reste affiché « (not listed) ».
- Sampler et les quatre LoRA : listbox avec recherche. La liste des LoRA était déjà filtrée par variante FLUX2 ; ce filtre est inchangé.
- Steps, CFG, Megapixels, Seed, Identity tokens, Caption tokens et les forces de LoRA : champ numérique du kit. Une saisie vide ou hors borne n'est plus enregistrée (avant, un champ vidé enregistrait une valeur invalide). Pas de curseur ajouté : ces champs n'ont jamais eu de borne haute.
- Prompts au kit : instruction d'édition, aperçus par pose, prompts système, prompt réel de la dernière exécution, légende finale.
- « Prompt preview », « Pose N prompt », « Vision & caption prompts » et « Latest run » sont des sections du kit. « Poses & expressions » garde son balisage (même apparence) parce que ses tests lisent son contenu fermé.
- Couleurs : cadres en bordure du thème au lieu des bordures claires ; le bloc du style choisi reçoit un cadre ; l'alerte utilise les couleurs d'erreur du thème.

**Onglet Character**

- Le JSX de l'onglet sort d'`App.tsx` vers `components/CharacterTab.tsx`. `App.tsx` passe de 1766 à 1607 lignes.
- Champ « Character Name » au style du kit, avec un vrai libellé.
- Le bouton « Auto-generate name » avait des classes cassées (`p - 2 rounded - md`) : il n'avait ni marge intérieure ni coins arrondis. Corrigé.

Comparaison avec le relevé d'avant : même nombre de contrôles dans les 7 variantes (56, 57, 54, 33, 65, 38, 40), mêmes valeurs. Seuls des noms changent : dans Blazing Fast, « identityTokens » → « Identity tokens », « Blazing sampler » → « Sampler », etc. ; ailleurs, le champ du nom a maintenant un libellé au lieu de son seul texte d'exemple.

### 2026-11-19 — Vérification finale de B5b

| Vérification | Fin de B5a | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,93 s |
| `check:panels` Character, avec exercice | — | 7/7, aucune erreur de page |
| `check:panels` Image Generator et Fun, avec exercice | 22/22, 14/14 | 22/22, 14/14 |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Identique |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues : Character Sheet et Blazing Fast, sections dépliées.

Non vérifié : aucune génération lancée ; aucune exécution dans Electron ; le filtre par My Library n'agit pas dans le navigateur de test (inventaire vide) ; Blazing Fast et Character Sheet n'ont pas été vus avec un résultat (prompt réel, légende finale, découpe des vues) ; le chargement d'un preset Blazing Fast depuis Library n'a pas été rejoué ; les captures QWEN, Mammouth et Gemini n'ont pas été relues.

### État de B5b

**Terminé.** Prochaine brique : B5c (Scene Variation).

### 2026-11-20 — B5c (Scene Variation et QWEN 2.1 I2I), étape 1 : relevés de référence

Fichier touché : `scripts/browser/panel-controls-audit.mjs`. Deux nouveaux groupes :

- `scene` (`LAWIZ_AUDIT_GROUP=scene`) : les quatre sous-onglets de Scene Variation. Relevé : `%TEMP%\lawiz-scene-controls-before.json` (32, 41, 107 et 43 contrôles).
- `qwen21` : les quatre panneaux QWEN 2.1 I2I d'Image Generator (Multi Images, Consistency, Turbo, Remove Background). Relevé : `%TEMP%\lawiz-qwen21-controls-before.json` (48, 42, 50 et 28 contrôles).

La variante « Scene Variation avec le moteur Qwen 2.1 » a été ajoutée au harnais après la migration : elle n'a **pas** de relevé d'avant.

`OutpaintPanel` était prévu dans B5c mais il s'affiche dans l'onglet Tools : il passe dans B5f.

### 2026-11-20 — B5c, étape 2 : QWEN 2.1 I2I et Character in a Scene (disposition standard)

Fichiers touchés : `components/Qwen21RemoveBackgroundPanel.tsx` (Remove Background, I2I Consistency, I2I Turbo), `components/Qwen21MultiPanel.tsx`, `components/CharacterScenePanel.tsx`.

Les cinq écrans avaient la même forme : des blocs repliables « Models & CLIP », « Reference Settings » et « Sampler Settings » à gauche, et un bloc « LoRA Settings » à droite **sous** les résultats. Ils suivent maintenant la règle :

- **Gauche** : sources, taille et seed, puis Models, LoRAs, Sampler, Advanced. Les LoRA passent donc de la colonne de droite à la colonne de gauche, après Models ; la section reste ouverte au départ, comme avant.
- **Droite** : prompts, Generate, résultats.
- **Prompt négatif** : il était caché dans la section Sampler ; il s'affiche à droite sous le prompt (repère rouge).
- **Advanced** reçoit l'ancien « Reference Settings » (Reference Upscale Method, Resolution Steps, Encoder Resolution, Character Reference MP).
- Listes venant de ComfyUI : listbox avec recherche. Modèle de diffusion et LoRA filtrés sur la famille QWEN 2.1 (avant : tous les LoRA installés).
- Prompts : boîte à prompt du kit. Dans Multi Images et Character in a Scene, le prompt calculé est en lecture seule (cadre pointillé) tant que « Manual prompt » n'est pas coché, comme avant.
- Curseurs conservés (mêmes bornes et pas).

### 2026-11-20 — B5c, étape 3 : Scene Variation

Fichier touché : `components/SceneVariationPanel.tsx`.

- Les réglages étaient dans un seul bloc « FLUX2 Advanced Settings » ou « Qwen 2.1 Advanced Settings », à droite sous les choix de variation. Ils passent à gauche, sous la source et l'analyse, en quatre sections fermées au départ : Models, LoRAs, Sampler (avec le seed), Advanced.
- La colonne de droite garde les choix de variation, les masques, Generate et la progression. Les résultats restent en dessous.
- Le listbox local du panneau est supprimé ; tout passe par le kit. Modèles, LoRA, samplers et checkpoint SAM3 ont la recherche. Modèles et LoRA filtrés par famille (FLUX2 selon la variante 9B/4B du modèle, ou QWEN 2.1).
- « Images » (1 à 8) : curseur + champ, selon la règle des nombres bornés.
- Les champs de l'analyse (lieu, style, description des personnes…) gardent leur limite de longueur ; seul leur style change.

### 2026-11-20 — B5c, étape 4 : Creation suite et Clothes Switcher

Fichiers touchés : `components/CreationSuitePanel.tsx`, `components/ClothesSwitcherPanel.tsx` et leurs deux tests.

Structure et ordre **conservés** : leurs tests fixent les colonnes et les titres des sections (même traitement que MOSS PHOTO et Blazing Fast). Ces deux panneaux affichent les réglages bruts des nœuds du workflow.

- Leur section repliable locale (deux copies identiques) est remplacée par celle du kit.
- Listes : listbox avec recherche. Modèle de diffusion et LoRA filtrés par famille (FLUX2 pour Clothes Switcher ; MOSS pour la scène et QWEN 2.1 pour le swap de Creation suite).
- Nombres : champ numérique du kit. Pas de curseur ajouté : les bornes viennent de ComfyUI et sont des maximums techniques (10 000 étapes, etc.).
- Prompts : boîte à prompt du kit, y compris les blocs du « Phone prompt builder » et les prompts négatifs.
- Boutons Generate : couleur d'accent pleine, comme dans les autres panneaux. Celui de Clothes Switcher avait un fond et une bordure sans effet ; celui de Creation suite était vert lime.
- Alertes : couleurs d'erreur du thème.
- Les cadres lime (scène) et cyan (swap) de Creation suite sont conservés : ils distinguent les deux pipelines.

### 2026-11-20 — Vérification de B5c

Comparaison avec les relevés d'avant, sans exercice :

| Écran | Contrôles avant → après | Écart |
| --- | --- | --- |
| Scene Variation (FLUX2) | 32 → 33 | Le curseur ajouté à « Images » |
| Character in a Scene | 41 → 41 | Aucun |
| Creation suite | 107 → 107 | Aucun |
| Clothes Switcher | 43 → 43 | Aucun |
| QWEN 2.1 Multi / Consistency / Turbo / Remove Background | 48, 42, 50, 28 → identiques | Aucun |

Mêmes noms, mêmes valeurs, mêmes états désactivés partout. Seule différence d'affichage : une valeur absente de ComfyUI se lit « (not listed) » au lieu de « (current / not listed) » ou d'apparaître comme installée.

| Vérification | Fin de B5b | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 6,54 s |
| `check:panels` Scene Variation, avec exercice | — | 5/5, aucune erreur de page |
| `check:panels` QWEN 2.1 I2I, avec exercice | — | 4/4, aucune erreur de page |
| `check:panels` Character, Image Generator, Fun, avec exercice | 7/7, 22/22, 14/14 | 7/7, 22/22, 14/14 |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Une seule ligne change : Scene Variation, 12 listes natives → 6. Les six autres sont dans les sections fermées, qui ne montent leur contenu qu'à l'ouverture. Nouvelle référence enregistrée. |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues : Scene Variation (FLUX2 et Qwen 2.1), Character in a Scene, Clothes Switcher, I2I Consistency, I2I Multi Images.

Non vérifié :

- aucune génération ni analyse d'image lancée ; aucune exécution dans Electron ;
- Scene Variation avec le moteur Qwen 2.1 n'a pas de relevé d'avant (exercice et capture seulement) ;
- le mode « Masked by person » de Scene Variation et tout ce qui apparaît après une analyse (choix par personne, analyse éditable, « Who to replace », « Placement ») n'ont pas été affichés : ils demandent une image analysée ;
- les captures de Creation suite, I2I Turbo et Remove Background n'ont pas été relues ;
- le chargement d'un preset (Scene Variation, Clothes Switcher) et la restauration d'une composition depuis Library n'ont pas été rejoués ;
- le filtre par My Library n'agit pas dans le navigateur de test (inventaire vide).

### État de B5c

**Terminé**, sauf `OutpaintPanel` (déplacé dans B5f). Prochaine brique : B5d (Video).

### 2026-11-20 — B5d (Video), étape 1 : relevé de référence

Fichier touché : `scripts/browser/panel-controls-audit.mjs`. Nouveau groupe `video` (`LAWIZ_AUDIT_GROUP=video`) : les huit sous-onglets — Video Prompt Generator, LTX Director, LTX-Ripple-FFAF, LTX 2.5 Audio-Sync, Minimax REF2v H3, Ultrafast, MiniMax Advanced, Character Swap H3. Relevé : `%TEMP%\lawiz-video-controls-before.json` (17, 3, 123, 72, 60, 57, 81 et 25 contrôles).

Le relevé de LTX Director ne couvre que son écran vide (3 contrôles) : ses réglages apparaissent après « Advanced » ou l'ajout d'un clip.

### 2026-11-20 — B5d, étape 2 : LTX-Ripple-FFAF et LTX 2.5 Audio-Sync

Fichiers touchés : `components/LTXRipplePanel.tsx`, `components/LTXAudioSyncPanel.tsx`, leurs deux tests, `services/styleLibrary.ts`.

Structure et ordre conservés (leurs tests fixent les titres des sections). Ces panneaux affichent les réglages bruts des nœuds du workflow.

- Leurs deux sections repliables locales sont remplacées par celle du kit.
- Listes : listbox avec recherche. Modèle de diffusion et LoRA filtrés sur la famille LTX. Les textes d'aide qui annonçaient une liste « unfiltered » sont corrigés.
- `services/styleLibrary.ts` : le filtre par famille reconnaît maintenant les fichiers LTX (`ltx` dans le nom) et H3 (`h3` ou `minimax`), en plus de My Library. Comme ailleurs, la liste complète reste affichée si aucun fichier n'est reconnu.
- Nombres : champ numérique du kit. Force des LoRA d'Audio-Sync (−20 à 20) : curseur + champ.
- Prompts : boîte à prompt du kit (prompt vidéo, prompt d'édition, prompts négatifs).
- Ripple, « Frame count » : le champ n'a volontairement pas de maximum. Une valeur trop longue pour la vidéo source est ainsi refusée avec le message d'explication existant, au lieu d'être ignorée en silence.
- Boutons Generate en couleur d'accent ; alertes aux couleurs d'erreur du thème.

### 2026-11-20 — B5d, étape 3 : Minimax REF2v H3, Ultrafast, MiniMax Advanced

Fichiers touchés : `components/MinimaxH3Panel.tsx`, `components/AdvancedH3Settings.tsx`, `components/H3StyleControl.tsx`, `components/VideoAudioControls.tsx`, `components/VideoPromptText.tsx`, et trois tests adaptés.

- Les trois écrans partagent le même panneau. Ses contrôles locaux (liste, champ numérique, champ texte) rendent maintenant ceux du kit : aucun réglage n'a bougé.
- Listes : listbox avec recherche. Le modèle de diffusion est filtré sur la famille H3. Les LoRA étaient déjà filtrés sur H3 ; inchangé. Dans Advanced, les LoRA de l'étape LTX Refine sont filtrés sur LTX.
- Curseur + champ ajoutés aux nombres à échelle humaine : Megapixels, H3 duration, Denoise, RTX scale, Preview JPEG quality, force des LoRA, force du LoRA de style. Les autres bornes sont des maximums techniques (seed, 10 000 étapes, 8192 px) : champ seul.
- Force d'un LoRA H3 : le curseur passe sous la liste du fichier, sur toute la largeur (il ne tenait pas dans la colonne de 90 px).
- Soundtrack mode, Original soundtrack, Transcription provider, Input, Stage order, Mode, LTX decode mode : listes courtes du kit.
- Prompts : « ReferencePack system prompt » et « Words for this passage » au kit. L'éditeur de prompt vidéo garde ses couleurs par référence (une couleur par image, vidéo ou audio, la même que sur les pastilles) ; seul son cadre est aligné sur celui du kit.
- Les sections repliables de ces panneaux gardent leur balisage : elles avaient déjà l'apparence du kit, et leur état ouvert/fermé est piloté par le panneau et lu par ses tests.
- Boutons Generate en couleur d'accent (avant : violet, émeraude ou cyan selon l'écran) ; alertes aux couleurs d'erreur du thème.

### 2026-11-20 — B5d, étape 4 : Video Prompt Generator et Character Swap H3

Fichiers touchés : `components/VideoWorkspace.tsx`, `components/CharacterSwapPanel.tsx`, `components/ui/PromptBox.tsx`.

- Video Prompt Generator : Target video model, Generation mode, Provider, Canvas, Aspect ratio et « Send prompt to workflow » sont des listes du kit. Duration (1 à 120 s) : curseur + champ.
- « Your idea », les deux gabarits et le prompt généré en mode édition utilisent la boîte à prompt du kit. Les jetons `<Picture 1>` y sont colorés.
- `PromptBox` reçoit une option `inputRef` : le clic sur une pastille de référence insère toujours le jeton à la position du curseur.
- Le bouton « Generate video prompt » avait un fond sans effet (opacité sur une couleur du thème) : il prend la couleur d'accent pleine.
- **Exception** : la liste des modèles OpenRouter garde sa structure (champ de recherche séparé + liste native). Ses tests imposent ce comportement précis : le modèle choisi reste affiché même s'il est incompatible ou absent du catalogue, et n'est jamais remplacé en silence. Elle reçoit seulement le style du kit.
- Character Swap H3 : la section des réglages est celle du kit. Quand le catalogue ComfyUI est chargé, modèles, LoRA, sampler et attention sont des listbox avec recherche (modèle et LoRA filtrés sur H3) ; avant, c'étaient des zones de texte avec suggestions. Sans catalogue, le nom reste saisissable à la main.

### 2026-11-20 — Vérification de B5d (sans LTX Director)

Comparaison avec le relevé d'avant, sans exercice :

| Écran | Contrôles avant → après | Écart |
| --- | --- | --- |
| Video Prompt Generator | 17 → 18 | Curseur de Duration |
| LTX Director | 3 → 3 | Non touché |
| LTX-Ripple-FFAF | 123 → 123 | Aucun |
| LTX 2.5 Audio-Sync | 72 → 76 | Quatre curseurs de force de LoRA |
| Minimax REF2v H3 | 60 → 63 | Curseurs Megapixels, H3 duration, JPEG quality |
| Ultrafast | 57 → 61 | Les trois mêmes + Denoise |
| MiniMax Advanced | 81 → 84 | Les trois mêmes |
| Character Swap H3 | 25 → 25 | Aucun |

Mêmes valeurs et mêmes états désactivés partout. Cinq champs H3 changent de nom : leur texte d'aide n'est plus collé au libellé (« Resolution multiple » au lieu de « Resolution multipleH3 requires… »).

| Vérification | Fin de B5c | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,92 s |
| `check:panels` Video, avec exercice | — | 8/8, aucune erreur de page |
| `check:panels` Scene Variation, QWEN 2.1 I2I, Character, Image Generator, Fun, avec exercice | 5/5, 4/4, 7/7, 22/22, 14/14 | Identique |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Identique |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Cinq tests adaptés pour charger le kit ; trois assertions de balisage réécrites (liste des LoRA H3, titre de section Audio-Sync, section repliable de Ripple), les autres inchangées.

Captures relues : Video Prompt Generator, Minimax REF2v H3, LTX 2.5 Audio-Sync.

Non vérifié :

- aucune génération, analyse ni transcription lancée ; aucune exécution dans Electron ;
- les écrans avec un média chargé : références H3, éditeur de paroles, passage audio, vidéo source de Ripple, résultats ;
- le curseur de force du LoRA de style H3 (visible seulement avec un style choisi) et les options de ReferencePack avec OpenRouter ;
- Character Swap H3 avec son catalogue chargé : le navigateur de test n'a pas le planner BFS, donc ses listbox n'ont pas été affichées ;
- les captures de Ripple, Ultrafast, Advanced et Character Swap n'ont pas été relues ;
- le filtre par My Library (inventaire de test vide).

### LTX Director — décision demandée

LTX Director (1 312 lignes, 12 listes natives, 7 champs numériques, 4 curseurs sans champ) était écrit avec une palette sombre fixe (gris zinc et ambre) qui ignorait le thème de l'application. Y poser les contrôles du kit, qui suivent le thème, aurait donné dans le thème « Studio Light » des libellés sombres sur fond noir, donc illisibles.

Deux options proposées à l'utilisateur (point ouvert 10) :

1. Convertir tout LTX Director aux couleurs du thème, comme le reste de l'application.
2. Garder son apparence sombre fixe et y épingler une palette sombre locale pour les contrôles du kit.

**Décision du 2026-11-20 : option 1.**

### 2026-11-20 — B5d, étape 5 : LTX Director aux couleurs du thème

Fichiers touchés : `components/LTXDirectorPanel.tsx` (1 277 lignes), `components/VideoWorkspace.tsx` (bouton « Reset LTX Director » à la couleur d'alerte du thème), `scripts/browser/panel-controls-audit.mjs`.

Ce qui change à l'écran :

- Tout le panneau suit le thème : fonds, bordures, textes, boutons. Generate et « Generate Prompt » prennent la couleur d'accent ; les boutons à deux positions (LTX 2.3 / 2.5, Standard / Tiled, Landscape / Portrait, relation entre clips) ont le même style partout.
- Le bouton « Advanced » de l'en-tête disparaît. Les réglages sont trois sections repliables toujours présentes, dans l'ordre standard : **Models**, **LoRAs**, **Advanced**. Models et LoRAs s'ouvrent d'elles-mêmes quand on change de version de modèle ou qu'un LoRA est envoyé depuis un autre onglet, comme l'ancien panneau.
- Toutes les listes de modèles et de LoRA sont des listbox avec recherche. Le checkpoint et les LoRA sont filtrés sur la famille LTX ; encodeurs de texte, VAE et upscaler ne le sont pas.
- Les quatre anciens curseurs sans champ ont maintenant un champ de saisie : Guide strength, Output scale, durée du clip, force de chaque LoRA. Les trois réglages CacheDiT (Warmup steps, Skip interval, Noise scale) gagnent un curseur.
- Les quatre listes du clip (Visual theme, Sub-theme, Camera style, Audio style) ont la recherche ; le prompt du clip est la zone de prompt du kit.
- La colonne de gauche passe de 280 à 320 px pour loger curseur et champ côte à côte.

Gardé sombre volontairement, quel que soit le thème : l'aperçu vidéo (fond noir) et le bloc de forme d'onde audio. Ce sont des surfaces de média ; leurs textes ont des couleurs fixes lisibles sur noir.

Inchangé : la logique, les valeurs par défaut, le graphe envoyé à ComfyUI, les presets, les noms accessibles des contrôles existants.

Harnais : trois variantes LTX Director dans le groupe `video` (écran vide, sections ouvertes, avec un clip prompt). Nouvelle variable `LAWIZ_AUDIT_THEME` pour prendre les captures dans un autre thème.

Une erreur de ma part, corrigée : la première capture « Studio Light » était en fait sombre. Le thème était écrit dans le stockage local avant le démarrage, mais l'application le remplace au chargement. Le harnais change maintenant le thème par le store, après le chargement. La capture a été reprise et relue.

### 2026-11-20 — Vérification finale de B5d

Comparaison de LTX Director avec un relevé pris juste avant sa conversion :

| Écran | Contrôles avant → après | Écart |
| --- | --- | --- |
| Écran vide | 3 → 43 | Les réglages sont toujours présents (sections), plus derrière un bouton |
| Réglages ouverts | 38 → 43 | Trois curseurs CacheDiT, deux champs (Guide strength, Output scale) |
| Avec un clip | 44 → 50 | Les cinq mêmes, plus le champ de durée du clip |

Mêmes valeurs. La comparaison automatique signale à tort cinq lignes « LoRA N » : la case à cocher et la liste portent maintenant le même nom dans le relevé ; les deux contrôles existent bien.

| Vérification | Avant LTX Director | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 6,12 s |
| `check:panels` Video, avec exercice | 8/8 | 10/10 (deux variantes ajoutées), aucune erreur de page |
| `check:panels` Scene Variation, QWEN 2.1 I2I, Character, Image Generator, Fun, avec exercice | 5/5, 4/4, 7/7, 22/22, 14/14 | Identique |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Identique |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues : LTX Director avec un clip, dans le thème par défaut et dans « Studio Light ». Dans les deux, libellés, listes, curseurs, champs et boutons sont lisibles.

Constat hors LTX Director, non corrigé : dans « Studio Light », les onglets actifs (« Video », « LTX », « LTX Director ») sont peu lisibles, texte ambre clair sur fond ambre clair. Ces boutons viennent de `App.tsx` et `VideoWorkspace.tsx` (couleurs fixes de la palette). Ajouté à « À régler ».

Non vérifié pour LTX Director :

- aucune génération lancée ; aucune exécution dans Electron ;
- un clip avec photo ou avec bande-son : forme d'onde, découpage, voix, verrou de durée par l'audio n'ont pas été affichés ;
- la fenêtre d'exemples de prompt des LoRA, les résultats, l'enregistrement et le rechargement d'un preset ;
- le passage à LTX 2.5 et l'envoi d'un LoRA depuis un autre onglet (ouverture automatique des sections) : lus dans le code, pas rejoués ;
- les thèmes « Synthwave » et « 70s Groove » ;
- le filtre par My Library (inventaire de test vide).

### État de B5d

**Terminé.** Les huit sous-onglets Video sont au kit. Exception connue : la liste des modèles OpenRouter du Video Prompt Generator (structure imposée par ses tests).

### 2026-11-20 — B5f (TTS, Prompt, Extractor, Logo, Tools), étape 1 : relevés de référence

Demande de l'utilisateur : faire B5f au complet. La brique couvre cinq onglets : TTS, Prompt, Extractor, Logo et Tools (dix outils, dont Outpaint et Upscale).

Fichier touché : `scripts/browser/panel-controls-audit.mjs`.

- Cinq nouveaux groupes : `tts` (4 écrans), `prompt` (6), `extractor` (8), `logo` (3), `tools` (14).
- Nouvelle étape `upload` : le harnais charge une image, une vidéo ou un son d'essai dans l'outil affiché. Sans cela, la plupart des outils de Tools n'affichent aucun réglage.
- Deux fichiers d'essai créés dans le dossier temporaire de Windows avec le ffmpeg déjà installé sur le poste : `sample.mp4` (3 s, 640 × 360, avec son) et `sample.wav`. Rien n'est ajouté au dépôt.
- Relevés d'avant : `%TEMP%\lawiz-{tts,prompt,extractor,logo,tools}-controls-before.json`, avec captures.

### 2026-11-20 — B5f, étape 2 : TTS

Fichiers touchés : `components/TtsPanel.tsx`, `components/TtsAdvancedPanel.tsx`, `components/ui/fields.tsx` (nouveau champ texte `TextField`).

- TTS Voice Clone : « Advanced » devient une section repliable du kit. Les trois curseurs ont un champ de saisie ; « Max characters per chunk » et « Silence between chunks » gagnent un curseur. Language a la recherche. Le texte à dire est la zone de prompt du kit. Le seed utilise le champ standard (bouton « Random »).
- TTS Advanced : « Engine settings » devient la section « Advanced ». Chaque curseur d'émotion garde sa couleur et gagne un champ de saisie. La voix installée et la langue ont la recherche. Les lignes de dialogue sont des zones de prompt.
- Couleurs fixes remplacées par celles du thème : le bouton « Random Dialogue / Generate selected line » (ambre), « Continue conversation / Change subject » (cyan et fuchsia), les étiquettes AUTO et CUSTOM, l'encadré « Automatic text emotion ». Dans « Studio Light », « Change subject » était presque illisible.

### 2026-11-20 — B5f, étape 3 : Prompt, Extractor, Logo, barre de fournisseur

Fichiers touchés : `components/PromptGeneratorPanel.tsx`, `components/ClothesExtractorPanel.tsx`, `components/LogoThemeGeneratorPanel.tsx`, `components/CloudImageProviderBar.tsx`, `components/ExtractorResultsGrid.tsx`, `components/SendToLTXButton.tsx`, `components/ImageUploader.tsx`.

Ces panneaux n'ont pas de bloc Models / LoRAs / Sampler : leur disposition est conservée, seuls les contrôles changent.

- Prompt : listes Ollama et Florence2 avec recherche. Les trois prompts générés sont des zones de prompt (repère vert ; avant, texte à la couleur de l'onglet). Creativity a un champ de saisie.
- Extractor : liste Ollama avec recherche ; « People in image », « Max Objects », Steps et CFG de la police ont curseur et champ ; « Style instructions » est une zone de prompt.
- Logo, Banner, Album Cover : les champs ont maintenant un libellé au-dessus (avant, seulement un texte indicatif dans le champ) ; le concept est une zone de prompt ; « Number of… » a un champ de saisie. « Generate Covers » prend la couleur d'accent comme les deux autres (il était rouge d'alerte).
- Barre de fournisseur (Extractor et Logo) : modèles Gemini et Mammouth avec recherche.
- Boutons posés sur les vignettes de résultat (Extractor, Logo) et bouton « Send to LTX » : leur fond utilisait une opacité sans effet, ils étaient donc sans fond sur l'image assombrie. Ils ont maintenant un fond plein. Le message d'erreur d'une vignette d'Extractor est maintenant rouge.

### 2026-11-20 — B5f, étape 4 : Outpaint et Upscale

Fichiers touchés : `components/OutpaintPanel.tsx`, `components/UpscalePanel.tsx`, `components/ZImageCreativeUpscalePanel.tsx`, `components/InputComponents.tsx`, `scripts/browser/lock-release-check.mjs`.

- Outpaint : sections du kit dans l'ordre standard — **Models, LoRAs, Sampler, Advanced** (avant : « Models & CLIP », « LoRA Settings », « Sampler Settings »). Cache, raccord (Stitch) et prompt envoyé passent dans Advanced. Listes avec recherche ; modèle de diffusion et LoRA filtrés sur QWEN 2.1. « Scene » est une zone de prompt, déplacée à droite juste avant le bouton Outpaint.
- Upscale : le bouton « Advanced » de l'en-tête disparaît. Les réglages sont des sections dans la colonne de gauche : Models et Advanced pour SeedVR2 ; Models, LoRAs, Sampler et Advanced pour Z-Image Creative Upscale, dont le prompt et le bouton passent à droite au-dessus des images. UNET et LoRA de Z-Image filtrés sur leur famille.
- Les trois seeds utilisent le champ standard. « Aléatoire » se choisit avec la case « New seed for every run » ; avant, il fallait taper −1 (Outpaint) ou vider le champ (Upscale). La valeur enregistrée est la même.
- `EditableNumberInput` n'a plus d'appelant : supprimé de `InputComponents.tsx`.
- Le harnais des verrous ouvre les nouvelles sections d'Outpaint et compte aussi les listes avec recherche.

Trois écarts de comportement, à connaître :

1. Une valeur absente du catalogue ComfyUI s'affiche « (not listed) ». Avant, Outpaint et Z-Image l'affichaient comme un choix normal. C'est la règle du kit : jamais de repli silencieux.
2. Z-Image avait deux champs pour la même valeur : « Prompt Prefix » dans Advanced et « Prompt Direction ». Seul « Prompt Direction » reste.
3. Un champ numérique du kit n'applique qu'une valeur valide. Avant, vider un champ de Z-Image envoyait 0.

### 2026-11-20 — B5f, étape 5 : outils média de Tools

Fichiers touchés : `components/VideoUtilsPanel.tsx`, `components/ReferenceMakerPanel.tsx`, `components/VoiceRecorderPanel.tsx`, `components/AudioExtractorPanel.tsx`, `components/VideoClipExtractor.tsx`, `components/VideoMergePanel.tsx`, `components/VideoOutputFrames.tsx`, `components/ui/styles.ts`, `components/ui/fields.tsx`.

- Listes au kit : ratio de recadrage (image et vidéo), Reference Maker (ratio, colonnes, résolution), micro du Voice Recorder.
- Curseur et champ : Resize (image et vidéo), Number of Colors, Spacing. Largeur et hauteur de sortie vidéo, noms de palette, de planche et de voix : champs du kit.
- **Gardés tels quels, avec le style du kit** : les curseurs de lecture (position dans la vidéo ou le son, fenêtre visible, comparaison avant/après) et les champs de découpe « début / fin en secondes » avec le champ FPS. Ce ne sont pas des réglages : les champs de découpe acceptent exprès une valeur vide ou hors bornes pour afficher leur message (« End must be after start… »), ce que le champ du kit ne fait pas.
- Les curseurs de réglage et les curseurs de lecture de ces outils partagent maintenant la même classe (`ui.slider`).
- Couleurs fixes remplacées par le thème : textes et bordures cyan d'Audio Extractor et du sélecteur d'image de sortie, encadré d'aide du Voice Recorder, messages d'erreur rouges fixes.

Deux tests adaptés pour charger les styles du kit (`AudioExtractorPanel.test.mjs`, `VideoOutputFrames.test.mjs`) ; aucune assertion modifiée.

### 2026-11-20 — Vérification de B5f

Comparaison avec les relevés d'avant, sans exercice :

| Onglet | Contrôles avant → après, par écran | Écart |
| --- | --- | --- |
| TTS | 15 → 20, 16 → 21, 14 → 30, 16 → 33 | Champs à côté des curseurs. Pour TTS Advanced, le relevé d'avant ne comptait pas les cinq réglages « Engine settings », restés fermés |
| Prompt | 1, 2, 3, 1, 1 inchangés ; 1 → 2 | Champ de Creativity |
| Extractor | 3, 4, 2 inchangés ; 2 → 3, 2 → 3, 0, 2, 4 → 6 | Champs à côté des curseurs |
| Logo | 4 → 5, 4 → 5, 7 → 8 | Champ de « Number of… » |
| Tools, outils média | 2, 4, 5, 4, 8, 1 inchangés ; 7 → 8, 1 → 2, 2 → 3, 6 → 7 | Champs à côté des curseurs |
| Tools, Outpaint | 27 → 28, 31 → 32 | Case « New seed for every run » |
| Tools, Upscale | 29 → 38, 69 → 71 | Champs à côté des curseurs, cases de seed ; « Prompt Prefix » retiré |

Mêmes valeurs par défaut partout. Les seules lignes « changed » sont des listes natives devenues listes avec recherche, et les « (not listed) » décrits plus haut (le catalogue simulé du harnais ne contient pas ces modèles).

| Vérification | Fin de B5d | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 5,76 s |
| `check:panels` TTS, Prompt, Extractor, Logo, Tools, avec exercice | — | 4/4, 6/6, 8/8, 3/3, 14/14, aucune erreur de page |
| `check:panels` Video, Scene Variation, QWEN 2.1 I2I, Character, Image Generator, Fun, avec exercice | 10/10, 5/5, 4/4, 7/7, 22/22, 14/14 | Identique |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Seul TTS change : 3 listes natives → 2 natives et 1 avec recherche. Nouvelle référence enregistrée |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Le typecheck ne vérifie pas les propriétés passées à la plupart des composants du kit (champs, sections, zone de prompt) : le projet n'a pas les types de React. Seules celles des listes sont vérifiées. La preuve que les contrôles sont bien branchés vient de l'exercice du harnais : chaque liste, curseur et champ numérique affiché reçoit une nouvelle valeur et doit la montrer. Un second passage (nouvelle option `LAWIZ_AUDIT_TEXT=1`) tape aussi dans chaque champ texte et zone de prompt modifiable des cinq onglets de B5f : 4/4, 6/6, 8/8, 3/3, 14/14. Les cases à cocher ne sont pas exercées.

Captures relues, thème par défaut : TTS Voice Clone, TTS Advanced en dialogue, Album Cover, Outpaint, Z-Image Creative Upscale, Resize & Crop vidéo. Dans « Studio Light » : Audio Extractor, Upscale SeedVR2, TTS Advanced.

Non vérifié :

- aucune génération, analyse, extraction, fusion ni enregistrement lancé ; aucune exécution dans Electron ;
- les écrans d'après traitement : éléments identifiés d'Extractor, résultats et zoom de Logo, résultat et comparaison d'Outpaint et d'Upscale, prompt Florence2 de Z-Image ;
- TTS avec des voix installées (le catalogue simulé n'en renvoie aucune) et avec une voix de la Library ;
- Logo avec références, palette ou police chargées ;
- le Voice Recorder en enregistrement (pas de micro dans le navigateur de test) ;
- les autres écrans dans « Studio Light », et les thèmes « Synthwave » et « 70s Groove » ;
- les captures non citées ci-dessus n'ont pas été relues ;
- le filtre par My Library (inventaire de test vide).

### État de B5f

**Terminé.** Reste pour B5g (Library, Models/LoRAs, réglages) : 16 listes natives dans 5 fichiers (`LibraryPanel` 10, `ImagePromptModal` 2, `StyleBrowser` 2, `StyleGalleryPanel` 1, `OpenRouterSettings` 1), et 52 classes d'opacité sans effet dans 15 fichiers.

### 2026-11-20 — B5g (Library, Models/LoRAs, Gestionnaire de styles, fenêtres de réglages), étape 1 : relevés de référence

Fichier touché : `scripts/browser/panel-controls-audit.mjs`.

- Quatre nouveaux groupes : `library` (2 écrans), `models` (4), `styles` (2), `settings` (2 : Connection Settings et Visual Settings).
- Le harnais lit maintenant aussi les contrôles des fenêtres ouvertes (certaines sont affichées hors de la zone de contenu), peut cliquer un bouton de l'en-tête et appuyer sur une touche.
- Relevés d'avant : `%TEMP%\lawiz-{library,models,styles,settings}-controls-before.json`, avec captures.

Constat du relevé : l'onglet Models/LoRAs était déjà entièrement sur les listes du kit (30 listes par l'enveloppe `MenuSelect` de B4). Il n'y avait rien à y migrer, sauf deux bordures.

### 2026-11-20 — B5g, étape 2 : Library et Gestionnaire de styles

Fichiers touchés : `components/LibraryPanel.tsx`, `components/StyleBrowser.tsx`, `components/StyleGalleryPanel.tsx`, `components/BlazingFastCharacterPanel.test.mjs`.

- Library : les dix listes passent au kit (tri, éléments par page et page en haut et en bas, fournisseur et workflow des filtres Images et Characters, filtre Safety, choix d'un tag existant). Les deux listes de tags ont la recherche. Le champ de recherche et les champs de tag ont le style du kit.
- **Correction liée aux listes qui se ferment** : les deux barres de pagination de la Library étaient recréées à chaque rafraîchissement de l'onglet (composant déclaré pendant le rendu). Une liste de pagination ouverte se refermait donc dès que la Library se redessinait. Elles ne sont plus recréées. Prouvé par le harnais : avant ce changement, il ne pouvait exercer que 2 des 4 listes (les deux de pagination disparaissaient entre deux actions) ; après, les 4.
- Le message d'état du projet et le bouton « Detect common terms » utilisent le vert et le jaune du thème : ils étaient presque illisibles dans « Studio Light ».
- Gestionnaire de styles : filtre de modèle et pagination au kit. Dans la fenêtre d'édition : Title est un champ du kit, Trigger et Style prompt sont des zones de prompt, LoRA strength est un champ numérique du kit.
- Le champ Model de la fenêtre d'édition était une zone de texte avec suggestions. C'est maintenant une liste des modèles connus avec une entrée « Custom... » pour en taper un autre, comme Installed LoRA path, Sampler et Scheduler juste à côté.
- Gardés en champs simples, avec le style du kit : Steps, CFG et Megapixels du style. Ils doivent pouvoir rester vides (« réglage du générateur »), ce que le champ numérique du kit ne permet pas.

Les listes de la fenêtre d'édition de style restent des listes natives du kit, sans recherche : cette fenêtre est une boîte de dialogue native du navigateur, et la liste avec recherche s'ouvrirait derrière elle.

Le test Blazing charge le kit pour ces deux fichiers ; aucune assertion modifiée.

### 2026-11-20 — B5g, étape 3 : fenêtres de réglages et de prompt

Fichiers touchés : `components/ComfyUIConnection.tsx`, `components/OpenRouterSettings.tsx`, `components/VisualSettingsModal.tsx`, `components/ImagePromptModal.tsx`, `components/VideoReferenceEditor.tsx`, `components/ImageStyleControl.tsx`, et trois tests (`krea2Style`, `mossStyle`, `styleSampling`).

- Connection Settings : tous les champs ont le style du kit. Le modèle OpenRouter par défaut (476 modèles dans le catalogue reçu pendant l'essai) est une liste avec recherche. Le modèle Ollama par défaut reste une zone de texte ; après « Test », il devient une liste avec recherche des modèles installés (avant : zone de texte avec suggestions).
- Visual Settings : la taille de l'interface garde son curseur et gagne un champ de saisie.
- Generate Prompt from Image : listes et champs du kit ; le prompt généré est une zone de prompt. Le modèle d'analyse reste une zone de texte ; après « Load available models », il devient une liste avec recherche. Les deux boutons d'accent avaient un texte de la couleur du fond de page ; ils utilisent la couleur de texte prévue pour l'accent.
- Éditeur de référence vidéo (onglet Video) et force du LoRA de style (Image Generator) : champs numériques du kit. Ces deux fichiers avaient été oubliés dans B5d et B5a.

Un écart de comportement : une fois la liste des modèles chargée (Ollama, ou modèle d'analyse), on choisit dans la liste et on ne peut plus taper un nom libre. Dans Connection Settings, rouvrir la fenêtre redonne la zone de texte. Dans Generate Prompt from Image, la liste reste jusqu'au rechargement de l'application (pour Ollama, changer l'URL redonne aussi la zone de texte).

### 2026-11-20 — B5g, étape 4 : fin des classes d'opacité sans effet

Fichiers touchés : `components/ImageGrid.tsx`, `components/OAuthHelperModal.tsx`, `components/ComfyUIConnectionHelperModal.tsx`, `components/CivitaiInventoryPanel.tsx`, `components/Loader.tsx`, `components/Header.tsx`, `components/LibraryPickerModal.tsx`, `components/LibraryPromptButton.tsx`, `components/SaveStyleSamplingButton.tsx`, `components/CreationSuiteResult.tsx`, `App.tsx`.

Les 52 classes restantes sont traitées : il n'en reste **aucune** dans l'application (187 au départ).

- Boutons posés sur les images générées (grille de résultats d'Image Generator et de Character) : fond plein, comme dans Extractor et Logo. Ils étaient sans fond.
- Fonds décoratifs sans effet : retirés, l'affichage ne change pas.
- **En-tête de l'application et barre d'onglets** : leur fond prévu (demi-opaque) n'a jamais été appliqué ; ils sont transparents avec un flou, et le contenu défile visiblement dessous. J'ai retiré la classe sans effet **sans changer l'affichage**. Les rendre opaques changerait l'allure de toute l'application : décision laissée à l'utilisateur (point ouvert 11).

### 2026-11-20 — Vérification de B5g

Comparaison avec les relevés d'avant, sans exercice :

| Écran | Contrôles avant → après | Écart |
| --- | --- | --- |
| Library, par défaut et avec filtres | 8 → 8, 12 → 12 | Noms des listes précisés (« Items per page top », « Image provider filter »…) |
| Models/LoRAs, quatre sections | 4, 7, 10, 3 inchangés | Aucun |
| Gestionnaire de styles, galerie et fenêtre d'édition | 6 → 6, 20 → 20 | Model : zone de texte → liste |
| Connection Settings | 10 → 10 | Modèle OpenRouter : liste native → liste avec recherche |
| Visual Settings | 2 → 3 | Champ de la taille d'interface |

Mêmes valeurs partout.

| Vérification | Fin de B5f | Maintenant |
| --- | --- | --- |
| Tests `npm test` | 972 tests : 958 réussis, 0 en échec, 14 ignorés | Identique |
| `npm run typecheck` | 18 erreurs | 18 erreurs, mêmes 9 fichiers |
| Build Vite (dossier temporaire) | Réussi | Réussi en 6,04 s |
| `check:panels` Library, Models/LoRAs, Styles, Settings, avec exercice et saisie de texte | — | 2/2, 4/4, 2/2, 2/2, aucune erreur de page |
| `check:panels` des onze autres groupes, avec exercice | 14, 4, 6, 8, 3, 10, 5, 4, 7, 22, 14 | Identique |
| `check:locks`, `check:tab-jobs`, `check:ui` | 13/13, 6/6, 12/12 | 13/13, 6/6, 12/12 |
| `check:tabs` | Référence | Identique |
| `profile:renders` | 5 vérifications réussies | 5 vérifications réussies |

Captures relues, thème par défaut : Library avec filtres, fenêtre d'édition de style, Connection Settings, Visual Settings. Dans « Studio Light » : Library avec filtres (reprise après le changement de couleur du message d'état), fenêtre d'édition de style.

Non vérifié :

- la Library avec des éléments : la Library du navigateur de test est vide. La fiche d'un élément, les deux listes de tags existants, la pagination sur plusieurs pages et les boutons posés sur les vignettes n'ont pas été affichés ;
- les boutons posés sur les images générées (aucune génération lancée) ;
- Models/LoRAs avec un inventaire : les cartes de modèle et leurs listes ne sont pas affichées en mode navigateur ;
- Connection Settings après « Test » d'Ollama, et la fenêtre Generate Prompt from Image : lus dans le code, pas affichés ;
- l'éditeur de référence vidéo et la force du LoRA de style : pas affichés (il faut une référence chargée, ou un style choisi) ; couverts seulement par le typecheck et, pour le second, par ses trois tests ;
- les fenêtres d'aide (OAuth, connexion ComfyUI) et l'écran de chargement, où seules des classes sans effet ont été retirées ;
- aucune exécution dans Electron.

### État de B5g et de B5

**B5g terminé. B5 terminé** : tous les onglets et les fenêtres de réglages utilisent le kit.

Ce qui reste hors kit dans toute l'application, compté le 2026-11-20 :

| Contrôle brut | Reste | Nature |
| --- | --- | --- |
| Liste native | 1 | Modèle OpenRouter du Video Prompt Generator : structure imposée par ses tests |
| Suggestions (`datalist`) | 3 | Video Prompt Generator 2, H3 1 : champs où l'on tape un nom libre |
| Zone de texte | 14 dans 10 fichiers | Analyses à longueur limitée de Scene Variation (4), MOSS PHOTO (2), éditeurs à jetons colorés, champs compacts des cartes de modèle |
| Curseur | 20 dans 15 fichiers | Lecture, position, comparaison avant/après, émotions colorées |
| Champ numérique | 20 dans 11 fichiers | Découpe début/fin et FPS, valeurs qui peuvent rester vides, champs compacts des cartes de modèle |

Ces restes ne sont pas tous des exceptions vérifiées une à une : je n'ai pas rouvert chaque zone de texte et chaque champ numérique des panneaux des briques précédentes pour confirmer sa raison d'être.

### 2026-11-20 — Après B5 : en-tête et barre d'onglets opaques

Décision de l'utilisateur sur le point ouvert 11 : les rendre opaques. Fichiers touchés : `components/Header.tsx`, `App.tsx`.

- L'en-tête a le fond des cartes, la barre d'onglets le fond de page. Le flou est retiré : il ne sert plus sous un fond opaque.
- **Changement non demandé, conséquence directe** : la barre d'onglets se collait tout en haut de la fenêtre, donc par-dessus l'en-tête. Tant qu'elle était transparente, les deux se superposaient ; opaque, elle cachait le titre, le badge du fournisseur et « Welcome » dès qu'on défilait (vu sur capture). Elle se colle maintenant juste sous l'en-tête, dont elle suit la hauteur. Elle occupe donc 39 px de plus en haut de l'écran quand on défile.

Vérifié : positions mesurées dans les quatre thèmes (en-tête 0 à 120 px, onglets 120 à 159 px après défilement, fonds opaques) ; captures relues en Cyberpunk, Studio Light et 70s Groove (fenêtre de 900 px). 972 tests (958 réussis, 0 en échec, 14 ignorés), typecheck 18 erreurs (mêmes fichiers), build Vite temporaire réussi, `check:locks` 13/13, `check:tab-jobs` 6/6, `check:ui` 12/12, `profile:renders` 5 réussies, `check:tabs` identique, `check:panels` Image 22/22 et Library 2/2.

Non vérifié : Electron ; un en-tête qui passe sur deux lignes (à 900 px de large il reste sur une) ; les menus de l'en-tête, s'ils dépassent sous lui, passent derrière la barre d'onglets comme avant.

### 2026-11-20 — Thème clair : une base claire solide

Demande de l'utilisateur : un thème clair qui fonctionne partout (une autre personne utilise l'application et l'a signalé), et plus tard des thèmes personnalisables sur deux bases, une sombre (Cyberpunk) et une claire.

Fichiers touchés : `index.html`, `utils/accentTheme.ts`, `components/SystemMetricsIndicators.tsx`, `components/FunTab.tsx`, `components/VideoMergePanel.tsx`, `scripts/browser/panel-controls-audit.mjs`.

**Mesure d'abord.** Le harnais `check:panels` sait maintenant mesurer le contraste de chaque texte visible contre le fond réellement peint derrière lui (`LAWIZ_AUDIT_CONTRAST=fichier.json`, norme WCAG : 4,5:1 pour un texte normal, 3:1 comme plancher). Mesuré sur les 107 écrans qu'il sait ouvrir, 11 010 textes :

| Thème | Sous 3:1 avant | Sous 3:1 après | Sous 4,5:1 avant | Sous 4,5:1 après |
| --- | --- | --- | --- | --- |
| Studio Light | 2 473 | 3 | 3 075 | 46 |
| Cyberpunk | 190 | 191 | 915 | 916 |

Dans Studio Light, près d'un texte sur quatre était sous le plancher. Trois causes en expliquaient presque tout : les jauges système de l'en-tête (texte blanc sur gris, 1 070 mesures car l'en-tête est sur chaque écran), la couleur d'accent pastel de chaque onglet, et les textes de couleur claire fixe.

**Le mécanisme, au lieu de 587 remplacements.** Les classes de couleur fixe ne sont pas réécrites :

- Dans `index.html`, les couleurs de la palette utilisées comme encre (texte, bordure, anneau de focus) passent par des variables. Sur une base sombre elles valent exactement la palette d'origine. Sur la base claire, les teintes claires deviennent foncées (100 → 900, 200 → 800, 300 à 500 → 700). Les fonds ne sont pas touchés : un fond teinté reste un fond teinté, un bouton plein reste plein.
- Les accents par onglet (`utils/accentTheme.ts` et les tables des sous-onglets) suivent la même bascule sans changer aucun appel.
- Une variante `light:` existe pour les cas particuliers (`light:bg-black/75`). Utilisée deux fois : jauges système, sous-onglets Fun à texte blanc.
- Couleurs propres au thème Studio Light foncées : texte discret `#6b7280` → `#5d6470`, erreur `#ef4444` → `#b91c1c`, vert `#16a34a` → `#15803d`, jaune `#ca8a04` → `#a16207`.

Pour les futurs thèmes personnalisables : la bascule est attachée à un seul sélecteur (`:root[data-theme="studio-light"]`, deux endroits dans `index.html`). Une « base claire » reviendra à élargir ce sélecteur.

**Preuve que les thèmes sombres ne bougent pas.** Les 194 classes de couleur fixe distinctes du code ont été rendues avant et après dans Cyberpunk : 0 différence. La liste des textes peu contrastés de Cyberpunk est identique sur 106 écrans sur 107 ; le seul écart est le bouton ci-dessous. Synthwave et 70s Groove utilisent les mêmes valeurs par construction ; non mesurés.

**Un changement qui touche aussi les thèmes sombres** : le bouton « Merge videos » (Tools) portait deux fonds contradictoires et s'affichait gris au lieu de la couleur d'accent, donc blanc sur gris clair dans le thème clair. Il a maintenant son fond d'accent dans tous les thèmes.

**Ce qui reste sous 4,5:1 dans Studio Light (46 textes)** :

- 35 entre 4,3 et 4,5 : le badge du fournisseur dans l'en-tête et le libellé de l'onglet actif, sur leur fond teinté ;
- 4 à 4,24 : le badge vert « ComfyUI » de TTS ;
- 3 à 2,72 : les consignes grises sur l'aperçu noir de LTX Director (identiques dans Cyberpunk) ;
- 4 autres entre 3,8 et 4,5 (bouton « Search ArchiveCivit », deux valeurs du redimensionnement vidéo, un libellé de LTX Director).

Vérifié : 972 tests (958 réussis, 0 en échec, 14 ignorés), typecheck 18 erreurs (mêmes fichiers), build Vite temporaire réussi (le script des couleurs est bien dans le `index.html` produit), `check:locks` 13/13, `check:tab-jobs` 6/6, `check:ui` 12/12, `profile:renders` 5 réussies, `check:tabs` identique, `check:panels` avec exercice Fun 14/14 et Tools 14/14, les 15 groupes parcourus dans les deux thèmes sans erreur de page. Captures relues dans le thème clair : Image Generator FLUX2, Video H3, Models/LoRAs Civitai.

Limites de la mesure, donc non vérifié :

- seuls les textes sont mesurés : ni les icônes, ni les bordures, ni les textes d'aide dans les champs vides, ni les contrôles désactivés, ni les textes posés sur une image ou un dégradé ;
- seuls les états au repos : ni le survol, ni les messages d'erreur ou de progression qui n'apparaissent que pendant un travail ;
- seuls les écrans que le harnais ouvre : pas la Library avec des éléments, pas les cartes de modèles, pas les résultats de génération, pas les fenêtres d'aide ;
- 3 captures relues sur 107 ;
- rien dans Electron.

Constat laissé tel quel (point ouvert 13) : dans Cyberpunk, les 191 textes sous 3:1 sont presque tous du texte blanc sur un bouton d'accent pastel (bouton du fournisseur ou du workflow sélectionné, par exemple blanc sur cyan : 1,81:1).

### 2026-11-20 — Liste « À régler » : les trois derniers points

Demande de l'utilisateur : régler la liste « À régler » avant B6. Fichiers touchés : `components/AudioExtractorPanel.tsx`, `components/OptionsPanel.tsx`, `scripts/browser/ui-kit-check.mjs`.

**Audio Extractor : décimales des champs Start et End (point 5).** Les deux champs affichent maintenant le temps au millième, comme la durée affichée à côté (3.019 au lieu de 3.01859410430839). La valeur exacte est conservée en interne : « Select full track » exporte toujours la piste entière. Cas prévu : retaper la durée arrondie de la piste (3.019 alors que la piste fait 3,0186 s) désigne la fin exacte et ne déclenche pas le message « hors de l'enregistrement ».

Vérifié dans le navigateur avec le fichier d'essai : affichage après chargement, saisie de 1.2345678 (affiché 1.235), saisie de la durée arrondie (acceptée), saisie de 99 (message de validation toujours affiché), « Select full track », saisie dans Start.

Non corrigé, même famille : les champs de découpe de H3 (référence audio), Clips, Merge et Frames peuvent afficher une longue suite de décimales après « Set start here » ou « Set end here ». Non observé avec le fichier d'essai (aucun autre champ à plus de trois décimales sur les 14 écrans Tools), mais ces boutons n'ont pas été cliqués.

**`check:ui` intermittent (point 3).** Cause probable trouvée, non reproduite :

- Mesuré : chaque scénario recharge une page qui attend quatre sites tiers (Tailwind, deux sites de polices, une feuille de style) avant de démarrer, soit 13 chargements par exécution, sans cache partagé.
- Prouvé : si un seul de ces sites ne répond pas, la page ne se charge pas et le délai expire. C'est exactement le seul échec capturé (délai dépassé au chargement).
- Non prouvé : que les trois échecs du 2026-11-19 venaient bien de là. Le réseau était rapide pendant les essais d'aujourd'hui.

Correction du harnais : chaque ressource tierce est téléchargée une seule fois par exécution ; si un chargement expire, le message dit quelle adresse était encore en attente ; un échec de la dernière étape (sonde d'opacité et captures) est rapporté comme un échec au lieu d'interrompre le script sans résumé.

Résultat : 25 exécutions de suite, 0 échec, 9,6 s en moyenne (8,7 à 16,2 s). Au taux d'échec d'avant (3 sur 22), 25 réussites de suite arrivent par hasard environ une fois sur 40 : c'est un bon indice, pas une certitude. À rouvrir si un échec revient ; le message dira alors quoi regarder.

Même fragilité, non traitée : la page de l'application attend les mêmes sites tiers à chaque démarrage (même `index.html`). Je n'ai pas essayé l'application hors ligne. C'est un sujet d'empaquetage, pas de harnais (point ouvert 14).

**Expression régulière `Flux|` sans effet (`OptionsPanel.tsx`, notée à la fin de B1).** Retirée : plus aucun code n'envoie de champ LoRA de l'ancien FLUX 1 depuis B1.

Vérifié après les trois changements : 972 tests (958 réussis, 0 en échec, 14 ignorés), typecheck 18 erreurs (mêmes fichiers), build Vite temporaire réussi, `check:locks` 13/13, `check:tab-jobs` 6/6, `profile:renders` 5 réussies, `check:tabs` identique, `check:panels` avec exercice Tools 14/14 et Image 22/22. Rien dans Electron.

### 2026-11-20 — Cyberpunk : texte lisible sur les boutons d'accent

Décision de l'utilisateur sur le point ouvert 13 : « arrange cyberpunk ». Fichiers touchés : `index.html`, `utils/accentTheme.ts`, `components/FunTab.tsx`, `components/LTXDirectorPanel.tsx`, `components/LibraryPanel.tsx`.

- **Boutons d'accent** : sur une base sombre, le texte posé sur la couleur d'accent d'un onglet est maintenant foncé (`#030712`) au lieu de blanc. Les accents par onglet étant les mêmes pastels dans les trois thèmes sombres, Synthwave et 70s Groove en profitent aussi à l'intérieur des onglets. Dans le thème clair rien ne change : texte blanc sur accent foncé.
- **Survol** : avec un texte foncé, un bouton d'accent qui fonce au survol deviendrait moins lisible. Sur une base sombre il s'éclaircit donc au survol ; sur la base claire il fonce (teinte 800).
- **Accent propre à Cyberpunk** (fenêtres hors onglet) : même texte foncé.
- **Sous-onglets de Fun** : Photo Fusion, Past Forward et Swap a Person sélectionnés ont un texte noir, comme l'avaient déjà Swap Anything et Stylise Anything.
- **Flèches de la visionneuse de la Library** : l'icône prend la couleur du texte d'accent quand le bouton passe à l'accent au survol.

Deux changements au-delà de la question posée, faits parce qu'ils portaient presque tout le reste des textes peu contrastés de Cyberpunk :

- **Texte discret de Cyberpunk** : `#6b7280` → `#8b93a1`. 710 textes d'aide et noms de fichiers étaient entre 3,0 et 4,2:1 sur les trois fonds du thème. C'est une seule ligne de `index.html`, facile à remettre si l'ancien gris est préféré.
- **Consignes grises sur l'aperçu noir de LTX Director** : un cran plus clair (2,72 → 4,35:1).

Mesure dans Cyberpunk sur les 107 écrans (11 010 textes avant ; 10 874 après, la mesure finale ayant été faite pendant l'exercice des contrôles, qui fait varier quelques textes) :

| | Avant | Après |
| --- | --- | --- |
| Sous 3:1 | 191 | 0 |
| Sous 4,5:1 | 916 | 4 |

Les 4 restants : les trois consignes de LTX Director (4,35:1) et le bouton « Search ArchiveCivit » (blanc sur vert, 3,77:1).

Thème clair remesuré après ces changements : 0 texte sous 3:1 (3 avant : les consignes de LTX Director), 46 sous 4,5:1 (inchangé).

Vérifié :

- couleurs lues dans le navigateur sur le bouton du fournisseur sélectionné d'Image Gen : texte foncé sur cyan pastel dans Cyberpunk, Synthwave et 70s Groove ; blanc sur cyan foncé dans Studio Light ;
- couleurs de survol d'un bouton d'accent dans cet onglet : cyan plus clair dans Cyberpunk, cyan plus foncé dans Studio Light ;
- 972 tests (958 réussis, 0 en échec, 14 ignorés), typecheck 18 erreurs (mêmes fichiers), build Vite temporaire réussi, `check:locks` 13/13, `check:tab-jobs` 6/6, `check:ui` 12/12, `profile:renders` 5 réussies, `check:tabs` identique, `check:panels` des 15 groupes avec exercice dans Cyberpunk : 107 écrans sur 107.

Non vérifié :

- Synthwave et 70s Groove n'ont pas été mesurés. Hors des onglets, leur propre couleur d'accent garde un texte blanc, et leur texte discret n'a pas changé ;
- le survol n'a été lu que dans un onglet ;
- deux captures Cyberpunk relues (Image Gen FLUX2, Photo Fusion), avant le changement du texte discret ; aucune après ;
- rien dans Electron.

## B6 — Audit de la documentation et des nœuds ComfyUI requis

### 2026-11-20 — B6, étape 1 : `COMFYUI_REQUIRED_NODES.txt`

Fichier touché : `COMFYUI_REQUIRED_NODES.txt`.

Méthode : un script a relevé chaque classe de nœud écrite dans les workflows de l'application (`constants.ts`, les constructeurs de `services/`, les fichiers `assets/*.json`). Le ComfyUI local (lecture seule de `/object_info`, aucun travail lancé) a donné pour chaque classe le paquet qui la fournit. Les adresses des dépôts viennent des dossiers `custom_nodes` de cette installation.

| | Écrit dans le fichier avant | Mesuré dans le code |
| --- | --- | --- |
| Classes de nœuds | 85 (51 natives + 34 externes) | 212 (103 natives + 109 externes) |
| Paquets externes | 22 | 45 |

Le fichier était donc très en retard : ses sections par fonction citaient les nœuds récents, mais sa liste d'installation et son inventaire ne couvraient que les fonctions d'origine.

Changements :

- En-tête : date, méthode, totaux et limites de l'audit.
- Liste d'installation : nœuds corrigés pour 7 paquets déjà listés (KJNodes passe de 4 à 11 nœuds, rgthree de 1 à 5, TTS Audio Suite de 2 à 5…), et 22 paquets ajoutés ([26] à [47]) avec leur dépôt, leurs nœuds et les fichiers source qui les utilisent.
- Inventaire exhaustif : remplacé par les 212 classes. Deux classes natives qui n'étaient plus utilisées par aucun workflow en sortent (`KSamplerAdvanced`, `ModelSamplingSD3`).
- État de l'installation de référence : les 212 classes sont chargées dans le ComfyUI local.
- Chemins de navigation mis à jour (« Image Gen », « Video > LTX > … », « Video > H3 > … »).

Vérifié par script après modification : les 212 classes du code sont toutes nommées dans le fichier ; l'inventaire contient exactement ces 212 classes, ni plus ni moins ; aucune classe marquée native n'est externe dans l'installation locale, et inversement ; chaque classe externe figure dans la liste d'installation.

Limites :

- « Native » veut dire fournie par ComfyUI dans l'installation locale à cette date. Un ComfyUI plus ancien peut ne pas avoir les classes récentes.
- Les sections par fonction (environ 450 lignes de texte) n'ont pas été relues phrase par phrase : seuls leurs noms de classes ont été confrontés au code. Leurs noms de fichiers de modèles et leurs valeurs par défaut ne sont pas vérifiés.
- Pour les 22 paquets ajoutés, le fichier indique les fichiers source concernés, pas une description de la fonction.
- Le relevé repose sur la façon dont le code écrit ses nœuds. Une classe construite autrement (nom assemblé à l'exécution) lui échapperait ; je n'en ai pas trouvé.

Constat non traité : `services/installationDiagnostics.ts` (le tableau de bord d'installation) ne cite pas 55 des 212 classes, dont 39 externes, et cite encore `KSamplerAdvanced` et `ModelSamplingSD3`. Ce fichier n'importe aucune liste de nœuds d'un autre module : le tableau de bord ne contrôle donc pas ces 55 classes et peut annoncer une fonction comme prête alors qu'un nœud manque. Je n'ai pas vérifié quelles fonctions sont touchées (point ouvert 15).

### 2026-11-20 — B6, étape 2 : README et `docs/`

Fichiers touchés : `docs/README.md`, `docs/connections.md`, `docs/development.md`, `docs/reference/comfyui-workflows.md` et, dans `docs/features/`, `character-swap-h3.md`, `creative-tools.md`, `images-and-characters.md`, `ltx-and-audio.md`, `minimax-h3.md`, `models-and-loras.md`, `scene-variation.md`, `swap-and-fusion.md`.

Méthode : les 17 documents ont été lus en entier par un sous-agent qui a confronté leurs affirmations au code (libellés, onglets, fournisseurs, nœuds, chemins, commandes, liens). J'ai revérifié dans le code la preuve de presque tous les écarts avant de corriger ; la nouvelle description de la disposition de FLUX2 Edit repose sur le relevé du sous-agent et sur le travail de B5a.

37 corrections dans 12 fichiers. `README.md`, `docs/getting-started.md`, `docs/features/library.md`, `docs/features/video-prompt-generator.md` et `docs/screenshots/README.md` : aucun écart trouvé. Aucune mention de FLUX 1, Nunchaku, FLUX Krea ou WAN 2.2 ne restait.

| Famille d'écart | Exemples |
| --- | --- |
| Disposition changée pendant B5 | « right-hand LoRA panel », « LoRA Settings », « Qwen 2.1 Advanced Settings », « FLUX2 settings » → sections **Models**, **LoRAs**, **Sampler**, **Advanced** à gauche ; les modèles SeedVR2 sont dans **Models**, plus dans **Advanced** |
| Chemins de navigation | « Image Generation » → **Image Gen** (7 endroits) ; « Video > Minimax REF2v H3 » → **Video > H3 > …** ; « Video > LTX-Ripple-FFAF » → **Video > LTX > …** ; Scene Variation « between Character and LTX Director » |
| Listes incomplètes | Gemini manquait dans Photo Fusion, Past Forward et Image Gen ; Gemini et OpenRouter manquaient dans l'analyse de prompt |
| Valeurs | CacheDiT de LTX Director : 6 étapes et intervalle 4 pour LTX 2.3, pas 8 et 3 ; « up to three LoRAs » → cinq emplacements ; « Images to Generate » → **Number of Images** |
| Outils de développement | « There is no `npm test` script » : il existe ; commandes `test`, `typecheck` et vérifications navigateur ajoutées au tableau |
| Lien | Ancre `#portable-archives` inexistante dans `library.md` |

Non vérifié, donc peut-être encore faux dans les documents :

- la plupart des valeurs par défaut chiffrées, des plages et des noms de fichiers de modèles ;
- les comportements décrits (annulation, persistance, ordre des validations, contenu d'un instantané Library) ;
- les dispositions gauche/droite de MiniMax Advanced, de Creation suite et des sorties de Character (`images-and-characters.md` ligne 46 parle encore de « wide right column ») ;
- les adresses externes et les attributions à des auteurs tiers ;
- les captures d'écran : le dossier contient trois images ; je n'ai pas regardé si elles montrent encore l'interface actuelle.

Aucun code n'a changé dans B6 : les vérifications de code n'avaient pas à être relancées pour cette brique.

### État de B6

**Terminé**, dans les limites écrites ci-dessus. Reste du plan : B7 (suggestions), optionnel. Points ouverts en attente de l'utilisateur : 14 (sites tiers au démarrage) et 15 (tableau de bord d'installation).

## Version 2.0.0

### 2026-11-20 — Passage à la version 2.0.0 et installateur Windows

Demande de l'utilisateur : passer à la version 2, préparer le message de commit, compiler l'installateur Windows dans `dist`.

Fichiers touchés : `package.json`, `package-lock.json`, `version.json`, `README.md`, `docs/development.md`.

- Version `1.88.0` → `2.0.0` (`package.json`, `package-lock.json`, badge du README, guide de développement). `version.json` passe à `2.0` avec la date du jour et un résumé des changements : c'est le texte de l'infobulle du numéro de version dans l'en-tête.
- README : nouvelle section « What's new in 2.0 » ; l'ancienne devient « Added in 1.88 ».

Installateur, par la commande du projet `npm run electron:build` :

- `dist\lawiz's-media-generator-v-2 Setup 2.0.0.exe`, 252 Mo, avec son `.blockmap` et `latest.yml`.
- Cette commande vide `dist` avant de construire : l'installateur 1.88.0 qui s'y trouvait a été remplacé.
- Le disque C: n'avait que 2,6 Go libres. Les fichiers temporaires de la construction ont été dirigés vers E: le temps de la commande, puis ce dossier temporaire a été supprimé.

Vérifié :

- avant la construction : 972 tests (958 réussis, 0 en échec, 14 ignorés), typecheck 18 erreurs (mêmes fichiers) ;
- la construction s'est terminée sans erreur ;
- l'empreinte SHA-512 et la taille de l'installateur correspondent à `latest.yml` ;
- l'exécutable empaqueté porte la version 2.0.0 ;
- la page construite contient les changements de thème, et le paquet contient le texte de la version 2.0.

Non vérifié : **l'installateur n'a pas été lancé**, ni l'application empaquetée. Toutes les vérifications du chantier ont été faites dans un navigateur sur le serveur de développement, avec un ComfyUI simulé ; aucune génération réelle n'a été lancée par moi. L'exécutable n'est pas signé par un certificat (comme avant).

État de Git, laissé tel quel (je n'indexe ni ne commite rien) : 155 entrées indexées par l'utilisateur ; les autres changements ne le sont pas, dont deux fichiers nouveaux jamais suivis, `components/CharacterTab.tsx` et `components/ImageGeneratorTab.tsx`, que `App.tsx` importe. Un commit sans eux ne se construirait pas.

### 2026-11-20 — Push refusé par GitHub (adresse courriel privée)

L'utilisateur a commité la version 2.0.0 en deux commits ; GitHub a refusé le push (« push declined due to email privacy restrictions ») parce que ces commits portaient son adresse Gmail et que son compte bloque les pushes qui l'exposent.

Correction choisie par l'utilisateur : utiliser l'adresse privée GitHub, pour ce dépôt seulement.

- `user.email` de ce dépôt réglé sur l'adresse `…@users.noreply.github.com` du compte. La configuration Git globale n'est pas modifiée.
- Les deux commits en attente ont été recréés avec cette adresse (auteur et committer). Contenu identique vérifié, dates conservées, messages identiques à une ligne vide finale près. Les fichiers de travail n'ont pas été touchés.
- Push normal (non forcé) réussi : `aaa7071..d558acc`. La branche locale et `origin/main` sont au même commit.

À savoir : les commits publiés avant celui-ci contiennent toujours l'adresse Gmail ; ils n'ont pas été modifiés. Les anciens commits locaux (`57146ca`, `0bb9647`) ne sont plus sur aucune branche.

## Licence : code issu de zGenMedia

### 2026-11-22 — Évaluation avant remplacement (aucun code modifié)

Demande de l'utilisateur : zGenMedia ne répond pas ; remplacer le code qui en provient, sauf la création de personnage qu'il estime déjà substantiellement modifiée, pour pouvoir présenter l'application sous GPL. D'abord une évaluation.

Méthode : les fichiers publics des deux projets (Portrait Generator v2.0, Group Photo Fusion) ont été téléchargés dans le dossier temporaire et comparés ligne par ligne à tous les fichiers source de l'application, et au premier jour du dépôt (2025-09-08). Une ligne compte si elle est identique après normalisation des espaces et fait au moins 25 caractères.

Faits relevés :

- Aucun des deux projets n'a de licence (ni champ GitHub, ni fichier). La demande d'autorisation est ouverte depuis le 2026-10-19, sans aucune réponse.
- Le premier jour du dépôt, onze fichiers étaient des copies de Portrait Generator à 55–100 % (`App.tsx`, `ImageUploader`, `icons`, `OptionsPanel`, `constants`, `ImageGrid`, `Loader`, `Header`, `index.html`, `imageUtils`, `vite.config`).
- Aujourd'hui, 622 lignes sur l'ensemble du code sont identiques à une ligne d'un des deux projets ; la plupart sont du code banal. Les concentrations réelles :

| Partie | Fichiers | Ce qui reste |
| --- | --- | --- |
| Photo Fusion (onglet Fun) | 11 fichiers, environ 1 870 lignes | Clairement dérivé : 38 à 77 % de lignes identiques dans six petits composants et les types, 82 lignes dans le panneau, 9 titres de pose sur 13 et 7 descriptions mot pour mot |
| Fichiers partagés venus de Portrait Generator | `ImageUploader.tsx`, `icons.tsx`, `utils/imageUtils.ts`, `Loader.tsx` | `ImageUploader` : 57 % du fichier d'origine survit ; 6 icônes sur 68 ont un dessin identique ; une fonction de `imageUtils` et son motif de lecture de fichier |
| Fichiers partagés réécrits au fil du temps | `App.tsx`, `ImageGrid.tsx`, `Header.tsx`, `index.html`, `vite.config.ts` | Quelques lignes banales (4 à 20 par fichier) |
| Création de personnage (exclue par l'utilisateur) | `constants.ts`, `OptionsPanel.tsx`, `services/geminiService.ts` | Le code est bien réécrit (15 et 19 lignes banales), **mais 11 des 33 textes de pose sont mot pour mot ceux de Portrait Generator** (stockés encodés dans `constants.ts`) |

Limites :

- La mesure ne voit que les lignes identiques. Du code copié puis renommé ou reformaté lui échappe.
- Ce n'est pas un avis juridique. Le fichier `LICENSING.md` du dépôt dit lui-même qu'une modification substantielle ne vaut pas autorisation.
- Les icônes d'origine ressemblent à un jeu d'icônes libre courant ; je ne l'ai pas vérifié.
- L'historique Git et les installateurs déjà produits contiennent l'ancien code ; remplacer le code actuel ne les change pas.

Outils dans le dossier temporaire : `lawiz-zgen\` (fichiers d'origine), `lawiz-zgen-fetch.mjs.txt`, `lawiz-zgen-compare.mjs.txt`.

### 2026-11-22 — Remplacement du code issu de zGenMedia

Décisions de l'utilisateur : réécrire aussi les 11 textes de pose de la création de personnage ; profiter de la réécriture de Photo Fusion pour retirer le superflu, dont le mode débogage ; garder dans `LICENSING.md` une ligne d'origine pour la création de personnage.

**Photo Fusion, réécrit à partir de son comportement.** Supprimés (11 fichiers) : `components/groupPhotoFusion/` (7 fichiers), `groupPhotoFusion/constants.ts` et `types.ts`, `services/groupPhotoFusionService.ts`, `store/groupPhotoFusionSlice.ts`. Nouveaux :

| Fichier | Rôle |
| --- | --- |
| `photoFusion/scenes.ts` | Types, 13 scènes décrites comme des données, 11 expressions, 3 niveaux de détail, construction du prompt |
| `services/photoFusionService.ts` | Limites par moteur et un seul point d'entrée pour les quatre moteurs |
| `store/photoFusionSlice.ts` | État (la scène est un identifiant, plus un objet contenant une fonction) |
| `components/photoFusion/PhotoFusionPanel.tsx` | Écran |
| `services/photoFusion.test.mjs` | 6 tests nouveaux |

Ce qui change pour l'utilisateur :

- disposition standard : personnes, arrière-plan, scène, détail et nombre d'images à gauche, puis **Models**, **LoRAs**, **Sampler**, **Advanced** ; à droite le prompt réellement envoyé (lecture seule), le bouton et les résultats. Avant, l'écran n'affichait rien d'autre que la zone de dépôt tant qu'aucune photo n'était chargée ;
- les scènes, leurs titres, les expressions et tous les textes de prompt sont nouveaux : les images produites ne seront pas les mêmes qu'avant ;
- **retirés** : le mode débogage et sa section, la double barre de progression par image, le grand écran « Your Fused Photos are Ready! » ;
- QWEN-Edit a maintenant les champs de graine, comme FLUX2, et suit la même règle de graine (avant : fixe ou aléatoire seulement) ;
- l'en-tête affiche « Gemini · modèle » quand Gemini est choisi (il affichait Mammouth) ;
- les messages d'erreur sont nouveaux et disent ce qui bloque avant le clic (pas assez de personnes, limite de QWEN-Edit, scène pour deux personnes, connexion ou nœuds manquants).

Conservés : quatre moteurs et leurs réglages (`GenerationOptions`, donc préréglages et Library inchangés), personne connue, arrière-plan, import depuis la Library, enregistrement dans la Library (même type `group-fusion`), envoi à LTX, nouvel essai, ZIP.

**Code partagé venu de Portrait Generator, réécrit** : `components/ImageUploader.tsx` (mêmes propriétés pour ses 20 utilisateurs ; aperçu par URL d'objet au lieu d'une lecture du fichier), `components/Loader.tsx`, les trois fonctions de lecture de fichier de `utils/imageUtils.ts` (une seule fonction commune), 7 dessins d'icônes (`UploadIcon`, `UploadCloudIcon`, `SpinnerIcon`, `SaveIcon`, `ImageIcon`, `ZipIcon`, `CloseIcon`). `UploadIcon` respecte maintenant la taille demandée (il était toujours en 6) ; `CloseIcon` garde sa taille fixe pour ne pas changer ses 61 usages.

**Création de personnage** : les 13 premières poses (11 identiques à Portrait Generator, 2 copies abîmées à l'encodage) sont réécrites, avec de nouveaux noms dans la liste à cocher. Les 33 poses sont maintenant en texte clair au lieu d'être encodées en base64 (le commentaire « Obfuscated poses to protect intellectual property » venait aussi de l'origine) ; deux fautes corrigées au passage. Les réglages enregistrés avant 2.0 contiennent des poses encodées : elles sont toujours décodées et envoyées telles quelles, mais ces anciennes sélections n'apparaissent plus cochées dans la liste.

**Licence et documentation** : `LICENSING.md` remplace « permission pending » par ce qui a été remplacé, comment c'est vérifié et les limites ; la création de personnage y garde sa ligne d'origine. README (statut, remerciements, licence), `docs/development.md` et la section Photo Fusion de `docs/features/swap-and-fusion.md` mis à jour.

Mesure après remplacement (même méthode que l'évaluation) :

| | Avant | Après |
| --- | --- | --- |
| Lignes identiques à une ligne des deux projets | 622 | 327 |
| Dont 60 caractères ou plus | 155 | 65 |
| Fichiers d'origine retrouvés à plus de 40 % | 12 | 2 (`vite.config.ts` des deux projets, 5 lignes du modèle Google AI Studio) |

Les lignes restantes de 45 caractères ou plus ont été relues une à une : écouteurs de clavier, `useState` d'erreur, appels de l'API Gemini, `index.html`/`index.tsx`/`vite.config.ts` du modèle AI Studio, et dans `icons.tsx` l'enveloppe `<svg …>` commune à tous les jeux d'icônes (aucun dessin identique). Deux libellés d'options d'arrière-plan de la création de personnage (« Green Screen », « Natural Studio ») restent identiques.

Vérifié :

- typecheck 18 erreurs (mêmes fichiers) ; 978 tests (964 réussis, 0 en échec, 14 ignorés ; les 6 nouveaux compris) ; build Vite temporaire réussi ;
- `check:panels` avec exercice : Fun 14/14 (les 4 variantes de Photo Fusion, photos chargées), Character 7/7, Image 22/22, Tools 14/14, Library 2/2 ; contraste de Fun : 0 texte sous 4,5:1 dans Studio Light et dans Cyberpunk ;
- parcours dans le navigateur avec ComfyUI simulé, 14 vérifications réussies : une personne bloque la génération, trois personnes, Cheek Kiss désactivée à trois, expression et personne connue dans le prompt, Film Poster ignore l'arrière-plan, Line-Up l'utilise, limite de QWEN-Edit puis levée en retirant une personne, Mammouth non connecté, bouton Library, Remove all, aucune erreur de page ;
- `check:locks` 13/13, `check:tab-jobs` 6/6, `profile:renders` 5 réussies ;
- `check:tabs` : seul Fun change (2 listes natives et 3 listes avec recherche visibles dès la première visite). Nouvelle référence enregistrée ; l'ancienne est gardée (`lawiz-tabs-control-before-fusion.txt`) ;
- `check:ui` : **1 échec sur 9 exécutions**, scénario non relevé (la première exécution n'affichait que le compte). Les 8 suivantes ont réussi. Le harnais ne touche pas Photo Fusion ; il utilise deux des icônes redessinées. Point « À régler » 3 rouvert.

Non vérifié : **aucune génération** avec les nouveaux prompts, ni sur aucun des quatre moteurs (les images, l'identité des visages et le respect du nombre de personnes restent à juger par l'utilisateur) ; l'enregistrement dans la Library et l'envoi à LTX depuis un vrai résultat ; rien dans Electron ; les icônes redessinées n'ont été vues que sur quelques captures.

### 2026-11-22 — Installateur reconstruit

Demande de l'utilisateur. `npm run electron:build`, fichiers temporaires sur E: puis supprimés (C: avait 3,8 Go libres).

- `dist\lawiz's-media-generator-v-2 Setup 2.0.0.exe`, 252 Mo ; il remplace celui du 2026-11-20, qui contenait encore l'ancien code. La version reste 2.0.0.
- Vérifié avant : typecheck 18 erreurs, 978 tests (964 réussis, 0 en échec). Après : empreinte SHA-512 et taille conformes à `latest.yml`, exécutable en 2.0.0, le paquet contient le nouveau Photo Fusion et plus le texte du mode débogage, `LICENSING.md` à jour est dans l'archive de l'application. La seule ligne « erreur » du journal de construction est un avertissement de Vite écrit sur la sortie d'erreur.
- Non vérifié : l'installateur n'a pas été lancé.

### 2026-11-22 — Version 2.0.1

Décision de l'utilisateur : passer à 2.0.1 pour distinguer cet installateur de celui du 2026-11-20, qui portait aussi le numéro 2.0.0.

Fichiers touchés : `package.json`, `package-lock.json`, `version.json` (notes affichées dans l'infobulle de la version), `README.md` (badge et ligne « 2.0.1 » dans « What's new in 2.0 »), `docs/development.md`.

Installateur reconstruit : `dist\lawiz's-media-generator-v-2 Setup 2.0.1.exe`, 252 Mo ; la construction vide `dist`, l'installateur 2.0.0 n'y est plus. Vérifié : typecheck 18 erreurs, 978 tests (964 réussis, 0 en échec) avant ; après, `latest.yml` en 2.0.1 avec empreinte et taille conformes, exécutable en 2.0.1, notes 2.0.1 présentes dans le paquet. Non vérifié : l'installateur n'a pas été lancé.

### 2026-11-23 — Section de prompt KREA2

Demande : une section de prompt dédiée à KREA dans l'onglet Prompt, accessible depuis les onglets de génération KREA, avec les références et les outils pratiques du guide [rakshazi/krea2-prompting](https://github.com/rakshazi/krea2-prompting) (v1.5.1, CC BY-SA 4.0).

Ajouté :

- **Prompt > KREA2 Prompt** (nouveau sous-onglet, accent orange). Rédaction par IA (Gemini, Mammouth AI, OpenRouter ou Ollama, image de référence facultative pour un prompt fidèle), constructeur en phrases dans l'ordre du guide avec pastilles de vocabulaire photo, index de 283 styles (4 paragraphes complets, 2 formules), 30 poses en 11 champs (objet tenu renommé, option « 4 champs clés »), recettes et modules de composition, contrôles en direct (mots de qualité, négations, poids, texte long ou non compté, personnage derrière un meuble, mains, foule, liste de mots-clés, CFG), réglages recommandés, pièges, familles de négatifs (RAW seulement), crédits. Envoi vers SIMPLE KREA, KREA2 RAW ou I2I Edit / Identity, enregistrement dans la Library.
- **Bouton « KREA2 prompt helper »** au-dessus du prompt de SIMPLE KREA, KREA2 RAW et I2I Edit / Identity : la même section dans une fenêtre, qui écrit dans le flux ouvert. Le brouillon est partagé avec l'onglet Prompt (store `promptGen.krea2Draft`).
- **« Also apply the guide settings »**, décochée par défaut : 8 pas, CFG 1, euler, beta et la résolution la plus proche du ratio (RAW : résolution seulement ; Edit : réglages imbriqués et ratio). Sans elle, seuls les prompts changent ; les réglages existants du flux sont gardés (valeurs par défaut du flux appliquées seulement s'il n'a jamais été ouvert).

Fichiers : `utils/krea2Prompting.ts` (données et logique adaptées), `components/Krea2PromptStudio.tsx`, `components/PromptGeneratorPanel.tsx`, `components/OptionsPanel.tsx`, `store/promptGenSlice.ts`, `services/ollamaService.ts` (`generateOllamaText`), `utils/promptDestination.ts` (`KREA2_SIMPLE_DEFAULTS`, `KREA2_RAW_DEFAULTS`, `getKrea2PromptUpdate`) ; `App.tsx` reprend ces deux constantes au lieu de ses copies (mêmes valeurs). Tests : `utils/krea2Prompting.test.mjs` (6), un test dans `utils/imagePromptImport.test.mjs`, deux vérifications de `services/krea2Style.test.mjs` adaptées à la constante. Audit : variante `krea2` du groupe `prompt`, variante `krea2 edit helper` du groupe `image`. Licence et docs : section dans `LICENSING.md`, remerciements et tableau de `README.md`, `docs/features/creative-tools.md`.

Non repris : `references/adult.md` (contenu explicite), deux noms de style liés à ce contenu, les chapitres sur les échelles géantes, l'inpainting et les images de référence.

Vérifié : typecheck 18 erreurs (les mêmes) ; 985 tests (971 réussis, 0 en échec, 14 ignorés) ; `check:panels` groupes `prompt` et `image` sans texte sous 4,5:1, la variante qui suit la fenêtre retrouve son nombre de contrôles (fenêtre fermée) ; `check:tabs` identique à la référence ; construction Vite de vérification réussie ; parcours dans le navigateur (script ponctuel `%TEMP%\scene-variation-browser\krea2-flow.mjs`, 10 vérifications réussies, aucune erreur de page) : construction depuis les champs, envoi vers SIMPLE KREA avec réglages du guide, aide dans SIMPLE KREA puis dans Edit, envoi vers RAW.

Non vérifié : la rédaction par IA avec un vrai fournisseur (aucun appel payant ni GPU) ; aucune génération KREA2 ; Electron.

### 2026-11-23 — Skill `write-agentsmd` installé dans le projet

Demande : installer [rakshazi/write-agentsmd](https://github.com/rakshazi/write-agentsmd) dans un répertoire de skills du projet.

Copie non modifiée du commit `7f630bf` (version 2.0.1 du skill) dans `.github/skills/write-agentsmd/`, emplacement lu par VS Code ; son dossier `.git` a été retiré pour que les fichiers soient suivis par le dépôt. Licences gardées (GPL-3.0-or-later pour les scripts, CC BY-SA 4.0 pour le Markdown, CC0 pour les gabarits) et notées dans `LICENSING.md`. Le dossier `.github` n'entre pas dans l'installateur. Scripts parcourus : aucun appel réseau ni commande destructrice ; `curl`/`wget` n'y figurent que dans une liste de noms de commandes.

Non vérifié : `scripts/audit.sh` demande bash ; le seul bash trouvé est celui de WSL (`C:\WINDOWS\system32\bash.exe`), non essayé. Le skill n'a pas encore été utilisé ; il écrirait `AGENTS.md`, `AGENTS.ledger.md` (temporaire) et peut-être `TODO_BEFORE_SHIPPING.md` à la racine.

### 2026-11-23 — `AGENTS.md` écrit avec le skill

Mode « New file » du skill `write-agentsmd`. `AGENTS.md` (46 lignes) : commandes vérifiées (`npm test` 0, test isolé 0, `npm run typecheck` 2, build de vérification 0, `check:tabs` 0, `check:ui` 0), `dist/`, conventions, trois pièges (tests qui lisent le texte des sources, onglets montés en `TabActivity`, `.env.local` suivi par git alors que `vite.config.ts` injecte `GEMINI_API_KEY` dans le bundle ; il ne contient que la valeur d'exemple), limites et renvois. Le WSL n'a pas de bash ; l'audit a tourné avec le bash de Git pour Windows.

Audit : plus aucun défaut sur le fichier ; il reste 13 lignes « repository file modified », qui désignent les modifications non commitées de la section KREA2 et ne sont pas à restaurer. `AGENTS.ledger.md` reste donc à la racine (le script ne le retire qu'après un audit sans échec). `TODO_BEFORE_SHIPPING.md` liste les 18 erreurs de typage existantes, dont certaines peuvent être de vrais défauts (Gemini : ratio et nombre d'images passés dans des champs inconnus du SDK ; Library : champs `prompt`, `characterName`, `thumbnail` absents du type). Rien corrigé.

### 2026-11-23 — Les 18 erreurs de typage corrigées, `.env.local` retiré de git

Décisions de l'utilisateur : tout corriger sans changement cassant ; retirer `.env.local` de git ; supprimer `TODO_BEFORE_SHIPPING.md` et `AGENTS.ledger.md` (fait).

- **Gemini (vrais défauts)** : le ratio passait dans un champ que le SDK ignore, le nombre d'images aussi. Le ratio passe maintenant par `imageConfig` (aperçus de fond et de vêtement, bannières, pochettes), seulement s'il figure dans la liste du modèle ; sinon il est omis comme avant. Logos, bannières et pochettes envoient une requête par image demandée (Gemini rend une image par requête) : **4 logos = 4 requêtes facturées**, au lieu d'une seule image jusqu'ici. `generateDecadeImage` : champ inutile retiré.
- **Library** : `prompt` et `characterName`, déjà enregistrés par Outpaint, Qwen 2.1 Remove Background et Character Sheet, sont déclarés dans `LibraryItem` (données inchangées). Lecture de `thumbnail` dans `libraryService` et de `fallback` dans `ttsDialogueService` rendue sûre pour le type, même comportement.
- **Typage seul** : `SwapPersonPanel` (instantané partiel d'options), `ImageGeneratorHeader` (navigation clavier des onglets), `ClothesExtractorPanel` (ratio typé `AspectRatio`).
- `.env.local` retiré de l'index (`git rm --cached`, suppression indexée) ; le fichier reste sur le disque et est ignoré par `*.local`. `AGENTS.md` : le typecheck entre dans la vérification complète ; le piège sur les clés vise `.env` (toujours suivi, vide) et `.env.local`.

Constat : `@types/react` n'est pas installé, donc `tsc` ne contrôle ni le JSX ni les types React (d'où `event` en `any` dans `ImageGeneratorHeader`). Non changé ; l'installer ferait sans doute apparaître d'autres erreurs.

Vérifié : typecheck 0 erreur (la ligne de vérification complète d'`AGENTS.md` passe telle qu'écrite) ; 985 tests, 971 réussis, 0 en échec ; build de vérification réussi ; audit d'`AGENTS.md` sans autre défaut que les fichiers non commités. Non vérifié : aucun appel Gemini réel (logos, bannières, pochettes, aperçus) ; Electron.

### 2026-11-23 — Types React installés et erreurs révélées corrigées

Décision de l'utilisateur : installer `@types/react` et `@types/react-dom`. Ajoutés en dépendances de développement (`npm install --save-dev @types/react@19 @types/react-dom@19`, `package.json` et `package-lock.json` modifiés). Le typecheck contrôle maintenant le JSX ; il a révélé 55 erreurs, toutes corrigées :

- **Vrai défaut, Outpaint** : « Use result as source » passait une promesse au lieu d'un fichier à `loadSource` ; le fichier est maintenant attendu avant d'être chargé. Non essayé dans l'application.
- **`Select` et `MenuSelect`** (49 erreurs) : passer directement un setter d'état à `onChange` élargissait le type de la valeur ; `onChange` utilise maintenant `NoInfer<T>`. Typage seul.
- **Typage seul, même comportement** : `useRef` avec valeur initiale explicite (`CharacterSwapPanel`, exigé par React 19), garde « aucun dossier » dans le déplacement d'un modèle (`CivitaiInventoryPanel`, bouton déjà désactivé dans ce cas), type de retour des sources d'exemples de prompts LTX, valeur de `background` typée (`OptionsPanel`), sélecteurs Library des logos, bannières et pochettes qui ne renvoient plus l'action Redux (`LibraryPickerHost`).

Vérifié : typecheck 0 erreur ; 985 tests, 971 réussis, 0 en échec ; build de vérification réussi ; `check:tabs` réussi ; `check:ui` : 1 échec sur 5 exécutions, scénario non relevé (sortie non gardée à cette exécution ; voir « À régler » 3), les 4 autres réussies. `npm install` signale des vulnérabilités dans les dépendances (non traitées, `npm audit fix --force` non lancé).

### 2026-11-25 — Installateur 2.0.1 reconstruit avec la section KREA2

Constat de l'utilisateur : l'installateur 2.0.1 n'avait pas le prompt KREA2. Cause vérifiée : il datait du 2026-11-22 à 12 h 19, avant la section KREA2 (2026-11-23) ; son paquet ne contenait aucun de ses textes.

Reconstruit avec `npm run electron:build` (typecheck 0 et 985 tests sans échec juste avant ; 19 Go libres sur C:, pas de redirection de TEMP) : `dist\lawiz's-media-generator-v-2 Setup 2.0.1.exe`, 264 262 113 octets, 2026-11-25 11 h 23. Vérifié : SHA-512 et taille conformes à `latest.yml` (version 2.0.1) ; le paquet contient la section KREA2 (« KREA2 prompt helper », « Write KREA2 prompt », « Build prompt from fields », « Use in this workflow ») et le `LICENSING.md` avec l'attribution krea2-prompting. Le numéro reste 2.0.1 : deux installateurs différents portent donc ce numéro. Non vérifié : l'installateur n'a pas été lancé.

### 2026-11-25 — Version 2.0.2

Décision de l'utilisateur : passer à 2.0.2 pour ne pas confondre avec les installateurs 2.0.1 (avec et sans section KREA2). Règle retenue : changer le numéro à chaque nouvel installateur dont le contenu diffère.

Fichiers touchés : `package.json`, `package-lock.json` (racine), `version.json` (date et notes : section KREA2, correctifs Gemini et Outpaint), `README.md` (badge et ligne « 2.0.2 » dans « What's new in 2.0 »), `docs/development.md`.

Installateur : `dist\lawiz's-media-generator-v-2 Setup 2.0.2.exe`, 264 272 728 octets, 2026-11-25 11 h 26 ; la construction a remplacé l'installateur 2.0.1 dans `dist`. Vérifié : typecheck 0 et 985 tests sans échec avant ; SHA-512 et taille conformes à `latest.yml` (2.0.2) ; exécutable en 2.0.2.0 ; `package.json` du paquet en 2.0.2 ; notes 2.0.2 et textes de la section KREA2 présents dans le bundle. Non vérifié : l'installateur n'a pas été lancé.

---

## Suivi général

### Points ouverts pour l'utilisateur

1. ~~Après ces corrections, le gel revient-il ?~~ Retour de l'utilisateur après ses tests dans Electron : aucun gel constaté jusqu'ici. À rouvrir s'il réapparaît (noter l'onglet et l'opération).
2. ~~Changer d'onglet annule l'opération en cours : voulu ?~~ Non voulu ; corrigé à l'étape 6.
3. ~~Réparer les deux tests en échec avant le chantier ?~~ Fait à l'étape 5.
4. ~~**Découpage du fichier `App.tsx`**~~ : pendant B5, onglet par onglet (décision du 2026-11-19).
5. ~~**Catalogue ComfyUI hors du store (2d)**~~ : abandonné (décision du 2026-11-19).
6. ~~**B1 : approbation de la liste de suppression**~~ : décisions prises le 2026-11-19 ; B1 clos.
7. ~~**FLUX2 Edit** : garder sa disposition ou l'aligner sur la règle ?~~ Aligné sur la règle (décision du 2026-11-19, B5a étape 4).
8. ~~**Listes de modèles d'Image Generator** : filtrer sur la famille ?~~ Oui, partout où c'est possible, surtout les LoRA (décision du 2026-11-19, B5a étape 4).
9. ~~**MOSS PHOTO** : structure guidée ou disposition standard ?~~ Structure et ordre conservés, contrôles au kit (décision du 2026-11-19, B5a étape 4).
10. ~~**LTX Director** : le convertir aux couleurs du thème, ou garder son apparence sombre fixe ?~~ Converti aux couleurs du thème (décision du 2026-11-20, B5d étape 5).
11. ~~**En-tête et barre d'onglets transparents** : les rendre opaques, ou les laisser ainsi ?~~ Rendus opaques (décision du 2026-11-20, voir « Après B5 »).
12. ~~**Couleurs fixes hors thème** : les convertir, et jusqu'où ?~~ Réglé par une bascule de la palette sur la base claire, sans réécrire les classes (2026-11-20, voir « Thème clair »).
13. ~~**Texte blanc sur les boutons d'accent pastel dans les thèmes sombres** (191 textes sous 3:1 dans Cyberpunk) : passer ce texte en foncé sur les bases sombres ?~~ Oui (décision du 2026-11-20, voir « Cyberpunk »).
14. **L'application dépend de sites tiers au démarrage** (Tailwind, polices, une feuille de style, chargés depuis Internet par `index.html`) : les embarquer dans l'application ? Non essayé hors ligne. Changement d'empaquetage, à traiter comme une brique à part.
15. **Tableau de bord d'installation** : `services/installationDiagnostics.ts` ne contrôle pas 55 des 212 classes de nœuds utilisées (39 externes). Le compléter à partir du même relevé ? (voir B6, étape 1).

### À régler (hors briques en cours)

1. ~~**Library : erreur à la première ouverture après un redémarrage.**~~ Corrigé le 2026-11-19 (voir « Correctif Library »). **Confirmé par l'utilisateur dans Electron.**
2. ~~**Opacité sur les couleurs du thème sans effet**~~ (constat de B4) : 187 classes dans 51 fichiers au départ, aucune après B5g (2026-11-20). Reste la décision du point ouvert 11.
3. **`check:ui` échoue par intermittence** (3 exécutions sur 22 le 2026-11-19) : harnais corrigé le 2026-11-20, 25 exécutions de suite sans échec ; **rouvert le 2026-11-22** : 1 échec sur 9 exécutions, scénario non relevé (voir « Remplacement du code issu de zGenMedia »). À la prochaine occurrence, noter le scénario et le message. Constat d'origine : une fois sans aucun résultat affiché, deux fois avec un scénario en échec. Le seul échec capturé est un délai dépassé au chargement de la page du harnais (`page.goto`, 30 s), pas une assertion sur le kit. Cause non identifiée ; je ne sais pas si le défaut existait avant cette session, le harnais ayant été lancé moins souvent.
4. ~~**Onglets actifs peu lisibles dans « Studio Light »**~~ (constat du 2026-11-20) : réglé le 2026-11-20 avec l'ensemble du thème clair (voir « Thème clair » ; reste 46 textes entre 2,7 et 4,5:1, listés là). Constat d'origine : la barre d'onglets principale et les sous-onglets Video utilisent des couleurs fixes de la palette (texte ambre clair sur fond ambre clair). Vu sur capture, non corrigé ; les autres barres de sous-onglets n'ont pas été regardées dans ce thème. Plus largement : 226 textes de couleur claire fixe (ambre, émeraude, cyan, rouge… en teinte 200 à 400) dans 37 fichiers, pensés pour un fond sombre ; les plus touchés sont `CivitaiInventoryPanel` 29, `MinimaxH3Panel` 28, `VideoWorkspace` 18, `LibraryPanel` 17. Tous ne sont pas illisibles sur fond clair ; aucun tri fait. Relevé complet du 2026-11-20 (fichiers `.ts` compris) : 587 classes de couleur fixe dans 49 fichiers sur 226 (texte 236, fond 201, bordure 119, autres 31), dont 9 fichiers de plus de 20 classes et 26 de 5 ou moins. Deux causes s'ajoutent aux classes : la table des accents par onglet (`utils/accentTheme.ts`, 17 couleurs pastel identiques dans tous les thèmes, qui remplacent l'accent du thème dans chaque onglet) et les 13 styles d'onglet actif de `App.tsx`. Limite connue : les fonds teintés (`bg-amber-400/15`) n'ont pas d'équivalent en couleur de thème tant que celles-ci n'acceptent pas l'opacité.
5. ~~**Audio Extractor : le champ « End (s) » affiche toutes les décimales**~~ (constat du 2026-11-20, par exemple 3.01859410430839) : corrigé le 2026-11-20 (voir « Liste À régler »).
6. **Champs de découpe de H3, Clips, Merge et Frames** : même défaut possible après « Set start here » ou « Set end here », non observé, non corrigé.
