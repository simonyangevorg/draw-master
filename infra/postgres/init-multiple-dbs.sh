#!/bin/bash
# Creates one PostgreSQL database per service on a fresh volume.
# (players and matches are gone: their services were retired in L-18 / TICKET-023.)
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE tournaments;
  CREATE DATABASE stats;
  CREATE DATABASE notifications;
  CREATE DATABASE auth;
EOSQL
