// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { LabelProviderContribution } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class ContextVariableLabelProvider implements LabelProviderContribution {

    canHandle(element: object): number {
        if (AIVariableResolutionRequest.is(element)) {
            return 1;
        }
        return -1;
    }

    getIcon(element: object): string | undefined {
        return 'codicon codicon-variable';
    }

    getName(element: object): string | undefined {
        if (!AIVariableResolutionRequest.is(element)) {
            return undefined;
        }
        return element.variable.name;
    }

    getLongName(element: object): string | undefined {
        if (!AIVariableResolutionRequest.is(element)) {
            return undefined;
        }
        return element.variable.name + (element.arg ? ':' + element.arg : '');
    }

    getDetails(element: object): string | undefined {
        if (!AIVariableResolutionRequest.is(element)) {
            return undefined;
        }
        return element.arg;
    }

}
