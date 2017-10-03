/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';

import writeJsonFile = require('write-json-file');
function readJsonFile(path: string): any {
    return JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
}

export { writeJsonFile, readJsonFile };
