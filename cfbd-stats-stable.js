import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;
const MCP_API_KEY = process.env.MCP_API_KEY;
const CFBD_API_KEY = process.env.CFBD_API_KEY;

app.use(cors());
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({ service: 'CFBD Stats MCP', status: 'running' });
});

// MCP endpoint - handle both GET and POST
app.all('/mcp', async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🟢 [${timestamp}] MCP ${req.method} REQUEST`);
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
  
  // Handle GET (for connection check)
  if (req.method === 'GET') {
    console.log('   → GET request - returning 200 OK');
    return res.status(200).json({ 
      service: 'MCP Server',
      status: 'ready',
      methods: ['initialize', 'tools/list', 'tools/call'],
      timestamp
    });
  }
  
  // Handle POST (actual MCP calls)
  try {
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Auth check
    if (MCP_API_KEY) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ No auth');
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized' },
          id: req.body?.id
        });
      }
      
      const token = authHeader.substring(7);
      if (token !== MCP_API_KEY) {
        console.log('❌ Bad key');
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Invalid key' },
          id: req.body?.id
        });
      }
      console.log('✅ Auth OK');
    }
    
    const { method, params, id } = req.body;
    console.log(`Method: ${method}`);
    
    // Handle initialize
    if (method === 'initialize') {
      console.log('→ Returning initialize response');
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
    
    // Handle tools/list
    if (method === 'tools/list') {
      console.log('→ Returning tools list');
      return res.json({
        jsonrpc: '2.0',
        result: {
          tools: [{
            name: 'get_player_stats',
            description: 'Get college football player statistics from CFBD API',
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
    
    // Handle tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      console.log(`→ Tool: ${name}`);
      console.log(`→ Args:`, args);
      
      if (name === 'get_player_stats') {
        if (!CFBD_API_KEY) {
          console.log('❌ No CFBD key');
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
        
        console.log(`→ Fetching: ${url}`);
        
        try {
          const cfbdRes = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CFBD_API_KEY}` },
            signal: AbortSignal.timeout(15000)
          });
          
          console.log(`→ CFBD status: ${cfbdRes.status}`);
          
          if (!cfbdRes.ok) {
            const errText = await cfbdRes.text();
            console.log(`❌ CFBD error: ${errText}`);
            return res.json({
              jsonrpc: '2.0',
              result: {
                content: [{ type: 'text', text: `CFBD API error: ${cfbdRes.status}` }]
              },
              id
            });
          }
          
          const data = await cfbdRes.json();
          console.log(`✅ Got ${data.length} players`);
          
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
          
          console.log('✅ Sending response');
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text }]
            },
            id
          });
          
        } catch (err) {
          console.error('❌ Fetch error:', err);
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: `Error: ${err.message}` }]
            },
            id
          });
        }
      }
      
      // Unknown tool
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
    
  } catch (err) {
    console.error('❌ Error:', err);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: err.message },
      id: req.body?.id
    });
  }
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CFBD MCP Server running on :${PORT}`);
  console.log(`✅ CFBD Key: ${CFBD_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`✅ MCP Key: ${MCP_API_KEY ? 'SET' : 'NONE'}\n`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n📴 Shutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Keep alive ping
setInterval(() => {
  console.log(`💓 Alive: ${Math.floor(process.uptime())}s`);
}, 60000);
