/**
 * CFBD Statistics MCP Server
 * Simple, reliable traditional stats only
 * Separate from ESPN/NCAA server
 */

import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const CFBD_API_KEY = process.env.CFBD_API_KEY;
const MCP_API_KEY = process.env.MCP_API_KEY || 'your-secret-key';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Team name mappings
const TEAM_MAPPINGS = {
  'oklahoma': 'Oklahoma',
  'ou': 'Oklahoma',
  'sooners': 'Oklahoma',
  'texas': 'Texas',
  'longhorns': 'Texas',
  'alabama': 'Alabama',
  'crimson tide': 'Alabama',
  'georgia': 'Georgia',
  'bulldogs': 'Georgia',
  'ohio state': 'Ohio State',
  'buckeyes': 'Ohio State',
  'michigan': 'Michigan',
  'wolverines': 'Michigan'
};

function normalizeTeamName(team) {
  const lower = team.toLowerCase();
  return TEAM_MAPPINGS[lower] || team;
}

function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`✅ Cache hit: ${key}`);
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

async function fetchCFBD(endpoint, params = {}) {
  const url = new URL(`https://api.collegefootballdata.com${endpoint}`);
  Object.keys(params).forEach(key => {
    if (params[key] !== null && params[key] !== undefined) {
      url.searchParams.append(key, params[key]);
    }
  });

  console.log(`🔍 CFBD API call: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${CFBD_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get individual player statistics
 */
async function getPlayerStats(team, year = null, category = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `player_${normalizedTeam}_${currentYear}_${category || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const params = {
      year: currentYear,
      team: normalizedTeam
    };
    
    if (category) {
      params.category = category;
    }

    const data = await fetchCFBD('/stats/player/season', params);
    
    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No player stats found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    // Organize by category for easier reading
    const organized = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      players: {}
    };

    data.forEach(player => {
      const name = player.player || 'Unknown';
      if (!organized.players[name]) {
        organized.players[name] = {
          name: name,
          position: player.position || 'N/A',
          stats: {}
        };
      }
      
      // Add stats by category
      const cat = player.category || 'general';
      organized.players[name].stats[cat] = player;
    });

    setCache(cacheKey, organized);
    return organized;

  } catch (error) {
    console.error('❌ Error fetching player stats:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get team season statistics
 */
async function getTeamStats(team, year = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `team_${normalizedTeam}_${currentYear}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchCFBD('/stats/season', {
      year: currentYear,
      team: normalizedTeam
    });

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No team stats found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    const result = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      stats: data[0] // CFBD returns array with one object for team stats
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error('❌ Error fetching team stats:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get team game-by-game statistics
 */
async function getGameStats(team, year = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `games_${normalizedTeam}_${currentYear}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchCFBD('/games/teams', {
      year: currentYear,
      team: normalizedTeam
    });

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No game stats found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    const result = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      games: data.map(game => ({
        week: game.week,
        date: game.start_date,
        opponent: game.home_team === normalizedTeam ? game.away_team : game.home_team,
        home_away: game.home_team === normalizedTeam ? 'home' : 'away',
        result: game.home_team === normalizedTeam 
          ? (game.home_points > game.away_points ? 'W' : 'L')
          : (game.away_points > game.home_points ? 'W' : 'L'),
        score_us: game.home_team === normalizedTeam ? game.home_points : game.away_points,
        score_them: game.home_team === normalizedTeam ? game.away_points : game.home_points,
        stats: game.stats || {}
      }))
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error('❌ Error fetching game stats:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get team recruiting class rankings
 */
async function getRecruitingRankings(team, year = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `recruiting_rank_${normalizedTeam}_${currentYear}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchCFBD('/recruiting/teams', {
      year: currentYear,
      team: normalizedTeam
    });

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No recruiting rankings found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    const result = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      ranking: data[0]
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error('❌ Error fetching recruiting rankings:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get individual recruits for a team
 */
async function getRecruits(team, year = null, position = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `recruits_${normalizedTeam}_${currentYear}_${position || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const params = {
      year: currentYear,
      team: normalizedTeam
    };

    if (position) {
      params.position = position;
    }

    const data = await fetchCFBD('/recruiting/players', params);

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No recruits found for ${normalizedTeam} in ${currentYear}${position ? ` at ${position}` : ''}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    // Organize by star rating
    const organized = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      total_commits: data.length,
      five_stars: data.filter(r => r.stars === 5),
      four_stars: data.filter(r => r.stars === 4),
      three_stars: data.filter(r => r.stars === 3),
      all_recruits: data.map(r => ({
        name: r.name,
        position: r.position,
        hometown: r.city && r.stateProvince ? `${r.city}, ${r.stateProvince}` : r.stateProvince || 'Unknown',
        high_school: r.school || 'Unknown',
        stars: r.stars || 0,
        rating: r.rating || 0,
        rank_overall: r.ranking || null,
        rank_position: r.positionRanking || null,
        rank_state: r.stateRanking || null,
        height: r.height || null,
        weight: r.weight || null
      }))
    };

    setCache(cacheKey, organized);
    return organized;

  } catch (error) {
    console.error('❌ Error fetching recruits:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get team talent composite (roster talent rating)
 */
async function getTalentRating(team, year = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `talent_${normalizedTeam}_${currentYear}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchCFBD('/talent', {
      year: currentYear
    });

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No talent data found for ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    // Find the team in the results
    const teamData = data.find(t => t.school === normalizedTeam);
    
    if (!teamData) {
      return {
        success: false,
        message: `No talent data found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    const result = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      talent_rating: teamData.talent,
      national_rank: data.findIndex(t => t.school === normalizedTeam) + 1,
      total_teams_ranked: data.length
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error('❌ Error fetching talent rating:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get team records (overall, conference, home, away)
 */
async function getTeamRecords(team, year = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `records_${normalizedTeam}_${currentYear}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchCFBD('/records', {
      year: currentYear,
      team: normalizedTeam
    });

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No records found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    const record = data[0];
    const result = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      overall: {
        wins: record.total?.wins || 0,
        losses: record.total?.losses || 0,
        ties: record.total?.ties || 0
      },
      conference: {
        wins: record.conferenceGames?.wins || 0,
        losses: record.conferenceGames?.losses || 0,
        ties: record.conferenceGames?.ties || 0
      },
      home: {
        wins: record.homeGames?.wins || 0,
        losses: record.homeGames?.losses || 0,
        ties: record.homeGames?.ties || 0
      },
      away: {
        wins: record.awayGames?.wins || 0,
        losses: record.awayGames?.losses || 0,
        ties: record.awayGames?.ties || 0
      }
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error('❌ Error fetching team records:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

/**
 * Get team roster
 */
async function getRoster(team, year = null) {
  const normalizedTeam = normalizeTeamName(team);
  const currentYear = year || new Date().getFullYear();
  
  const cacheKey = `roster_${normalizedTeam}_${currentYear}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchCFBD('/roster', {
      team: normalizedTeam,
      year: currentYear
    });

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No roster found for ${normalizedTeam} in ${currentYear}`,
        team: normalizedTeam,
        year: currentYear
      };
    }

    // Organize by position
    const organized = {
      success: true,
      team: normalizedTeam,
      year: currentYear,
      total_players: data.length,
      by_position: {},
      all_players: data.map(p => ({
        name: `${p.first_name} ${p.last_name}`,
        jersey: p.jersey || null,
        position: p.position || 'Unknown',
        year: p.year || null,
        height: p.height || null,
        weight: p.weight || null,
        hometown: p.home_city && p.home_state ? `${p.home_city}, ${p.home_state}` : p.home_state || 'Unknown'
      }))
    };

    // Group by position
    data.forEach(player => {
      const pos = player.position || 'Unknown';
      if (!organized.by_position[pos]) {
        organized.by_position[pos] = [];
      }
      organized.by_position[pos].push({
        name: `${player.first_name} ${player.last_name}`,
        jersey: player.jersey,
        year: player.year
      });
    });

    setCache(cacheKey, organized);
    return organized;

  } catch (error) {
    console.error('❌ Error fetching roster:', error);
    return {
      success: false,
      error: error.message,
      team: normalizedTeam,
      year: currentYear
    };
  }
}

// MCP Protocol Handler
app.post('/mcp', async (req, res) => {
  try {
    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing or invalid authorization header' },
        id: req.body.id || null
      });
    }

    const token = authHeader.substring(7);
    if (token !== MCP_API_KEY) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid API key' },
        id: req.body.id || null
      });
    }

    const { method, params, id } = req.body;

    // Handle tools/list
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'get_player_stats',
              description: 'Get individual player statistics (passing, rushing, receiving, etc.) for a specific team. Use this when asked about a specific player or "player stats".',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Season year (defaults to current year)'
                  },
                  category: {
                    type: 'string',
                    description: 'Stat category: "passing", "rushing", "receiving", "defensive", "kicking" (optional - returns all if omitted)'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_team_stats',
              description: 'Get team season totals (total yards, points, turnovers, etc.). Use this when asked about team performance or "team stats".',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Season year (defaults to current year)'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_game_stats',
              description: 'Get game-by-game results and statistics for a team. Use this when asked about "game by game" or "results by game".',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Season year (defaults to current year)'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_recruiting_rankings',
              description: 'Get team recruiting class rankings with total commits, average rating, and star distribution. Use when asked about "recruiting class", "recruiting ranking", or "how many stars".',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Recruiting class year (defaults to current year)'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_recruits',
              description: 'Get individual recruits with names, positions, hometowns, star ratings, and rankings. Use when asked about "who did we sign", "show me recruits", or asking about specific recruit names.',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Recruiting class year (defaults to current year)'
                  },
                  position: {
                    type: 'string',
                    description: 'Filter by position (e.g., "QB", "RB", "WR") - optional'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_talent_rating',
              description: 'Get team roster talent composite rating and national ranking. Use when asked about "how talented is the roster", "talent rating", or "how stacked are we".',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Season year (defaults to current year)'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_team_records',
              description: 'Get team win-loss records (overall, conference, home, away). Use when asked about "our record", "conference record", "home record", or "away record".',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Season year (defaults to current year)'
                  }
                },
                required: ['team']
              }
            },
            {
              name: 'get_roster',
              description: 'Get complete team roster with player names, positions, jersey numbers, year (Fr/So/Jr/Sr), and hometowns. Use when asked "who\'s on the team", "show me the roster", or asking about specific position groups.',
              inputSchema: {
                type: 'object',
                properties: {
                  team: {
                    type: 'string',
                    description: 'Team name (e.g., "Oklahoma", "Texas")'
                  },
                  year: {
                    type: 'number',
                    description: 'Season year (defaults to current year)'
                  }
                },
                required: ['team']
              }
            }
          ]
        },
        id
      });
    }

    // Handle tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;

      console.log(`🔧 Tool called: ${name} with args:`, args);

      switch (name) {
        case 'get_player_stats':
          result = await getPlayerStats(args.team, args.year, args.category);
          break;
        
        case 'get_team_stats':
          result = await getTeamStats(args.team, args.year);
          break;
        
        case 'get_game_stats':
          result = await getGameStats(args.team, args.year);
          break;
        
        case 'get_recruiting_rankings':
          result = await getRecruitingRankings(args.team, args.year);
          break;
        
        case 'get_recruits':
          result = await getRecruits(args.team, args.year, args.position);
          break;
        
        case 'get_talent_rating':
          result = await getTalentRating(args.team, args.year);
          break;
        
        case 'get_team_records':
          result = await getTeamRecords(args.team, args.year);
          break;
        
        case 'get_roster':
          result = await getRoster(args.team, args.year);
          break;
        
        default:
          return res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32601, message: `Unknown tool: ${name}` },
            id
          });
      }

      return res.json({
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        },
        id
      });
    }

    // Unknown method
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32601, message: `Unknown method: ${method}` },
      id
    });

  } catch (error) {
    console.error('❌ MCP error:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id: req.body.id || null
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'CFBD Statistics MCP Server - COMPLETE EDITION',
    status: 'running',
    tools: [
      'get_player_stats',
      'get_team_stats', 
      'get_game_stats',
      'get_recruiting_rankings',
      'get_recruits',
      'get_talent_rating',
      'get_team_records',
      'get_roster'
    ],
    cfbd_configured: !!CFBD_API_KEY,
    version: '2.0-complete'
  });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 CFBD Stats Server running on ${HOST}:${PORT}`);
  console.log(`✅ CFBD API Key: ${CFBD_API_KEY ? 'Configured' : '⚠️  MISSING'}`);
  console.log(`✅ MCP endpoint: /mcp`);
});
