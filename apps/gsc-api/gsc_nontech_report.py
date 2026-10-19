#!/usr/bin/env python3
"""
GSC Non-Tech Topic Report Generator
Generates HTML report grouping queries by NON-TECH topics with aggregated metrics.
"""

import json
import os
from datetime import datetime
from collections import defaultdict

# =============================================================================
# TECH KEYWORDS TO EXCLUDE
# =============================================================================

TECH_KEYWORDS = [
    # AI & ML
    "ai", "umelá inteligencia", "umela inteligencia", "artificial intelligence",
    "machine learning", "ml", "chatbot", "gpt", "chatgpt", "openai", "neural",
    "deep learning", "nlp", "generatívna", "generativna", "llm", "copilot",
    "gemini", "claude", "bard",
    # Cloud & SaaS
    "cloud", "saas", "aws", "amazon web services", "azure", "google cloud",
    "hosting", "serverless", "iaas", "paas", "docker", "kubernetes", "k8s",
    "microservices", "container",
    # Programming
    "java", "python", "javascript", "typescript", "golang", "programovanie",
    "programovací", "programovaci", "developer", "vývojár", "vyvojar", "coding",
    "kód", "kod", "github", "git", "api", "framework", "frontend", "backend",
    "fullstack", "react", "angular", "node", "sql", "html", "css",
    # Cybersecurity
    "security", "bezpečnosť", "bezpecnost", "malware", "hacking", "hacker",
    "cyber", "phishing", "ransomware", "firewall", "antivirus", "encryption",
    "šifrovanie", "sifrovanie", "ddos", "vulnerability", "penetration",
    "deepfake", "spam",
    # Data & Analytics
    "data scientist", "data science", "analytics", "analytik", "big data",
    "databáz", "databaz", "database", "nosql", "reporting", "bi ",
    "business intelligence", "tableau", "power bi", "etl", "data warehouse",
    "data mining",
    # DevOps & Agile
    "devops", "scrum", "agile", "kanban", "ci/cd", "jenkins", "ansible",
    "terraform", "infrastructure", "deployment", "sprint", "product owner",
    "scrum master", "jira", "confluence",
    # IT Career
    "it tester", "tester", "qa ", "quality assurance", "it práca", "it praca",
    "it job", "it kariéra", "it kariera", "it pozícia", "it pozicia",
    "programátor", "programator", "it consultant", "it konzultant",
    # Digital Trends
    "digitalizácia", "digitalizacia", "digital transformation", "digitálna",
    "digitalna", "iot", "internet of things", "blockchain", "web3", "metaverse",
    "robotik", "automatizácia", "automatizacia"
]

# =============================================================================
# NON-TECH TOPIC DEFINITIONS
# =============================================================================

