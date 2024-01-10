// *****************************************************************************
// Copyright (C) 2022 Arm and others.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _scope = (this as any);
_scope.exports = {};

const _getModule = () => {
    if (!_scope[_scope.frontendModuleName]) {
        _scope[_scope.frontendModuleName] = {};
    }
    return _scope[_scope.frontendModuleName];
};

Object.defineProperty(_scope.exports, 'activate', {
    set: value => _getModule().activate = value
});

Object.defineProperty(_scope.exports, 'deactivate', {
    set: value => _getModule().deactivate = value
});

_scope.require = (moduleName: string) => {
    const vscodeModuleName = 'vscode';

    if (moduleName === vscodeModuleName) {
        // Return the defaultApi
        return _scope.theia._empty;
    }
};
