#!/usr/bin/env bash
# Builds the site the suite runs against, in a DDEV project: an app made from an official template with individual
# accounts, at the current .NET release, published and run in production by the project's web container:
#
#   TEMPLATE=webapp  `dotnet new webapp --auth Individual`: Razor Pages with the default account pages, plus what
#                    the build adds (see site/prepare-app.py): the Administrator role and a page only it opens, an
#                    email sender pointed at the mail catcher, the app's status code page, the movies pages of the
#                    official Razor Pages tutorial behind the login, and the accounts below;
#   TEMPLATE=blazor  `dotnet new blazor --auth Individual`: the Blazor Web App, whose account pages are components
#                    of its own, with the same additions but the movies.
#
#   - https://<project>.ddev.site/        the app (the router of the container tool sends the project's address to
#                                          the app's port, 5000);
#   - https://<project>.ddev.site:8026/   the project's mail catcher (Mailpit), which the app sends its mail to.
#
# The .NET SDK (MIT) is copied from its official image into the web image: no .NET on the machine.
# NuGet keeps its downloads in the project (.nuget/; a build again in the same folder reuses them, removing the
# folder removes them). The database is SQLite, as the templates have it, in data/ of the project.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME      the DDEV project name                                         (default aspnetcoresteps)
#   SITE_DIR          the project folder                                            (default a new temporary folder)
#   TEMPLATE          webapp or blazor (see above)                                  (default webapp)
#   DOTNET_VERSION    the .NET release of the SDK image and of the app: 11.0, the current one, or 10.0, the
#                     long-term-support one                                         (default 11.0)
#   ACCOUNT_PASSWORD  the password of the accounts below                           (default dD.123123ddd)
#   ACCOUNTS_ONLY     1: build nothing, put the accounts of the app in SITE_DIR back as below (the app keeps running)
#   APP_ENVIRONMENT   the environment the app runs in: Production, a live app (its error page, no debug information),
#                     or Development (the developer exception page)                  (default Production)
#   ENVIRONMENT_ONLY  1: build nothing, run the app of SITE_DIR in APP_ENVIRONMENT (the project restarts)
#
# The accounts are configuration: this script makes them, through the app's own user manager, and cucumber.js names
# them; the features never create or delete one. Each signs in with its email address.
#   administrator    the Administrator role: opens the administration page
#   user             no role
#   twofactoruser    two-factor sign-in with an authenticator app, its key known to the tests
#   lockeduser       locked out
#   unconfirmeduser  its email address not confirmed yet
#
# No hosted service, no account anywhere, nothing that is not open source.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-aspnetcoresteps}"
TEMPLATE="${TEMPLATE:-webapp}"
DOTNET_VERSION="${DOTNET_VERSION:-11.0}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
APP_ENVIRONMENT="${APP_ENVIRONMENT:-Production}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
PACK_SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)"
APP_NAME="TestApp"
HOST="${PROJECT_NAME}.ddev.site"
APP_URL="https://${HOST}"
ROOT="/var/www/html"
PORT="5000"
# The authenticator key of twofactoruser (base32): a test secret of a throwaway site, the one cucumber.js knows.
TWO_FACTOR_KEY="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

case "$TEMPLATE" in webapp|blazor) ;; *) echo "TEMPLATE is webapp or blazor, not ${TEMPLATE}." >&2; exit 1 ;; esac
case "$DOTNET_VERSION" in [0-9]*.[0-9]*) ;; *) echo "DOTNET_VERSION is a release line such as 11.0, not ${DOTNET_VERSION}." >&2; exit 1 ;; esac
case "$APP_ENVIRONMENT" in Production|Development) ;; *) echo "APP_ENVIRONMENT is Production or Development, not ${APP_ENVIRONMENT}." >&2; exit 1 ;; esac

# The accounts of the app (config/accounts.json), which the app's seeding step reads.
write_accounts() {
  mkdir -p config
  cat > config/accounts.json <<JSONEOF
{
  "roles": ["Administrator"],
  "accounts": [
    { "email": "administrator@example.com", "roles": ["Administrator"] },
    { "email": "user@example.com" },
    { "email": "twofactoruser@example.com", "authenticatorKey": "${TWO_FACTOR_KEY}" },
    { "email": "lockeduser@example.com", "lockedOut": true },
    { "email": "unconfirmeduser@example.com", "emailConfirmed": false }
  ]
}
JSONEOF
}

# The app's own seeding step: the accounts through its user manager, the password on standard input.
seed_accounts() {
  printf '%s' "$ACCOUNT_PASSWORD" | ddev exec -d "${ROOT}/publish" "Logging__LogLevel__Default=Warning dotnet ${APP_NAME}.dll --seed-accounts ${ROOT}/config/accounts.json"
}

# Wait until the app answers its home page (from inside the web container).
wait_for_app() {
  local attempt code
  for attempt in $(seq 1 120); do
    code="$(ddev exec "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/" < /dev/null 2>/dev/null | tr -d '\r' || true)"
    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 2
  done
  echo "The app did not come up; the end of the web container's log:" >&2
  ddev logs --tail 80 < /dev/null >&2 || true
  return 1
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ENVIRONMENT_ONLY:-}" = "1" ]; then
  sed -i "s/^  - ASPNETCORE_ENVIRONMENT=.*/  - ASPNETCORE_ENVIRONMENT=${APP_ENVIRONMENT}/" .ddev/config.aspnet-core.yaml
  ddev restart < /dev/null
  wait_for_app
  echo "The app of ${APP_URL} runs in ${APP_ENVIRONMENT}."
  exit 0
