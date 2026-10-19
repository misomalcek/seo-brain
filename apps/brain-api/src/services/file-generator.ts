import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';

export type GenerateFormat = 'docx' | 'xlsx' | 'pptx' | 'html' | 'csv' | 'md' | 'json' | 'txt';

// --- Example Org Brand Colors ---
const MSG_BRAND = {
  crimson: 'C50044',       // primary
  crimsonArgb: 'FFC50044',
  purple: '8C24F5',        // accent
  dark: '0F1218',
  surface: '1A1F2E',
  textLight: 'E5E7EB',
  textMuted: '5A6478',
  white: 'FFFFFF',
  // XLSX needs ARGB (with alpha prefix)
  headerArgb: 'FFC50044',
  headerTextArgb: 'FFFFFFFF',
};

interface Section {
  level: number;      // 1-6 for headings, 0 for body
  title?: string;
  lines: string[];
}

// --- Markdown Parsing Helpers ---

function parseMarkdownSections(content: string): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let current: Section = { level: 0, lines: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (current.lines.length > 0 || current.title) {
        sections.push(current);
      }
      current = { level: headingMatch[1].length, title: headingMatch[2], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.title) {
    sections.push(current);
  }
  return sections;
}

function parseMarkdownTables(content: string): string[][][] {
  const tables: string[][][] = [];
  const lines = content.split('\n');
  let currentTable: string[][] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Skip separator rows
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        continue;
      }
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
      currentTable.push(cells);
      inTable = true;
    } else {
      if (inTable && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = false;
    }
  }
  if (currentTable.length > 0) {
    tables.push(currentTable);
  }
  return tables;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^>\s*/gm, '')
    .trim();
}

/** Prevent XLSX formula injection — prefix dangerous cell values with single quote */
function sanitizeXlsxCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length > 0 && /^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return value;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: 'Courier New', size: 20 }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5] }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

// --- DOCX Generation ---

export async function generateDocx(content: string): Promise<Buffer> {
  const sections = parseMarkdownSections(content);
  const children: (Paragraph | Table)[] = [];

  for (const section of sections) {
    if (section.title) {
      const headingMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      children.push(new Paragraph({
        text: stripMarkdown(section.title),
        heading: headingMap[section.level] || HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      }));
    }

    for (const line of section.lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        children.push(new Paragraph({ text: '' }));
        continue;
      }

      // Skip table lines (handled separately below)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) continue;
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

      // Bullet points
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
      if (bulletMatch) {
        children.push(new Paragraph({
          children: parseInlineFormatting(bulletMatch[1]),
          bullet: { level: 0 },
        }));
        continue;
      }

      // Numbered lists
      const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
      if (numMatch) {
        children.push(new Paragraph({
          children: parseInlineFormatting(numMatch[1]),
          numbering: { reference: 'default-numbering', level: 0 },
        }));
        continue;
      }

      // Regular paragraph
      children.push(new Paragraph({
        children: parseInlineFormatting(trimmed),
        spacing: { after: 80 },
      }));
    }
  }

  // Add tables as proper Table objects
  const tables = parseMarkdownTables(content);
  for (const tableData of tables) {
    if (tableData.length === 0) continue;
    children.push(new Paragraph({ text: '' })); // spacer
    const tableRows = tableData.map((row, rowIdx) =>
      new TableRow({
        children: row.map(cell =>
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({
                text: stripMarkdown(cell),
                bold: rowIdx === 0,
                size: 20,
              })],
            })],
            width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
          })
        ),
      })
    );
    children.push(new Table({
      rows: tableRows,
      width: { size: 9000, type: WidthType.DXA },
    }));
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: 'decimal' as any,
          text: '%1.',
          alignment: AlignmentType.START,
        }],
      }],
    },
    styles: {
      default: {
        heading1: {
          run: { color: MSG_BRAND.crimson, bold: true, size: 32, font: 'Inter' },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading2: {
          run: { color: MSG_BRAND.crimson, bold: true, size: 26, font: 'Inter' },
          paragraph: { spacing: { before: 280, after: 120 } },
        },
        heading3: {
          run: { color: '333333', bold: true, size: 22, font: 'Inter' },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        document: {
          run: { font: 'Inter', size: 22 },
        },
      },
    },
    sections: [{
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Example Org', font: 'Inter', size: 16, color: MSG_BRAND.crimson, bold: true }),
              new TextRun({ text: '  |  Team Brain', font: 'Inter', size: 16, color: MSG_BRAND.textMuted }),
            ],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'brain.example.com', font: 'Inter', size: 14, color: MSG_BRAND.textMuted }),
              new TextRun({ text: '  •  Strana ', font: 'Inter', size: 14, color: MSG_BRAND.textMuted }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Inter', size: 14, color: MSG_BRAND.textMuted }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// --- XLSX Generation ---

export async function generateXlsx(content: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Team Brain | Example Org';
  workbook.created = new Date();

  // Try to parse as JSON array first
  let jsonData: any[] | null = null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      jsonData = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (arrayKey) {
        jsonData = parsed[arrayKey];
      }
    }
  } catch {
    // Not JSON, try markdown tables
  }

  if (jsonData && jsonData.length > 0) {
    const sheet = workbook.addWorksheet('Data');
    const headers = Object.keys(jsonData[0]);
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MSG_BRAND.headerArgb } };

    for (const item of jsonData) {
      sheet.addRow(headers.map(h => sanitizeXlsxCell(item[h] ?? '')));
    }

    sheet.columns.forEach(col => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = String(cell.value || '').length;
        if (len > maxLen) maxLen = Math.min(len, 50);
      });
      col.width = maxLen + 2;
    });
  } else {
    const tables = parseMarkdownTables(content);
    if (tables.length > 0) {
      tables.forEach((table, idx) => {
        const sheet = workbook.addWorksheet(idx === 0 ? 'Data' : `Sheet${idx + 1}`);
        for (const row of table) {
          sheet.addRow(row.map(c => sanitizeXlsxCell(stripMarkdown(c))));
        }
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MSG_BRAND.headerArgb } };
        sheet.columns.forEach(col => {
          let maxLen = 10;
          col.eachCell?.({ includeEmpty: false }, cell => {
            const len = String(cell.value || '').length;
            if (len > maxLen) maxLen = Math.min(len, 50);
          });
          col.width = maxLen + 2;
        });
      });
    } else {
      // Fallback: CSV-like parsing
      const sheet = workbook.addWorksheet('Data');
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.includes(',') || line.includes('\t')) {
          const sep = line.includes('\t') ? '\t' : ',';
          sheet.addRow(line.split(sep).map(c => sanitizeXlsxCell(c.trim())));
        } else {
          sheet.addRow([sanitizeXlsxCell(line)]);
        }
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// --- PPTX Generation ---

