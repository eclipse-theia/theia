// *****************************************************************************
// Copyright (C) 2023 Typefox and others.
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

export interface NotebookTypeDescriptor {
    readonly type: string;
    readonly displayName: string;
    readonly priority?: string | undefined;
    readonly selector?: readonly NotebookFileSelector[];
}

export interface NotebookFileSelector {
    readonly filenamePattern?: string;
    readonly excludeFileNamePattern?: string;
}

export interface NotebookRendererDescriptor {
    readonly id: string;
    readonly displayName: string;
    readonly mimeTypes: string[];
    readonly entrypoint: string | { readonly extends: string; readonly path: string };
    readonly requiresMessaging?: 'always' | 'optional' | 'never'
}