fi

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  write_accounts
  seed_accounts
  echo "The accounts of ${APP_URL} are put back (administrator, user, twofactoruser, lockeduser, unconfirmeduser)."
  exit 0
fi

# A project of this name from an earlier build goes first, with its containers.
if ddev describe "$PROJECT_NAME" > /dev/null 2>&1; then
  ddev delete -Oy "$PROJECT_NAME" < /dev/null
fi
# The NuGet downloads of an earlier build in this folder (.nuget/) are kept.
rm -rf app publish data config .dotnet-tools .app-ready

# A generic project: the web container runs the app as a daemon and the router sends the project's address to its
# port; no database of the container tool's own (the app keeps its data in SQLite), Node.js 24 for a test suite run
# in the web container.
mkdir -p app data
ddev config --project-type=generic --webserver-type=generic --docroot=app --project-name="$PROJECT_NAME" \
  --omit-containers=db --nodejs-version=24 < /dev/null

mkdir -p .ddev/web-build
cat > .ddev/config.aspnet-core.yaml <<YAMLEOF
# ASP.NET Core in this project. Written by the build script of the step pack; build again rather than editing by
# hand. The web container serves no files of its own: the router sends ports 80 and 443 of the project's address to
# the app, which the web container runs as a daemon once it is published and its accounts are in (.app-ready), in
# production, behind the router's HTTPS (the forwarded headers give the address the browser uses). The app keeps
# its database and the keys of its cookies in data/, sends its mail to the mail catcher of the project, and NuGet
# keeps its downloads in the project (.nuget/).
web_extra_exposed_ports:
  - name: aspnet-core
    container_port: ${PORT}
    http_port: 80
    https_port: 443
web_extra_daemons:
  - name: aspnet-core
    command: "bash -c 'while [ ! -f ${ROOT}/.app-ready ]; do sleep 2; done; cd ${ROOT}/publish && exec dotnet ${APP_NAME}.dll'"
    directory: ${ROOT}
web_environment:
  - ASPNETCORE_ENVIRONMENT=${APP_ENVIRONMENT}
  - ASPNETCORE_HTTP_PORTS=${PORT}
  - ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
  - ConnectionStrings__DefaultConnection=DataSource=${ROOT}/data/app.db;Cache=Shared
  - DataProtection__KeysFolder=${ROOT}/data/keys
  - Smtp__Host=127.0.0.1
  - Smtp__Port=1025
  - NUGET_PACKAGES=${ROOT}/.nuget/packages
  - DOTNET_CLI_TELEMETRY_OPTOUT=1
  - DOTNET_NOLOGO=1
  - DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
YAMLEOF
cat > .ddev/web-build/Dockerfile.aspnet-core <<DOCKEREOF
# The .NET SDK of the app (${DOTNET_VERSION}), copied from its official image. Written by the build script of the
# step pack.
COPY --from=mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} /usr/share/dotnet /usr/share/dotnet
ENV DOTNET_ROOT=/usr/share/dotnet DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
RUN ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet && dotnet --list-sdks
DOCKEREOF

ddev start -y < /dev/null
SDK="$(ddev exec "dotnet --version" < /dev/null | tr -d '\r')"
echo "The .NET SDK ${SDK} is in the web container."

echo "Making the app with dotnet new ${TEMPLATE} --auth Individual (the first run downloads its packages into .nuget/)."
ddev exec -d "${ROOT}" "dotnet new ${TEMPLATE} --auth Individual -o app -n ${APP_NAME} --force" < /dev/null
python3 "${PACK_SITE}/prepare-app.py" app --template "$TEMPLATE"

if [ "$TEMPLATE" = "webapp" ]; then
  # The migration of the movies, with the EF Core tools of the app's own release (dotnet-ef, in the project).
  EF_VERSION="$(sed -n 's/.*Include="Microsoft.EntityFrameworkCore.Design" Version="\([^"]*\)".*/\1/p' app/${APP_NAME}.csproj)"
  ddev exec -d "${ROOT}" "dotnet tool install dotnet-ef --version ${EF_VERSION} --tool-path ${ROOT}/.dotnet-tools" < /dev/null
  ddev exec -d "${ROOT}/app" "${ROOT}/.dotnet-tools/dotnet-ef migrations add AddMovies" < /dev/null
fi

echo "Publishing the app (Release)."
ddev exec -d "${ROOT}/app" "dotnet publish -c Release -o ${ROOT}/publish -nologo" < /dev/null
write_accounts
seed_accounts
touch .app-ready
echo "Waiting for the app."
wait_for_app

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$APP_URL" >> "$GITHUB_ENV"
fi
RUNTIME="$(ddev exec "dotnet --list-runtimes" < /dev/null | tr -d '\r' | sed -n 's/^Microsoft.AspNetCore.App \([^ ]*\).*/\1/p' | tail -n 1)"
[ "$TEMPLATE" = "webapp" ] && WHAT="the Razor Pages app" || WHAT="the Blazor Web App"
echo "Built ${WHAT} on ASP.NET Core ${RUNTIME} (SDK ${SDK}) at ${APP_URL}, its mail at ${APP_URL}:8026."
