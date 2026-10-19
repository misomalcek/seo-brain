# tech-tutorial-brief - new

## CONTENT BRIEF: Tech Tutorial

## Basic Info
- **URL**: /technologie/java/spring-boot/
- **Type**: Tech Tutorial (Cluster 1: Java Ecosystem)
- **Priority**: 🔥 P0
- **Target Word Count**: 1,800 words
- **Deadline**: 2026-03-20
- **Owner**: Content Writer 2 (tech background)

---

## Target Audience
- **Primary**: Junior-Medior Java Developers
- **Skill Level**: Basic Java knowledge (OOP, collections)
- **Goal**: Naučiť sa Spring Boot basics, vytvoriť prvý projekt

---

## SEO Requirements

### Primary Keywords:
- spring boot (90 vol, KD 35)
- spring boot tutorial (40 vol, KD 25)

### Secondary:
- čo je spring boot
- spring boot slovensky
- spring boot začiatočník

---

## Content Structure

### H1: Spring Boot — Úvod a prvý projekt v 2026

### Introduction (150 words)
- Čo je Spring Boot?
- Prečo je populárny? (convention over configuration)
- Čo sa naučíš v tomto tutoriáli?

### H2: Čo je Spring Boot? (250 words)
- Framework na tvorbu Java aplikácií
- Postavený na Spring Framework
- Auto-configuration, embedded servers
- Ideálne pre: REST API, microservices

### H2: Prečo používať Spring Boot? (200 words)
**Výhody:**
- Rýchly development
- Minimal configuration
- Production-ready (health checks, metrics)
- Veľká komunita

**Use cases:**
- Backend REST API
- Microservices
- Enterprise aplikácie

### H2: Prerequisites (100 words)
**Potrebuješ:**
- Java 11+ (link: /slovnik/tech/java/)
- IDE (IntelliJ IDEA, Eclipse)
- Maven/Gradle

### H2: Prvý Spring Boot projekt (800 words)

**Krok 1: Project Setup** (200w)
```java
// Spring Initializr (start.spring.io)
// Dependencies: Spring Web, Spring Boot DevTools
```
[Screenshot: Spring Initializr]

**Krok 2: Hello World API** (300w)
```java
@RestController
public class HelloController {
    @GetMapping("/hello")
    public String hello() {
        return "Hello from Spring Boot!";
    }
}
```
[Code explanation]

**Krok 3: Run Application** (200w)
```bash
mvn spring-boot:run
```
[Screenshot: Console output]

**Krok 4: Test v prehliadači** (100w)
`http://localhost:8080/hello`

### H2: Ďalšie kroky (200 words)
- Spring Data JPA (databáza)
  - Link: /technologie/java/hibernate/
- Spring Security (authentication)
- REST API best practices
  - Link: /technologie/java/microservices/

### H2: Zdroje na učenie (100 words)
- Official docs: spring.io
- Online kurzy: /kurzy/java-programovanie/
- example-dev.com (pokročilé tutoriály)

---

## Code Examples
- ✅ All code in Slovak comments
- ✅ GitHub repo link (example-org-examples)
- ✅ Copy button for code blocks

---

## Cross-Links

**Internal:**
- /technologie/java/ (pillar)
- /slovnik/tech/spring-boot/ (glossary)
- /kariera/ako-sa-stat-java-developerom/
- /praca/pozicie/java-developer/

**External:**
- example-dev.com/spring-boot-advanced/
- spring.io/guides

---

## Schema Markup
- Article
- HowTo (step-by-step)
- SoftwareApplication (Spring Boot)

---

## CTAs
1. "Hľadáš prácu so Spring Boot? Pozri pozície"
   → /praca/technologie/spring-boot/

2. "Pokročilé Spring Boot tutoriály"
   → example-dev.com

