import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;
const MCP_API_KEY = process.env.MCP_API_KEY;
const CFBD_API_KEY = process.env.CFBD_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());

// LOG EVERY SINGLE REQUEST
app.use((req, res, next) => {
  console.log(`\n🔵 INCOMING REQUEST:`);
  console.log(`   Method: ${req.method}`);
  console.log(`   Path: ${req.path}`);
  console.log(`   Headers: ${JSON.stringify(req.headers)}`);
  console.log(`   Body: ${JSON.stringify(req.body)}\n`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('✅ Health check hit');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  console.log('✅ Root endpoint hit');
  res.json({ 
    service: 'CFBD Stats MCP Server',
    status: 'running',
    endpoints: {
      health: '/health',
      mcp: '/mcp (POST only)'
    }
  });
});

// MCP endpoint with detailed logging
app.post('/mcp', async (req, res) => {
  console.log('🟢 MCP ENDPOINT HIT!');
  
  try {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader);
    
    if (MCP_API_KEY) {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ Missing or invalid auth header');
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Missing authorization header' },
          id: req.body.id || null
        });
      }
      
      const token = authHeader.substring(7);
      if (token !== MCP_API_KEY) {
        console.log('❌ Invalid API key');
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Invalid API key' },
          id: req.body.id || null
        });
      }
      console.log('✅ Auth valid');
    }
    
    const { method, params, id } = req.body;
    console.log(`Method: ${method}`);
    
    if (method === 'tools/list') {
      console.log('📋 Handling tools/list');
      return res.json({
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'get_player_stats',
              description: 'Get individual player statistics for a team',
              inputSchema: {
                type: 'object',
                properties: {
                  team: { type: 'string', description: 'Team name (e.g., "oklahoma")' },
                  year: { type: 'number', description: 'Season year' }
                },
                required: ['team']
              }
            }
          ]
        },
        id
      });
    }
    
    if (method === 'tools/call') {
      console.log('🔧 Handling tools/call');
      const { name, arguments: args } = params;
      console.log(`Tool: ${name}, Args:`, args);
      
      if (name === 'get_player_stats') {
        if (!CFBD_API_KEY) {
          return res.json({
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: 'CFBD API key missing' }] },
            id
          });
        }
        
        const team = args.team || 'oklahoma';
        const year = args.year || 2025;
        
        const url = `https://api.collegefootballdata.com/stats/player/season?year=${year}&team=${team}`;
        console.log(`Fetching: ${url}`);
        
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${CFBD_API_KEY}` }
        });
        
        console.log(`CFBD status: ${response.status}`);
        const data = await response.json();
        console.log(`Got ${data.length} players`);
        
        let text = `${team} Stats (${year}):\n\n`;
        data.slice(0, 10).forEach(p => {
          text += `${p.player}: ${p.statType} = ${p.stat}\n`;
        });
        
        return res.json({
          jsonrpc: '2.0',
          result: { content: [{ type: 'text', text }] },
          id
        });
      }
    }
    
    res.json({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found' },
      id
    });
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id: req.body.id
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server on 0.0.0.0:${PORT}`);
  console.log(`CFBD Key: ${CFBD_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`MCP Key: ${MCP_API_KEY ? 'SET' : 'NONE'}\n`);
});
