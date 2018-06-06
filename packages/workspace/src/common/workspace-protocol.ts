/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

export const workspacePath = '/services/workspace';

/**
 * The JSON-RPC workspace interface.
 */
export const WorkspaceServer = Symbol('WorkspaceServer');
export interface WorkspaceServer {

    /**
     * Returns with a promise that resolves to the most recently used workspace folder URI as a string.
     * Resolves to `undefined` if the workspace folder is not yet set.
     */
    getMostRecentlyUsedWorkspace(): Promise<string | undefined>;

    /**
     * Sets the desired string representation of the URI as the most recently used workspace folder.
     */
    setMostRecentlyUsedWorkspace(uri: string): Promise<void>;

    /**
     * Returns list of recently opened workspaces as an array.
     */
    getRecentWorkspaces(): Promise<string[]>
}
