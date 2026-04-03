#!/usr/bin/env bash
# Import Kick2 MySQL dump (creates DB `oefb_two_club_full`).
#
# Needs: MySQL 8.x Server running + mysql client in PATH.
# Install (Beispiel): brew install mysql && brew services start mysql
#
# Usage A – Passwort in Umgebung (nur lokal, nicht committen):
#   export MYSQL_PASSWORD='dein_passwort'
#   ./scripts/import-kick2-mysql-dump.sh
#
# Usage B – interaktiv (ohne Passwort in der Shell):
#   mysql -h 127.0.0.1 -u root -p
#   Dann in der mysql-Konsole:
#   SOURCE '/Users/omerkarakus/Downloads/Kick2/DB dump/Dump20260326.sql';

set -euo pipefail

DUMP="${DUMP:-$HOME/Downloads/Kick2/DB dump/Dump20260326.sql}"
HOST="${MYSQL_HOST:-127.0.0.1}"
USER="${MYSQL_USER:-root}"

if [[ ! -f "$DUMP" ]]; then
  echo "Dump nicht gefunden: $DUMP" >&2
  echo "Passe DUMP= an oder lege die Datei dort ab." >&2
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo "Kein 'mysql' im PATH. Bitte MySQL Client installieren (z.B. brew install mysql)." >&2
  exit 1
fi

if [[ -n "${MYSQL_PASSWORD:-}" ]]; then
  echo "Importiere nach $HOST als $USER aus: $DUMP"
  mysql -h "$HOST" -u "$USER" -p"$MYSQL_PASSWORD" < "$DUMP"
  echo "Fertig. Datenbank: oefb_two_club_full"
  exit 0
fi

echo "MYSQL_PASSWORD ist nicht gesetzt."
echo ""
echo "Option 1 – einmalig mit Passwort in der Shell (nur lokal):"
echo "  export MYSQL_PASSWORD='…'"
echo "  $0"
echo ""
echo "Option 2 – manuell in der mysql-Konsole (Pfad mit Leerzeichen in Anführungszeichen):"
echo "  mysql -h $HOST -u $USER -p"
echo "  SOURCE '$DUMP';"
exit 1
