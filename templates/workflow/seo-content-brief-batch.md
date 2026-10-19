---
name: SEO Content Brief — Batch
description: Vygeneruj 1-20 SEO content briefov pre zadané keywords
variables:
  - name: domain
    label: Pre akú doménu?
    options: [example.com, example-dev.com, example-qa.com]
    required: true
  - name: keywords
    label: Kľúčové slová (čiarkou oddelené)
    required: true
  - name: count
    label: Počet briefov
    default: "5"
    type: number
  - name: language
    label: Jazyk výstupu
    default: sk
    options: [sk, en, cs]
---

## Kroky

1. **Keyword analýza** — Pre každé keyword z [keywords] použi `ahrefs_keyword_overview` (volume, KD, CPC, traffic potential).

2. **SERP analýza** — Pre top [count] keywords podľa volume použi `ahrefs_serp_overview`. Zisti kto rankuje v top 10.

3. **Competitor content** — Pre top 3 výsledky z SERP použi `web_fetch`. Analyzuj štruktúru, dĺžku, headings.

4. **Content gap** — Porovnaj čo competitors pokrývajú vs čo [domain] ešte nemá. Použi `ahrefs_organic_keywords` pre [domain].

5. **Brief pre každý keyword** — Vytvor štruktúrovaný brief:
   - Navrhovaný H1 titulok
   - Meta description (max 155 znakov)
   - Outline (H2, H3 headings)
   - Cieľová dĺžka (word count podľa competitors)
   - Primary + secondary keywords
   - Internal linking suggestions pre [domain]

6. **Export** — Ulož výsledok ako DOCX súbor cez `save_user_file`. Pridaj do content calendar cez `content_calendar`.
