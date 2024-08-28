FROM armdocker.seli.gic.ericsson.se/dockerhub-ericsson-remote/node:14.17.0-alpine

# Set the working directory
WORKDIR /opt/SmokeTest

# Link Chromium to where Chrome normally is
RUN ln -s /usr/lib/chromium/chrome /usr/bin/google-chrome

# Install required packages
RUN apk add --no-cache git xvfb dbus xorg-server mesa-dri-swrast ttf-freefont chromium chromium-chromedriver
COPY package.json /opt/SmokeTest
RUN npm install

# Copy Smoke test and wrapper script to container
COPY mocha-config.json /opt/SmokeTest
COPY smoke_test.js /opt/SmokeTest
RUN mkdir /opt/SmokeTest/images
COPY prepare_env_smoke_tests.sh /opt/SmokeTest
RUN chmod 777 /opt/SmokeTest/prepare_env_smoke_tests.sh
CMD /opt/SmokeTest/prepare_env_smoke_tests.sh
