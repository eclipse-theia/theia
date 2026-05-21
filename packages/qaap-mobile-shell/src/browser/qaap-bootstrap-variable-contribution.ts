// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MaybePromise, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AIVariable,
    AIVariableContribution,
    AIVariableContext,
    AIVariableResolutionRequest,
    AIVariableResolver,
    AIVariableService,
    ResolvedAIVariable,
} from '@theia/ai-core/lib/common';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import { formatQaapBootstrapVariableValue } from './qaap-bootstrap-display';

export const QAAP_BOOTSTRAP_VARIABLE: AIVariable = {
    id: 'qaap-bootstrap-variable',
    name: 'qaap.bootstrap',
    description: nls.localize(
        'qaap/ai/bootstrapVariable/description',
        'Current Qaap dev bootstrap state: framework, phase, preview URL, and install/dev errors'
    ),
};

@injectable()
export class QaapBootstrapVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(QAAP_BOOTSTRAP_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === QAAP_BOOTSTRAP_VARIABLE.name ? 10_000 : -1;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== QAAP_BOOTSTRAP_VARIABLE.name) {
            return undefined;
        }
        const state = this.bootstrap.getStateSnapshot();
        const failure = this.bootstrap.getBootstrapFailureDetail();
        const value = formatQaapBootstrapVariableValue(state, {
            terminalFailure: failure?.terminalFailure,
        });
        return { variable: request.variable, value };
    }
}
