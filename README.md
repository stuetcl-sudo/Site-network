# Site Canvas

Browserbaseret kortlægning af netværk, fiber, kameraer og andet teknisk udstyr.

## Funktioner

- Eget satellitfoto eller plantegning som baggrund
- Enheder, områder/grupper og træk-og-slip
- Fiber, Ethernet, coax, trådløs, strøm og ukendte forbindelser
- Afstand i meter eller kilometer, målt/anslået, kabeltype, porte og fiberpar
- Separate noter og flere billeder pr. enhed
- Lokal automatisk lagring i IndexedDB
- Import og eksport af komplette projektfiler
- Print/PDF med oversigtskort, forbindelsesliste, alle noter og de rigtige billeder under hver enhed
- Responsivt arbejdsområde til desktop og tablet

## Lokal udvikling

```bash
npm run install:ci
npm run dev
```

## Produktion med Docker

```bash
docker compose up -d --build
```

Tjenesten bindes som standard til port `8092`, så den kan testes fra lokalnettet. Ved offentlig adgang bør Caddy eller en anden reverse proxy med adgangskontrol stå foran.

## Data

Denne udviklingsversion gemmer projektdata lokalt i den aktuelle browser. Brug **Gem projekt** til en flytbar backupfil. Når løsningen lægges på den endelige server, kan lagringen kobles til serverens database og filarkiv uden at ændre kortformatet.
