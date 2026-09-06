# Crypto Signal Dashboard

Crypto Signal Dashboard is a Node.js and MySQL/MariaDB application that derives
explainable market signals from public Kraken market data. It is intended for
research and paper-trading workflows, not financial advice or automatic live
trading.

## Repository layout

```text
public_html/backend/       Express API, market ingestion and signal generation
public_html/frontend/      Static dashboard client
public_html/sql/           Versioned fresh-install SQL files
public_html/trader/        Historical paper-trading component
private/.env               Local runtime configuration (ignored by Git)
```

## Requirements

- Node.js and npm
- MySQL 8 or MariaDB
- A selected empty database and a database user with schema privileges
- Optional: PM2 and a reverse proxy for production

## Install a fresh instance

Clone the repository, set an absolute path, and run the installer:

```bash
PROJECT_ROOT="/absolute/path/to/crypto.schnueddels.de"
cd "$PROJECT_ROOT"
chmod 700 "$PROJECT_ROOT/install.sh"
"$PROJECT_ROOT/install.sh"
```

On the first run the installer creates `private/.env` from `.env.example` and
stops. Fill in the `DB_*` values and `PROJECT_API_SECRET`, then run it again.
All API credentials are optional and blank by default. In particular, leave
Kraken and Telegram credentials empty unless that integration is explicitly
required. `TELEGRAM_ALERTS_ENABLED` remains `false` by default.

The installer applies the complete fresh-install schema from `install.sql`.
To perform this manually, execute the SQL from the repository root against an
empty database:

```bash
PROJECT_ROOT="/absolute/path/to/crypto.schnueddels.de"
cd "$PROJECT_ROOT"
mariadb --database="$DB_NAME" < "$PROJECT_ROOT/install.sql"
```

## Run and validate

Start the signal API locally with:

```bash
PROJECT_ROOT="/absolute/path/to/crypto.schnueddels.de"
node "$PROJECT_ROOT/public_html/backend/src/server.js"
```

The default listener is `127.0.0.1:3033`. Serve `public_html/frontend/` from
your web server and proxy `/api/` to that listener.

Before deployment, run:

```bash
PROJECT_ROOT="/absolute/path/to/crypto.schnueddels.de"
node --check "$PROJECT_ROOT/public_html/backend/src/server.js"
npm --prefix "$PROJECT_ROOT/public_html/backend" test
```

## Security

Never commit `private/.env`, database credentials, API tokens, private keys or
production exports. The supplied `.env.example` intentionally contains only
placeholders. The historical trader component must remain without exchange
credentials for a safe paper-trading-only installation.
