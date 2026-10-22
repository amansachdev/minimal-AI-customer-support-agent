# Kindred Support

A small full-stack AI customer support app. Users can create an account, talk to a Gemini-powered assistant, and return to earlier conversations.

## Stack

- **Frontend:** React 19 + Vite
- **API:** Node.js 22 + Express 5
- **Database:** MongoDB (local in Docker Compose, Atlas in production)
- **Authentication:** bcrypt password hashes + short-lived JWT bearer tokens
- **AI:** Gemini API (`gemini-2.5-flash` by default)
- **Hosting:** Azure Static Web Apps Free plan + Azure Container Apps consumption

## Run locally with Docker Compose

1. Install Docker Desktop and make a local environment file:

   ```sh
   cp .env.example .env
   ```

2. Add your Gemini API key to `.env` as `GEMINI_API_KEY`. Chat requests need this key; signup and login can run without it.

3. Start the app:

   ```sh
   docker compose up --build
   ```

4. Open [http://localhost:5173](http://localhost:5173). The API health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).

MongoDB data persists in the `mongo_data` Docker volume. Stop the containers with `docker compose down`; use `docker compose down -v` only when you want to delete local database data.

## Run without Docker

Use Node.js 22 or newer and a running MongoDB instance.

```sh
cp server/.env.example server/.env
cd server && npm install && npm run dev
```

In another terminal:

```sh
cd client
npm install
cp .env.example .env
npm run dev
```

Set `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, and `CLIENT_ORIGIN` in `server/.env`. The frontend reads `VITE_API_BASE_URL` at build time. Never commit environment files or put the Gemini key in the frontend.

## API

All endpoints use the `/api` prefix. Auth endpoints return a JWT; send it as `Authorization: Bearer <token>` on protected routes.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create account (`email`, `password`) |
| `POST` | `/auth/login` | Sign in and receive JWT |
| `POST` | `/auth/logout` | Logout acknowledgement; client clears its tab-scoped JWT |
| `POST` | `/chat/send` | Send `{ "message": "...", "conversationId": "optional" }` |
| `GET` | `/chat/history` | List the signed-in user’s conversations |
| `GET` | `/chat/history/:conversationId` | Load one of the signed-in user’s conversations |
| `GET` | `/health` | API health check at `/api/health` |

Conversation lookups are scoped to the authenticated user. Auth routes are limited to 10 attempts per IP every 15 minutes; chat sends are limited to 20 per user per minute, in addition to a general API limit.

## Environment variables

See [`.env.example`](.env.example), [`server/.env.example`](server/.env.example), and [`client/.env.example`](client/.env.example). Production secrets belong in Azure Container App secrets or GitHub Actions secrets. The browser only receives the API base URL, never credentials.

| Variable | Used by | Description |
| --- | --- | --- |
| `MONGODB_URI` | API | Local or Atlas MongoDB connection string |
| `JWT_SECRET` | API | Long random signing key (required in production) |
| `JWT_EXPIRES_IN` | API | Token lifetime; defaults to `1h` |
| `GEMINI_API_KEY` | API | Gemini Developer API key |
| `GEMINI_MODEL` | API | Model name; defaults to `gemini-2.5-flash` |
| `CLIENT_ORIGIN` | API | Comma-separated allowed browser origins |
| `TRUST_PROXY` | API | Set to `1` when behind Azure ingress |
| `VITE_API_BASE_URL` | Frontend build | API origin plus `/api` |

## Deploy to Azure

The frontend is a static site on Azure Static Web Apps. The API is a scale-to-zero Azure Container App; MongoDB Atlas remains the managed database. Container Apps has monthly free grants for consumption usage, and Atlas Free clusters are intended for small development workloads. Actual cost can depend on usage, region, and other account resources. [Azure Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing) · [Atlas Free cluster docs](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)

### 1. Create Azure resources

Sign in with Azure CLI, then run:

```sh
az login
AZURE_LOCATION=eastus AZURE_SWA_LOCATION=eastus2 ./infra/provision-azure.sh
```

The script creates a resource group, a Container Apps environment with platform log collection disabled, and a Free Azure Static Web App. Change the names/regions with `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINER_ENV`, `AZURE_STATIC_APP`, `AZURE_LOCATION`, and `AZURE_SWA_LOCATION`. Azure’s Express Container Apps environment currently offers a `none` log destination to avoid creating a Log Analytics workspace. [Container Apps logging options](https://learn.microsoft.com/en-us/azure/container-apps/log-options)

### 2. Create a public GitHub repository

Push this project to a public repository and use `main` as the production branch. The API deployment workflow publishes its container image to GitHub Container Registry (GHCR). Create a GitHub classic personal access token with `read:packages` for the Container App to pull that image.

### 3. Configure Azure deployment identity

Create a Microsoft Entra application/service principal, grant it Contributor access to the resource group, and add a federated identity credential that trusts this repository’s `main` branch. Configure these GitHub Actions secrets:

- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `AZURE_STATIC_WEB_APPS_API_TOKEN` (retrieve with the command printed by `provision-azure.sh`)
- `GHCR_PULL_USERNAME`, `GHCR_PULL_TOKEN`
- `MONGODB_URI`, `GEMINI_API_KEY`, `JWT_SECRET`

Configure these GitHub Actions repository variables:

- `AZURE_RESOURCE_GROUP` (default `rg-kindred-support`)
- `AZURE_CONTAINER_ENV` (default `aca-kindred-support`)
- `AZURE_CONTAINER_APP` (default `kindred-support-api`)
- `AZURE_LOCATION` (default `eastus`)
- `CLIENT_ORIGIN` (the Azure Static Web App origin, without a trailing slash)
- `API_BASE_URL` (the Container App URL followed by `/api`)

Retrieve the Static Web Apps token and save it without printing it in terminal history:

```sh
SWA_TOKEN="$(az staticwebapp secrets list --name swa-kindred-support --resource-group rg-kindred-support --query properties.apiKey --output tsv)"
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body "$SWA_TOKEN"
unset SWA_TOKEN
```

The workflow uses Azure workload identity federation through `azure/login`, so no long-lived Azure password or client secret is stored in GitHub. [GitHub Actions with Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/github-actions)

### 4. Deploy

Push to `main`. The frontend workflow builds and publishes `client/`; the API workflow builds and deploys `server/`. The API URL is printed by the workflow and can also be read with:

```sh
az containerapp show --name kindred-support-api --resource-group rg-kindred-support --query properties.configuration.ingress.fqdn --output tsv
```

Once both workflows finish, the Azure Static Web App URL is the deployed link. Add that URL to `CLIENT_ORIGIN`; set `API_BASE_URL` to the API’s `https://<container-app-host>/api` URL before the frontend workflow runs.

## Development and production settings

`NODE_ENV=development` is used locally; Azure sets `NODE_ENV=production`, trusts the Azure ingress proxy, and requires explicit database, JWT, and Gemini secrets. Local Compose uses a private MongoDB container. Production must use Atlas with a database user limited to the application database and Atlas network access configured for the Container Apps egress path.

## Notes

- JWTs are held in `sessionStorage` and cleared when the tab session ends or the user signs out. They are never persisted in `localStorage`.
- Gemini API keys must remain server-side. Google’s current free tier is subject to model-specific quotas and may use submitted content to improve Google products. [Gemini API pricing and data use](https://ai.google.dev/gemini-api/docs/pricing)
- Chat turns are saved after the assistant successfully responds. If Gemini is unavailable, the message remains in the composer for retry.
- `support@example.com` in the Help Center link is a placeholder; replace it with the project’s support address before public launch.
