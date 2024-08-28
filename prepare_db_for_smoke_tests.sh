#!/bin/sh
# This script will restore from fixed backed up of OQS Users and Configuration db data in folder database_data.
# Note:
# - Has to be run outside the container.
# - To run locally use: ./prepare_db_for_smoke_tests.sh <network_name>
echo "Clearing database..."
MONGO=`docker ps --filter "name=mongo" -q`
docker exec -it $MONGO mongo mean --eval "db.dropDatabase()"
docker exec -it $MONGO mongo mean_logging --eval "db.dropDatabase()"
echo "Restoring database..."
.././restore_mongodb_backup.sh $PWD/database_data $1
