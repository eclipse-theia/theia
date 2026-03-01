// *****************************************************************************
// Copyright (C) 2026 and others.
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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SaveableService } from '@theia/core/lib/browser/saveable-service';
import { DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { ProblemManager } from './problem-manager';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class ProblemAutoSaveContribution implements FrontendApplicationContribution {

    @inject(ProblemManager)
    protected readonly problemManager: ProblemManager;

    @inject(SaveableService)
    protected readonly saveableService: SaveableService;

    initialize(): void {
        this.saveableService.setAutoSaveErrorChecker(uri => this.hasErrors(uri));
        this.problemManager.onDidChangeMarkers(() => {
            this.saveableService.notifyAutoSaveConditionsChanged();
        });
    }

    protected hasErrors(uri: URI): boolean {
        const markers = this.problemManager.findMarkers({ uri });
        return markers.some(marker => marker.data.severity === DiagnosticSeverity.Error);
    }
}