export async function generatePptx(content: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = 'Team Brain | Example Org';
  pptx.title = 'Team Brain Export';

  pptx.defineSlideMaster({
    title: 'BRAIN_MASTER',
    background: { color: MSG_BRAND.dark },
    objects: [
      // Bottom-left brand text
      { text: { text: 'Example Org', options: { x: 0.3, y: 5.2, w: 3, h: 0.3, fontSize: 9, color: MSG_BRAND.textMuted, fontFace: 'Inter' } } },
      // Top accent line
      { rect: { x: 0, y: 0, w: 10, h: 0.04, fill: { color: MSG_BRAND.crimson } } },
    ],
  });

  const sections = parseMarkdownSections(content);

  // Title slide
  const titleSection = sections.find(s => s.level === 1) || sections[0];
  const titleSlide = pptx.addSlide({ masterName: 'BRAIN_MASTER' });
  // Crimson accent bar on title slide
  titleSlide.addShape('rect' as any, { x: 0, y: 1.2, w: 10, h: 0.06, fill: { color: MSG_BRAND.crimson } });
  titleSlide.addText(stripMarkdown(titleSection?.title || 'Team Brain Export'), {
    x: 0.5, y: 1.5, w: 9, h: 1.5,
    fontSize: 36, bold: true, color: MSG_BRAND.white, fontFace: 'Inter',
    align: 'center',
  });
  titleSlide.addText('Team Brain | Example Org', {
    x: 0.5, y: 3.3, w: 9, h: 0.5,
    fontSize: 14, color: MSG_BRAND.textMuted, fontFace: 'Inter',
    align: 'center',
  });
  titleSlide.addText(new Date().toLocaleDateString('sk-SK'), {
    x: 0.5, y: 3.8, w: 9, h: 0.4,
    fontSize: 11, color: MSG_BRAND.textMuted, fontFace: 'Inter',
    align: 'center',
  });

  // Content slides from h2+ sections
  const contentSections = sections.filter(s => s.level >= 2 || (s.level === 0 && s.lines.some(l => l.trim())));

  for (const section of contentSections) {
    if (!section.title && section.lines.every(l => !l.trim())) continue;

    const slide = pptx.addSlide({ masterName: 'BRAIN_MASTER' });

    if (section.title) {
      slide.addText(stripMarkdown(section.title), {
        x: 0.5, y: 0.3, w: 9, h: 0.8,
        fontSize: 24, bold: true, color: MSG_BRAND.crimson, fontFace: 'Inter',
      });
    }

    const bullets: string[] = [];
    for (const line of section.lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
      const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
      if (bulletMatch) {
        bullets.push(stripMarkdown(bulletMatch[1]));
      } else if (numMatch) {
        bullets.push(stripMarkdown(numMatch[1]));
      } else if (!trimmed.startsWith('|')) {
        bullets.push(stripMarkdown(trimmed));
      }
    }

    if (bullets.length > 0) {
      const bodyItems = bullets.map(b => ({
        text: b,
        options: { fontSize: 16, color: MSG_BRAND.textLight, fontFace: 'Inter', bullet: { code: '2022' } as any },
      }));
      slide.addText(bodyItems, {
        x: 0.5, y: section.title ? 1.3 : 0.5, w: 9, h: 4,
        valign: 'top',
        lineSpacingMultiple: 1.4,
      });
    }
  }

  if (contentSections.length === 0) {
    const slide = pptx.addSlide({ masterName: 'BRAIN_MASTER' });
    slide.addText(stripMarkdown(content).slice(0, 2000), {
      x: 0.5, y: 0.5, w: 9, h: 5,
      fontSize: 14, color: MSG_BRAND.textLight, fontFace: 'Inter',
      valign: 'top',
    });
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}

// --- HTML Generation ---

export function generateHtml(content: string, title?: string): Buffer {
  let html = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  const doc = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${(title || 'Brain Chat Export').replace(/</g, '&lt;')}</title>
  <style>
    body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #0f1218; color: #e5e7eb; line-height: 1.6; }
    h1, h2, h3 { color: #fff; }
    h1 { border-bottom: 2px solid #c50044; padding-bottom: 0.5rem; color: #c50044; }
    h2 { color: #c50044; }
    a { color: #8c24f5; }
    code { background: #1a1f2e; padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1a1f2e; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #2d3344; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #c50044; color: #fff; font-weight: 600; }
    strong { color: #fff; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #2d3344; font-size: 0.8rem; color: #5a6478; }
  </style>
</head>
<body>
  ${html}
  <div class="footer">Example Org · Team Brain | ${new Date().toLocaleDateString('sk-SK')}</div>
</body>
</html>`;

  return Buffer.from(doc, 'utf8');
}

// --- CSV Generation ---

export function generateCsv(content: string): Buffer {
  try {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed).find(Array.isArray) as any[] : null);
    if (arr && arr.length > 0) {
      const headers = Object.keys(arr[0]);
      const csvLines = [headers.join(',')];
      for (const item of arr) {
        csvLines.push(headers.map(h => {
          const v = String(item[h] ?? '');
          return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(','));
      }
      return Buffer.from(csvLines.join('\n'), 'utf8');
    }
  } catch {}

  const tables = parseMarkdownTables(content);
  if (tables.length > 0) {
    const csvLines = tables[0].map(row =>
      row.map(cell => {
        const v = stripMarkdown(cell);
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    );
    return Buffer.from(csvLines.join('\n'), 'utf8');
  }

  return Buffer.from(content, 'utf8');
}

// --- Format Detection ---

export function detectBestFormats(content: string): GenerateFormat[] {
  const formats: GenerateFormat[] = [];
  const hasTables = /^\|.+\|$/m.test(content);
  const hasBullets = /^[-*]\s+/m.test(content);
  const hasHeadings = /^#{1,3}\s+/m.test(content);
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);

  let isJson = false;
  try { JSON.parse(content); isJson = true; } catch {}

  if (hasTables || isJson) {
    formats.push('xlsx', 'csv');
  }

  if (hasHeadings && hasBullets && !hasTables) {
    formats.push('pptx');
  }

  if (hasHeadings || content.length > 500) {
    formats.push('docx');
  }

  if (hasHtmlTags) {
    formats.push('html');
  }

  if (!formats.includes('md')) {
    formats.push('md');
  }

  return [...new Set(formats)];
}

// --- Main generate function ---

export async function generateFile(content: string, format: GenerateFormat): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  switch (format) {
    case 'docx': {
      const buffer = await generateDocx(content);
      return { buffer, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: '.docx' };
    }
    case 'xlsx': {
      const buffer = await generateXlsx(content);
      return { buffer, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' };
    }
    case 'pptx': {
      const buffer = await generatePptx(content);
      return { buffer, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' };
    }
    case 'html': {
      const buffer = generateHtml(content);
      return { buffer, mimeType: 'text/html', extension: '.html' };
    }
    case 'csv': {
      const buffer = generateCsv(content);
      return { buffer, mimeType: 'text/csv', extension: '.csv' };
    }
    case 'json': {
      let output = content;
      try { output = JSON.stringify(JSON.parse(content), null, 2); } catch {}
      return { buffer: Buffer.from(output, 'utf8'), mimeType: 'application/json', extension: '.json' };
    }
    case 'txt': {
      const plain = stripMarkdown(content);
      return { buffer: Buffer.from(plain, 'utf8'), mimeType: 'text/plain', extension: '.txt' };
    }
    case 'md':
    default: {
      return { buffer: Buffer.from(content, 'utf8'), mimeType: 'text/markdown', extension: '.md' };
    }
  }
}
