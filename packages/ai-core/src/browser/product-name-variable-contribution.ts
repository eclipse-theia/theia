// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { MaybePromise, nls } from '@theia/core';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { injectable } from '@theia/core/shared/inversify';
import { AIVariable, AIVariableContribution, AIVariableContext, AIVariableResolutionRequest, AIVariableResolver, AIVariableService, ResolvedAIVariable } from '../common';

export const PRODUCT_NAME_VARIABLE: AIVariable = {
    id: 'product-name-provider',
    name: 'productName',
    description: nls.localize('theia/ai/core/productNameVariable/description', 'The name of the product/application the user is working with'),
};

@injectable()
export class ProductNameVariableContribution implements AIVariableContribution, AIVariableResolver {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(PRODUCT_NAME_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name === PRODUCT_NAME_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === PRODUCT_NAME_VARIABLE.name) {
            return { variable: request.variable, value: FrontendApplicationConfigProvider.get().applicationName };
        }
        return undefined;
    }
}
