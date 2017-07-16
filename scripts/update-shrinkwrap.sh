#!/bin/bash
./scripts/clean-all.sh
rm npm-shrinkwrap.json
npm install
npm shrinkwrap