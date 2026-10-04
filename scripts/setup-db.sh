#!/bin/bash
set -e

service postgresql start
service redis-server start

# Configure postgres to listen on all addresses and allow password auth
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf || true
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/16/main/pg_hba.conf || true
echo "host all all ::0/0 md5" >> /etc/postgresql/16/main/pg_hba.conf || true
service postgresql restart

su - postgres << 'EOF'
psql -tc "SELECT 1 FROM pg_user WHERE usename = 'cheque_user'" | grep -q 1 || psql -c "CREATE USER cheque_user WITH SUPERUSER PASSWORD 'cheque_password';"
psql -c "ALTER USER cheque_user WITH PASSWORD 'cheque_password';"
psql -tc "SELECT 1 FROM pg_database WHERE datname = 'cheque_db'" | grep -q 1 || psql -c "CREATE DATABASE cheque_db OWNER cheque_user;"
psql -d cheque_db -c "GRANT ALL PRIVILEGES ON DATABASE cheque_db TO cheque_user;"
EOF

echo "Postgres and Redis setup completed successfully!"
