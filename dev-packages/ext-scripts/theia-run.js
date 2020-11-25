#!/usr/bin/env node

/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
// @ts-check
const path = require('path');

// See: https://github.com/eclipse-theia/theia/issues/8779#issuecomment-733747340
const filter = require('os').platform() === 'win32'
    ? arg => arg.indexOf(path.join('ext-scripts', 'theia-run.js')) !== -1
    : arg => arg.indexOf(path.join('.bin', 'run')) !== -1
let index = process.argv.findIndex(filter);
if (index === -1) {
    // Fall back to the original logic.
    // https://github.com/eclipse-theia/theia/blob/6ef08676314a2ceca93023ddd149579493ae7914/dev-packages/ext-scripts/theia-run.js#L21
    index = process.argv.findIndex(arg => arg.indexOf('run') !== -1);
}
const args = process.argv.slice(index + 1);
const scopedArgs = args.length > 1 ? [args[0], '--scope', ...args.slice(1)] : args;
process.argv = [...process.argv.slice(0, index + 1), 'run', ...scopedArgs];

require(path.resolve(__dirname, '..', '..', 'scripts', 'lerna'));
