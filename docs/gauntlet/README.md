# Lokale Gauntlet-pilot

## Gewone ontwikkelopdracht

De gebruiker geeft de opdracht in Codex zoals gebruikelijk; Codex maakt zelf
het lokale pakket. Begin vóór implementatie met een taaksnapshot van de gekozen
bestanden en bestaande werkboomstatus. Bewaar opdrachtwijzigingen als aparte
amendments en laat werkboomwijzigingen buiten de opdracht ongemoeid. Gebruik
de bestaande `verify:change`-planning en verificatie, `qa:run`-manifesten en,
waar beschikbaar, Playwright-JSON. Bewaar iedere receipt en poging direct onder
een unieke taakmap in `artifacts/gauntlet/`; standaard receipts en het
Playwright-resultaat kunnen door een volgende run overschreven worden. Neem ook
de finale commands uit het plan, mislukte pogingen, skips en ontbrekende
uitvoering op. De pakketbouwer voert zelf geen controles uit.

Codex kan het pakket met de lokale CLI opbouwen. Een tekstbestand met de
opdracht wordt door Codex gemaakt; het is geen taakbestand dat de gebruiker
moet voorbereiden. `--file` wordt herhaald voor elk geselecteerd bronbestand,
ook voor nieuwe bestanden die bij de start nog niet bestaan.

```bash
node scripts/gauntlet-package.mjs start --task-id <taak-id> --task-file <opdracht.md> --file <pad>
node scripts/gauntlet-package.mjs check-start --run <taakmap> --attempt-id <poging>
npm run verify:change -- --focused --files <taakbestanden> --output <unieke-receipt.json>
node scripts/gauntlet-package.mjs check-end --run <taakmap> --attempt-id <poging>
node scripts/gauntlet-package.mjs finish --run <taakmap> --receipt <unieke-receipt.json> --receipt-attempt-id <poging> --required-check <exacte-commandtekst> --draft-file <concept.md>
```

Bij meerdere receipts horen evenveel `--receipt-attempt-id`-waarden in dezelfde
volgorde. Een markerpaar koppelt een receipt pas aan die poging wanneer de
receipt een geldige begintijd en eindtijd heeft en beide binnen de start- en
eindmarker liggen. Bij ontbrekende, ongeldige of afwijkende tijden blijft de
oude receipt en zijn technische resultaat zichtbaar, maar geldt hij niet als
actueel uitvoeringsbewijs. Zonder geldig markerpaar blijft wijziging tijdens
een controle onbekend. `--required-check` verwijst exact naar een command uit
het verificatieplan of een geïmporteerde receipt; een onbekende command wordt
als `unlinked` en `not-run` met ontbrekende koppeling gerapporteerd. Een
receipt geldt alleen als kandidaatbreed passend als zijn geordende
bestandsselectie exact met die van het pakket overeenkomt. Oudere pogingen
blijven zichtbaar; de kandidaatbrede samenvatting gebruikt de laatste poging
per controle.

`finish` kan daarnaast herhaalde `--qa`, `--playwright`, `--plan`,
`--amendment-file` en brononderbouwde `--annotation
'<controle-id>|<execution-kind>|<scope>|<bron>'` gebruiken. Laat de scope
weg als die niet inhoudelijk onderbouwd kan worden; hij blijft dan `unknown`.
Een bediende Playwright-flow met lokale routefixtures krijgt bijvoorbeeld pas
na broninspectie `browser-interaction|local-fixture`. Een gemockte callback
blijft `mocked-handler|unit` en bewijst geen volledige browserflow. Codex kiest de relevante
controles uit de opdracht en projectregels. De import bewaart alleen de
bestaande JSON-outputformaten van `verify:change`, `qa:run` en Playwright;
tekstlogs vragen een expliciete, herleidbare annotatie. De geïmporteerde
`gauntlet-input.json` blijft intern. In de importeerbare API kan Codex ook
expliciete taakvereisten, vereiste uitvoeringssoorten en handmatige
gebruikersinterventies meegeven. De scope van een taakeis komt uit de opdracht;
een `expectedExecutionKind` alleen verheft die scope niet automatisch tot
browserfixture, echt apparaat of extern netwerk.

