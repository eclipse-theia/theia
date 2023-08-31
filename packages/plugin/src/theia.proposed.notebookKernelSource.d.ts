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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module '@theia/plugin' {
    export interface NotebookControllerDetectionTask {
        /**
         * Dispose and remove the detection task.
         */
        dispose(): void;
    }

    export class NotebookKernelSourceAction {
        readonly label: string;
        readonly description?: string;
        readonly detail?: string;
        readonly command: string | Command;
        readonly documentation?: Uri;

        constructor(label: string);
    }

    export interface NotebookKernelSourceActionProvider {
        /**
         * An optional event to signal that the kernel source actions have changed.
         */
        onDidChangeNotebookKernelSourceActions?: Event<void>;
        /**
         * Provide kernel source actions
         */
        provideNotebookKernelSourceActions(token: CancellationToken): ProviderResult<NotebookKernelSourceAction[]>;
    }

    export namespace notebooks {
        /**
         * Create notebook controller detection task
         */
        export function createNotebookControllerDetectionTask(notebookType: string): NotebookControllerDetectionTask;

        /**
         * Register a notebook kernel source action provider
         */
        export function registerKernelSourceActionProvider(notebookType: string, provider: NotebookKernelSourceActionProvider): Disposable;
    }
}
