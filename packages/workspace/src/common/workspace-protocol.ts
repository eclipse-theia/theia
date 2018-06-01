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
     * Returns with a promise that resolves to root URIs as strings of a workspace.
     * Resolves an empty array if the workspace has no root.
     * @param instanceId Id of the workspace
     */
    getRoots(instanceId: string): Promise<string[]>;

    /**
     * Adds the desired string representation of the URI to the workspace.
     * @param uri string representation of the root URI
     * @param instanceId Id of the workspace
     */
    addRoot(uri: string, instanceId: string): Promise<void>

    /**
     * Removes the root, represented by the string representation of the URI, from the workspace.
     * @param uri string representation of the root URI
     * @param instanceId Id of the workspace
     */
    removeRoot(uri: string, instanceId: string): Promise<void>

    /**
     * Returns a promise that resolves to the workspace configuration file URI as a string.
     * Resolves `undefined` if the workspace configuration file is unavailable.
     * @param instanceId Id of the workspace
     */
    getWorkspaceConfigFile(instanceId: string): Promise<string | undefined>;


    /**
     * Returns a promise that resolves to the workspace configuration data.
     * Resolves `undefined` if the workspace configuration is unavailable.
     * When instanceId is `undefined`, returns a promise that resolves to the workspace configuration that gets saved most recently.
     * @param instanceId Id of the workspace
     */
    getWorkspaceConfigData(instanceId: string | undefined): Promise<WorkspaceData | undefined>;

    /**
     * Resovles when workspace server side gets ready
     */
    ready(): Promise<boolean>;

}

export interface WorkspaceData {
    id: string;
    name?: string;
    roots: string[];
    // settings?: WorkspaceSettings // TODO
}
