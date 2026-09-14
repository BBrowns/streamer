# QA-run: development Electron playback

## Resultaat

**Geblokkeerd op bronbeschikbaarheid; geen player attach/first frame.**

De development Electron-app startte correct. Auth, API, lokale desktop-sidecar en bridge-capability probe waren beschikbaar. Bij Play werd HLS als delivery gekozen en werd de voorbereiding zichtbaar in de UI.

## Reproductie

- Start: `npm run dev:desktop-all`
- Doel: een catalogusfilm openen en Play gebruiken
- UI-flow: Home → Play → automatische bronfallback → More options → tweede Engelse bron → Cancel
- Testaccount: bestaand ingelogd account; credentials zijn niet in dit record opgenomen

## Observaties

1. De eerste kandidaat bereikte `finding_peers` en eindigde met `NO_PEERS`.
2. De daaropvolgende kandidaten werden één voor één geprobeerd. De app maakte nieuwe gateway-jobs aan en herhaalde geen kandidaat direct.
3. Een latere kandidaat bereikte 6 peers en de UI ging naar `Reading torrent metadata`; er volgde geen `container_selected`, `delivery_promoted`, `first_byte`, `first_fragment`, `player_attach` of `first_frame`.
4. De automatische flow eindigde na de begrensde fallback met `No playable source`.
5. Een handmatig gekozen Engelse bron bereikte 3 peers en metadata, maar bleef daarna steken vóór first fragment en eindigde als `SOURCE_STALLED`.
6. Annuleren vanuit de preparation-overlay bracht de gebruiker terug naar de detailpagina en registreerde `CANCELLED`; er was geen uncaught `Playback session does not exist`-fout zichtbaar.
7. De More Sources-modal toonde Engelse bronlabels en bleef semantisch één modal.

## Logsignalen

Veilig gecorreleerde signalen tijdens de run:

- bridge capability: available/ready
- delivery: `hls`
- phases: `finding_peers`, `Reading torrent metadata`
- errors: `NO_PEERS`, `SOURCE_STALLED`, `CANCELLED`
- session updates bleven HTTP 200

Er zijn geen magnets, hashes, media-URLs, bridge-URLs, credentials, bestandsnamen of raw FFmpeg-output in dit record opgenomen.

## Conclusie en vervolg

De startup- en fallback/cancellation-flow werkt aantoonbaar, maar de echte bron bereikt geen eerste mediafragment. De resterende blocker zit in torrent-runtime/source readiness na peer discovery, niet in auth, bridge-capability negotiation of de player-overlay. Volgende diagnose moet de torrent warning veilig categoriseren en vaststellen waarom metadata/first-byte niet doorloopt voor een kandidaat met peers; daarbij moet de bestaande begrenzing van maximaal vijf automatische kandidaten behouden blijven.

Bekende development-waarschuwingen (Electron CSP, `useNativeDriver` op web, `module.register()` en `node-vibrant`) waren niet de directe oorzaak van deze playbackblokkade.

## Vergelijking met de herhaalrun op het thuisnetwerk

De run hierboven beschrijft de eerste reproduceerbare blokkade. Tijdens een
herhaalrun op het thuisnetwerk is dezelfde flow opnieuw uitgevoerd met meerdere
Engelse candidates. De uitkomst was niet uniform:

| Test                               | Wat werkte                                                                                                                 | Waar het misging                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Best available, eerste poging      | HLS-job werd ready; de player attachte en er kwam een first-frame. Het gepubliceerde seek-window groeide tijdens de remux. | Dit is de referentie voor de gewenste flow, niet een bewijs dat iedere candidate bruikbaar is. |
| Best available, herhaald           | Peers, metadata/remux en `ready` werden bereikt.                                                                           | Kort daarna volgde `SOURCE_UNAVAILABLE`; de browser zag `410 Gone` op de HLS stream-request.   |
| Handmatige Engelse 1080p-candidate | Candidate werd gestart en kreeg peers.                                                                                     | De bron leverde geen bruikbare playback-URL op en eindigde met `SOURCE_UNAVAILABLE`.           |
| Handmatige Engelse 4K-candidate    | De preparation-status bleef zichtbaar en peer-discovery liep.                                                              | Metadata werd niet tijdig bruikbaar; de candidate eindigde als `SOURCE_STALLED`.               |
| Cancel tijdens preparation         | De sessie ging gecontroleerd naar `CANCELLED` en de route keerde terug.                                                    | Geen uncaught `Playback session does not exist` meer in deze flow.                             |

