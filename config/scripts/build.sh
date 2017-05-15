#!/bin/bash
npm run i \
&& npm run build \
&& npm run test \
&& cd releng/file-dependency-updater \
&& npm i \
&& cd ../../examples/browser
&& npm i \
&& npm run build:app \
&& npm run build:browser \
&& cd ../electron \
&& npm run build:app \
&& npm run build:electron