# CFBD Statistics MCP Server - COMPLETE EDITION

Everything CFBD offers. Eight powerful tools. Maximum automation.

## What This Server Does

**Eight comprehensive tools:**
1. **get_player_stats** - Individual player statistics (John Mateer's passing yards, etc.)
2. **get_team_stats** - Team season totals (total yards, points, etc.)
3. **get_game_stats** - Game-by-game results and performance
4. **get_recruiting_rankings** - Team recruiting class rank and overview
5. **get_recruits** - Individual recruit details (names, positions, stars, rankings)
6. **get_talent_rating** - Roster talent composite and national rank
7. **get_team_records** - Win-loss records (overall, conference, home, away)
8. **get_roster** - Complete team roster with all player details

**This is EVERYTHING you can automate from CFBD's free API.**

This is a separate, dedicated stats server - does not interfere with your ESPN/NCAA server.

---

## Railway Deployment Steps

### 1. Get CFBD API Key (Free!)

1. Go to: https://collegefootballdata.com/
2. Click "Get Started" or "Sign Up"
3. Create free account
4. Go to "API Keys" section
5. Generate a new API key
6. Copy it (looks like: `abc123xyz...`)

### 2. Create New GitHub Repo

```bash
# Create new repo called "cfbd-stats-server"
# Upload these files:
- cfbd-stats-server.js
- package.json (rename cfbd-package.json to package.json)
```

### 3. Deploy to Railway

1. Go to Railway dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your new `cfbd-stats-server` repo
5. Railway auto-detects Node.js and deploys

### 4. Set Environment Variables in Railway

In your Railway project settings → Variables:

```
CFBD_API_KEY=your_cfbd_api_key_here
MCP_API_KEY=sk_live_cfbd_stats_2025_secure_key_here
PORT=3000
```

**Generate a secure MCP_API_KEY:**
```bash
# Use this or any random string generator:
openssl rand -hex 32
```

### 5. Get Your Server URL

Railway gives you a URL like:
```
https://cfbd-stats-server-production.up.railway.app
```

Your MCP endpoint will be:
```
https://cfbd-stats-server-production.up.railway.app/mcp
```

### 6. Connect to Your Bot

In your bot platform (PaymeGPT):
1. Add new MCP server
2. URL: `https://your-url.up.railway.app/mcp`
3. Auth: Bearer token with your `MCP_API_KEY`
4. Click "Discover Tools"
5. You should see 3 tools appear

### 7. Update Bot Prompt

Add the content from `CFBD_STATS_PROMPT.md` to your bot's system prompt.

---

## Testing Your Server

### Test 1: Health Check
Visit in browser:
```
https://your-url.up.railway.app/
```

Should see:
```json
{
  "service": "CFBD Statistics MCP Server",
  "status": "running",
  "tools": ["get_player_stats", "get_team_stats", "get_game_stats"],
  "cfbd_configured": true
}
```

### Test 2: Player Stats
Ask your bot:
```
"What are John Mateer's stats for 2025?"
```

Bot should call: `get_player_stats(team="Oklahoma", year=2025)`

### Test 3: Team Stats
Ask your bot:
```
"How's OU's offense this season?"
```

Bot should call: `get_team_stats(team="Oklahoma", year=2025)`

### Test 4: Game Stats
Ask your bot:
```
"Show me game by game results"
```

Bot should call: `get_game_stats(team="Oklahoma", year=2025)`

---

## What Data You'll Get

### Player Stats Return Format:
```json
{
  "success": true,
  "team": "Oklahoma",
  "year": 2025,
  "players": {
    "John Mateer": {
      "name": "John Mateer",
      "position": "QB",
      "stats": {
        "passing": {
          "completions": 245,
          "attempts": 378,
          "yards": 2847,
          "touchdowns": 24,
          "interceptions": 6
        },
        "rushing": {
          "carries": 87,
          "yards": 423,
          "touchdowns": 5
        }
      }
    }
  }
}
```

### Team Stats Return Format:
```json
{
  "success": true,
  "team": "Oklahoma",
  "year": 2025,
  "stats": {
    "games": 12,
    "totalYards": 5234,
    "passingYards": 3156,
    "rushingYards": 2078,
    "pointsPerGame": 31.4,
    "turnovers": 18
  }
}
```

### Game Stats Return Format:
```json
{
  "success": true,
  "team": "Oklahoma",
  "year": 2025,
  "games": [
    {
      "week": 1,
      "date": "2025-08-31",
      "opponent": "Temple",
      "home_away": "home",
      "result": "W",
      "score_us": 51,
      "score_them": 3
    }
  ]
}
```

---

## Troubleshooting

### Problem: "No tools discovered"
**Solution:** Check Railway logs for errors, verify MCP_API_KEY matches in both Railway and bot config

### Problem: "No player stats found"
**Possible causes:**
- Player name spelled wrong (try just last name)
- Team name not matching (use "Oklahoma" not "OU Sooners")
- Year hasn't started yet (CFBD has data from 2000-current)

### Problem: "CFBD API error 401"
**Solution:** Your CFBD_API_KEY is wrong or expired. Get a new one from collegefootballdata.com

### Problem: Inconsistent results
**Causes:**
- CFBD doesn't have all data yet (season in progress)
- Some positions don't have stats (backup players with no playing time)
- This is normal - just say "No stats available yet"

---

## Key Advantages of This Approach

✅ **Separate server** - Won't break your ESPN/NCAA server
✅ **Simple tools** - Bot knows exactly which one to call
✅ **Clear prompts** - No confusion about parameters
✅ **Reliable data** - CFBD is the gold standard for college football stats
✅ **Good caching** - 5 minute cache reduces API calls
✅ **Better error handling** - Returns helpful messages when data missing

---

## Cost

**CFBD API:** FREE (no rate limits for reasonable usage)
**Railway:** FREE tier should handle this easily (minimal traffic)

---

## Support

If you have issues:
1. Check Railway logs for errors
2. Test with simple queries first ("OU team stats")
3. Verify CFBD API key is working at collegefootballdata.com
4. Make sure bot prompt includes the tool guide

This is about as simple as stats can get. Three tools, clear purposes, traditional data only.
