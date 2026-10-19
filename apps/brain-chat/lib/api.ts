const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// --- Chat ---

export function streamChat(messages: Array<{ role: string; content: string }>) {
  return fetch(`${API_BASE}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

// --- History ---

export interface ConversationSummary {
  id: string;
  title: string | null;
  persona_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationMessage {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  persona_id: string | null;
  tool_calls: any;
  tokens_used: number | null;
  created_at: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
}

interface ListResponse {
  success: boolean;
  data: ConversationSummary[];
  total: number;
  offset: number;
  limit: number;
}

interface DetailResponse {
  success: boolean;
  data: ConversationDetail;
}

interface SaveResponse {
  success: boolean;
  data: { conversationId: string; messageCount: number };
}

export async function listConversations(limit = 50, offset = 0): Promise<ListResponse> {
  return request<ListResponse>(`/history?limit=${limit}&offset=${offset}`);
}

export async function getConversation(id: string): Promise<DetailResponse> {
  return request<DetailResponse>(`/history/${id}`);
}

export async function saveConversation(
  messages: Array<{ role: string; content: string; toolCalls?: any }>,
  options?: { conversationId?: string; title?: string; personaId?: string }
): Promise<SaveResponse> {
  return request<SaveResponse>('/history', {
    method: 'POST',
    body: JSON.stringify({ messages, ...options }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await request(`/history/${id}`, { method: 'DELETE' });
}

export async function updateConversation(
  id: string,
  updates: { title?: string }
): Promise<void> {
  await request(`/history/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// --- Personas ---

import type { Persona, AgentInfo, SkillInfo, ActionInfo, ActionCategory, MentionCategory, UserReport, WorkspaceItem, FrameworkInfo, UserStats, SpecialistCard, CustomAgentCard, AgentFormData, ExtensionFormData, AgentExtension } from './types';

export async function getPersonas(): Promise<{ personas: Persona[] }> {
  return request('/chat/personas');
}

// --- Tools (Brain Pt II focus #4 — Tools Browser transparency overlay) ---
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}
export interface ToolCategory {
  name: string;
  icon: string;
  tools: string[];
}
export async function getTools(): Promise<{
  tools: ToolInfo[];
  categories: Record<string, ToolCategory>;
  status: { ahrefs: string };
}> {
  return request('/chat/tools');
}

export async function deliberate(
  question: string,
  personas: string[],
  context?: string
): Promise<{
  question: string;
  responses: Array<{
    personaId: string;
    name: string;
    nameLocalized: string;
    icon: string;
    color: string;
    content: string;
  }>;
}> {
  return request('/chat/deliberate', {
    method: 'POST',
    body: JSON.stringify({ question, personas, context }),
  });
}

// --- Knowledge ---

export async function getKnowledgeCatalog(): Promise<{
  agents: AgentInfo[];
  skills: SkillInfo[];
  stats: { totalAgents: number; totalSkills: number };
}> {
  return request('/knowledge');
}

export async function getAgents(): Promise<{ agents: AgentInfo[]; total: number }> {
  return request('/knowledge/agents');
}

/** Fetch the 6 specialist agent cards from registry (Sprint E). */
export async function getSpecialistCards(): Promise<{
  specialists: SpecialistCard[];
  brainCore: SpecialistCard[];
  total: number;
}> {
  return request('/knowledge/agents/specialists');
}

// ── Agent CRUD — Sprint G ──────────────────────────────────────────────────────

/** List base specialists (with extensions) + custom agents */
export async function listAllAgents(): Promise<{
  specialists: SpecialistCard[];
  custom: CustomAgentCard[];
  total: number;
}> {
  return request('/agents');
}

/** Create a new custom agent */
export async function createAgent(data: AgentFormData): Promise<{ success: boolean; agent: CustomAgentCard }> {
  return request('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Update a custom agent by slug */
export async function updateAgent(slug: string, data: Partial<AgentFormData>): Promise<{ success: boolean; agent: CustomAgentCard }> {
  return request(`/agents/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Upsert extension for a base specialist */
export async function upsertSpecialistExtension(agentId: string, data: ExtensionFormData): Promise<{ success: boolean; extension: AgentExtension }> {
  return request(`/agents/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Deactivate a custom agent */
export async function deleteAgent(slug: string): Promise<{ success: boolean }> {
  return request(`/agents/${slug}`, { method: 'DELETE' });
}

export async function getSkills(): Promise<{
  skills: SkillInfo[];
  grouped: Record<string, SkillInfo[]>;
  total: number;
}> {
  return request('/knowledge/skills');
}

export async function getActions(): Promise<{
  actions: ActionInfo[];
  categories: ActionCategory[];
}> {
  return request('/chat/actions');
}

export async function getMentions(): Promise<{
  categories: MentionCategory[];
}> {
  return request('/chat/mentions');
}

// --- Files ---

import type { UserFile } from './types';

export async function uploadFile(file: File, conversationId?: string): Promise<{ success: boolean; file: UserFile }> {
  const formData = new FormData();
  formData.append('file', file);
  if (conversationId) {
    formData.append('conversationId', conversationId);
  }

  const response = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
    // No Content-Type header - browser sets it with boundary for multipart
  });

  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}

export async function listFiles(limit = 50, offset = 0): Promise<{ files: UserFile[]; total: number }> {
  return request(`/files?limit=${limit}&offset=${offset}`);
}

export async function deleteFile(fileId: string): Promise<void> {
  await request(`/files/${fileId}`, { method: 'DELETE' });
}

export async function previewFile(fileId: string): Promise<{
  preview: string | null;
  truncated?: boolean;
  filename: string;
  mimeType?: string;
}> {
  return request(`/files/${fileId}/preview`);
}

export function getFileDownloadUrl(fileId: string): string {
  return `${API_BASE}/files/${fileId}/download`;
}

export async function listSharedFiles(): Promise<{ files: UserFile[] }> {
  return request('/files/shared');
}

export async function toggleFileShare(fileId: string): Promise<{ success: boolean; isShared: boolean }> {
  return request(`/files/${fileId}/share`, { method: 'POST' });
}

export async function createFile(filename: string, content: string): Promise<{ success: boolean; file: UserFile }> {
  return request('/files/create', {
    method: 'POST',
    body: JSON.stringify({ filename, content }),
  });
}

// --- Reports ---

export async function listReports(type?: string, dateFrom?: string, dateTo?: string, limit?: number, offset?: number): Promise<{ reports: UserReport[]; total: number }> {
  const p = new URLSearchParams();
  if (type) p.set('type', type);
  if (dateFrom) p.set('dateFrom', dateFrom);
  if (dateTo) p.set('dateTo', dateTo);
  if (limit) p.set('limit', String(limit));
  if (offset) p.set('offset', String(offset));
  const qs = p.toString();
  return request(`/reports${qs ? '?' + qs : ''}`);
}

export async function getReportContent(filename: string): Promise<{ filename: string; content: any }> {
  return request(`/reports/${encodeURIComponent(filename)}`);
}

// --- Profile ---

export async function getProfileStats(): Promise<UserStats> {
  return request('/profile/stats');
}

// --- Workspace ---

export async function listWorkspace(type?: string): Promise<{ items: WorkspaceItem[]; total: number }> {
  const params = type ? `?type=${type}` : '';
  return request(`/workspace${params}`);
}

export async function shareToWorkspace(item: {
  itemType: string;
  itemId: string;
  title: string;
  description?: string;
}): Promise<{ success: boolean; id: string }> {
  return request('/workspace', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function removeFromWorkspace(id: string): Promise<void> {
  await request(`/workspace/${id}`, { method: 'DELETE' });
}

// --- Frameworks ---

export async function getFrameworks(): Promise<{
  frameworks: FrameworkInfo[];
  grouped: Record<string, FrameworkInfo[]>;
  total: number;
}> {
  return request('/knowledge/frameworks');
}

export async function getFrameworkContent(fwPath: string): Promise<{
  framework: FrameworkInfo;
  content: string;
}> {
  return request(`/knowledge/frameworks/by-path?path=${encodeURIComponent(fwPath)}`);
}

// --- Admin ---

export interface AdminHealth {
  status: string;
  uptime: number;
  timestamp: string;
  responseTime: number;
  database: { status: string; latency: number };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    memory: { total: number; used: number; free: number; usagePercent: number };
    disk: { total: number; used: number; available: number };
    loadAvg: { '1m': number; '5m': number; '15m': number };
    cpus: number;
  };
  mcpBridge: { configured: boolean; status: string };
  storage: { reports: number; userFiles: number };
  dataPipeline: {
    gscSnapshots: { latest: string | null; count: number; stale: boolean };
    ahrefsSnapshots: { latest: string | null; count: number; stale: boolean };
    dashboards: { seo: string | null; content: string | null; ceo: string | null; keywords: string | null; audit: string | null; links: string | null; visibility: string | null };
    mcpCache: { entries: number; lastCleanup: string | null };
  };
  pendingActions: { memoryInbox: number; newFeedback: number };
  pm2?: { status: string; restarts: number; uptime: number };
  lastBackup?: string | null;
  promptBreakdown?: {
    system_prompt_chars: number;
    system_prompt_tokens_est: number;
    context_window: number;
    system_pct: number;
  };
}

export interface AdminStats {
  users: { total: number; byRole: Array<{ role: string; count: number }> };
  conversations: { total: number; today: number; thisWeek: number };
  messages: { total: number; today: number };
  personas: { usage: Array<{ personaId: string; count: number }> };
  deliberations: { total: number };
  files: { total: number; totalSize: number };
  recentActivity: Array<{
    id: string;
    title: string;
    personaId: string | null;
    userName: string;
    messageCount: number;
    createdAt: string;
  }>;
  teamUsage: {
    conversations7d: number;
    aiResponses30d: number;
    topAgents: Array<{ name: string; count: number }>;
  };
}

// AdminReport removed — MCP reports no longer shown in admin

export async function getAdminHealth(): Promise<AdminHealth> {
  return request('/admin/health');
}

export async function getAdminStats(): Promise<AdminStats> {
  return request('/admin/stats');
}

// getAdminReports + getAdminReportContent removed — MCP reports no longer shown in admin

// Run U 2026-05-27 — feedback feature removed. Users send feedback via
// email. The 4 functions below + FeedbackButton + FeedbackBrowser + the
// backend route are gone. Type FeedbackItem stays in types.ts but no
// caller imports it from here any more.
import type { SEODashboardData, ContentDashboardData, CEODashboardData, ChatChannel, ChatAttachment, TeamMessage, TeamUser } from './types';

// --- Dashboards ---

export async function getSEODashboard(): Promise<SEODashboardData> {
  return request('/dashboards/seo/data');
}

export async function getContentDashboard(): Promise<ContentDashboardData> {
  return request('/dashboards/content/data');
}

export async function getCEODashboard(): Promise<CEODashboardData> {
  return request('/dashboards/ceo/data');
}

// --- Team Chat ---

export async function getChannels(): Promise<{ channels: ChatChannel[] }> {
  return request('/team-chat/channels');
}

export async function getChannelMessages(channelId: string, before?: number): Promise<{ messages: TeamMessage[] }> {
  const params = before ? `?before=${before}` : '';
  return request(`/team-chat/channels/${channelId}/messages${params}`);
}

export async function sendChannelMessage(channelId: string, content: string, attachments?: ChatAttachment[]): Promise<{ message: TeamMessage }> {
  return request(`/team-chat/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, attachments: attachments?.length ? attachments : undefined }),
  });
}

export async function getOrCreateDM(userId: string): Promise<{ channel: ChatChannel }> {
  return request(`/team-chat/dm/${userId}`, { method: 'POST' });
}

export async function getPresence(): Promise<{ users: TeamUser[] }> {
  return request('/team-chat/presence');
}

export async function sendHeartbeat(): Promise<void> {
  await request('/team-chat/presence/heartbeat', { method: 'POST' });
}

export function getTeamChatSSEUrl(): string {
  return `${API_BASE}/team-chat/sse`;
}

// --- Sites ---

import type { Site, BrandAsset, GenerateFormat } from './types';

export async function listSites(): Promise<{ sites: Site[] }> {
  return request('/sites');
}

export async function getSite(id: string): Promise<Site> {
  return request(`/sites/${id}`);
}

// --- Brand Assets ---

export async function listBrandAssets(siteId?: string): Promise<{ assets: BrandAsset[] }> {
  const params = siteId ? `?siteId=${siteId}` : '';
  return request(`/brand/assets${params}`);
}

export async function getBrandAsset(id: string): Promise<BrandAsset> {
  return request(`/brand/assets/${id}`);
}

export async function createBrandAsset(data: {
  siteId?: string | null;
  assetType: string;
  title: string;
  content: string;
}): Promise<{ success: boolean; id: string }> {
  return request('/brand/assets', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateBrandAsset(id: string, data: {
  title?: string;
  content?: string;
}): Promise<{ success: boolean }> {
  return request(`/brand/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteBrandAsset(id: string): Promise<{ success: boolean }> {
  return request(`/brand/assets/${id}`, { method: 'DELETE' });
}

// --- File Generation ---

export async function generateFile(content: string, format: GenerateFormat, filename?: string): Promise<{ success: boolean; file: UserFile }> {
  return request('/files/generate', {
    method: 'POST',
    body: JSON.stringify({ content, format, filename }),
  });
}

export async function detectFormats(content: string): Promise<{ formats: GenerateFormat[] }> {
  return request('/files/detect-format', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function getFileContent(fileId: string): Promise<{ content: string | null; filename: string; truncated?: boolean }> {
  return request(`/files/${fileId}/content`);
}

// --- Content Calendar ---

import type { ContentItem, ContentStatus } from './types';

export async function listContent(filters?: {
  status?: string;
  site?: string;
  assignee?: string;
  type?: string;
  search?: string;
}): Promise<{ items: ContentItem[]; total: number }> {
  const p = new URLSearchParams();
  if (filters?.status) p.set('status', filters.status);
  if (filters?.site) p.set('site', filters.site);
  if (filters?.assignee) p.set('assignee', filters.assignee);
  if (filters?.type) p.set('type', filters.type);
  if (filters?.search) p.set('search', filters.search);
  const qs = p.toString();
  return request(`/content${qs ? '?' + qs : ''}`);
}

export async function getContentItem(id: string): Promise<ContentItem> {
  return request(`/content/${id}`);
}

export async function createContent(data: {
  title: string;
  description?: string;
  status?: string;
  contentType?: string;
  siteId?: string | null;
  assigneeId?: string | null;
  deadline?: string | null;
  url?: string;
  keywords?: string[];
  notes?: string;
  attachments?: Array<{ type: string; id: string; title: string; meta?: string }>;
}): Promise<{ success: boolean; id: string }> {
  return request('/content', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateContent(id: string, data: Record<string, any>): Promise<{ success: boolean }> {
  return request(`/content/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function updateContentStatus(id: string, status: ContentStatus): Promise<{ success: boolean }> {
  return request(`/content/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function deleteContent(id: string): Promise<{ success: boolean }> {
  return request(`/content/${id}`, { method: 'DELETE' });
}

export async function getContentStats(): Promise<{
  byStatus: Array<{ status: string; count: number }>;
  bySite: Array<{ siteName: string; domain: string; count: number }>;
  upcoming: Array<{ id: string; title: string; deadline: string; status: string; siteDomain: string; assigneeName: string }>;
}> {
  return request('/content/stats');
}

// --- HTML Reports ---

import type { HTMLReport, SharedHTMLReport } from './types';

export async function generateHTMLReport(data: {
  title: string;
  templateType?: string;
  siteId?: string;
  dataSources?: Array<{ name: string; data: any }>;
}): Promise<{ success: boolean; report: { id: string; title: string; templateType: string; filename: string; viewUrl: string } }> {
  return request('/html-reports/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listHTMLReports(): Promise<{ reports: HTMLReport[] }> {
  return request('/html-reports');
}

export async function listSharedHTMLReports(): Promise<{ reports: SharedHTMLReport[] }> {
  return request('/html-reports/shared');
}

export async function saveHTMLReport(title: string, html: string): Promise<{ success: boolean; report: { id: string; title: string; viewUrl: string } }> {
  return request('/html-reports/save', {
    method: 'POST',
    body: JSON.stringify({ title, html }),
  });
}

export function getHTMLReportViewUrl(id: string): string {
  return `/api/html-reports/${id}/view`;
}

export async function shareHTMLReport(id: string): Promise<{
  success: boolean;
  isPublic: boolean;
  shareToken: string | null;
  shareUrl: string | null;
}> {
  return request(`/html-reports/${id}/share`, { method: 'POST' });
}

export async function deleteHTMLReport(id: string): Promise<{ success: boolean }> {
  return request(`/html-reports/${id}`, { method: 'DELETE' });
}

export async function refreshHTMLReport(id: string): Promise<{ success: boolean; report?: { id: string; title: string; updatedAt: string }; error?: string; hoursRemaining?: number }> {
  return request(`/html-reports/${id}/refresh`, { method: 'POST' });
}

// --- Documents + Help ---

import type { DocInfo, HelpData } from './types';

export async function getDocuments(): Promise<{ documents: DocInfo[] }> {
  return request('/knowledge/documents');
}

export async function getDocumentContent(docPath: string): Promise<{ path: string; name: string; category: string; content: string }> {
  return request(`/knowledge/documents/by-path?path=${encodeURIComponent(docPath)}`);
}

export async function getHelpData(): Promise<HelpData> {
  return request('/knowledge/help');
}

// --- Search ---

export interface SearchResult {
  type: 'conversation' | 'file' | 'content' | 'report';
  id: string;
  title: string;
  snippet: string;
  date: string;
}

export async function globalSearch(q: string, types?: string): Promise<{ results: SearchResult[]; total: number }> {
  const params = new URLSearchParams({ q });
  if (types) params.set('types', types);
  return request(`/search?${params.toString()}`);
}

// --- Admin CRUD ---

import type { AdminAgent, AdminFramework, AdminDataset, AdminUserFile, AdminHTMLReport, DatasetInfo } from './types';

// Agents
export async function getAdminAgents(): Promise<{ agents: AdminAgent[] }> {
  return request('/admin/agents');
}
export async function getAdminAgent(id: string): Promise<{ filename: string; frontmatter: any; body: string; raw: string }> {
  return request(`/admin/agents/${encodeURIComponent(id)}`);
}
export async function updateAdminAgent(id: string, content: string): Promise<{ success: boolean }> {
  return request(`/admin/agents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ content }) });
}
export async function createAdminAgent(id: string, content: string): Promise<{ success: boolean }> {
  return request('/admin/agents', { method: 'POST', body: JSON.stringify({ id, content }) });
}
export async function deleteAdminAgent(id: string): Promise<{ success: boolean }> {
  return request(`/admin/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Frameworks
export async function getAdminFrameworks(): Promise<{ frameworks: AdminFramework[]; grouped: Record<string, AdminFramework[]> }> {
  return request('/admin/frameworks');
}
export async function getAdminFramework(category: string, filename: string): Promise<{ path: string; content: string }> {
  return request(`/admin/frameworks/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`);
}
export async function updateAdminFramework(category: string, filename: string, content: string): Promise<{ success: boolean }> {
  return request(`/admin/frameworks/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'PUT', body: JSON.stringify({ content }) });
}
export async function createAdminFramework(category: string, filename: string, content: string): Promise<{ success: boolean }> {
  return request('/admin/frameworks', { method: 'POST', body: JSON.stringify({ category, filename, content }) });
}
export async function deleteAdminFramework(category: string, filename: string): Promise<{ success: boolean }> {
  return request(`/admin/frameworks/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

// Datasets (admin)
export async function getAdminDatasets(): Promise<{ datasets: AdminDataset[] }> {
  return request('/admin/datasets');
}
export async function uploadAdminDataset(file: File, description?: string): Promise<{ success: boolean; dataset: { id: string } }> {
  const formData = new FormData();
  formData.append('file', file);
  if (description) formData.append('description', description);
  const response = await fetch(`${API_BASE}/admin/datasets/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}
export async function patchAdminDataset(id: string, data: { description?: string; isApproved?: boolean }): Promise<{ success: boolean }> {
  return request(`/admin/datasets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export async function previewAdminDataset(id: string): Promise<{ preview: string | null; totalLines?: number; filename: string }> {
  return request(`/admin/datasets/${id}/preview`);
}
export async function deleteAdminDataset(id: string): Promise<{ success: boolean }> {
  return request(`/admin/datasets/${id}`, { method: 'DELETE' });
}

// User files (admin)
export async function getAdminUserFiles(limit = 100, offset = 0): Promise<{ files: AdminUserFile[]; total: number }> {
  return request(`/admin/user-files?limit=${limit}&offset=${offset}`);
}
export async function deleteAdminUserFile(id: string): Promise<{ success: boolean }> {
  return request(`/admin/user-files/${id}`, { method: 'DELETE' });
}

// HTML Reports (admin)
export async function getAdminHTMLReports(): Promise<{ reports: AdminHTMLReport[] }> {
  return request('/admin/html-reports');
}
export async function deleteAdminHTMLReport(id: string): Promise<{ success: boolean }> {
  return request(`/admin/html-reports/${id}`, { method: 'DELETE' });
}
export async function shareAdminHTMLReport(id: string): Promise<{ success: boolean; isPublic: boolean; shareUrl: string | null }> {
  return request(`/admin/html-reports/${id}/share`, { method: 'POST' });
}

// User Management (admin)
import type { AdminUser } from './types';

export async function getAdminUsers(): Promise<{ users: AdminUser[] }> {
  const result = await request<{ success: boolean; data: { users: AdminUser[] } }>('/auth/users');
  return (result as any).data;
}

export async function createAdminUser(data: { email: string; name: string; password: string; role: string }): Promise<{ success: boolean }> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAdminUser(id: string, data: { role?: string; password?: string; is_active?: boolean }): Promise<{ success: boolean }> {
  return request(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteAdminUser(id: string): Promise<{ success: boolean }> {
  return request(`/auth/users/${id}`, { method: 'DELETE' });
}

// Datasets (user-facing)
export async function listDatasets(): Promise<{ datasets: DatasetInfo[] }> {
  return request('/datasets');
}
export async function listMyDatasets(): Promise<{ datasets: Array<DatasetInfo & { isApproved: boolean }> }> {
  return request('/datasets/my');
}
export async function uploadDataset(file: File, description?: string): Promise<{ success: boolean; dataset: { id: string; filename: string; originalName: string } }> {
  const formData = new FormData();
  formData.append('file', file);
  if (description) formData.append('description', description);
  const response = await fetch(`${API_BASE}/datasets/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}
export async function deleteDataset(id: string): Promise<{ success: boolean }> {
  return request(`/datasets/${id}`, { method: 'DELETE' });
}
export async function getDatasetPreview(id: string): Promise<{ preview: string | null; totalLines?: number; filename: string }> {
  return request(`/datasets/${id}/preview`);
}
export async function getDatasetContent(id: string): Promise<{ content: string | null; filename: string; truncated?: boolean }> {
  return request(`/datasets/${id}/content`);
}

// --- Dashboard Snapshots ---

export interface DashboardSnapshot {
  id: string;
  dashboardType: string;
  title: string;
  filename: string;
  dataSummary: any;
  isLatest: boolean;
  generatedBy: string | null;
  createdAt: string;
}

export async function generateDashboard(type: string): Promise<{ success: boolean; snapshot: DashboardSnapshot }> {
  return request(`/dashboards/${type}/generate`, { method: 'POST' });
}

export async function getLatestDashboard(type: string): Promise<{ snapshot: DashboardSnapshot | null }> {
  return request(`/dashboards/${type}/latest`);
}

export async function getDashboardHistory(type: string): Promise<{ snapshots: DashboardSnapshot[] }> {
  return request(`/dashboards/${type}/history`);
}

export function getDashboardSnapshotUrl(id: string): string {
  return `/api/dashboards/snapshots/${id}`;
}

export async function deleteDashboardSnapshot(id: string): Promise<{ success: boolean }> {
  return request(`/dashboards/snapshots/${id}`, { method: 'DELETE' });
}

// Snapshots
export interface SnapshotSummary {
  gsc: Array<{ domain: string; count: string; latest: string; max_clicks: number }>;
  ahrefs: Array<{ domain: string; count: string; latest: string; max_dr: number | null }>;
  totals: { gsc: number; ahrefs: number };
}

export async function getSnapshotSummary(): Promise<SnapshotSummary> {
  return request('/snapshots/summary');
}

export type SnapshotType = 'gsc' | 'ahrefs' | 'ahrefs-keywords' | 'ahrefs-links' | 'ahrefs-audit' | 'ahrefs-competitors' | 'crux' | 'sitemap' | 'user-dataset';

export interface SnapshotItem {
  id: number;
  type: SnapshotType;
  domain: string;
  snapshotDate: string;
  metrics: Record<string, any>;
  createdAt: string;
}

export async function listAllSnapshots(): Promise<{ snapshots: SnapshotItem[]; total: number }> {
  return request('/snapshots/all');
}

export async function getSnapshotContent(type: SnapshotType, id: number): Promise<{ content: string; label: string }> {
  return request(`/snapshots/${type}/${id}/content`);
}

export async function deleteSnapshot(type: SnapshotType, id: number): Promise<{ success: boolean }> {
  return request(`/snapshots/${type}/${id}`, { method: 'DELETE' });
}

// Vector API
export interface VectorArticle {
  id: string;
  url: string;
  title: string;
  domain: string;
  content_md?: string;
  word_count: number;
  published_at: string | null;
  scraped_at: string;
  metadata: Record<string, any>;
}

export interface VectorSearchResult extends VectorArticle {
  score: number;
  snippet?: string;
}

export interface CannibalizationPair {
  article1: VectorArticle;
  article2: VectorArticle;
  similarity: number;
}

export async function getVectorArticles(opts?: { domain?: string; limit?: number; offset?: number; sort?: string }): Promise<{ articles: VectorArticle[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.domain) params.set('domain', opts.domain);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  if (opts?.sort) params.set('sort', opts.sort);
  return request(`/vector/articles?${params}`);
}

export async function getVectorArticle(id: string): Promise<{ article: VectorArticle }> {
  return request(`/vector/articles/${id}`);
}

export async function deleteVectorArticle(id: string): Promise<{ success: boolean }> {
  return request(`/vector/articles/${id}`, { method: 'DELETE' });
}

export async function refreshVectorArticle(id: string): Promise<{ success: boolean }> {
  return request(`/vector/articles/${id}/refresh`, { method: 'POST' });
}

export async function searchVector(query: string, mode: 'semantic' | 'hybrid' | 'lexical' = 'hybrid', domain?: string, limit = 10): Promise<{ results: VectorSearchResult[] }> {
  return request('/vector/search', {
    method: 'POST',
    body: JSON.stringify({ query, mode, domain, limit }),
  });
}

export async function getRelatedArticles(id: string, limit = 10): Promise<{ article: VectorArticle; related: VectorSearchResult[] }> {
  return request(`/vector/articles/${id}/related?limit=${limit}`);
}

export async function getCannibalization(domain?: string, threshold = 0.95): Promise<{ pairs: CannibalizationPair[] }> {
  const params = new URLSearchParams();
  if (domain) params.set('domain', domain);
  params.set('threshold', String(threshold));
  return request(`/vector/cannibalization?${params}`);
}

export async function getVectorStats(): Promise<{ totalArticles: number; byDomain: Record<string, number>; embeddedCount: number; lastScrape: string | null }> {
  return request('/vector/stats');
}

export async function triggerScrape(domain?: string): Promise<{ queued: boolean }> {
  return request('/vector/scrape', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}
