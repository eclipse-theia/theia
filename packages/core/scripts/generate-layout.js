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
 * Generate keyboard layouts for using Theia as web application.
 *
 * Usage:
 *     yarn generate-layout [--info] [--all] [--pretty] [--output file]
 *
 * --info          Print the keyboard layout information; if omitted, the full
 *                 keyboard layout with info and mapping is printed.
 * --all           Include all keys in the output, not only the relevant ones.
 * --pretty        Pretty-print the JSON output.
 * --output file   Write the output to the given file instead of stdout.
 *
 * Hint: keyboard layouts are stored in packages/core/src/common/keyboard/layouts
 * and have the following file name scheme:
 *     <language>-<name>-<hardware>.json
 *
 * <language>      A language subtag according to IETF BCP 47
 * <name>          Display name of the keyboard layout (without dashes)
 * <hardware>      `pc` or `mac`
 */
const args = parseArgs(process.argv);
const printInfo = args['info'];
const includeAll = args['all'];
const prettyPrint = args['pretty'];
const outFile = args['output'];

let output;
if (printInfo) {
    output = nativeKeymap.getCurrentKeyboardLayout();
} else {
    output = {
        info: nativeKeymap.getCurrentKeyboardLayout(),
        mapping: nativeKeymap.getKeyMap()
    };
    if (!includeAll) {
        // We store only key codes for the "writing system keys" as defined here:
        // https://w3c.github.io/uievents-code/#writing-system-keys
        const ACCEPTED_CODES = [
            'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyM',
            'KeyN', 'KeyO', 'KeyP', 'KeyQ', 'KeyR', 'KeyS', 'KeyT', 'KeyU', 'KeyV', 'KeyW', 'KeyX', 'KeyY', 'KeyZ',
            'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
            'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Backquote',
            'Comma', 'Period', 'Slash', 'IntlBackslash', 'IntlRo', 'IntlYen'
        ];
        const ACCEPTED_VARIANTS = ['value', 'withShift', 'withAltGr', 'withShiftAltGr', 'vkey'];
        for (let code of Object.keys(output.mapping)) {
            if (ACCEPTED_CODES.indexOf(code) < 0) {
                delete output.mapping[code];
            } else {
                for (let variant of Object.keys(output.mapping[code])) {
                    if (ACCEPTED_VARIANTS.indexOf(variant) < 0 || output.mapping[code][variant] === '') {
                        delete output.mapping[code][variant];
                    }
                }
                if (Object.keys(output.mapping[code]).length === 0) {
                    delete output.mapping[code];
                }
            }
        }
    }
}

const stringOutput = JSON.stringify(output, undefined, prettyPrint ? 2 : undefined);
if (outFile) {
    fs.writeFileSync(outFile, stringOutput);
} else {
    console.log(stringOutput);
}

electron.app.quit();
