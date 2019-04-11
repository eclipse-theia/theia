/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

const parseArgs = require('minimist');
const nativeKeymap = require('native-keymap');
const fs = require('fs');
const electron = require('electron');

/*
 * Usage:
 *     yarn generate-layout [--info] [--pretty] [--output file]
 *
 * --info          Print the keyboard layout information; if omitted, the full
 *                 keyboard layout with info and mapping is printed.
 * --pretty        Pretty-print the JSON output.
 * --output file   Write the output to the given file instead of stdout.
 */
const args = parseArgs(process.argv);
const printInfo = args.info;
const prettyPrint = args.pretty;
const outFile = args.output;

let output;
if (printInfo) {
    output = nativeKeymap.getCurrentKeyboardLayout();
} else {
    output = {
        info: nativeKeymap.getCurrentKeyboardLayout(),
        mapping: nativeKeymap.getKeyMap()
    };
}

const stringOutput = JSON.stringify(output, undefined, prettyPrint ? 2 : undefined);
if (outFile) {
    fs.writeFileSync(outFile, stringOutput);
} else {
    console.log(stringOutput);
}

electron.app.quit();