Het pakket bewaart kandidaatidentiteit, opdracht, bewijsinventaris, afgeleide
Gauntlet-invoer en conceptoplevering. Technische status en duur komen uit
beschikbare gestructureerde output. Ontbrekende waarden blijven `unknown`.
Markeer afzonderlijk wat uit broninspectie is afgeleid of handmatig is
waargenomen; een annotatie is geen runnerresultaat. Label componentchecks met
gemockte callbacks, bediende browserinteracties, native uitvoering en externe
uitvoering naar hun werkelijke bewijsgrens. Elke opdracht krijgt een eigen
unieke map onder `artifacts/gauntlet/`; neem taakuitvoer niet op in algemene
documentatie.

Start de lokale `risk_reviewer` met **verse context**. `finish` schrijft een
onveranderlijk `phase1-bindings.json` met de vier bronidentiteiten van opdracht,
kandidaat, bewijs en controle-inventaris. Geef in fase 1 alleen deze identiteiten,
opdracht en verduidelijkingen, kandidaatcode/diff, controle-inventaris en
bronbewijs. Leg deze vier identiteiten en het fase-1-oordeel vast voordat de
reviewer in fase 2 de conceptoplevering en Gauntlet-uitvoer krijgt. Leid
ontbrekende fase-1-identiteiten niet achteraf uit fase 2 af. Als een afzonderlijke reviewer
niet beschikbaar is, registreer `not-run`; eigen beoordeling telt niet als
onafhankelijke review. Nul bevindingen is geldig. Een afgeronde review kan
tegelijk open bevindingen of niet-uitgevoerde projectcontroles hebben.

Bij `visualImpact: yes` is ook een aparte `visual_reviewer` met **verse context**
vereist. Fase 1 legt voor die rol dezelfde vier bronidentiteiten vast, plus de
contracthash en digest van de stabiele visual cases, voordat de reviewer de
conceptoplevering krijgt. De reviewer beoordeelt alleen de gebonden screenshots
tegen de meegeleverde kopieën van `UI.md` en
`design/streamer-visual-contract.md`. De risk- en visual-reviewrecords blijven
onderdelen van dezelfde bestaande `reviews`-lijst. Beide rollen moeten actueel
zijn voor dezelfde candidate identity voordat de reviewstatus `completed` is.
Een visuele review zonder findings is geldig; actuele P1-bevindingen van risk-
of visual-review vereisen reparatie, en visual P2 is informatief.

Na review is hoogstens één gebundelde herstelronde toegestaan: verzamel alle
relevante findings op dezelfde kandidaat, voer één bounded repair uit, maak een
nieuwe kandidaat, draai de relevante checks opnieuw, leg nieuwe screenshots
vast en vraag verse risk- en (bij visuele impact) visual-reviews. Leg nieuwe
evidence vast en behoud eerdere pakketversies en beoordelingen. De grens geldt
voor de hele taak, niet per finding. Een P1 die in de verse visual review na die
ronde nog bestaat blijft unresolved in het eindrapport; start geen tweede
reparatie. Het definitieve oordeel moet passen bij de laatste kandidaat,
opdracht, bewijsinventaris en opleverclaims. Gauntlet blijft adviserend.

De packagebouwer leest eerdere `gauntlet-input.json`-bestanden in dezelfde
run. Een nieuwe candidate na een complete risk- of visual review met actuele,
open P1-findings krijgt automatisch één `repairRounds`-record dat de reviews en
findings koppelt en de geraakte visual cases plus eerdere check-inventory als
retests noemt. Een nieuwe candidate na die ronde wordt geweigerd. Een
onvolledige P1-review blokkeert ook voortgang totdat de review op dezelfde
candidate is voltooid. Candidates zonder actuele open P1-findings blijven
afzonderlijke snapshots en verbruiken de repairronde niet.

