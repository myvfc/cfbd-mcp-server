import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;
const MCP_API_KEY = process.env.MCP_API_KEY;
const CFBD_API_KEY = process.env.CFBD_API_KEY;

app.use(cors());
app.use(express.json());

// Ultra-verbose logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check - MUST respond quickly
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    service: 'CFBD Stats MCP',
    status: 'running',
    cfbdKey: !!CFBD_API_KEY,
    mcpKey: !!MCP_API_KEY
  });
});

// MCP endpoint - GET for SSE streaming
app.get('/mcp', async (req, res) => {
  console.log('\n🟢 MCP SSE CONNECTION');
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connection
  res.write('event: endpoint\n');
  res.write('data: /mcp\n\n');
  
  console.log('✅ SSE connection established');
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);
  
  req.on('close', () => {
    console.log('❌ SSE connection closed');
    clearInterval(keepAlive);
  });
});

// MCP endpoint - POST for direct calls
app.post('/mcp', async (req, res) => {
  console.log('\n🟢 MCP REQUEST RECEIVED');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Auth check
    if (MCP_API_KEY) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ No auth header');
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized' },
          id: req.body.id
        });
      }
      
      const token = authHeader.substring(7);
      if (token !== MCP_API_KEY) {
        console.log('❌ Invalid key');
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Invalid API key' },
          id: req.body.id
        });
      }
    }
    
    const { method, params, id } = req.body;
    console.log('Method:', method);
    
    // initialize - MCP handshake
    if (method === 'initialize') {
      console.log('✅ Handling initialize');
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'cfbd-stats-mcp-server',
            version: '1.0.0'
          }
        },
        id
      });
    }
    
    // tools/list
    if (method === 'tools/list') {
      console.log('✅ Returning tools list');
      return res.json({
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'get_player_stats',
              description: 'Get Oklahoma player statistics from CFBD',
              inputSchema: {
                type: 'object',
                properties: {
                  team: { type: 'string', description: 'Team name' },
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
    
    // tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      console.log('Tool:', name);
      console.log('Args:', JSON.stringify(args));
      
      if (name === 'get_player_stats') {
        console.log('📊 Fetching player stats...');
        
        if (!CFBD_API_KEY) {
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: '❌ Server error: CFBD API key not configured'
              }]
            },
            id
          });
        }
        
        const team = args.team || 'oklahoma';
        const year = args.year || 2025;
        const url = `https://api.collegefootballdata.com/stats/player/season?year=${year}&team=${team}`;
        
        console.log('Fetching:', url);
        
        try {
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${CFBD_API_KEY}`,
              'Accept': 'application/json'
            },
            timeout: 10000 // 10 second timeout
          });
          
          console.log('CFBD Status:', response.status);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.log('CFBD Error:', errorText);
            return res.json({
              jsonrpc: '2.0',
              result: {
                content: [{
                  type: 'text',
                  text: `CFBD API error (${response.status}): ${errorText}`
                }]
              },
              id
            });
          }
          
          const data = await response.json();
          console.log('Got', data.length, 'players');
          
          if (data.length === 0) {
            return res.json({
              jsonrpc: '2.0',
              result: {
                content: [{
                  type: 'text',
                  text: `No player stats found for ${team} in ${year}`
                }]
              },
              id
            });
          }
          
          // Format response
          let text = `🏈 ${team.toUpperCase()} PLAYER STATS (${year})\n\n`;
          
          // Group by category
          const byCategory = {};
          data.forEach(p => {
            const cat = p.category || 'other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(p);
          });
          
          // Show top players from each category
          for (const [category, players] of Object.entries(byCategory)) {
            text += `${category.toUpperCase()}:\n`;
            players.slice(0, 5).forEach(p => {
              text += `  • ${p.player} (#${p.playerNumber || '?'}): ${p.statType} = ${p.stat}\n`;
            });
            text += '\n';
          }
          
          console.log('✅ Sending response');
          
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: text
              }]
            },
            id
          });
          
        } catch (fetchError) {
          console.error('Fetch error:', fetchError);
          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: `Error fetching from CFBD: ${fetchError.message}`
              }]
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
    
  } catch (error) {
    console.error('❌ Server error:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id: req.body.id
    });
  }
});

// Start server with better error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('🚀 CFBD STATS MCP SERVER STARTED');
  console.log('========================================');
  console.log(`Port: ${PORT}`);
  console.log(`CFBD Key: ${CFBD_API_KEY ? '✅ SET' : '❌ MISSING'}`);
  console.log(`MCP Key: ${MCP_API_KEY ? '✅ SET' : '⚠️  NOT SET'}`);
  console.log('========================================');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /mcp');
  console.log('========================================\n');
});

// Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📴 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📴 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Keep alive - log every 30 seconds
setInterval(() => {
  console.log(`[${new Date().toISOString()}] Server alive, uptime: ${Math.floor(process.uptime())}s`);
}, 30000);

console.log('🎯 Server initialization complete, waiting for requests...');
