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

const index = process.argv.findIndex(arg => arg.indexOf('run') !== -1);
const args = process.argv.slice(index + 1);
const scopedArgs = args.length > 1 ? [args[0], '--scope', ...args.slice(1)] : args;
process.argv = [...process.argv.slice(0, index + 1), 'run', ...scopedArgs];

require(path.resolve(__dirname, '..', '..', 'scripts', 'lerna'));
