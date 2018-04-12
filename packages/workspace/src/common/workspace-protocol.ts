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
     * Returns with a promise that resolves to the active workspace root URI as a string.
     * Resolves to `undefined` if the active workspace root is not yet set.
     */
    getActiveRoot(instanceId: string | undefined): Promise<string | undefined>;

    /**
     * Sets the desired string representation of the URI as the active workspace root.
     */
    setActiveRoot(uri: string, instanceId: string): Promise<void>;

    /**
     * Returns with a promise that resolves to root URIs as strings of the workspace.
     * Resolves to `undefined` if the workspace has no root.
     */
    getRoots(instanceId: string): Promise<string[]>;

    /**
     * Adds the desired string representation of the URI to the workspace.
     */
    addRoot(uri: string, instanceId: string): Promise<void>;

    /**
     * Removes the root, represented by the string representation of the URI, from the workspace.
     */
    removeRoot(uri: string, instanceId: string): Promise<void>;

    /**
     * Returns with a promise that resolves to the workspace configuration file URI as a string.
     * Resolves to `undefined` if the workspace configuration file is unavailable.
     */
    getWorkspaceConfigFile(instanceId: string): Promise<string | undefined>;

    /**
     * Returns with a promise that resolves to the workspace id in the default workspace config file.
     * Resolves to `undefined` if the default workspace config file is unavailable.
     */
    getDefaultWorkspaceInstanceId(): Promise<string | undefined>;

    /**
     * Save the current workspace config into a user designated file
     */
    saveWorkspaceConfigAs(instanceId: string, newConfigFile: string, workspaceName: string): Promise<void>;

    /**
     * Load workspace from a workspace config file
     */
    loadWorkspaceFromConfig(configFile: string): Promise<WorkspaceData | undefined>;

    /**
     * Returns workspace settings (aka. preferences) from the workspace config file
     */
    getWorkspaceSettings(instanceId: string): Promise<WorkspaceSettings>;

    getWorkspaceName(instanceId: string): Promise<string | undefined>;

    /**
     * Write workspace settings (aka. preferences) back into the workspace config file
     */
    updateWorkspaceSettings(instanceId: string, workspaceSettings: WorkspaceSettings): Promise<void>;

    /**
     * Resovles when workspace server side gets ready
     */
    ready(): Promise<boolean>;
}

// tslint:disable-next-line:no-any
export interface WorkspaceSettings { [key: string]: any }

export interface WorkspaceData {
    id: string;
    name?: string;
    activeRoot: string;
    roots: string[];
    settings: WorkspaceSettings
}

export namespace WorkspaceData {
    // tslint:disable-next-line:no-any
    export function is(data: any): data is WorkspaceData {
        return data && data.activeRoot !== undefined && data.roots !== undefined;
    }
}
