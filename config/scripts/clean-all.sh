#!/bin/bash
rm -rf node_modules \
&& rm -rf lib \
&& rm -rf config/local-dependency-manager/node_modules \
&& rm -rf config/local-dependency-manager/lib \
&& rm -rf examples/browser/node_modules \
&& rm -rf examples/browser/lib \
&& rm -rf examples/electron/node_modules \
&& rm -rf examples/electron/lib