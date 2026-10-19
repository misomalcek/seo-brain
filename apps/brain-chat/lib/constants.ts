import type { MCPTool } from './types';

export interface ContentAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export const MCP_TOOLS: MCPTool[] = [
  { id: 'domain', label: 'Domain Rating', icon: '📊', endpoint: '/api/mcp/domain/', paramType: 'domain' },
  { id: 'keywords', label: 'Keywords', icon: '🔑', endpoint: '/api/mcp/keywords/', paramType: 'domain' },
  { id: 'serp', label: 'SERP Overview', icon: '📈', endpoint: '/api/mcp/serp/', paramType: 'keyword' },
];

export const CONTENT_ACTIONS: ContentAction[] = [
  { id: 'content-brief', label: 'Content Brief', icon: '📝', prompt: 'Vytvor content brief pre artikel na temu: ' },
  { id: 'content-refresh', label: 'Content Refresh', icon: '🔄', prompt: 'Analyzuj ktore clanky na nasom webe potrebuju refresh a preco. Pouzij Ahrefs data.' },
  { id: 'competitor-content', label: 'Competitor Content', icon: '👀', prompt: 'Analyzuj novy content nasich konkurentov a navrhni ako reagovat. Pouzij Ahrefs data.' },
  { id: 'content-cluster', label: 'Content Cluster', icon: '🕸️', prompt: 'Navrhni content cluster strukturu pre temu: ' },
  { id: 'slovak-article', label: 'Slovak IT Article', icon: '📰', prompt: 'Napisz profesionalny slovensky IT clanok na temu: ' },
];

export const TOOL_BADGES: Record<string, { icon: string; color: string }> = {
  ahrefs_domain_rating: { icon: '📊', color: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300' },
  ahrefs_organic_keywords: { icon: '🔑', color: 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-300' },
  ahrefs_backlinks: { icon: '🔗', color: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300' },
  ahrefs_top_pages: { icon: '📄', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300' },
  ahrefs_competitors: { icon: '⚔️', color: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300' },
  ahrefs_keyword_overview: { icon: '🎯', color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300' },
  ahrefs_serp_overview: { icon: '📈', color: 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300' },
  gsc_list_sites: { icon: '🌐', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' },
  gsc_search_analytics: { icon: '📉', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' },
  gsc_top_queries: { icon: '🔍', color: 'bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300' },
  gsc_top_pages: { icon: '📄', color: 'bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300' },
  gsc_quick_wins: { icon: '🎯', color: 'bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300' },
  web_search: { icon: '🌍', color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300' },
  get_current_date: { icon: '📅', color: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300' },
};
