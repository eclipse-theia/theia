#!/bin/bash
npm install \
&& npm run build \
&& npm run test \
&& cd examples/browser \
&& npm install \
&& npm run build:app \
&& npm run build:browser \
&& cd ../electron \
&& npm install \
&& npm run build:app \
&& npm run build:electron