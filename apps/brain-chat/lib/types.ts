export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  personaId?: string;
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  toolsUsed?: string[];
  toolData?: {
    type: string;
    data: any;
    executionTime?: number;
  };
  backgroundJobId?: string; // set for background job placeholder messages
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'team_admin' | 'member';
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at: string | null;
  total_tokens: number;
  conversations_30d: number;
}

export interface BackgroundJobSummary {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  conversation_id: string | null;
  tools_used: string[];
  created_at: string;
  completed_at: string | null;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export interface MCPTool {
  id: string;
  label: string;
  icon: string;
  endpoint: string;
  paramType: 'domain' | 'keyword';
}

export interface Persona {
  id: string;
  name: string;
  nameLocalized: string;
  description: string;
  icon: string;
  color: string;
  traits: {
    riskTolerance: number;
    timeHorizon: 'short' | 'medium' | 'long';
    detailLevel: 'high' | 'medium' | 'low';
    focusArea: string;
  };
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tools: string[];
  model: string;
  type?: 'master' | 'sub-agent' | 'framework' | 'utility';
  parent?: string;
  color?: string;
}

/** Lightweight card for the 6 specialist agents — returned by /knowledge/agents/specialists (Sprint E) */
export interface SpecialistCard {
  id: string;
  name: string;
  nameLocalized: string;
  description: string;
  descriptionLocalized: string;
  icon: string;
  color: string;
  model: string;
  type: 'specialist' | 'brain-core';
  toolCount: number | 'ALL';
  absorbs: string[];
  /** Whether a DB extension exists for this specialist (Sprint G) */
  hasExtension?: boolean;
  extension?: AgentExtension | null;
}

/** Custom agent — fully DB-managed (Sprint G) */
export interface CustomAgentCard {
  id: string;        // slug
  slug: string;
  name: string;
  nameLocalized: string;
  description: string;
  descriptionLocalized: string;
  icon: string;
  color: string;
  model: 'haiku' | 'sonnet' | 'sonnet-high';
  type: 'custom';
  toolCount: number | 'ALL';
  absorbs: string[];
  keywords: string[];
  system_prompt: string;
  tools_list: string[];
  source: 'custom';
}

/** Specialist extension — extra instructions for a base agent */
export interface AgentExtension {
  id: string;
  agent_id: string;
  custom_description: string | null;
  extra_system_prompt: string | null;
  extra_keywords: string[];
  updated_at: string;
}

/** Form input for creating or updating a custom agent */
export interface AgentFormData {
  slug: string;
  name: string;
  description: string;
  system_prompt: string;
  model: 'haiku' | 'sonnet' | 'sonnet-high';
  tools: string[];
  keywords: string[];
  color: string;
  icon: string;
}

/** Form input for extending a base specialist */
export interface ExtensionFormData {
  custom_description: string;
  extra_system_prompt: string;
  extra_keywords: string[];
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface ActionInfo {
  path: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  tier: number;
}

export interface ActionCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface MentionItem {
  id: string;
  name: string;
  description: string;
  color?: string;
  type: string;
}

export interface MentionCategory {
  id: string;
  label: string;
  icon: string;
  items: MentionItem[];
}

export interface UserFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  conversationId?: string;
  createdAt: string;
  isShared?: boolean;
  userName?: string;
}

export interface UserReport {
  id: string;
  filename: string;
  toolName: string;
  toolType: string;
  size: number;
  userName?: string;
  createdAt: string;
}

export interface WorkspaceItem {
  id: string;
  userId: string;
  userName: string;
  itemType: 'file' | 'report' | 'conversation';
  itemId: string;
  title: string;
  description?: string;
  createdAt: string;
}

export interface FrameworkInfo {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface UserStats {
  conversations: number;
  messages: number;
  files: number;
  filesSize: number;
  reports: number;
  deliberations: number;
  favoritePersona: string | null;
  memberSince: string;
  lastLogin: string | null;
  // Backend already returns these (see profile.ts /stats query) — added for #12 name editing
  email?: string;
  name?: string;
  role?: string;
  totalTokens?: number;
}

// --- Feedback ---

export interface FeedbackItem {
  id: string;
  userId: string;
  userName: string;
  type: 'like' | 'dislike' | 'general' | 'bug' | 'feature';
  content: string | null;
  conversationId: string | null;
  messageIndex: number | null;
  status: string;
  voteCount: number;
  myVote: number | null;
  createdAt: string;
}

// --- Dashboards ---

export interface SEODashboardData {
  domainRating: {
    current: number | null;
    rank: number | null;
    history: Array<{ date: string; value: number }>;
  };
  keywords: { total: number; top10: any[] };
  backlinks: { total: number; sample: any[] };
  competitors: any[];
  topQueries: any[];
  quickWins: any[];
  reportCount: number;
}

export interface ContentDashboardData {
  recentConversations: Array<{ id: string; title: string; createdAt: string; userName: string }>;
  totalConversations: number;
  totalResponses: number;
  toolUsage: Array<{ type: string; count: number }>;
}

export interface CEODashboardData {
  activity: Array<{ date: string; messages: number }>;
  users: Array<{
    id: string; name: string; role: string;
    lastLogin: string | null; conversations: number; messages: number;
  }>;
  featureUsage: { deliberations: number; reports: number; files: number; workspaceItems: number };
  system: { uptime: number; memoryMB: number };
  kpis: { domainRating: number | null; totalUsers: number; totalConversations: number };
}

// --- Team Chat ---

export interface ChatAttachment {
  type: 'file' | 'conversation' | 'report';
  id: string;
  title: string;
  meta?: string; // extra info like file size, tool name, etc.
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'team' | 'direct';
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageBy?: string;
  unreadCount: number;
  members?: TeamUser[];
}

export interface TeamMessage {
  id: number;
  channelId: string;
  userId: string;
  userName: string;
  content: string;
  mentionsBrain: boolean;
  brainResponse: string | null;
  attachments: ChatAttachment[];
  createdAt: string;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'online' | 'away' | 'offline';
  lastSeenAt: string;
}

// --- Sites ---

export interface Site {
  id: string;
  domain: string;
  name: string;
  description: string | null;
  isPrimary: boolean;
  gscProperty: string | null;
  createdAt: string;
}

// --- Brand Assets ---

export type BrandAssetType =
  | 'voice-guide' | 'writing-dna' | 'style-guide' | 'topic-clusters'
  | 'seo-strategy' | 'web-architecture' | 'sitemap'
  | 'quality-checklist-seo' | 'quality-checklist-content' | 'custom';

export interface BrandAsset {
  id: string;
  siteId: string | null;
  siteName: string | null;
  siteDomain: string | null;
  assetType: BrandAssetType;
  title: string;
  content?: string;
  version: number;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

// --- File Generation ---

export type GenerateFormat = 'docx' | 'xlsx' | 'pptx' | 'html' | 'csv' | 'md' | 'json' | 'txt';

// --- Content Calendar ---

export type ContentStatus = 'idea' | 'brief' | 'draft' | 'review' | 'published' | 'archived';
export type ContentType = 'article' | 'landing-page' | 'guide' | 'case-study' | 'infographic' | 'video-script';

export interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  contentType: ContentType;
  siteId: string | null;
  siteDomain: string | null;
  siteName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string;
  creatorName: string | null;
  deadline: string | null;
  url: string | null;
  keywords: string[];
  notes: string | null;
  attachments: ContentAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentAttachment {
  type: 'file' | 'report' | 'dataset';
  id: string;
  title: string;
  meta?: string;
}

// --- Context Items ---

export interface ContextItem {
  id: string;
  type: 'file' | 'report' | 'framework' | 'brand-asset' | 'dataset';
  label: string;
  content: string;
  icon: string;
}

// --- Datasets ---

export interface DatasetInfo {
  id: string;
  originalName: string;
  fileType: string;
  description: string | null;
  rowCount: number | null;
  columnNames: string[] | null;
  sizeBytes: number;
  uploaderName: string;
  createdAt: string;
}

// --- Admin types ---

export interface AdminAgent {
  filename: string;
  id: string;
  name: string;
  description: string;
  model: string;
  visibility: string;
  type: string;
  color: string;
  tools: string[];
  size: number;
  updatedAt: string;
}

export interface AdminFramework {
  filename: string;
  path: string;
  category: string;
  name: string;
  size: number;
  updatedAt: string;
}

export interface AdminDataset {
  id: string;
  filename: string;
  originalName: string;
  fileType: string;
  description: string | null;
  rowCount: number | null;
  columnNames: string[] | null;
  sizeBytes: number;
  isApproved: boolean;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserFile {
  id: string;
  userId: string;
  userName: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  conversationId: string | null;
  isShared: boolean;
  createdAt: string;
}

export interface AdminHTMLReport {
  id: string;
  userId: string;
  userName: string;
  title: string;
  templateType: string;
  filename: string;
  siteDomain: string | null;
  isPublic: boolean;
  shareToken: string | null;
  viewUrl: string;
  createdAt: string;
}

// --- Documents ---

export interface DocInfo {
  path: string;
  name: string;
  category: string;
  size: number;
  modifiedAt: string;
}

export interface HelpData {
  agents: Array<{ id: string; name: string; description: string }>;
  skills: Array<{ id: string; name: string; description: string; category: string }>;
  frameworks: Array<{ id: string; name: string; description: string; category: string }>;
  features: Array<{ name: string; description: string; icon: string }>;
  shortcuts: Array<{ keys: string; description: string }>;
}

// --- HTML Reports ---

export type ReportTemplateType = 'custom' | string;

export interface HTMLReport {
  id: string;
  title: string;
  templateType: string;
  filename: string;
  siteDomain: string | null;
  isPublic: boolean;
  shareToken: string | null;
  viewUrl: string;
  createdAt: string;
}

export interface SharedHTMLReport {
  id: string;
  title: string;
  templateType: string;
  filename: string;
  siteDomain: string | null;
  userName: string;
  viewUrl: string;
  createdAt: string;
}
