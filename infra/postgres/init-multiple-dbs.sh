#!/bin/bash
# Creates one PostgreSQL database per service from the POSTGRES_MULTIPLE_DATABASES env var
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE players;
  CREATE DATABASE tournaments;
  CREATE DATABASE matches;
  CREATE DATABASE stats;
  CREATE DATABASE notifications;
  CREATE DATABASE auth;
EOSQL
