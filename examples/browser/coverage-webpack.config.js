/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

let baseConfig = require('./webpack.config');

/* Filter out the .js loader to replace it with the istanbul one.
   This way the code will be instrumented.  */
let filteredRules = baseConfig.module.rules.filter((value) => {
    if (value.test.toString() !== /\.js$/.toString()) {
        return true;
    }
    else {
        return false;
    }
});

let istanbulRules = [...filteredRules,
{
    test: /\.js$/,
    use: { loader: 'istanbul-instrumenter-loader' },
    exclude: /node_modules|\.spec\.js$/,
}];

module.exports = baseConfig;
module.exports.module.rules = istanbulRules;
