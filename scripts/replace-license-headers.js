// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const fs = require('fs-extra');
const glob = require('glob');
const util = require('util');

const realpath = util.promisify(require('fs').realpath.native);

const oldHeaderRegexp = new RegExp(String.raw`
\/\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
 \* Copyright \(C\) (.+)
 \*
 \* This program and the accompanying materials are made available under the
 \* terms of the Eclipse Public License v\. 2\.0 which is available at
 \* http:\/\/www\.eclipse\.org\/legal\/epl-2\.0\.
 \*
 \* This Source Code may also be made available under the following Secondary
 \* Licenses when the conditions for such availability set forth in the Eclipse
 \* Public License v\. 2\.0 are satisfied: GNU General Public License, version 2
 \* with the GNU Classpath Exception which is available at
 \* https:\/\/www\.gnu\.org\/software\/classpath\/license\.html\.
 \*
 \* SPDX-License-Identifier: (.+)
 \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\/`
    .slice(1), // remove leading \n
    'i');

const newHeaderTemplate = `\
// *****************************************************************************
// Copyright (C) $1
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: $2
// *****************************************************************************`;

const search = new glob.Glob('**/*.{ts,tsx,js,jsx,c,cc,cpp,cxx}', {
    ignore: [
        '**/node_modules/**/*',
        '**/lib/**/*'
    ]
});
let matches = 0;
const seen = new Set();
search.on('match', async file => {
    file = await realpath(file);
    if (seen.has(file)) {
        return;
    }
    seen.add(file);
    const original = await fs.readFile(file, 'utf8');
    const replaced = original.replace(oldHeaderRegexp, newHeaderTemplate);
    if (original !== replaced) {
        matches += 1;
        console.log('Rewriting', file, matches);
        await fs.writeFile(file, replaced);
    }
});
