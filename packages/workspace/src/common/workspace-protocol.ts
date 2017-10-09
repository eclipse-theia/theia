/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const workspacePath = '/services/workspace';

/**
 * The JSON-RPC workspace interface.
 */
export const WorkspaceServer = Symbol('WorkspaceServer');
export interface WorkspaceServer {

    /**
     * Returns with a promise that resolves to the workspace root URI as a string. Resolves to `undefined` if the workspace root is not yet set.
     */
    getRoot(): Promise<string | undefined>;

    /**
     * Sets the desired string representation of the URI as the workspace root.
     */
    setRoot(uri: string): Promise<void>;

}
