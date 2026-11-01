import { brainPath } from '../paths';
import { Router, Request, Response } from 'express';
import { executeMCPTool, getAvailableMCPTools, MCPRequest } from '../services/mcp-bridge';

export const mcpRouter = Router();

// POST /mcp/execute - Execute an MCP tool via Claude Code bridge
mcpRouter.post('/execute', async (req: Request, res: Response) => {
  console.log('POST /mcp/execute received');

  try {
    const { tool, params } = req.body as MCPRequest;

    if (!tool) {
      res.status(400).json({ error: 'Tool name is required' });
      return;
    }

    console.log(`Executing MCP tool: ${tool}`, params);

    // Execute the tool via Claude Code bridge (pass userId for report tracking)
    const result = await executeMCPTool({ tool, params: params || {} }, req.user?.userId);

    if (result.success) {
      res.json({
        success: true,
        tool,
        data: result.data,
        executionTime: result.executionTime,
        reportPath: result.reportPath
      });
    } else {
      res.status(500).json({
        success: false,
        tool,
        error: result.error,
        executionTime: result.executionTime
      });
    }
  } catch (error) {
    console.error('MCP execution error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /mcp/tools - List available MCP tools
mcpRouter.get('/tools', (req: Request, res: Response) => {
  res.json({
    tools: getAvailableMCPTools(),
    note: 'These tools are executed via Claude Code MCP bridge'
  });
});

// GET /mcp/health - Health check for MCP bridge
mcpRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'mcp-bridge',
    claudePath: '/home/brain-admin/.nvm/versions/node/v22.13.1/bin/claude',
    reportsDir: brainPath('reports', 'mcp')
  });
});

// Quick action endpoints for common tasks
mcpRouter.get('/domain/:domain', async (req: Request, res: Response) => {
  const { domain } = req.params;
  console.log(`Quick domain analysis for: ${domain}`);

  const result = await executeMCPTool({
    tool: 'ahrefs_domain_rating',
    params: { target: domain }
  }, req.user?.userId);

  res.json(result);
});

mcpRouter.get('/keywords/:domain', async (req: Request, res: Response) => {
  const { domain } = req.params;
  const country = req.query.country as string || 'sk';
  const limit = parseInt(req.query.limit as string) || 20;

  console.log(`Keyword analysis for: ${domain}`);

  const result = await executeMCPTool({
    tool: 'ahrefs_organic_keywords',
    params: { target: domain, country, limit }
  }, req.user?.userId);

  res.json(result);
});

mcpRouter.get('/serp/:keyword', async (req: Request, res: Response) => {
  const { keyword } = req.params;
  const country = req.query.country as string || 'sk';

  console.log(`SERP overview for: ${keyword}`);

  const result = await executeMCPTool({
    tool: 'ahrefs_serp_overview',
    params: { keyword, country }
  }, req.user?.userId);

  res.json(result);
});
