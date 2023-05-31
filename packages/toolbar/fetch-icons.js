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

const fs = require('fs');
const path = require('path');

// This script generates an JSON array of font-awesome classnames from the font-awesome.css files
const fontAwesomeCSSPath = path.resolve(__dirname, '../../node_modules/font-awesome/css/font-awesome.css');
const fontAwesomeDestination = path.resolve(__dirname, './src/browser/font-awesome.json');

const codiconCSSPath = path.resolve(__dirname, '../../node_modules/@vscode/codicons/dist/codicon.css')
const codiconDestination = path.resolve(__dirname, './src/browser/codicon.json')

const faContent = fs.readFileSync(fontAwesomeCSSPath, 'utf-8');
const regexp = /([\w,-]*):before/gm;
let faArray;
const faMatches = [];
while (faArray = regexp.exec(faContent)) {
    faMatches.push(faArray[1]);
}
fs.writeFileSync(fontAwesomeDestination, JSON.stringify(faMatches));

const codiconContent = fs.readFileSync(codiconCSSPath, 'utf-8');
let codiconArray;
const codiconMatches = [];
while (codiconArray = regexp.exec(codiconContent)) {
    codiconMatches.push(codiconArray[1]);
}
fs.writeFileSync(codiconDestination, JSON.stringify(codiconMatches));
