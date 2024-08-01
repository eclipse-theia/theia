// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { ChatAgent, DefaultChatAgent } from '@theia/ai-chat/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { template } from '../common/template';
import { FunctionCallRegistry, ToolRequest } from '@theia/ai-core';
import { FileContentFunction, GetWorkspaceFileList } from './functions';

@injectable()
export class WorkspaceAgent extends DefaultChatAgent implements ChatAgent {
    override id = 'Workspace';
    override name = 'Workspace Agent';
    override description = 'An AI Agent that can access the current Workspace contents';
    override promptTemplates = [template];

    @inject(FunctionCallRegistry)
    protected functionCallRegistry: FunctionCallRegistry;

    protected override getSystemMessage(): Promise<string | undefined> {
        return this.promptService.getPrompt(template.id);
    }

    protected override getTools(): ToolRequest<object>[] | undefined {
        return this.functionCallRegistry.getFunctions(GetWorkspaceFileList.ID, FileContentFunction.ID);
    }
}
