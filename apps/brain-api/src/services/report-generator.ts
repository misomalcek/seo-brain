import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface ReportRequest {
  templateType: string;
  title: string;
  siteDomain?: string;
  dataSources: Array<{ name: string; data: any }>;
}

const TEMPLATE_PROMPTS: Record<string, string> = {
  'seo-audit': `Generate a comprehensive SEO Audit HTML report. Include sections for: Domain overview, Keyword rankings, Backlink profile, Top pages, Competitors, Recommendations. Use charts/tables where appropriate.`,
  'keyword-analysis': `Generate a Keyword Analysis HTML report. Include sections for: Target keywords overview, Search volume trends, Difficulty analysis, SERP features, Keyword clusters, Action items.`,
  'competitor-analysis': `Generate a Competitor Analysis HTML report. Include sections for: Competitor overview, Domain comparison, Keyword gaps, Backlink comparison, Content gaps, Strategic recommendations.`,
  'content-performance': `Generate a Content Performance HTML report. Include sections for: Content overview, Top performing pages, Underperforming content, Content gaps, Optimization opportunities, Content calendar recommendations.`,
  'custom': `Generate a professional HTML report based on the provided data.`,
};

const BASE_STYLES = `
<style>
  :root {
    --bg: #0a0e17;
    --card: #111827;
    --border: #1f2937;
    --text: #e5e7eb;
    --muted: #9ca3af;
    --primary: #6366f1;
    --accent: #8b5cf6;
    --green: #10b981;
    --red: #ef4444;
    --yellow: #f59e0b;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 2rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  h2 { font-size: 1.4rem; margin: 2rem 0 1rem; color: var(--text); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; color: var(--text); }
  p { margin-bottom: 1rem; color: var(--muted); }
  .header { margin-bottom: 2rem; }
  .header .meta { color: var(--muted); font-size: 0.875rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; text-align: center; }
  .stat .value { font-size: 2rem; font-weight: 700; color: var(--primary); }
  .stat .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
  th { background: var(--card); text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); }
  td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
  tr:hover td { background: rgba(99, 102, 241, 0.05); }
  .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
  .badge-green { background: rgba(16, 185, 129, 0.15); color: var(--green); }
  .badge-red { background: rgba(239, 68, 68, 0.15); color: var(--red); }
  .badge-yellow { background: rgba(245, 158, 11, 0.15); color: var(--yellow); }
  .badge-primary { background: rgba(99, 102, 241, 0.15); color: var(--primary); }
  ul, ol { margin: 0.5rem 0 1rem 1.5rem; color: var(--muted); }
  li { margin-bottom: 0.4rem; }
  .bar-chart { display: flex; flex-direction: column; gap: 0.5rem; }
  .bar-row { display: flex; align-items: center; gap: 0.75rem; }
  .bar-label { width: 120px; font-size: 0.8rem; color: var(--muted); text-align: right; }
  .bar-track { flex: 1; height: 24px; background: var(--border); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 4px; display: flex; align-items: center; padding-left: 8px; font-size: 0.7rem; color: white; }
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 0.75rem; }
  @media print { body { background: white; color: #333; } .card { border-color: #ddd; } }
</style>`;

export async function generateHTMLReport(request: ReportRequest): Promise<string> {
  const templatePrompt = TEMPLATE_PROMPTS[request.templateType] || TEMPLATE_PROMPTS['custom'];

  const dataContext = request.dataSources.map(ds =>
    `### Data Source: ${ds.name}\n\`\`\`json\n${JSON.stringify(ds.data, null, 2).slice(0, 10000)}\n\`\`\``
  ).join('\n\n');

  const prompt = `${templatePrompt}

Title: ${request.title}
${request.siteDomain ? `Website: ${request.siteDomain}` : ''}
Date: ${new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}

## Available Data:
${dataContext || 'No specific data provided. Generate a template report structure.'}

## Requirements:
- Generate ONLY the <body> content (no <html>, <head>, or <style> tags — those are provided separately)
- Use the CSS classes defined: .card, .grid, .stat, .badge-green/red/yellow/primary, table/th/td, .bar-chart, .header, .footer
- Include a .header section with h1 title and .meta line with date and site
- Include a .footer with "Generated by Brain AI"
- Use real data from the provided sources when available
- Fill missing data with realistic placeholder insights
- Create visual elements: stats grid, tables, bar charts (using .bar-chart CSS)
- Write in Slovak language for labels and descriptions
- Make it comprehensive but readable (3-6 sections)`;

  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
    max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '64000'),
    messages: [{ role: 'user', content: prompt }],
  });

  const bodyContent = (message.content[0] as any).text || '';

  // Wrap in full HTML document
  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(request.title)} — Brain Report</title>
  ${BASE_STYLES}
</head>
<body>
${bodyContent}
</body>
</html>`;

  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
