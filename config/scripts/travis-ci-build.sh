#!/bin/bash
npm install \
&& npm run build \
&& npm run test \
&& cd examples/browser \
&& npm install \
&& npm run build \
&& cd ../electron \
&& npm install \
&& npm run build