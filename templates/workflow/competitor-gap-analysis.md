---
name: Competitor Gap Analýza
description: Komplexná analýza konkurencie — keyword overlap, content gaps, backlink príležitosti
variables:
  - name: domain
    label: Náš web
    options: [example.com, example-dev.com, example-qa.com]
    required: true
  - name: competitors
    label: Konkurenti (čiarkou, max 5)
    required: true
  - name: focus
    label: Zameranie analýzy
    default: all
    options: [all, keywords, content, backlinks]
---

## Kroky

1. **Domain porovnanie** — Použi `ahrefs_batch_analysis` pre [domain] + [competitors]. Porovnaj DR, organic traffic, referring domains.

2. **Keyword overlap** — Použi `ahrefs_competitors` pre [domain]. Identifikuj shared vs. unique keywords.

3. **Content gaps** — Pre každého konkurenta použi `ahrefs_organic_keywords`. Nájdi keywords kde oni rankujú a my nie.

4. **Top pages analýza** — Použi `ahrefs_top_pages` pre [competitors]. Ktoré ich stránky generujú najväčší traffic?

5. **Backlink príležitosti** — Použi `ahrefs_referring_domains` pre [competitors]. Nájdi domény čo linkujú na nich ale nie na nás.

6. **Report** — Vytvor štruktúrovaný report s:
   - Executive summary (3-5 viet)
   - Tabuľka: domain comparison (DR, traffic, keywords, backlinks)
   - Top 20 keyword gaps (volume, KD, competitor pozícia)
   - Top 10 content gaps (URL, téma, estimated traffic)
   - Top 10 backlink príležitostí (domain, DA, typ)
   - Prioritizované odporúčania (quick wins first)

7. **Export** — Ulož report cez `save_user_file` ako DOCX.
