ENDLESS EVOLUTION v8.2 — READY LOBBY

WHAT CHANGED
Create Room generates a private lobby code; Join Room enters an existing room.
Lobby displays player names and READY status. Everyone must press READY.
Host can start once at least 2 players are present and all are ready.
Normal Mode only, with difficulty, map, and Endless rounds. Round 1 starts when host presses START.
Single-player gameplay is not modified.

IMPORTANT — WHY YOU SAW THE RED SERVER ERROR
The game HTML on Netlify is static. It cannot host real-time rooms.
You MUST deploy this entire ZIP to a Node.js hosting service (for example Render Web Service), NOT to Netlify as a static site.

SETUP
1. Unzip and upload index.html, server.js and package.json to a GitHub repository.
2. Create a Node.js Web Service on Render, using that repo.
3. Build command: npm install. Start command: npm start.
4. Open the Render URL itself (https://your-service.onrender.com). Do not open the old Netlify URL for multiplayer.
5. Multiplayer -> Create Room -> share code/link -> everyone Ready -> host Start.
6. Check https://your-service.onrender.com/health to verify the server responds.

For local testing: npm install; npm start; open http://localhost:8080 in two browser tabs.
On free hosting, the service may sleep after inactivity.

TEST STATUS: JavaScript syntax checked. Real two-device gameplay was not verified.
