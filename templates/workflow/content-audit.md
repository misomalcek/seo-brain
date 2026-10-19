---
name: Content Audit
description: Audit existujúceho obsahu — decay detection, performance, optimalizačné príležitosti
variables:
  - name: domain
    label: Doména
    options: [example.com, example-dev.com, example-qa.com]
    required: true
  - name: min_age_days
    label: Minimálny vek článku (dní)
    default: "90"
    type: number
  - name: focus
    label: Typ auditu
    default: performance
    options: [performance, decay, all]
---

## Kroky

1. **Top Pages** — Použi `ahrefs_top_pages` pre [domain]. Zisti ktoré stránky generujú traffic a ktoré nie.

2. **Keyword Coverage** — Použi `ahrefs_organic_keywords` pre [domain]. Pre každú top stránku: koľko keywords rankuje, priemerná pozícia.

3. **GSC Performance** — Použi `gsc_search_analytics` pre [domain]. Porovnaj kliky a impresie za posledných 28 dní vs. predchádzajúce obdobie.

4. **Decay Detection** — Identifikuj stránky kde:
   - Pozícia klesla o >5 miest
   - Kliky klesli o >30%
   - Impresie klesli o >40%
   Tieto sú kandidáti na content refresh.

5. **Content Quality Check** — Pre top 10 decaying pages použi `web_fetch`. Analyzuj:
   - Dĺžka obsahu (word count)
   - Heading štruktúra (H1, H2, H3)
   - Dátum poslednej aktualizácie
   - Internal links (in/out)

6. **Report** — Vytvor report s:
   - Celkový content health score (%)
   - Tabuľka: top performers (stránky s najväčším traffic)
   - Tabuľka: decaying content (stránky s najväčším poklesom)
   - Tabuľka: underperformers (stránky s traffic < 10/mesiac)
   - Prioritizované refresh odporúčania
   - Quick wins (malé zmeny, veľký impact)

7. **Export** — Ulož cez `save_user_file` ako DOCX.
