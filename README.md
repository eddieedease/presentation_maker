# Presentation Maker

Build presentations in a PowerPoint-style web editor, then publish them as a
reveal.js deck that anyone with the link can view.

- **Frontend** — Angular 22 (standalone, zoneless, signals) + Tailwind CSS 4 + reveal.js 5
- **Backend** — PHP 8.3 + MySQL 8.4 + phpMyAdmin, all in Docker
- **Auth** — JSON Web Tokens with rotating refresh tokens, plus optional Google / GitHub OAuth 2.0

---

## Quick start

```bash
cp .env.example .env && sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
```

```bash
docker compose up -d --build
```

```bash
cd frontend && npm install && npm start
```

| Service              | URL                     |
| -------------------- | ----------------------- |
| App                  | http://localhost:4200   |
| API                  | http://localhost:8080   |
| phpMyAdmin           | http://localhost:8081   |
| MySQL (host port)    | `localhost:3307`        |

The dev server proxies `/api` to the container (`frontend/proxy.conf.json`), so
there is no CORS setup to do locally.

Sign in at `/login`, or create an account — email + password works out of the box
and needs no OAuth credentials.

---

## The five screens

| Route             | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| `/`               | Landing page                                                             |
| `/login`          | Sign in / register, with OAuth buttons                                   |
| `/workspace`      | Your decks — create, duplicate, publish, revoke, delete                  |
| `/editor/:id`     | The slide editor                                                         |
| `/p/:slug`        | The publish site — a public, full-screen reveal.js player                |

---

## Using the editor

Slides are authored on a fixed **1280 × 720** canvas; reveal.js scales that canvas
to whatever screen the deck is viewed on, so what you place is what people see.

- **Insert** headings, text, bullet lists, quotes, images, code blocks and shapes
- **Drag** to move, drag the handles to resize — hold **Alt** for pixel-precise placement (snapping is 8 px otherwise)
- **Double-click** any text element to edit it in place
- The **Element / Slide / Deck** inspector controls typography, colour, position, per-slide backgrounds and transitions, and deck-wide theme and player options
- **Build animations** map to reveal.js fragments: give elements a step order and they reveal one at a time
- Changes **autosave** 1.2 s after you stop; `Ctrl+S` forces it

### Shortcuts

| Key                      | Action                     |
| ------------------------ | -------------------------- |
| `Ctrl/Cmd + Z` / `+Shift`| Undo / redo                |
| `Ctrl/Cmd + D`           | Duplicate selected element |
| `Ctrl/Cmd + S`           | Save now                   |
| Arrow keys (`+Shift`)    | Nudge by 1 px (10 px)      |
| `Delete`                 | Delete selected element    |
| `Esc`                    | Deselect / close overlay   |

While presenting, `S` opens the reveal.js speaker view with your slide notes.

---

## Publishing

**Publish** freezes a snapshot of the deck at a public URL (`/p/<slug>`). Editing
afterwards does not change the live deck until you publish again — and the slug
stays the same, so links you have already shared keep working. **Revoke link**
deletes the publication and the URL stops resolving immediately.

---

## API

All `/api/projects*` routes require `Authorization: Bearer <accessToken>` and are
scoped to the owner. `/api/public/*` requires nothing.

```
POST   /api/auth/register            POST   /api/auth/login
POST   /api/auth/refresh             POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/oauth/providers
GET    /api/auth/oauth/{provider}/start
GET    /api/auth/oauth/{provider}/callback

GET    /api/projects                 POST   /api/projects
GET    /api/projects/{id}            PUT    /api/projects/{id}
DELETE /api/projects/{id}            POST   /api/projects/{id}/duplicate
POST   /api/projects/{id}/publish    DELETE /api/projects/{id}/publish

GET    /api/public/presentations/{slug}
GET    /api/health
```

Access tokens last 15 minutes; the Angular interceptor transparently rotates the
refresh token on a 401 and replays the request. Only a SHA-256 hash of each
refresh token is stored, and using one revokes it.

### Deck validation

Every deck the API receives goes through `DeckNormalizer`, which whitelists
themes, transitions, element types, colours and URLs, and clamps all numbers.
The publish site therefore never renders unvalidated input — `javascript:` image
sources and unknown themes are dropped rather than stored. The Angular renderer
binds all authored text as interpolated content, never `innerHTML`.

---

## OAuth 2.0 (optional)

Email and password sign-in works without any of this. To add social login, create
credentials and put them in `.env`, then `docker compose up -d` to apply:

- **Google** — [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials), redirect URI `http://localhost:8080/api/auth/oauth/google/callback`
- **GitHub** — [github.com/settings/developers](https://github.com/settings/developers), callback URL `http://localhost:8080/api/auth/oauth/github/callback`

The login page reads `/api/auth/oauth/providers` and disables the buttons for
providers that have no credentials configured. CSRF state is a short-lived signed
JWT, and the finished session is handed back in the URL **fragment**, which
browsers never send to a server.

---

## Layout

```
.
├── docker-compose.yml        # api + db + phpmyadmin
├── docker/
│   ├── php/Dockerfile        # php:8.3-apache, pdo_mysql, rewrite
│   └── mysql/001-schema.sql  # schema, applied on first boot
├── backend/
│   ├── public/index.php      # router and route table
│   └── src/
│       ├── Controllers/      # Auth, OAuth, Project, Public
│       └── Support/          # Router, Jwt, TokenService, DeckNormalizer, …
└── frontend/
    └── src/app/
        ├── core/             # models, services, guard, interceptor
        ├── shared/           # reveal-deck, element-view, deck-style
        └── features/         # landing, auth, workspace, editor, present
```

The backend has **no Composer dependencies** — JWT signing/verification is a small
HS256 implementation in `src/Support/Jwt.php`, so `docker compose up` is all you need.

---

## Notes

- `backend/` is bind-mounted into the container: PHP edits are live, no rebuild.
- Changing `docker/mysql/*.sql` only affects a **fresh** database. To re-apply:
  `docker compose down -v && docker compose up -d`.
- For a production build (`npm run build`), serve `frontend/dist/frontend/browser`
  with an SPA fallback to `index.html` so deep links like `/p/<slug>` resolve, and
  point `API_BASE_URL` at the real API origin.
