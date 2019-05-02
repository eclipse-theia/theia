#!/usr/bin/env node

/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

/**
 * Theia's `package.json` contains a `prepare` script which is triggered after each install.
 * But we don't always want to build the whole project after installing dependencies.
 * This script looks for an environment variable to skip the prepare step.
 *
 * Example (Unix): `THEIA_SKIP_NPM_PREPARE=1 yarn`
 *
 * Script returns successfully (code=0) when the variable is set, and fails (code>0)
 * when variable is not set. This allows `script || a && b && ...` which will skip
 * the following commands if `script` returns 0, but will keep going otherwise.
 */

if (process.env.THEIA_SKIP_NPM_PREPARE) {
    console.error('skipping `npm prepare`')
    process.exit(0) // stop
} else {
    process.exit(1) // ok
}
