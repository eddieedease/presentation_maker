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

## Deploy to shared hosting

Shared hosting with PHP and MySQL is all this needs — no shell, no Composer, no
Node on the server.

**1. Build the bundle**

```bash
./scripts/build-release.sh
```

That compiles the frontend and assembles `release/presentation-maker/` plus a
zip of the same thing (about 550 KB).

**2. Upload it**

Upload the *contents* of the bundle to your web root (`public_html`, `httpdocs`,
`www`) — or to any subdirectory, which works too.

**3. Create a MySQL database**

In cPanel or Plesk, create a database and a user, and grant that user access to
it. Note the name, username and password.

**4. Open `install.php` in your browser**

`https://example.com/install.php` walks through four steps:

1. **Requirements** — PHP version, PDO/MySQL, mbstring, JSON, mod_rewrite and
   whether `app/` is writable
2. **Database** — your credentials, tested before it continues
3. **Site & admin** — the site URL (detected automatically) and your
   administrator account, **which the installer creates for you** so you can
   sign in the moment it finishes
4. **Finish** — it offers to delete itself

The installer creates the schema, writes `app/config.php` with a freshly
generated JWT secret, and points the frontend at wherever you installed it.

**5. Delete `install.php`**

The last step does this for you. If your file permissions prevent it, the page
says so — remove the file over FTP. An installer left on a live server lets
anyone reconfigure your site.

### What gets uploaded

```
public_html/
├── .htaccess          # /api → api.php, SPA fallback, caching, security headers
├── index.html         # the Angular app
├── main-*.js, *.css   # content-hashed, cached for a year
├── reveal/            # reveal.js core, themes and highlight styles
├── api.php            # PHP front controller
├── install.php        # delete this after installing
└── app/               # blocked from the web by its own .htaccess
    ├── src/           # the PHP classes
    ├── database/      # schema.sql
    └── config.php     # written by the installer (0640)
```

`app/` is denied over HTTP by `app/.htaccess`, so your config and sources are not
downloadable. Verify after installing: `https://example.com/app/config.php`
must return **403**.

### Notes

- **Subdirectories work.** Install at `example.com/decks/` and the installer
  rewrites the frontend's `<base href>` and stores matching URLs. Nothing to
  configure by hand.
- **Requires PHP 8.1+** and `pdo_mysql`. Most hosts let you pick the PHP version
  in the control panel.
- **To reinstall**, delete `app/config.php` and re-upload `install.php`. Your
  data is untouched — the schema uses `CREATE TABLE IF NOT EXISTS`.
- **To upgrade**, rebuild and upload everything *except* `app/config.php`.
- If the API returns 500s, check that `mod_rewrite` is enabled and that
  `AllowOverride All` applies to your web root — some hosts disable `.htaccess`.
- **OAuth** needs the `curl` extension. Without it, email and password sign-in
  still works.

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
├── docker/php/Dockerfile     # php:8.3-apache, pdo_mysql, rewrite
├── deploy/                   # .htaccess templates for the release bundle
├── scripts/build-release.sh  # builds the shared-hosting bundle
├── backend/
│   ├── public/
│   │   ├── index.php         # router and route table (becomes api.php)
│   │   └── install.php       # the web installer
│   ├── database/schema.sql   # one schema, used by Docker and the installer
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
- Settings come from `config.php` when it exists (hosted installs) and from the
  environment otherwise (Docker). The dev stack ships no config file, so the two
  never collide, and it sets `APP_INSTALLER_DISABLED=1` so the bundled installer
  cannot run against it.
- Changing `backend/database/schema.sql` only affects a **fresh** database. To re-apply:
  `docker compose down -v && docker compose up -d`.
- For hosting, use `./scripts/build-release.sh` rather than a bare `npm run build`:
  it adds the front controller, the installer and the `.htaccess` rules that make
  deep links like `/p/<slug>` resolve.
