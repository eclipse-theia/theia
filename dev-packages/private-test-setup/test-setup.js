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

// Register ESM loader hooks so that non-JS imports (e.g. .css files from
// @theia/monaco-editor-core ESM bundles) are handled before mocha attempts
// to load test files. Without this, Node's ESM resolver fails on .css
// imports, and mocha's import→require fallback causes files to be partially
// executed twice, leading to side-effect duplication.
const { register } = require('node:module');
register('./esm-loader-hooks.mjs', require('node:url').pathToFileURL(__filename));

// Mock DragEvent as '@lumino/dragdrop' already requires it at require time
global.DragEvent = class DragEvent { };
