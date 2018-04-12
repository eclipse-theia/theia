/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import { WorkspaceServer, WorkspaceData, WorkspaceSettings } from '../workspace-protocol';

@injectable()
export class MockWorkspaceServer implements WorkspaceServer {

    getActiveRoot(instanceId: string): Promise<string | undefined> { return Promise.resolve(''); }

    setActiveRoot(uri: string, instanceId: string): Promise<void> { return Promise.resolve(); }

    getRoots(instanceId: string): Promise<string[]> { return Promise.resolve(['']); }

    addRoot(uri: string, instanceId: string): Promise<void> { return Promise.resolve(); }

    removeRoot(uri: string, instanceId: string): Promise<void> { return Promise.resolve(); }

    getWorkspaceConfigFile(instanceId: string): Promise<string | undefined> { return Promise.resolve(''); }

    getDefaultWorkspaceInstanceId(): Promise<string | undefined> { return Promise.resolve(''); }

    saveWorkspaceConfigAs(instanceId: string, newConfigFile: string, workspaceName: string): Promise<void> { return Promise.resolve(); }

    loadWorkspaceFromConfig(configFile: string): Promise<WorkspaceData | undefined> { return Promise.resolve(undefined); }

    getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> { return Promise.resolve({}); }

    getWorkspaceName(instanceId: string): Promise<string | undefined> { return Promise.resolve(''); }

    updateWorkspaceSettings(workspaceId: string, workspaceSettings: WorkspaceSettings): Promise<void> { return Promise.resolve(); }

    ready(): Promise<boolean> { return Promise.resolve(true); }
}
