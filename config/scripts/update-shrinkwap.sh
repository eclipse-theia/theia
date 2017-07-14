#!/bin/bash
./config/scripts/clean-all.sh
rm npm-shrinkwrap.json examples/browser/npm-shrinkwrap.json examples/electron/npm-shrinkwrap.json
npm install
npm shrinkwrap
cd config/local-dependency-manager
npm install
cd ../../examples/browser
npm run bootstrap
npm shrinkwrap
cd ../../examples/electron
npm run bootstrap
npm shrinkwrap
cd ../../
