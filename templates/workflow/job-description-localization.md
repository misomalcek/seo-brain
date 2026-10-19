---
name: Job Description Lokalizácia
description: Lokalizácia job description z DE/EN do SK s brand voice a SEO optimalizáciou
variables:
  - name: source_url
    label: URL zdrojového inzerátu (example.group/karriere)
    required: true
  - name: target_domain
    label: Cieľový web
    default: example.com
    options: [example.com]
  - name: language
    label: Cieľový jazyk
    default: sk
    options: [sk, cs]
  - name: seo_optimize
    label: SEO optimalizácia?
    default: "true"
    options: ["true", "false"]
---

## Kroky

1. **Fetch zdrojový inzerát** — Použi `web_fetch` alebo `web_render` pre [source_url]. Extrahuj:
   - Job title
   - Requirements
   - Responsibilities
   - Benefits
   - Location/remote info

2. **Brand Voice Loading** — Načítaj brand assets pre [target_domain]. Použi tone of voice guidelines a content DNA.

3. **Lokalizácia** — Preložiť do [language] s dôrazom na:
   - Prirodzený jazyk (nie doslovný preklad)
   - Lokálne IT termíny a reálie
   - Example Org brand voice
   - Benefity relevantné pre slovenský trh

4. **SEO Optimalizácia** (ak [seo_optimize] = true):
   - Použi `ahrefs_keyword_overview` pre relevantné job keywords v [language]
   - Optimalizuj title pre search (napr. "Java Developer Bratislava")
   - Pridaj meta description
   - Navrhni URL slug

5. **Formátovanie** — Výstup v štruktúre:
   - H1: Pozícia
   - Úvod (2-3 vety, prečo Example Org)
   - Čo budeš robiť (responsibilities)
   - Čo od teba očakávame (requirements)
   - Čo ti ponúkame (benefits — lokalizované)
   - O Example Org (boilerplate z brand assets)
   - CTA

6. **Export** — Ulož cez `save_user_file` ako DOCX. Voliteľne pridaj do content calendar.
