#!/bin/bash
npm install \
&& npm run test \
&& cd config/local-dependency-manager \
&& npm install \
&& cd ../../examples/browser \
&& npm run bootstrap \
&& npm run test:ui \
&& ps -ef | grep 'node ./src-gen/backend/main.js' | grep -v grep | awk '{print $2}' | xargs kill \
&& cd ../electron \
&& npm run bootstrap \
&& npm run test 
