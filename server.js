import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;
const MCP_API_KEY = process.env.MCP_API_KEY;
const CFBD_API_KEY = process.env.CFBD_API_KEY;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Root
app.get('/', (req, res) => {
  res.json({ service: 'CFBD Stats MCP Server', status: 'running' });
});

// MCP endpoint
app.all('/mcp', async (req, res) => {
  console.log(`${req.method} /mcp`);
  
  // Handle GET (connection check)
  if (req.method === 'GET') {
    return res.json({ service: 'MCP Server', status: 'ready' });
  }
  
  // Handle POST (MCP protocol)
  try {
    // Auth check
    if (MCP_API_KEY) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${MCP_API_KEY}`) {
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized' },
          id: req.body?.id
        });
      }
    }
    
    const { method, params, id } = req.body;
    console.log(`  Method: ${method}`);
    
    // Initialize
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'cfbd-stats', version: '1.0.0' }
        },
        id
      });
    }
    
    // List tools
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        result: {
          tools: [{
            name: 'get_player_stats',
            description: 'Get college football player statistics from CFBD',
            inputSchema: {
              type: 'object',
              properties: {
                team: { type: 'string', description: 'Team name (e.g., "oklahoma")' },
                year: { type: 'number', description: 'Season year (default: 2025)' }
              },
              required: ['team']
            }
          }]
        },
        id
      });
    }
    
    // Call tool
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      console.log(`  Tool: ${name}, Args:`, args);
      
      if (name === 'get_player_stats') {
        if (!CFBD_API_KEY) {
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: 'Error: CFBD API key not configured' }]
            },
            id
          });
        }
        
        const team = args.team || 'oklahoma';
        const year = args.year || 2025;
        const url = `https://api.collegefootballdata.com/stats/player/season?year=${year}&team=${team}`;
        
        console.log(`  Fetching from CFBD...`);
        
        try {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${CFBD_API_KEY}` },
            signal: AbortSignal.timeout(10000)
          });
          
          if (!response.ok) {
            return res.json({
              jsonrpc: '2.0',
              result: {
                content: [{ type: 'text', text: `CFBD API error: ${response.status}` }]
              },
              id
            });
          }
          
          const data = await response.json();
          console.log(`  Got ${data.length} players`);
          
          if (data.length === 0) {
            return res.json({
              jsonrpc: '2.0',
              result: {
                content: [{ type: 'text', text: `No stats found for ${team} in ${year}` }]
              },
              id
            });
          }
          
          // Format response
          let text = `🏈 ${team.toUpperCase()} STATS (${year})\n\n`;
          
          const byCategory = {};
          data.forEach(p => {
            const cat = p.category || 'other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(p);
          });
          
          for (const [cat, players] of Object.entries(byCategory)) {
            text += `${cat.toUpperCase()}:\n`;
            players.slice(0, 5).forEach(p => {
              text += `  ${p.player}: ${p.statType} = ${p.stat}\n`;
            });
            text += '\n';
          }
          
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text }]
            },
            id
          });
          
        } catch (fetchError) {
          console.error('  CFBD fetch error:', fetchError.message);
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: `Error: ${fetchError.message}` }]
            },
            id
          });
        }
      }
      
      return res.json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Unknown tool: ${name}` },
        id
      });
    }
    
    // Unknown method
    return res.json({
      jsonrpc: '2.0',
      error: { code: -32601, message: `Unknown method: ${method}` },
      id
    });
    
  } catch (error) {
    console.error('MCP error:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id: req.body?.id
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`CFBD Key: ${CFBD_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`MCP Key: ${MCP_API_KEY ? 'SET' : 'NONE'}\n`);
});
