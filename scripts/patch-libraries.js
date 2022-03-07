#!/usr/bin/env node
// *****************************************************************************
// Copyright (C) 2022 Arm and others
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
// @ts-check

const fs = require('fs');

const patches = [
    {
        file: 'node_modules/@phosphor/widgets/lib/widget.js',
        find: /^.*?'Host is not attached.'.*?$/gm,
        replace: ''
    }
]

for (const patch of patches) {
    const contents = fs.readFileSync(patch.file).toString();
    const modified = contents.replace(patch.find, patch.replace);
    fs.writeFileSync(patch.file, modified);
}
