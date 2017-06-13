#!/bin/bash
npm install \
&& npm run test \
&& cd config/local-dependency-manager \
&& npm install \
&& cd ../../examples/browser \
&& npm run bootstrap \
&& cd ../electron \
&& npm run bootstrap \
&& cd .. \
&& electron-mocha  --require ts-node/register basic-example-spec.ts