De bridge bleef in deze runs `available/ready` en er waren runs met oplopende
peer counts tot boven tien. Daarmee is het thuisnetwerk geen afdoende verklaring
voor de fout. De oude console-output bevatte nog `404`-meldingen voor HLS-
segmenten; in de herhaalrun waren de relevante fouten `410` op de stream zelf.
Een `410` betekent hier dat de job-URL bij player attach al was geannuleerd of
verlopen, niet dat de media-inhoud per se ontbreekt.

## Vastgestelde oorzaak en reparaties

Er waren twee client-side races naast de echte bronvariatie:

1. De launch-binding en URI-binding konden na het verdwijnen van de eerste
   single-flight Promise opnieuw dezelfde sessie resolven. Een ready candidate
   werd dan ten onrechte als nieuw beschouwd; het live HLS-job werd vrijgegeven
   en de nog startende player kreeg een `410`.
2. De HLS-video-surface hield een oude source vast wanneer de URI naar `null`
   ging tijdens fallback. Oude dynamic-import- of media-events konden daardoor
   nog op de replacement-candidate landen.

De code bevat nu een ready-lease-reuse in `PlaybackSessionPlaybackService`,
deduplicatie van dezelfde URI-binding, expliciete HLS-source-clearing met een
generation bump en een player-overlay die bij een terminale fout niet tegelijk
de verborgen onderliggende playercontrols aanbiedt. De bronfouten zelf blijven
onderscheiden van lifecycle-fouten: `NO_PEERS`, `SOURCE_STALLED`,
`SOURCE_UNAVAILABLE` en `CANCELLED`.

## Nog niet bewezen

Deze dated run bewijst geen native iOS/Android-playback en geen packaged macOS-
renderer. Ook is de succesvolle HLS-run niet deterministisch reproduceerbaar
voor iedere source. Na deze fix moeten de gerichte mobile tests en de desktop
golden-path opnieuw worden uitgevoerd; pas daarna kan een nieuwe QA-run claimen
dat een film of aflevering consequent start.

## Post-fix verificatie van deze taak

De regressies zijn met gerichte tests afgedekt:

- playback-resolver: 43 tests geslaagd;
- URI-binding, HLS-adapter en playback-resolver samen: 47 tests geslaagd;
- stream-server: 241 tests geslaagd, 4 overgeslagen en 1 testsuite
  overgeslagen;
- mobile typecheck: geslaagd;
- stream-server typecheck: geslaagd;
- Prettier op de aangeraakte bestanden: geslaagd.

Een nieuwe browserrun kon na de codewijziging niet opnieuw tot een film komen,
omdat Home en Quick Search tijdens die run zelf `Cinemeta could not load` en
`Sync is temporarily rate-limited` toonden. Dat is een afzonderlijk provider-
of sync-rate-limitprobleem en geen geldige playbackacceptatierun. Er is daarom
geen nieuwe claim gedaan dat de bron op dit moment end-to-end speelt.

De bredere repository- en Electronchecks zijn daarna wel opnieuw uitgevoerd:

- `npm test --workspace=apps/mobile`: 186 suites en 1084 tests geslaagd;
- `npm test --workspace=@streamer/stream-server`: 23 suites, 241 tests geslaagd
  en 4 overgeslagen;
- `npm run typecheck:all`: geslaagd voor shared, stream-server, mobile, server
  en desktop;
- `npm run lint`: geslaagd, met alleen bestaande serverwaarschuwingen;
- `npm run format:check`: geslaagd;
- `npm run test:golden-path`: 118 tests geslaagd en 70 bewust overgeslagen;
- `npm run test:electron-smoke`: geslaagd;
- `npm run test:electron-packaged-smoke`: geslaagd met de packaged-file
  renderer.

Deze checks bevestigen dat de lifecycle- en overlayfixes niet door de bestaande
UI-, type-, desktop- of packaged-rendererregressies worden geblokkeerd. Voor een
definitieve playbackacceptatie blijft één nieuwe live run nodig nadat de
provider/sync-rate-limit is afgekoeld; die run moet opnieuw metadata, eerste
fragment, player attach en first-frame vastleggen.

## Nieuwe diagnose: 410-loop tijdens fallback

Na de eerste lifecyclefix is nog een tweede live run uitgevoerd. De gateway
leverde eerst een bruikbare HLS-job, maar bij een volgende candidate zag de
browser `410 Gone` en verschenen opnieuw herhaalde
`playback.resolve_started`/`playback.resolve_ready`-events voor dezelfde
attempt. De resolver bleef daardoor een oude, al geannuleerde prepared URI
terugplaatsen terwijl de fallback al naar de volgende candidate ging.

