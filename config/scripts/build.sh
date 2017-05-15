#!/bin/bash
npm install \
&& npm run build \
&& npm run test \
&& cd releng/file-dependency-updater/ \
&& npm install \
&& cd ../../examples/browser
&& npm install \
&& npm run build:app \
&& npm run build:browser \
&& cd ../electron \
&& npm run build:app \
&& npm run build:electron