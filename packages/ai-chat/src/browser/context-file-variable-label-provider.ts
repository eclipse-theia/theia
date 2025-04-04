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
import { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser';
import { ChangeSetFileService } from './change-set-file-service';

@injectable()
export class ContextFileVariableLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(ChangeSetFileService)
    protected readonly changeSetFileService: ChangeSetFileService;

    canHandle(element: object): number {
        if (AIVariableResolutionRequest.is(element) && element.variable.name === 'file') {
            return 10;
        }
        return -1;
    }

    getIcon(element: object): string | undefined {
        return this.labelProvider.getIcon(this.getUri(element)!);
    }

    getName(element: object): string | undefined {
        return this.labelProvider.getName(this.getUri(element)!);
    }

    getLongName(element: object): string | undefined {
        return this.labelProvider.getLongName(this.getUri(element)!);
    }

    getDetails(element: object): string | undefined {
        return this.labelProvider.getDetails(this.getUri(element)!);
    }

    protected getUri(element: object): URI | undefined {
        if (!AIVariableResolutionRequest.is(element)) {
            return undefined;
        }
        return new URI(element.arg);
    }

}
