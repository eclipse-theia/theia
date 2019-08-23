/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import URI from '@theia/core/lib/common/uri';
import { BreakpointManager } from '@theia/debug/lib/browser/breakpoint/breakpoint-manager';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { inject, injectable } from 'inversify';
import { TestCase } from '../framework/test-case';
import * as assert from 'assert';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { DebugThread } from '@theia/debug/lib/browser/model/debug-thread';

@injectable()
export class DebugTests implements TestCase {

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;
    @inject(BreakpointManager)
    protected readonly breakpointManager: BreakpointManager;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected async testDebugWorkflow(): Promise<void> {
        const roots = await this.workspaceService.roots;
        const resourceUri = new URI(roots[0].uri).withScheme('file').parent.resolve('testWorkspace/js/test.js').toString();

        this.breakpointManager.cleanAllMarkers();
        this.breakpointManager.addBreakpoint({
            id: '1',
            enabled: true,
            uri: resourceUri,
            raw: {
                column: 1,
                line: 1
            }
        });

        const debugSession = await this.debugSessionManager.start({
            configuration: {
                type: 'node',
                request: 'launch',
                name: 'Launch Program',
                program: '${workspaceFolder}/js/test.js'
            }
        });

        assert.ok(debugSession);

        const deferredThread = new Deferred<DebugThread>();
        debugSession!.onDidChange(() => deferredThread.resolve(debugSession!.threads.next().value));

        const currentThread = await deferredThread.promise;
        const response = await debugSession!.sendRequest('continue', { threadId: currentThread.raw.id });

        assert.ok(response.success);
    }
}
