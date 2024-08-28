#!/bin/bash
echo 'Starting Smoke Tests'
export COMPOSE_PROJECT_NAME="oqstest"
time docker-compose build
time docker-compose up -d --force-recreate

count=1
max=10
OQS_IP=`docker inspect -f "{{ .NetworkSettings.Networks.oqstest_default.Gateway }}" $(docker ps --filter "ancestor=oqstest_nginx" -q)`
until $(http_proxy= curl --silent --output /dev/null --fail $OQS_IP/authentication/signin); do
    echo -n 'Attempt '$count'/'$max': Waiting for container to come up at '
    echo $OQS_IP/authentication/signin
    sleep 10
    count=`expr $count + 1`
    if [ $count -gt $max ]
    then
        echo "Container didn't come up. Smoke Tests Failed. Exiting..."
        exit 1
    fi
done

# Run Smoke Tests
docker build . -t smoketest --force-rm
docker run -e "HEALTH_CHECK=false" -e "BASE_URL=$OQS_IP" -e "TEST_USERNAME=oqstest" -e "TEST_PASSWORD=otZPzm5craKQJ&IN" -v "$PWD"/images:/opt/SmokeTest/images -v "$PWD"/allure-results:/opt/SmokeTest/allure-results smoketest

if [[ $? -ne 0 ]]
then
    echo 'Smoke tests failed.'
    time docker-compose down --volumes
    exit 1
fi

time docker-compose down --volumes