Registreer beschikbare tijden voor pakketvoorbereiding, review en herstel
apart, plus het aantal handmatige gebruikersinterventies. De pakketbouwer meet
zijn eigen generatieduur; tijd tussen taaksnapshot en pakket is geen zuivere
voorbereidingstijd en blijft daarom onbekend. Leg review- en hersteltijden
alleen vast wanneer hun fasegrenzen zijn geregistreerd. Onbekend token- of
kostenverbruik blijft onbekend. De eerstvolgende drie echte ontwikkelopdrachten
zijn de praktijkmeting; deze synthetische invoervoorbeelden leveren geen
betrouwbare tijdwinstbaseline.

Voer uit vanuit de repositoryroot met Node 26.7.0:

```bash
node scripts/gauntlet.mjs --input docs/gauntlet/pilot-cases.json
```

Hetzelfde commando werkt met een eigen taakbestand. Markdown gaat naar stdout;
`--json` geeft de gestructureerde beoordeling. Bewaar desgewenst stdout in een
nieuw lokaal rapport. Het script schrijft zelf niets, voert geen tests/commands
uit en roept geen modellen, netwerkdiensten, hooks of CI aan. Exit 0 betekent
alleen dat de adviserende controle is uitgevoerd; onleesbare of ongeldige
taakinvoer geeft exit 2. Een ontbrekend bewijsstuk wordt `unknown`.

## Visuele impact, cases en bewijs

`verify:change --plan` rapporteert `visualImpact`, stabiele `visualCases` en
eventuele onbekende bestanden. Case-ID's zoals `library-phone` en
`library-desktop` zijn contractueel; de Playwright-test, route, projectnaam en
viewport waarmee Streamer ze vastlegt mogen veranderen. `config/verification-map.json`
beheert de huidige mapping van gewijzigde bestanden naar impact en cases.

Los elke `unknown` classificatie op bij `start`, vóór de taakbaseline en
kandidaat worden gemaakt. Geef voor elk onbekend bestand precies één besluit
mee. Gebruik `no` of `yes` met concrete stabiele case-ID's. Een nieuwe
`unknown`-resolutie vereist `resolvedBy` en `rationale`; zonder die gegevens
stopt `start` vóór candidate-creatie. De planner legt de besluiten vast in
`verificationPlan.visualImpactResolutions` en neemt ze op in de reviewbinding.
De visual reviewer classificeert impact niet achteraf. Bij `yes` vereist
Gauntlet screenshots voor elke genoemde case.

Leg screenshots vast in dezelfde gemarkeerde Playwright-poging als het bewijs
voor de kandidaat. Start en eindig markers rond de test en geef bij `finish`
dezelfde attempt-ID mee:

```bash
node scripts/gauntlet-package.mjs check-start --run <taakmap> --attempt-id visual
STREAMER_GAUNTLET_VISUAL_CASES=library-phone,library-desktop npm exec playwright -- test --config=playwright.config.ts --project=phone-web --project=desktop-renderer tests/golden-path/visual-regression.spec.ts --reporter=json > artifacts/gauntlet/<taakmap>/playwright-visual.json
node scripts/gauntlet-package.mjs check-end --run <taakmap> --attempt-id visual
node scripts/gauntlet-package.mjs finish --run <taakmap> --playwright artifacts/gauntlet/<taakmap>/playwright-visual.json --playwright-attempt-id visual --draft-file <concept.md>
```

De testhelpers vertalen stabiele case-ID's naar de huidige Playwright-projecten.
De test moet slagen en de attachment moet een PNG van maximaal 2 MB zijn. De
pakketbouwer bewaart de PNG lokaal met capture-context, SHA-256 en de al
bestaande candidate identity (revision, fingerprint, algoritme en
bestandsselectie). Markerstart en -eindtijd binden de capture aan diezelfde
kandidaat; een los screenshot of een parallelle visual fingerprint geldt niet
als bewijs. Ontbrekende cases maken de visual review onvolledig.

