#!/bin/bash
npm install \
&& npm run build \
&& npm run test \
&& cd config/local-dependency-manager \
&& npm install \
&& cd ../../examples/browser \
&& npm install \
&& npm run build \
&& cd ../electron \
&& npm install \
&& npm run build