Dit was een client-side bindingrace, niet een nieuw bridge- of netwerkcontract:

- een terminale sessie mocht geen prepared URI meer herstellen;
- tijdens de fallbacktransitie mocht de mislukte attempt geen oude URI opnieuw
  publiceren;
- een nieuwe, nog actieve attempt moest wel zijn eigen prepared URI kunnen
  publiceren.

De hook heeft hiervoor nu expliciete guards voor sessie-readiness en de
fallbacktransitie. De effect-dependencies bevatten deze guards ook, zodat een
statuswijziging niet met stale state wordt uitgevoerd. Er zijn twee
regressietests toegevoegd; beide reproduceerden eerst het foutieve URI-herstel
en zijn na de wijziging groen.

Een geïsoleerde no-peers-fixture maakte daarna nog een verwante variant
zichtbaar: bij een terminale `NO_PEERS`-sessie zonder prepared URI bleef de
hook opnieuw `resolvePlaybackSession` aanroepen. Daardoor bleef de overlay op
`Preparing` staan en groeide de log tot een snelle reeks
`resolve_started`/`SOURCE_UNAVAILABLE`-events. De guard staat nu vóór zowel het
prepared-URI-pad als het normale sessie-resolvepad. De regressiesuite bevat
hiervoor een aparte no-URI-test; de hook-suite staat nu op 7/7 groen.

De eerste gerichte regressietest stond op 6/6 tests groen en mobile typecheck
was groen. De eerste volledige golden-path-her-run leverde 103 geslaagde en 70
overgeslagen tests op; 15 desktop-renderer-tests konden niet meer starten nadat
de lokale webserver tijdens de run wegviel (`ERR_CONNECTION_REFUSED` op
`127.0.0.1:8081`). Dat was een testomgeving-/procesprobleem, geen
assertionfailure in de nieuwe fallbackguard. De latere schone run hieronder
heeft de volledige suite opnieuw groen uitgevoerd.

Een nieuwe echte provider-run is na deze laatste guard nog niet gelukt omdat
de live Home/Quick Search-flow opnieuw door `Cinemeta could not load` en
`Sync is temporarily rate-limited` werd geblokkeerd. Daarom is de 410-loop
code-level afgedekt, maar een nieuwe end-to-end first-frame-acceptatie na deze
laatste wijziging moet nog worden uitgevoerd zodra die rate-limit is afgekoeld.

De geïsoleerde browser-fixture voor `NO_PEERS` is na deze laatste wijziging
wel opnieuw uitgevoerd op een schone renderer: de recovery-overlay verscheen
en de test slaagde in 2,3 seconden. Dit bevestigt dat de eerdere 45-seconden
`Preparing`-lus door de clientguard is opgelost; het zegt nog niets over een
echte providerbron met first-frame.

De volledige geïsoleerde golden-path is daarna opnieuw uitgevoerd op een
aparte rendererpoort: 118 tests geslaagd en 70 bewust overgeslagen over
phone-web, tablet portrait, tablet landscape en desktop renderer. De relevante
playback-fixtures voor directe playback, automatische fallback en More Sources
waren alle drie groen. Development Electron en packaged Electron bleven ook
groen.

## Live provider-bewijsrun (2026-09-14, 21:57–22:00 CET)

Deze run is uitgevoerd tegen de draaiende development-app met de echte
providerflow, dus niet tegen de lokale playback-fixture.

- Renderer, API en bridge-readiness waren beschikbaar.
- Stream discovery leverde 54 bruikbare resultaten op; het playback-plan koos
  48 kandidaten en HLS als delivery.
- De automatische beste kandidaat had geen peers en eindigde gecontroleerd in
  een connection-failed recovery-state.
- Een handmatig gekozen Engelse kandidaat had 2 peers en bereikte `metadata` en
  bestandsselectie, maar eindigde tijdens de compatibiliteitsvoorbereiding
  zonder speelbare URL.
- Een tweede Engelse kandidaat had tijdelijk 3 peers, maar bereikte geen
  metadata binnen de begrensde window. De flow ging daarna door met
  fallback-kandidaten.
- De fallback bleef eindig en eindigde met `No playable source`.
- In geen van deze echte bronpogingen verschenen een player-attach- of
  first-frame-event. Er is dus in deze run geen echte providerbron afgespeeld.

