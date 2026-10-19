/**
 * Workflow Engine — loads workflow templates, parses variables,
 * and generates prompts for Brain to execute step by step.
 */

import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW_DIR = '/opt/team-brain/templates/workflow';

export interface WorkflowVariable {
  name: string;
  label: string;
  required?: boolean;
  default?: string;
  type?: string;
  options?: string[];
}

export interface WorkflowTemplate {
  id: string;           // filename without .md
  name: string;
  description: string;
  variables: WorkflowVariable[];
  steps: string;        // raw markdown steps
}

/**
 * Load all workflow templates from disk.
 * Cached after first load (templates don't change at runtime).
 */
let cachedTemplates: WorkflowTemplate[] | null = null;

export function loadWorkflowTemplates(): WorkflowTemplate[] {
  if (cachedTemplates) return cachedTemplates;

  if (!fs.existsSync(WORKFLOW_DIR)) {
    cachedTemplates = [];
    return cachedTemplates;
  }

  const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.md'));
  cachedTemplates = files.map(file => {
    const content = fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8');
    return parseWorkflowTemplate(file.replace('.md', ''), content);
  }).filter((t): t is WorkflowTemplate => t !== null);

  console.log(`[workflow] Loaded ${cachedTemplates.length} workflow templates`);
  return cachedTemplates;
}

function parseWorkflowTemplate(id: string, raw: string): WorkflowTemplate | null {
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  // Simple YAML parser for our specific structure
  const name = extractYamlValue(frontmatter, 'name') || id;
  const description = extractYamlValue(frontmatter, 'description') || '';

  // Parse variables block
  const variables = parseVariables(frontmatter);

  return { id, name, description, variables, steps: body };
}

function extractYamlValue(yaml: string, key: string): string | null {
  const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function parseVariables(yaml: string): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [];
  const varSection = yaml.match(/variables:\s*\n((?:\s+-[\s\S]*?)(?=\n\S|\n---|\s*$))/);
  if (!varSection) return variables;

  // Split by "  - name:" entries (handle first entry which includes leading whitespace)
  const entries = varSection[1].split(/\s+-\s+name:\s+/).filter(Boolean);

  for (const entry of entries) {
    const lines = ('name: ' + entry.trim()).split('\n');
    const v: WorkflowVariable = { name: '', label: '' };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('name:')) v.name = trimmed.replace('name:', '').trim();
      else if (trimmed.startsWith('label:')) v.label = trimmed.replace('label:', '').trim().replace(/^["']|["']$/g, '');
      else if (trimmed.startsWith('required:')) v.required = trimmed.includes('true');
      else if (trimmed.startsWith('default:')) v.default = trimmed.replace('default:', '').trim().replace(/^["']|["']$/g, '');
      else if (trimmed.startsWith('type:')) v.type = trimmed.replace('type:', '').trim();
      else if (trimmed.startsWith('options:')) {
        const optMatch = trimmed.match(/\[(.+)\]/);
        if (optMatch) v.options = optMatch[1].split(',').map(o => o.trim().replace(/^["']|["']$/g, ''));
      }
    }

    if (v.name) variables.push(v);
  }

  return variables;
}

/**
 * Build a workflow prompt with variables filled in.
 * Brain receives this as a structured instruction to follow step by step.
 */
export function buildWorkflowPrompt(template: WorkflowTemplate, params: Record<string, string>): string {
  let prompt = `# Workflow: ${template.name}\n\n`;
  prompt += `${template.description}\n\n`;

  // Replace [variable] placeholders with actual values
  let steps = template.steps;
  for (const v of template.variables) {
    const value = params[v.name] || v.default || `[${v.name}]`;
    steps = steps.replace(new RegExp(`\\[${v.name}\\]`, 'g'), value);
  }

  prompt += steps;
  prompt += '\n\n---\n';
  prompt += 'Spracuj tento workflow krok po kroku. Po každom kroku stručne zhrň výsledok. Ak niečo chýba, opýtaj sa používateľa.';

  return prompt;
}

/**
 * Get workflow info for ActionPalette / API listing.
 */
export function getWorkflowsForPalette(): Array<{
  id: string;
  name: string;
  description: string;
  variables: WorkflowVariable[];
}> {
  return loadWorkflowTemplates().map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    variables: t.variables,
  }));
}
