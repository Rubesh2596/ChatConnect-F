# ChatConnect

Simple Node + Express + Socket.io chat application using MongoDB for persistence.

What I added for GitHub & deploy:

- A start script in `package.json` (node server.js)
- A GitHub Actions workflow to trigger a deploy to Render via its Deploy API. You can change to another host later.

How to run locally

1. Install deps

```powershell
npm install
```

2. Create a `.env` file with values (example):

```
MONGO_URI=mongodb://127.0.0.1:27017/chatconnect
JWT_SECRET=your_jwt_secret
PORT=3000
```

3. Start app

```powershell
npm start
```

Preparing GitHub + Deploy (recommended flow)

1. Initialize git and push to a new GitHub repo (see PowerShell commands below).
2. Create a Render Web Service (or any host) and note the Service ID and an API key.
3. In your GitHub repository, add the following secrets: `RENDER_API_KEY` and `RENDER_SERVICE_ID`.
4. Push to `main` branch — the workflow will call the Render API to trigger a deploy.

Notes

- The GitHub Actions workflow uses the Render deploy-by-API pattern which requires you to provide a Render API key and the Service ID as repository secrets. If you prefer another host (Heroku, Railway, Vercel), I can provide a workflow for that instead.
