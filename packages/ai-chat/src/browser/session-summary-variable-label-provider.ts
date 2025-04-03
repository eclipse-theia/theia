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
import { SessionSumaryVariableContribution, SESSION_SUMMARY_VARIABLE } from './session-summary-variable-contribution';
import { ChatService } from '../common';

@injectable()
export class SessionSummaryVariableLabelProvider implements LabelProviderContribution {
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(SessionSumaryVariableContribution) protected readonly chatVariableContribution: SessionSumaryVariableContribution;
    protected isMine(element: object): element is AIVariableResolutionRequest & { arg: string } {
        return AIVariableResolutionRequest.is(element) && element.variable.id === SESSION_SUMMARY_VARIABLE.id && !!element.arg;
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
        return session?.title ?? this.chatVariableContribution.getLabel(element.arg) ?? session?.id ?? element.arg;
    }

    getLongName(element: object): string | undefined {
        const short = this.getName(element);
        const details = this.getDetails(element);
        return `Summary of '${short}' (${details})`;
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
