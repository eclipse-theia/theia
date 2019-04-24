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

/**
 * This is a hack to help `webpack` locating the Theia extensions with dynamic `require`.
 * See: https://github.com/theia-ide/theia/pull/4983#issuecomment-486145220
 *
 * Instead of doing:
 * ```ts
 * const myModule = require.resolve(getMyModuleName());
 * ```
 *
 * You're supposed to do:
 * ```ts
 * import nodeRequire from './node-require';
 * const myModule = nodeRequire.resolve(getMyModuleName());
 * ```
 *
 * Then, in your `webpack.config.js`, you have to make sure, `webpack` does not parse this module:
 * ```js
 * module.exports = (options = {}) => ({
 *      // Your configuration comes here.
 *      module: {
 *          noParse: /\/node-require.js$/,
 *      }
 * });
 * ```
 */
export default require;