De pakketbouwer kopieert `UI.md` en `design/streamer-visual-contract.md` en
berekent `contractVersion.sha256` over hun exacte bytes, in gesorteerde
padvolgorde met `sha256-path-nul-content-nul-v1`. Een wijziging aan één van
beide bestanden maakt een eerdere visual review verouderd.

## Taakbestand

`pilot-cases.json` is het complete invoervoorbeeld. Paden zijn relatief aan de
repositoryroot; buitenliggende paden en symlinks naar buiten worden geweigerd.
Per bestand geldt een grens van 2 MB; de documentzoektocht is begrensd tot 2.000
directories/Markdownbestanden. Een afgebroken scan blijft expliciet onvolledig.

- `task.outcome` en `task.requirements`: de verlangde uitkomst en vereiste
  controles, met `id`, `text`, `runId`, `scope` en `evidence` (bewijs-ID's).
  Optioneel: `network`, vereiste `scenarios`, `code.revision`,
  `code.fingerprint` of `code.currentFiles: true`.
- `runs`: eigen, stabiele run-ID's met opgegeven `target`, `runtime`,
  `documents` en eventueel `context`. Netwerkcontext bevat `runId`, `category`,
  `source` en `confirmedAt` (ISO-tijd). Categorieën: `home`, `work`, `guest`,
  `hotspot`, `unknown`. Zonder dezelfde run-ID, bron en tijd is de categorie
  onbekend. Een nieuwe run erft niets van een vorige run. Voor een wissel binnen
  een testsessie moet de gebruiker de runs splitsen. Er is geen verzonnen TTL
  die bewijst hoe lang een netwerk hetzelfde blijft.
- `evidence`: concrete bewijsstukken met eigen ID en run-ID. `kind: qa-run`
  leest een bestaande v1-JSON via `path` en `selector` (stap-ID).
  `kind: verify-change` leest de bestaande v3-receipt via `path` en `selector`
  (exacte commandtekst), of herkent de bestaande planoutput. De adapters
  negeren handmatig opgegeven status-/scope-overrides. Een QA-preflight heeft
  scope `preflight`; handmatige stappen `manual`; verificatiecommands
  `command`. Scenarioaantallen blijven onbekend als de producent ze niet bewaart.
- `kind: observation` is een **handmatige, controleerbare annotatie** met
  `status`, `scope`, `source`, `observedAt`, optioneel `exitCode`, `counts`
  (`passed`, `failed`, `skipped`), `scenarios` (naam → status), `revision` en
  `fingerprint`, `fingerprintAlgorithm` en `files`. Een `passed` met een
  `failed`/`blocked` scenario krijgt `OBSERVATION_CONTRADICTION`, ook zonder
  gevraagde scenarionamen. De oorspronkelijke status en scenario's blijven
  behouden. Het script leest geen ruwe testlogs en leidt hier geen feiten
  uit taal af. Een bronanker is geen automatische controle van die bron.
- `provenance`: `historical` voor oorspronkelijke receipts; `reconstructed`
  voor omzettingen uit historische bronnen; `synthetic` voor verzonnen
  testinputs; `recorded` voor een nieuw vastgelegde waarneming. Deze labels
  zijn door de auteur aangeleverd, niet onafhankelijk geauthenticeerd.
- `conclusions`: de beoogde oplevertekst met dezelfde bewijs-/scopekoppeling.
  Alleen hier kan `expectedStatus` een eerlijke beperking zoals `skipped` of
  `not-run` ondersteunen. Een taakeis verlangt altijd geslaagde uitvoering.
- `corrections`: append-only intentie, met `id`, betrokken `runId`, `from`,
  `to`, `source`, `confirmedAt`. De input wordt niet aangepast. Het rapport
  toont de effectieve context en correcties; JSON bewaart ook `originalContext`.
  Alle betrokken eisen/conclusies krijgen herbeoordeling; de oorspronkelijke
  technische uitvoeringsstatus blijft staan. Inhoudelijke afhandeling vraagt
  een afzonderlijk reviewrecord en gebeurt niet door deze correctieregel zelf.
- `documentRoots`: de te doorzoeken mappen voor directe inkomende inline
  Markdownlinks naar de `documents` van een gecorrigeerde run. Bestandsnaam,
  betrokken documentregels en de verwijzingsregels worden bekeken, niet alle
  andere regels van een gedeelde QA-matrix. Oudere runs blijven apart.
- Voor dagelijkse pakketten: `candidate`, `checkInventory` en `draft` bewaren
  de huidige code- en oplevercontext. Een eis of conclusie kan
  `expectedExecutionKind` bevatten. Bewijs heeft een apart `executionKind`
  (`mocked-handler`, `browser-interaction`, `native-runtime`,
  `external-runtime`, `command-only` of `unknown`) met bron en herkomst van
  het label. De evaluator laat een mock of commandstatus geen browser-,
  native- of externe claim dragen.
- `visualImpact` bevat `status` (`yes`, `no` of `unknown`), stabiele `cases`
  en de toegepaste `resolutions`, met per expliciet onbekend bestand
  `resolvedBy` en `rationale`. De resolutie wordt vóór candidate-creatie
  opgeslagen en in de visual-case-reviewbinding opgenomen. Een `yes` vraagt voor elke case een
  candidate-bound screenshot en `visualReview.contractVersion`; `unknown`
  blokkeert een complete review totdat het bij planning expliciet is opgelost.
  De contractversie bewaart de hash, het algoritme, de exacte paden en hashes
  van de gekopieerde `UI.md`- en designcontractbestanden.
- `reviews` bewaart de afzonderlijke reviewrecords in volgorde. Een record
  heeft reviewerrol en verse context, een gedateerde fase 1 met bindingen voor
  opdracht/kandidaat/bewijs/controles, daarna een gedateerde fase 2 met de
  conceptoplevering en Gauntlet-uitvoer, plus bevindingen en afhandeling.
  Rollen zijn `risk_reviewer` en, bij `visualImpact: yes`, `visual_reviewer`.
  Een visual finding bevat `id`, `severity`, `category`, `location`,
  `observation`, `violatedPrinciple`, `smallestAppropriateRepair` en een
  `evidenceReference.screenshotId`. Alleen visual P1 vereist herstel; P2 is
  informatief. Een actuele review zonder visual findings is geldig.
  `reviewBindings` in `scripts/gauntlet.mjs` levert de lokale hashes voor de
  huidige inhoud. Fase 1 moet de vier bronbindingen zelfstandig bevatten;
  fase 2 kan een ontbrekende bronbinding niet achteraf aanvullen. De uitvoer meldt reviewstatus, bevindingen en projectcontroles
  afzonderlijk. Hashes en rolmetadata bewijzen niet zelfstandig wie de review
  uitvoerde; het feitelijke agentverloop moet ook worden vastgelegd.
- `repairRounds` bevat maximaal één gebundelde reviewgestuurde herstelronde met
  verwijzing naar de eerdere review en relevante nacontroles. Daarna horen een
  nieuwe candidate, actuele relevante checks, screenshots en reviews bij de
  eindcandidate. P1 die dan nog open is blijft unresolved; een tweede ronde
  wordt geweigerd. Oudere reviews blijven in `reviewHistory` zichtbaar, ook
  wanneer zij niet langer bij de kandidaat passen.

Scopes worden exact vergeleken: `command`, `preflight`, `manual`, `unit`,
`local-fixture`, `active-probe`, `external-network`, `live-provider`,
`real-device`, `context-observation`, `unknown`. Er is geen automatische
promotie van probe naar volledige netwerktoegang of van fixture naar provider.
Selectors moeten niet-lege strings zijn; een receiptselectie moet eenduidig
naar geldige command-/stapvelden verwijzen. Ontbrekende waarden, ongeldige
resultaten en dubbele matches blijven onbekend.

Binnen één eis of conclusie mogen verschillende bekende revisies niet samen
een opleverkandidaat onderbouwen, ook zonder `code`. Zo'n combinatie krijgt
`CODE_CONFLICT`; de bewijsstukken zelf behouden hun status. Beperkte
historische uitspraken blijven mogelijk als afzonderlijke claims, elk gekoppeld
aan het eigen bewijs. Een historisch herkomstlabel heft de versiegrens niet op.

Een ontbrekende codefingerprint blijft een beperking. Alleen een expliciete
versie-/actuele-inhoudseis maakt dit ook een openstaande voorwaarde. De
fingerprintcontrole gebruikt de geselecteerde bestanden en het bestaande
algoritme van `verify-change.mjs`; zij bewijst geen hele-repository-identiteit,
dependencyomgeving of authenticiteit.

Onderlinge fingerprints worden alleen vergeleken bij een bekend gelijk
`fingerprintAlgorithm` en identieke niet-lege `files`-lijsten **in dezelfde
volgorde**. Verschillende subsets, volgordes of ontbrekende metadata zijn geen
aangetoonde tegenstelling. De v3-adapter vult
`sha256-path-nul-content-nul-v1` in voor het bestaande `file\0bytes\0`-algoritme.
Bij een expliciete `code.fingerprint`-eis zijn ook
`code.fingerprintAlgorithm` en `code.files` nodig; zonder vergelijkbare metadata
blijft de eis open met `FINGERPRINT_INCOMPARABLE`. Gelijke metadata/digests
bewijzen alleen de genoemde selectie, geen hele kandidaat. Onbekende revisies
blijven als beperking zichtbaar en worden niet als gelijkheid geïnterpreteerd.

## Wat mechanisch gebeurt

De pilot vergelijkt expliciete labels, bewaart failed/skipped/not-run/planned,
weigert een fixture als externe netwerkonderbouwing, controleert vereiste
scenarionamen en vraagt in het rapport alleen om netwerkbevestiging als een eis
of conclusie een concrete categorie nodig heeft. Een fixturepass zonder
netwerkclaim lokt dus geen bevestigingsvraag uit.

Na een correctie meldt hij gekoppelde claims/documenten en directe verwijzingen.
De woorden `home`/`thuis`, `work`/`werk`, `guest`/`gast` en `hotspot` zijn slechts
zoekheuristieken. Ook een geldige ontkenning kan worden gemarkeerd. Daarom vraagt
zo'n treffer **inhoudelijke beoordeling**; een actuele review kan die afhandeling
apart vastleggen. Reference-style links,
HTML, complexe Markdown, ongekoppelde bestanden en verwijzingen buiten de
opgegeven mappen vallen buiten de mechanische dekking.

`supported` betekent uitsluitend consistent met de ingevoerde labels en
gelezen resultaten. Een mens moet controleren of de eisen volledig zijn, of
de bewijs- en runlabels kloppen en of de tekst méér beweert dan die labels.
Bewaar geen credentials, media-URL's, magnets, infohashes, bridge-URL's, IP's
of ruwe processoutput in deze invoer.

## Synthetisch voorbeeld

`pilot-cases.json` en de documenten onder `fixtures/` zijn volledig synthetische
invoer voor voorbeelden en regressietests. De waarden, tijdstippen, netwerklabels
en observaties zijn verzonnen; ze verwijzen niet naar een gebruiker of echte run.
De casus toont onder meer dat een lokale fixturepass geen externe netwerkclaim
onderbouwt, een geslaagde commandstatus met overgeslagen vereiste scenario's de
taakeis openlaat, en een contextcorrectie alleen de gekoppelde run en directe
documentverwijzingen raakt. Dit demonstreert regelwerking, geen onafhankelijke
detectie op onbekende taken of bewijs uit een echt apparaat.

De fixture kan lokaal worden uitgevoerd met het voorbeeldcommando hierboven.
Echte receipts en taakgegevens horen in de unieke, gitignored taakmap van hun
opdracht en worden niet als vaste documentatievoorbeelden meegeleverd.

Gerichte tests:

```bash
node --test scripts/gauntlet.test.mjs scripts/gauntlet-package.test.mjs
```
