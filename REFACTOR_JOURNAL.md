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

### Reste à faire dans B5e

| Panneau | État |
| --- | --- |
| Swap a Person, Swap Anything, Stylise Anything | **Faits** |
| Photo Fusion (`GroupPhotoFusionPanel`, 728 lignes : 4 `select` bruts, 13 `SelectInput`, 5 classes d'opacité sans effet) | À faire |
| Past Forward (`PastForwardPanel`, 1503 lignes : 10 `select` bruts, 11 `SelectInput`, 10 classes d'opacité sans effet) | À faire |

---

## Suivi général

### Points ouverts pour l'utilisateur

1. ~~Après ces corrections, le gel revient-il ?~~ Retour de l'utilisateur après ses tests dans Electron : aucun gel constaté jusqu'ici. À rouvrir s'il réapparaît (noter l'onglet et l'opération).
2. ~~Changer d'onglet annule l'opération en cours : voulu ?~~ Non voulu ; corrigé à l'étape 6.
3. ~~Réparer les deux tests en échec avant le chantier ?~~ Fait à l'étape 5.
4. ~~**Découpage du fichier `App.tsx`**~~ : pendant B5, onglet par onglet (décision du 2026-11-19).
5. ~~**Catalogue ComfyUI hors du store (2d)**~~ : abandonné (décision du 2026-11-19).
6. ~~**B1 : approbation de la liste de suppression**~~ : décisions prises le 2026-11-19 ; B1 clos.

### À régler (hors briques en cours)

1. ~~**Library : erreur à la première ouverture après un redémarrage.**~~ Corrigé le 2026-11-19 (voir « Correctif Library »). **Confirmé par l'utilisateur dans Electron.**
2. **Opacité sur les couleurs du thème sans effet** (constat de B4) : 187 classes dans 51 fichiers. À vérifier et corriger pendant B5.
3. **`check:ui` échoue par intermittence** (3 exécutions sur 22 le 2026-11-19) : une fois sans aucun résultat affiché, deux fois avec un scénario en échec. Le seul échec capturé est un délai dépassé au chargement de la page du harnais (`page.goto`, 30 s), pas une assertion sur le kit. Cause non identifiée ; je ne sais pas si le défaut existait avant cette session, le harnais ayant été lancé moins souvent.
