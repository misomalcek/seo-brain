---
name: Mesačný SEO Report
description: Automatizovaný mesačný SEO prehľad so všetkými kľúčovými metrikami
variables:
  - name: domain
    label: Doména
    options: [example.com, example-dev.com, example-qa.com]
    required: true
  - name: period
    label: Obdobie
    default: 28d
    options: [7d, 28d, 3m, 6m]
---

## Kroky

1. **GSC Performance** — Použi `gsc_search_analytics` pre [domain] za [period]. Kľúčové metriky: kliky, impresie, CTR, priemerná pozícia.

2. **Top Keywords** — Z GSC dát vyber top 20 keywords podľa klikov. Pre každý: pozícia, trend, CTR.

3. **Domain Authority** — Použi `ahrefs_domain_rating` pre [domain]. DR, Ahrefs rank, referring domains count.

4. **Organic Keywords** — Použi `ahrefs_organic_keywords` pre [domain]. Celkový počet, distribúcia (top 3, 4-10, 11-20, 21-50, 50+).

5. **Quick Wins** — Použi `gsc_quick_wins` pre [domain]. Keywords na pozíciách 4-20 s potenciálom.

6. **Technical Health** — Použi `gsc_tech_seo` pre [domain]. CrUX metriky (LCP, CLS, INP), index status.

7. **Backlink Status** — Použi `ahrefs_referring_domains` pre [domain]. Nové vs. stratené domény.

8. **Report** — Vytvor HTML report s:
   - Dashboard header (4 KPI karty: kliky, impresie, DR, keywords)
   - Performance graf popis (trend za [period])
   - Top 20 keywords tabuľka
   - Quick wins tabuľka (top 10)
   - Technical health status
   - Backlink summary
   - 5 prioritizovaných odporúčaní

9. **Export** — Ulož ako DOCX cez `save_user_file`.
