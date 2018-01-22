/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import { WorkspaceServer } from '../workspace-protocol';

@injectable()
export class MockWorkspaceServer implements WorkspaceServer {

    getRoot(): Promise<string | undefined> { return Promise.resolve(''); }

    setRoot(uri: string): Promise<void> { return Promise.resolve(); }
}
