/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
* This is the place for API experiments and proposals.
* These API are NOT stable and subject to change. Use it on own risk.
*/
declare module '@theia/plugin' {
    export namespace languageServer {
        /**
         * Registers new language server.
         *
         * @param languageServerInfo information about the language server
         */
        export function registerLanguageServerProvider(languageServerInfo: LanguageServerInfo): Disposable;

        /**
         * Stops the language server.
         *
         * @param id language server's id
         */
        export function stop(id: string): void;
    }

    /**
    * The language contribution interface defines an information about language server which should be registered.
    */
    export interface LanguageServerInfo {
        /**
         * Language server's id.
         */
        id: string;
        /**
         * Language server's name.
         */
        name: string;
        /**
         * The command to run language server as a process.
         */
        command: string;
        /**
         * Command's arguments.
         */
        args: string[];
        /**
         * File's patterns which can be used to create file system watchers.
         */
        globPatterns?: string[];
        /**
         * Names of files. If the workspace contains some of them language server should be activated.
         */
        workspaceContains?: string[];
    }
}
