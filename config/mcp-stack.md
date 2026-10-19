# Team Brain MCP Stack

Kompletná konfigurácia MCP serverov pre Team Brain.

## Aktuálne Aktívne

### 1. Ahrefs SEO
```json
"ahrefs": {
  "command": "npx",
  "args": ["mcp-remote", "https://api.ahrefs.com/mcp/mcp", "--header", "Authorization:${AUTH_HEADER}"],
  "env": {
    "AUTH_HEADER": "Bearer [AHREFS_MCP_KEY]"
  }
}
```
**Stav:** ✅ Active

### 2. Context7 (Documentation)
```json
"context7": {
  "command": "npx",
  "args": ["-y", "@anthropic/context7-mcp-server"]
}
```
**Stav:** ✅ Active (plugin)

### 3. Filesystem
```json
"filesystem": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/opt/team-brain", "/var/www/brain"]
}
```
**Stav:** ✅ Active

### 4. GitHub
```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "[GITHUB_TOKEN]"
  }
}
```
**Stav:** ✅ Active

---

## Pripravené na Aktiváciu

### 5. Google Analytics 4 (Recommended: surendranb)

**Prečo surendranb verziu:**
- 200+ GA4 dimensions a metrics
- Built-in safeguards proti context overflow
- Smart server-side aggregation
- Lepšia data volume management

**Setup:**
1. Google Cloud service account s Analytics Reporting API
2. Viewer access na GA4 property
3. Credentials JSON file

```json
"google-analytics": {
  "command": "python",
  "args": ["-m", "google_analytics_mcp"],
  "env": {
    "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json",
    "GA4_PROPERTY_ID": "123456789"
  }
}
```

**Instalácia:**
```bash
pip install google-analytics-mcp
```

**Tools:**
- `search_schema` - Hľadanie dostupných polí
- `get_ga4_data` - Získanie dát s safety features
- `get_property_schema` - Kompletná štruktúra property
- Category listing pre dimensions/metrics

---

### 6. Microsoft Clarity (User Behavior Analytics)

**Čo to robí:**
- Session recordings access
- Heatmaps a scroll depth
- User behavior insights
- Traffic analytics

```json
"clarity": {
  "command": "npx",
  "args": ["-y", "@microsoft/clarity-mcp-server"],
  "env": {
    "CLARITY_API_TOKEN": "[YOUR_CLARITY_TOKEN]"
  }
}
```

**Získanie API Token:**
1. Login do Microsoft Clarity
2. Project → Settings → Data Export
3. Generate New API Token

**Tools:**
- Query analytics data
- Filter by dimensions (Browser, Device, Country, OS)
- Metrics: Scroll Depth, Engagement Time, Traffic

---

### 7. Resend Email

**Čo to robí:**
- Posielanie emailov z Claude
- HTML a plain text
- Scheduled delivery
- CC/BCC support

```json
"resend": {
  "command": "npx",
  "args": ["-y", "mcp-send-email"],
  "env": {
    "RESEND_API_KEY": "[RESEND_API_KEY]",
    "SENDER_EMAIL_ADDRESS": "brain@example.com",
    "REPLY_TO_EMAIL_ADDRESS": "team@exampleorg.sk"
  }
}
```

**Setup:**
1. Resend account (free tier available)
2. Verify domain for custom sender
3. Generate API key

---

## Skills (nie MCP)

### 8. NotebookLM Skill

**Čo to robí:**
- Query Google NotebookLM z Claude Code
- Source-grounded answers s citáciami
- Redukcia hallucinations cez Gemini

**Instalácia:**
```bash
git clone https://github.com/pleaseprompto/notebooklm-skill ~/.claude/skills/notebooklm
```

**Použitie:**
1. Upload dokumenty do NotebookLM
2. Share notebook
3. Claude automaticky queries NotebookLM

**Limitácia:** Len lokálny Claude Code (nie web UI)

---

## Kompletná Konfigurácia

```json
{
  "mcpServers": {
    "ahrefs": {
      "command": "npx",
      "args": ["mcp-remote", "https://api.ahrefs.com/mcp/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": {
        "AUTH_HEADER": "Bearer [AHREFS_KEY]"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/opt/team-brain", "/var/www/brain"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "[GITHUB_TOKEN]"
      }
    },
    "google-analytics": {
      "command": "python",
      "args": ["-m", "google_analytics_mcp"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/credentials.json",
        "GA4_PROPERTY_ID": "[PROPERTY_ID]"
      }
    },
    "clarity": {
      "command": "npx",
      "args": ["-y", "@microsoft/clarity-mcp-server"],
      "env": {
        "CLARITY_API_TOKEN": "[CLARITY_TOKEN]"
      }
    },
    "resend": {
      "command": "npx",
      "args": ["-y", "mcp-send-email"],
      "env": {
        "RESEND_API_KEY": "[RESEND_KEY]",
        "SENDER_EMAIL_ADDRESS": "brain@example.com"
      }
    }
  }
}
```

---

## Setup Priority

1. **High** - Google Analytics (traffic insights pre SEO)
2. **High** - Microsoft Clarity (user behavior pre UX)
3. **Medium** - Resend (email automation)
4. **Optional** - NotebookLM skill (document grounding)

---

*Aktualizované: 23. január 2026*
