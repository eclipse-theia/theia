// *****************************************************************************
// Copyright (C) 2025 Eclipse GmbH and others.
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

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { codicon, LabelProviderContribution } from '@theia/core/lib/browser';
import { TaskContextVariableContribution } from './task-context-variable-contribution';
import { ChatService } from '../common';
import { TaskContextService } from './task-context-service';
import { TASK_CONTEXT_VARIABLE } from './task-context-variable';

@injectable()
export class TaskContextVariableLabelProvider implements LabelProviderContribution {
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(TaskContextVariableContribution) protected readonly chatVariableContribution: TaskContextVariableContribution;
    @inject(TaskContextService) protected readonly taskContextService: TaskContextService;
    protected isMine(element: object): element is AIVariableResolutionRequest & { arg: string } {
        return AIVariableResolutionRequest.is(element) && element.variable.id === TASK_CONTEXT_VARIABLE.id && !!element.arg;
    }

    canHandle(element: object): number {
        return this.isMine(element) ? 10 : -1;
    }

    getIcon(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        return codicon('clippy');
    }

    getName(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        const session = this.chatService.getSession(element.arg);
        return session?.title ?? this.taskContextService.getLabel(element.arg) ?? session?.id ?? element.arg;
    }

    getLongName(element: object): string | undefined {
        const short = this.getName(element);
        const details = this.getDetails(element);
        return `'${short}' (${details})`;
    }

    getDetails(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        return `id: ${element.arg}`;
    }

    protected getUri(element: object): URI | undefined {
        if (!AIVariableResolutionRequest.is(element)) {
            return undefined;
        }
        return new URI(element.arg);
    }
}
