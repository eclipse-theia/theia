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

import { inject, injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core';
import { LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser';
import { AI_VARIABLE_RESOURCE_SCHEME, AIVariableResourceResolver } from '../common/ai-variable-resource';
import { AIVariableResolutionRequest, AIVariableService } from '../common/variable-service';

@injectable()
export class AIVariableUriLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(AIVariableResourceResolver) protected variableResourceResolver: AIVariableResourceResolver;
    @inject(AIVariableService) protected readonly variableService: AIVariableService;

    protected isMine(element: object): element is URI {
        return element instanceof URI && element.scheme === AI_VARIABLE_RESOURCE_SCHEME;
    }

    canHandle(element: object): number {
        return this.isMine(element) ? 150 : -1;
    }

    getIcon(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        return this.labelProvider.getIcon(this.getResolutionRequest(element)!);
    }

    getName(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        return this.labelProvider.getName(this.getResolutionRequest(element)!);
    }

    getLongName(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        return this.labelProvider.getLongName(this.getResolutionRequest(element)!);
    }

    getDetails(element: object): string | undefined {
        if (!this.isMine(element)) { return undefined; }
        return this.labelProvider.getDetails(this.getResolutionRequest(element)!);
    }

    protected getResolutionRequest(element: object): AIVariableResolutionRequest | undefined {
        if (!this.isMine(element)) { return undefined; }
        const metadata = this.variableResourceResolver.fromUri(element);
        if (!metadata) { return undefined; }
        const { variableName, arg } = metadata;
        const variable = this.variableService.getVariable(variableName);
        return variable && { variable, arg };
    }
}
