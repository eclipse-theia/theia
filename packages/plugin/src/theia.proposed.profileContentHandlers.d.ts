// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.77.0/src/vscode-dts/vscode.proposed.profileContentHandlers.d.ts

export module '@theia/plugin' {

    export interface ProfileContentHandler {
        readonly name: string;
        saveProfile(name: string, content: string, token: CancellationToken): Thenable<Uri | null>;
        readProfile(uri: Uri, token: CancellationToken): Thenable<string | null>;
    }

    export namespace window {
        export function registerProfileContentHandler(id: string, profileContentHandler: ProfileContentHandler): Disposable;
    }

}