NONTECH_TOPICS = {
    "CV & Resume": [
        "životopis", "zivotopis", "cv", "resume", "lebenslauf",
        "curriculum vitae", "europass"
    ],
    "Cover Letter / Motivačný list": [
        "motivačný list", "motivacny list", "cover letter", "sprievodný list",
        "sprievodny list", "anschreiben", "bewerbungsschreiben"
    ],
    "Job Application": [
        "žiadosť o prijatie", "ziadost o prijatie", "žiadosť do zamestnania",
        "ziadost do zamestnania", "žiadosť o prácu", "ziadost o pracu",
        "bewerbung", "job application", "prihlaska do prace"
    ],
    "Interview & Hiring": [
        "pohovor", "interview", "pracovný pohovor", "pracovny pohovor",
        "výberové konanie", "vyberove konanie", "hiring", "recruitment",
        "nástup do práce", "nastup do prace", "otázky na pohovore"
    ],
    "Generations & Demographics": [
        "generácia", "generacia", "generacie", "generation",
        "mileniál", "milenial", "boomer", "gen z", "gen x", "gen y",
        "demografic"
    ],
    "Soft Skills": [
        "soft skills", "mäkké zručnosti", "makke zrucnosti",
        "komunikácia", "komunikacia", "teamwork", "tímová práca",
        "leadership", "vedenie", "prezentačné", "prezentacne",
        "time management", "kritické myslenie", "kriticke myslenie",
        "kreativita", "emočná inteligencia", "emocna inteligencia"
    ],
    "Hard Skills": [
        "hard skills", "tvrdé zručnosti", "tvrde zrucnosti",
        "technické zručnosti", "technicke zrucnosti", "odborné znalosti"
    ],
    "Career Development": [
        "kariéra", "kariera", "career", "profesijný rast", "profesijny rast",
        "povýšenie", "povysenie", "promotion", "rozvoj kariéry",
        "kariérny rast", "karierny rast"
    ],
    "Workplace & Office": [
        "pracovisko", "workplace", "office", "kancelária", "kancelaria",
        "home office", "práca z domu", "praca z domu", "remote",
        "hybridná práca", "hybridna praca", "open space"
    ],
    "Work-Life Balance": [
        "work-life", "work life", "rovnováha", "rovnovaha", "balance",
        "voľný čas", "volny cas", "dovolenka", "wellness", "wellbeing",
        "vyhorenie", "burnout", "stres", "relaxácia"
    ],
    "Salary & Benefits": [
        "plat", "mzda", "salary", "odmena", "benefity", "benefits",
        "prémie", "premie", "bonus", "13. plat", "stravné lístky",
        "zamestnanecké výhody"
    ],
    "Company Culture": [
        "firemná kultúra", "firemna kultura", "company culture",
        "hodnoty", "values", "team building", "teambuilding",
        "pracovná atmosféra", "pracovna atmosfera", "kolektív", "kolektiv"
    ],
    "HR & People Management": [
        "hr ", "ľudské zdroje", "ludske zdroje", "human resources",
        "personálne", "personalne", "people management", "onboarding",
        "offboarding", "employee", "zamestnanec"
    ],
    "Education & Training": [
        "vzdelávanie", "vzdelavanie", "education", "školenie", "skolenie",
        "training", "kurz", "certifikát", "certifikat", "rekvalifikácia",
        "rekvalifikacia", "učenie", "ucenie"
    ],
    "Brand & Company (MSG)": [
        "Example Org", "example-org", "exampleorg", "Example Org", "Example Group"
    ],
    "Lifestyle & Wellbeing": [
        "lifestyle", "zdravie", "health", "cvičenie", "cvicenie",
        "karpálny tunel", "karpalny tunel", "ergonóm", "ergonom",
        "očné", "ocne", "zrak", "chrbtica", "sed"
    ],
    "Productivity & Methods": [
        "produktivita", "productivity", "efektívnosť", "efektivnost",
        "efektívna", "efektivna", "metóda", "metoda", "technika",
        "pareto", "smart ciele", "smart ciel", "pomodoro", "gtd",
        "plánovanie", "planovanie"
    ],
    "Languages & Communication": [
        "jazyk", "language", "angličtina", "anglictina", "nemčina", "nemcina",
        "english", "german", "deutsch", "komunikácia", "komunikacia",
        "písanie", "pisanie", "email", "e-mail"
    ],
    "Insurance Industry": [
        "poisťovn", "poistovn", "poistenie", "insurance", "poistka",
        "životné poistenie", "zivotne poistenie", "aktuar", "aktuár"
    ]
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def is_tech_query(query_text):
    """Check if query is tech-related."""
    query_lower = query_text.lower()
    for kw in TECH_KEYWORDS:
        if kw in query_lower:
            return True
    return False

def classify_nontech_query(query_text):
    """Classify a non-tech query into topic groups."""
    query_lower = query_text.lower()
    matched_topics = []

    for topic, keywords in NONTECH_TOPICS.items():
        for kw in keywords:
            if kw in query_lower:
                matched_topics.append(topic)
                break

    return matched_topics if matched_topics else ["Uncategorized"]

def calculate_metrics(queries):
    """Calculate aggregated metrics for a list of queries."""
    if not queries:
        return {"clicks": 0, "impressions": 0, "ctr": 0, "avg_position": 0, "count": 0}

    total_clicks = sum(q["clicks"] for q in queries)
    total_impressions = sum(q["impressions"] for q in queries)

    weighted_pos = sum(q["position"] * q["impressions"] for q in queries)
    avg_position = weighted_pos / total_impressions if total_impressions > 0 else 0

    ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0

    return {
        "clicks": total_clicks,
        "impressions": total_impressions,
        "ctr": ctr,
        "avg_position": avg_position,
        "count": len(queries)
    }

def find_top_performers(topic_data):
    """Find queries with best CTR and position (winners)."""
    winners = []
    for topic, queries in topic_data.items():
        if topic in ["Uncategorized"]:
            continue
        for q in queries:
            # Good CTR (>5%) and decent impressions (>10)
            ctr = (q["clicks"] / q["impressions"] * 100) if q["impressions"] > 0 else 0
            if ctr > 5 and q["impressions"] > 10 and q["clicks"] > 0:
                winners.append({
                    "query": q["keys"][0],
                    "topic": topic,
                    "clicks": q["clicks"],
                    "impressions": q["impressions"],
                    "ctr": ctr,
                    "position": q["position"]
                })

    return sorted(winners, key=lambda x: x["clicks"], reverse=True)[:30]

# =============================================================================
# HTML GENERATION
# =============================================================================

def generate_html(topic_data, all_nontech_queries, all_queries, top_performers, site_name, date_range):
    """Generate HTML report."""

    nontech_metrics = calculate_metrics(all_nontech_queries)
    all_metrics = calculate_metrics(all_queries)

    # Sort topics by impressions
    sorted_topics = sorted(
        [(t, qs) for t, qs in topic_data.items()],
        key=lambda x: calculate_metrics(x[1])["impressions"],
        reverse=True
    )

    html = f'''<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GSC Non-Tech Report - {site_name}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }}
        .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}

        header {{
            background: linear-gradient(135deg, #2d5016 0%, #4a7c23 100%);
            color: white;
            padding: 30px 20px;
            margin-bottom: 30px;
        }}
        header h1 {{ font-size: 28px; margin-bottom: 10px; }}
        header .meta {{ opacity: 0.8; font-size: 14px; }}

        .summary-cards {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .card {{
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .card h3 {{ font-size: 14px; color: #666; margin-bottom: 8px; }}
        .card .value {{ font-size: 32px; font-weight: 700; color: #2d5016; }}
        .card .subvalue {{ font-size: 14px; color: #888; margin-top: 5px; }}
        .card.highlight {{ background: linear-gradient(135deg, #4a7c23 0%, #6ba32e 100%); color: white; }}
        .card.highlight h3 {{ color: rgba(255,255,255,0.8); }}
        .card.highlight .value {{ color: white; }}
        .card.highlight .subvalue {{ color: rgba(255,255,255,0.7); }}

        .section {{
            background: white;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .section-header {{
            padding: 20px;
            background: #fafafa;
            border-bottom: 1px solid #eee;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .section-header:hover {{ background: #f0f0f0; }}
        .section-header h2 {{ font-size: 18px; }}
        .section-header .metrics {{
            display: flex;
            gap: 20px;
            font-size: 14px;
        }}
        .section-header .metrics span {{
            background: #e8e8e8;
            padding: 4px 12px;
            border-radius: 20px;
        }}
        .section-header .metrics .clicks {{ background: #d4edda; color: #155724; }}
        .section-header .metrics .impressions {{ background: #cce5ff; color: #004085; }}

        .section-content {{
            padding: 20px;
            display: none;
            max-height: 600px;
            overflow-y: auto;
        }}
        .section.open .section-content {{ display: block; }}
        .section-header .toggle {{
            font-size: 20px;
            transition: transform 0.2s;
        }}
        .section.open .section-header .toggle {{ transform: rotate(180deg); }}

        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }}
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }}
        th {{
            background: #f8f9fa;
            font-weight: 600;
            position: sticky;
            top: 0;
        }}
        tr:hover {{ background: #f8f9fa; }}
        .query-text {{ max-width: 400px; word-break: break-word; }}
        .number {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .position {{
            display: inline-block;
            min-width: 40px;
            text-align: center;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 500;
        }}
        .position.good {{ background: #d4edda; color: #155724; }}
        .position.medium {{ background: #fff3cd; color: #856404; }}
        .position.poor {{ background: #f8d7da; color: #721c24; }}

        .winners-section {{ background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); }}
        .winners-section .section-header {{ background: transparent; }}
        .winner-tag {{
            display: inline-block;
            font-size: 12px;
            padding: 2px 8px;
            background: #4caf50;
            color: white;
            border-radius: 4px;
            margin-left: 8px;
        }}

        footer {{
            text-align: center;
            padding: 30px;
            color: #888;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>Non-Tech Topics Report</h1>
            <div class="meta">
                <strong>{site_name}</strong> | {date_range} | Generated {datetime.now().strftime("%Y-%m-%d %H:%M")}
            </div>
        </div>
    </header>

    <div class="container">
        <div class="summary-cards">
            <div class="card highlight">
                <h3>Non-Tech Queries</h3>
                <div class="value">{nontech_metrics["count"]:,}</div>
                <div class="subvalue">z {all_metrics["count"]:,} celkovo ({nontech_metrics["count"]/all_metrics["count"]*100:.1f}%)</div>
            </div>
            <div class="card">
                <h3>Non-Tech Clicks</h3>
                <div class="value">{nontech_metrics["clicks"]:,}</div>
                <div class="subvalue">z {all_metrics["clicks"]:,} celkovo</div>
            </div>
            <div class="card">
                <h3>Non-Tech Impressions</h3>
                <div class="value">{nontech_metrics["impressions"]:,}</div>
                <div class="subvalue">z {all_metrics["impressions"]:,} celkovo</div>
            </div>
            <div class="card">
                <h3>Avg Position</h3>
                <div class="value">{nontech_metrics["avg_position"]:.1f}</div>
                <div class="subvalue">CTR: {nontech_metrics["ctr"]:.2f}%</div>
            </div>
        </div>
'''

    # Top Performers section first
    if top_performers:
        html += '''
        <div class="section winners-section open">
            <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
                <h2>Top Performers<span class="winner-tag">High CTR winners</span></h2>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="margin-bottom: 15px; color: #666;">
                    Queries s najlepším CTR (>5%) a viac ako 10 impressions. Tieto témy fungujú dobre!
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Query</th>
                            <th>Topic</th>
                            <th class="number">Clicks</th>
                            <th class="number">Impr</th>
                            <th class="number">CTR</th>
                            <th class="number">Position</th>
                        </tr>
                    </thead>
                    <tbody>
'''
        for w in top_performers:
            pos_class = "good" if w["position"] < 5 else ("medium" if w["position"] < 15 else "poor")
            html += f'''
                        <tr>
                            <td class="query-text">{w["query"]}</td>
                            <td>{w["topic"]}</td>
                            <td class="number">{w["clicks"]}</td>
                            <td class="number">{w["impressions"]}</td>
                            <td class="number">{w["ctr"]:.1f}%</td>
                            <td class="number"><span class="position {pos_class}">{w["position"]:.1f}</span></td>
                        </tr>
'''
        html += '''
                    </tbody>
                </table>
            </div>
        </div>
'''

    # Topic sections
    for topic, queries in sorted_topics:
        metrics = calculate_metrics(queries)
        sorted_queries = sorted(queries, key=lambda x: x["impressions"], reverse=True)

        html += f'''
        <div class="section">
            <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
                <h2>{topic}</h2>
                <div class="metrics">
                    <span class="clicks">{metrics["clicks"]} clicks</span>
                    <span class="impressions">{metrics["impressions"]:,} impr</span>
                    <span>pos {metrics["avg_position"]:.1f}</span>
                    <span>{metrics["count"]} queries</span>
                </div>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content">
                <table>
                    <thead>
                        <tr>
                            <th>Query</th>
                            <th class="number">Clicks</th>
                            <th class="number">Impressions</th>
                            <th class="number">CTR</th>
                            <th class="number">Position</th>
                        </tr>
                    </thead>
                    <tbody>
'''
        for q in sorted_queries[:100]:
            pos = q["position"]
            pos_class = "good" if pos < 5 else ("medium" if pos < 15 else "poor")
            ctr = (q["clicks"] / q["impressions"] * 100) if q["impressions"] > 0 else 0

            html += f'''
                        <tr>
                            <td class="query-text">{q["keys"][0]}</td>
                            <td class="number">{q["clicks"]}</td>
                            <td class="number">{q["impressions"]:,}</td>
                            <td class="number">{ctr:.1f}%</td>
                            <td class="number"><span class="position {pos_class}">{pos:.1f}</span></td>
                        </tr>
'''

        if len(sorted_queries) > 100:
            html += f'''
                        <tr>
                            <td colspan="5" style="text-align: center; color: #888; font-style: italic;">
                                ... a {len(sorted_queries) - 100} ďalších queries
                            </td>
                        </tr>
'''

        html += '''
                    </tbody>
                </table>
            </div>
        </div>
'''

    html += '''
    </div>

    <footer>
        Generated by GSC Non-Tech Report | Data source: Google Search Console API
    </footer>

    <script>
        // First section (Top Performers) is already open
    </script>
</body>
</html>
'''

    return html

# =============================================================================
# MAIN
# =============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate GSC Non-Tech Topic Report")
    parser.add_argument("data_dir", help="Directory with queries.json")
    parser.add_argument("-o", "--output", help="Output HTML file path")
    parser.add_argument("-s", "--site", default="example.com", help="Site name for report")
    args = parser.parse_args()

    # Load data
    queries_file = os.path.join(args.data_dir, "queries.json")
    if not os.path.exists(queries_file):
        print(f"Error: {queries_file} not found")
        return 1

    with open(queries_file) as f:
        data = json.load(f)

    all_queries = data.get("rows", [])
    print(f"Loaded {len(all_queries)} queries")

    # Filter out tech queries
    nontech_queries = [q for q in all_queries if not is_tech_query(q["keys"][0])]
    tech_count = len(all_queries) - len(nontech_queries)
    print(f"Filtered out {tech_count} tech queries, {len(nontech_queries)} non-tech remaining")

    # Classify non-tech queries
    topic_data = defaultdict(list)
    for q in nontech_queries:
        topics = classify_nontech_query(q["keys"][0])
        for topic in topics:
            topic_data[topic].append(q)

    # Find top performers
    top_performers = find_top_performers(topic_data)

    # Print summary
    print("\nNon-Tech Topic breakdown:")
    for topic in sorted(topic_data.keys()):
        metrics = calculate_metrics(topic_data[topic])
        print(f"  {topic}: {metrics['count']} queries, {metrics['clicks']} clicks, {metrics['impressions']} impr")

    # Generate report
    date_range = args.data_dir.split("/")[-1] if "/" in args.data_dir else "recent"
    html = generate_html(topic_data, nontech_queries, all_queries, top_performers, args.site, date_range)

    # Output
    if args.output:
        output_path = args.output
    else:
        os.makedirs(os.path.join(os.path.dirname(args.data_dir), "reports"), exist_ok=True)
        output_path = os.path.join(os.path.dirname(args.data_dir), "reports",
                                   f"{args.site.replace('.', '-')}-nontech-topics-{date_range}.html")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nReport saved to: {output_path}")
    return 0

if __name__ == "__main__":
    exit(main())
