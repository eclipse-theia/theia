#!/usr/bin/env node

// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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
// @ts-check
const path = require('path');
const cp = require('child_process');

const patchPackage = require.resolve('patch-package');
console.log(`patch-package = ${patchPackage}`);

const patchesDir = path.join('.', 'node_modules', '@theia', 'cli', 'patches');

console.log(`patchesdir = ${patchesDir}`);

const env = Object.assign({}, process.env);

const scriptProcess = cp.exec(`node "${patchPackage}" --patch-dir "${patchesDir}"`, {
    cwd: process.cwd(),
    env
});

scriptProcess.stdout.pipe(process.stdout);
scriptProcess.stderr.pipe(process.stderr);
