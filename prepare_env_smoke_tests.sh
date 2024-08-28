#!/bin/sh
export DISPLAY=:10
pkill Xvfb
Xvfb ${DISPLAY} -ac +iglx -screen 0 2560x1440x24 -nolisten tcp &
pkill dbus-demon
/usr/bin/dbus-daemon --system --nopidfile
./node_modules/.bin/mocha smoke_test.js --reporter mocha-multi-reporters --reporter-options configFile=mocha-config.json