Conclusie: de client- en fixturetests zijn groen, maar end-to-end playback van
deze echte providerbronnen is nog niet bewezen. De live blocker zit in de
bron/runtime-keten vóór player attach: peers/metadata komen niet betrouwbaar
beschikbaar of de compatibiliteitsvoorbereiding levert geen speelbare URL.

Tijdens een vierde handmatige Engelse bron verdween de in-app-browser-tab
onverwacht uit de automation-sessie. Bij heropenen was de playerstate leeg
(`Playback unavailable`) en kon de vorige poging niet worden hervat. In de
development-log volgden een onverwachte client-socket-reset en een nieuwe web
bundle/reconnect. Dit is aanvullend bewijs dat een echte run ook de
renderer-/sessiecontinuïteit moet bewaken; het is niet als first-frame-succes
geteld.

## Live provider-bewijsrun met geslaagde player-attach (2026-09-14, 22:10–22:12 CET)

Een tweede echte providerflow is uitgevoerd nadat de eerste beste kandidaat
was gefaald. De veilige client- en bridge-events lieten opnieuw zien dat
discovery, het playback-plan, bridge-capability en HLS-jobcreatie beschikbaar
waren. De eerste automatische poging eindigde zonder speelbare bron en ging
begrensd door naar fallback.

Daarna is een andere Engelse kandidaat handmatig gekozen. Deze poging bereikte
metadata-readiness en leverde daarna een HLS-prepared URI. De client logde
`playback.resolve_ready` met delivery `hls`; de UI toonde een echte
`Video player` met een oplopende afspeelpositie. De tijdlijn ging van ongeveer
00:02 naar 00:07 en vervolgens 00:12. Daarmee is voor deze providerbron
bewezen dat de keten tot player attach en zichtbare eerste playback werkt.

Ook scrubbing binnen het op dat moment gepubliceerde HLS-venster is getest:
de positie verschoof van ongeveer 00:12 naar 00:22 via de bestaande
`Seek forward 10 seconds`-control zonder de player te verlaten.

De run is nog niet volledig stabiel: na enkele seconden stopte de video bij
buffering terwijl het gepubliceerde venster verder groeide. Handmatig hervatten
startte de playback opnieuw en de positie liep verder op, waarna opnieuw een
bufferpauze volgde. Daarnaast verscheen tijdelijk `Sync connection temporarily
unavailable`; de serverlog bevatte een gesloten WebSocket met reconnect.

Conclusie: echte provider-playback, player-attach en vroege scrubbing zijn nu
bewezen voor ten minste één kandidaat. Volledig doorlopende playback zonder
bufferpauzes en stabiele sync zijn nog niet bewezen en blijven afzonderlijke
issues. De eerdere no-source-fallback blijft eveneens geldig voor kandidaten
zonder peers/metadata.

## Fix en live-verificatie van buffering en sync (2026-09-14, 22:23–22:26 CET)

De twee resterende issues zijn gericht gerepareerd:

- De web HLS-adapter bewaart nu de gebruikersintentie om af te spelen. Een
  automatische pauze door `waiting`, `stalled` of bufferonderloop wordt
  begrensd opnieuw gestart zodra data beschikbaar komt. Een expliciete
  gebruikerspauze annuleert dit herstelpad.
- De sync-service houdt maximaal één autoritatieve verbinding per device-id
  aan. Een stale reconnect wordt netjes vervangen in plaats van een extra
  connection-slot te verbruiken. Afsluitredenen voor limiet-, auth- en
  protocolpaden worden als veilige foutcategorie gelogd.

De regressietests voor beide paden zijn groen. In een nieuwe echte
provider-run bleef de HLS-player na attach ruim 45 seconden actief: de
zichtbare positie liep op van ongeveer 00:00 naar 00:46, de control bleef
`Pause playback` en de timeline bleef verder publiceren. Er trad geen
`Sync connection temporarily unavailable`-melding op; de server accepteerde
de playback-updates doorlopend zonder nieuwe 1008-sluiting.

Verificatie:

- mobiele tests: 186 suites, 1086 tests geslaagd;
- servertests: 39 testfiles, 371 tests geslaagd, 1 bewust overgeslagen;
- mobile- en server-typecheck geslaagd;
- `npm run verify:quick` geslaagd, inclusief format, lint, architectuur,
  volledige typecheck, shared tests en dependency-remediationtests.

De resterende waarschuwingen zijn bestaande test/dev-waarschuwingen; er zijn
geen nieuwe failures. Native iOS/Android playback is niet geclaimd, omdat deze
run de development web/Electron-route gebruikte.
