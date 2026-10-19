#!/usr/bin/env python3
"""
GSC Topic Report Generator
Generates HTML report grouping queries by topics with aggregated metrics.
"""

import json
import os
from datetime import datetime
from collections import defaultdict

# =============================================================================
# TOPIC DEFINITIONS
# =============================================================================

TOPICS = {
    "AI & Machine Learning": [
        "ai", "umelá inteligencia", "umela inteligencia", "artificial intelligence",
        "machine learning", "ml", "chatbot", "gpt", "chatgpt", "openai", "neural",
        "deep learning", "nlp", "generatívna", "generativna", "llm", "copilot",
        "gemini", "claude", "bard"
    ],
    "Cloud & SaaS": [
        "cloud", "saas", "aws", "amazon web services", "azure", "google cloud",
        "hosting", "serverless", "iaas", "paas", "docker", "kubernetes", "k8s",
        "microservices", "container"
    ],
    "Programming & Development": [
        "java", "python", "javascript", "typescript", "golang", "programovanie",
        "programovací", "programovaci", "developer", "vývojár", "vyvojar", "coding",
        "kód", "kod", "github", "git", "api", "framework", "frontend", "backend",
        "fullstack", "react", "angular", "node", "sql", "html", "css"
    ],
    "Cybersecurity": [
        "security", "bezpečnosť", "bezpecnost", "malware", "hacking", "hacker",
        "cyber", "phishing", "ransomware", "firewall", "antivirus", "encryption",
        "šifrovanie", "sifrovanie", "ddos", "vulnerability", "penetration",
        "deepfake", "spam"
    ],
    "Data & Analytics": [
        "data scientist", "data science", "analytics", "analytik", "big data",
        "databáz", "databaz", "database", "sql", "nosql", "reporting", "bi ",
        "business intelligence", "tableau", "power bi", "etl", "data warehouse",
        "dáta", "data mining"
    ],
    "DevOps & Agile": [
        "devops", "scrum", "agile", "kanban", "ci/cd", "jenkins", "ansible",
        "terraform", "infrastructure", "deployment", "sprint", "product owner",
        "scrum master", "jira", "confluence"
    ],
    "IT Career & Jobs": [
        "it tester", "tester", "qa ", "quality assurance", "it práca", "it praca",
        "it job", "it kariéra", "it kariera", "it pozícia", "it pozicia",
        "programátor", "programator", "it consultant", "it konzultant"
    ],
    "Digital Trends": [
        "digitalizácia", "digitalizacia", "digital transformation", "digitálna",
        "digitalna", "trendy", "budúcnosť", "buducnost", "future", "industry 4.0",
        "iot", "internet of things", "blockchain", "web3", "metaverse", "vr", "ar",
        "robotik", "automatizácia", "automatizacia"
    ]
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def classify_query(query_text):
    """Classify a query into topic groups. Can belong to multiple topics."""
    query_lower = query_text.lower()
    matched_topics = []

    for topic, keywords in TOPICS.items():
        for kw in keywords:
            if kw in query_lower:
                matched_topics.append(topic)
                break

    return matched_topics if matched_topics else ["Other"]

def calculate_metrics(queries):
    """Calculate aggregated metrics for a list of queries."""
    if not queries:
        return {"clicks": 0, "impressions": 0, "ctr": 0, "avg_position": 0, "count": 0}

    total_clicks = sum(q["clicks"] for q in queries)
    total_impressions = sum(q["impressions"] for q in queries)

    # Weighted average position
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

def find_hidden_gems(topic_data):
    """Find queries with good position but low clicks (opportunities)."""
    gems = []
    for topic, queries in topic_data.items():
        if topic == "Other":
            continue
        for q in queries:
            # Good position (<10), some impressions (>5), but no/few clicks
            if q["position"] < 10 and q["impressions"] > 5 and q["clicks"] == 0:
                gems.append({
                    "query": q["keys"][0],
                    "topic": topic,
                    "position": q["position"],
                    "impressions": q["impressions"]
                })

    return sorted(gems, key=lambda x: x["impressions"], reverse=True)[:20]

# =============================================================================
# HTML GENERATION
# =============================================================================

def generate_html(topic_data, all_queries, hidden_gems, site_name, date_range):
    """Generate HTML report."""

    # Calculate totals
    it_queries = [q for t, qs in topic_data.items() if t != "Other" for q in qs]
    it_metrics = calculate_metrics(it_queries)
    all_metrics = calculate_metrics(all_queries)

    # Sort topics by impressions
    sorted_topics = sorted(
        [(t, qs) for t, qs in topic_data.items() if t != "Other"],
        key=lambda x: calculate_metrics(x[1])["impressions"],
        reverse=True
    )

    html = f'''<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GSC Topic Report - {site_name}</title>
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
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
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
        .card .value {{ font-size: 32px; font-weight: 700; color: #1a1a2e; }}
        .card .subvalue {{ font-size: 14px; color: #888; margin-top: 5px; }}
        .card.highlight {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }}
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

        .gems-section {{ background: linear-gradient(135deg, #fff9e6 0%, #fff5d6 100%); }}
        .gems-section .section-header {{ background: transparent; }}
        .gem-tag {{
            display: inline-block;
            font-size: 12px;
            padding: 2px 8px;
            background: #ffc107;
            color: #333;
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
            <h1>IT & Digital Topics Report</h1>
            <div class="meta">
                <strong>{site_name}</strong> | {date_range} | Generated {datetime.now().strftime("%Y-%m-%d %H:%M")}
            </div>
        </div>
    </header>

    <div class="container">
        <div class="summary-cards">
            <div class="card highlight">
                <h3>IT/Digital Queries</h3>
                <div class="value">{it_metrics["count"]:,}</div>
                <div class="subvalue">z {all_metrics["count"]:,} celkovo ({it_metrics["count"]/all_metrics["count"]*100:.1f}%)</div>
            </div>
            <div class="card">
                <h3>IT/Digital Clicks</h3>
                <div class="value">{it_metrics["clicks"]:,}</div>
                <div class="subvalue">z {all_metrics["clicks"]:,} celkovo</div>
            </div>
            <div class="card">
                <h3>IT/Digital Impressions</h3>
                <div class="value">{it_metrics["impressions"]:,}</div>
                <div class="subvalue">z {all_metrics["impressions"]:,} celkovo</div>
            </div>
            <div class="card">
                <h3>Avg Position (IT)</h3>
                <div class="value">{it_metrics["avg_position"]:.1f}</div>
                <div class="subvalue">CTR: {it_metrics["ctr"]:.2f}%</div>
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
        for q in sorted_queries[:100]:  # Top 100 per topic
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

    # Hidden Gems section
    if hidden_gems:
        html += '''
        <div class="section gems-section">
            <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
                <h2>Hidden Gems - Opportunities<span class="gem-tag">Low clicks, good position</span></h2>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="margin-bottom: 15px; color: #666;">
                    Queries s dobrou pozíciou (&lt;10) a impressions, ale bez klikov. Príležitosti na optimalizáciu title/description.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Query</th>
                            <th>Topic</th>
                            <th class="number">Impressions</th>
                            <th class="number">Position</th>
                        </tr>
                    </thead>
                    <tbody>
'''
        for gem in hidden_gems:
            html += f'''
                        <tr>
                            <td class="query-text">{gem["query"]}</td>
                            <td>{gem["topic"]}</td>
                            <td class="number">{gem["impressions"]}</td>
                            <td class="number"><span class="position good">{gem["position"]:.1f}</span></td>
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
        Generated by GSC Topic Report | Data source: Google Search Console API
    </footer>

    <script>
        // Open first section by default
        document.querySelector('.section')?.classList.add('open');
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

    parser = argparse.ArgumentParser(description="Generate GSC Topic Report")
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

    # Classify queries
    topic_data = defaultdict(list)
    for q in all_queries:
        topics = classify_query(q["keys"][0])
        for topic in topics:
            topic_data[topic].append(q)

    # Find hidden gems
    hidden_gems = find_hidden_gems(topic_data)

    # Print summary
    print("\nTopic breakdown:")
    for topic in sorted(topic_data.keys()):
        if topic != "Other":
            metrics = calculate_metrics(topic_data[topic])
            print(f"  {topic}: {metrics['count']} queries, {metrics['clicks']} clicks, {metrics['impressions']} impr")

    # Generate report
    date_range = args.data_dir.split("/")[-1] if "/" in args.data_dir else "recent"
    html = generate_html(topic_data, all_queries, hidden_gems, args.site, date_range)

    # Output
    if args.output:
        output_path = args.output
    else:
        os.makedirs(os.path.join(os.path.dirname(args.data_dir), "reports"), exist_ok=True)
        output_path = os.path.join(os.path.dirname(args.data_dir), "reports",
                                   f"{args.site.replace('.', '-')}-it-topics-{date_range}.html")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nReport saved to: {output_path}")
    return 0

if __name__ == "__main__":
    exit(main())
