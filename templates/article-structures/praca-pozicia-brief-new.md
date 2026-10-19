# praca/pozicia-brief - new

## CONTENT BRIEF: Job Hub TIER 1 (Evergreen)

## Basic Info
- **URL**: /praca/pozicie/java-developer/
- **Type**: Job Listing Hub + Informational
- **Priority**: 🔥 P0
- **Target Word Count**: 1,200-1,500 words
- **Deadline**: 2026-03-08
- **Owner**: Content Writer 2

---

## Target Audience
- **Primary**: Job seekers (Java Developers)
- **Intent**: Transactional (job search) + Informational (career info)

---

## SEO Requirements

### Primary Keywords:
- java developer práca (300 vol, KD 20)
- java programátor pozície (100 vol, KD 15)

### Secondary:
- java developer slovensko
- java developer bratislava
- java práca Example Org

---

## Content Structure

### H1: Java Developer — Práca v Example Org

### Dynamic Section: Aktuálne pozície (TOP OF PAGE)
**[DYNAMIC FEED — pulls from ATS]**

**Example:**
```
🔥 Aktuálne Java Developer pozície (7 otvorených)

→ Senior Java Developer — Life Insurance (Bratislava)
  📍 Bratislava | 💼 Senior | 💰 3,800-4,800 € | 🏢 Hybrid
  [Zobraziť detaily] → /praca/12345/senior-java-developer-life/

→ Java Software Engineer — Example Product Suite (Žilina)
  📍 Žilina | 💼 Medior-Senior | 💰 3,200-4,200 € | 🏢 Hybrid
  [Zobraziť detaily]

→ Full Stack Java Developer — Digital (Remote)
  📍 Remote | 💼 Medior | 💰 3,000-3,800 € | 🏢 100% Remote
  [Zobraziť detaily]

[Zobraziť všetky →]

---

💬 Žiadna otvorená pozícia?
[CTA: Poslať iniciatívnu žiadosť] → /kariera/iniciativna-ziadost/
```

### H2: Čo robí Java Developer v Example Org? (300 words)
- Vývoj enterprise aplikácií pre poisťovníctvo
- Práca s Example Product Suite
- Microservices architektúra (Spring Boot, Kubernetes)
- Agile tímová spolupráca
- Code review & mentoring juniorov
- Medzinárodné projekty (DE, AT, CH)

**Real example project:**
"Vývoj nového life insurance modulu pre Generali — 6-mesačný projekt, Spring Boot + AWS Lambda, team 8 ľudí"

### H2: Požadované skills (200 words)

**Must-have:**
- Java 11+ (Spring Boot, Hibernate)
- REST API development
- SQL databázy (PostgreSQL, Oracle)
- Git version control

**Nice-to-have:**
- Kubernetes / Docker
- AWS / Azure (link: /technologie/cloud/aws-uvod/)
- Insurance domain knowledge
- Nemčina (výhoda pre medzinárodné projekty)

Link: /popisy-pozicii/java-developer/ (detailný popis)

### H2: Kariérna cesta (200 words)
```
Junior Developer (1-2 roky)
    ↓
Medior Developer (2-4 roky)
    ↓
Senior Developer (3-5 rokov)
    ↓
Tech Lead / Solutions Architect
```

Link: /kariera/z-developera-na-architekta/

### H2: Priemerný plat (150 words)
**Junior**: 1,800-2,400 € brutto
**Medior**: 2,500-3,200 € brutto
**Senior**: 3,300-4,500 € brutto

[Link: Detailný prehľad platov → /kariera/platy/java-developer/]

### H2: Benefity v Example Org (200 words)
- Flexible working hours & hybrid model
- 25 dní dovolenky + sick days
- Vzdelávanie & certifikácie (AWS, Java, Kubernetes)
- Moderné technológie
- Medzinárodné projekty
- Kariérny growth (internal mobility)

[Link: Všetky benefity → /benefity/]

### H2: Ako sa pripraviť na pohovor? (150 words)
- Osvieži si Java fundamentals
- Priprav portfolio (GitHub projekty)
- Zopakuj si Spring Boot
- Behavioral questions (teamwork, problem-solving)

[Link: Java pohovor otázky → /kariera/otazky-na-pohovore-java/]

### H2: Ďalšie technológie v Example Org (100 words)
[Links: Spring Boot, AWS, Microservices, Docker, Kubernetes]

### H2: Pozri tiež (50 words)
- [Ako sa stať Java developerom → /kariera/ako-sa-stat-java-developerom/]
- [Java tutoriály → /technologie/java/]
- [Java certifikácie → /kariera/certifikacie/oracle-java/]

---

## Dynamic Elements

**Job Feed Logic:**
```
IF active_jobs_count > 0:
    DISPLAY job feed (dynamic, sorted by publish_date DESC)
ELSE:
    DISPLAY "Žiadna otvorená pozícia" + iniciatívna žiadosť CTA
```

**Automatic Internal Linking:**
- Homepage: Featured jobs widget → links here
- /kariera/ako-sa-stat-java-developerom/ → "Aktuálne pozície" sidebar
- /technologie/java/ → "Hľadáš prácu? Pozri pozície"

---

## Schema Markup
```json
{
  "@type": ["CollectionPage", "JobPosting"],
  "name": "Java Developer Jobs",
  "description": "Aktuálne Java Developer pozície v Example Org",
  "jobPosting": [
    {
      "@type": "JobPosting",
      "title": "Senior Java Developer",
      "hiringOrganization": {...},
      "baseSalary": {...}
    }
  ]
}
```

---

## CTAs

**Primary (after job feed):**
- "Prihlásiť sa na pozíciu" (per job)

**Secondary (if 0 jobs):**
- "Poslať iniciatívnu žiadosť"

**Tertiary (sidebar):**
- "Priprav sa na pohovor"
- "Nauč sa Spring Boot"
- "Porovnaj platy"
