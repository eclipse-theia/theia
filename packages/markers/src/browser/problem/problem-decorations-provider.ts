// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Decoration, DecorationsProvider, DecorationsService } from '@theia/core/lib/browser/decorations-service';
import { ProblemManager } from './problem-manager';
import { ProblemUtils } from './problem-utils';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CancellationToken, Emitter, Event, nls } from '@theia/core';
import debounce = require('@theia/core/shared/lodash.debounce');

@injectable()
export class ProblemDecorationsProvider implements DecorationsProvider {
    @inject(ProblemManager) protected readonly problemManager: ProblemManager;

    protected currentUris: URI[] = [];

    protected readonly onDidChangeEmitter = new Emitter<URI[]>();
    get onDidChange(): Event<URI[]> {
        return this.onDidChangeEmitter.event;
    }

    @postConstruct()
    protected init(): void {
        this.problemManager.onDidChangeMarkers(() => this.fireDidDecorationsChanged());
    }

    protected fireDidDecorationsChanged = debounce(() => this.doFireDidDecorationsChanged(), 50);

    protected doFireDidDecorationsChanged(): void {
        const newUris = Array.from(this.problemManager.getUris(), stringified => new URI(stringified));
        this.onDidChangeEmitter.fire(newUris.concat(this.currentUris));
        this.currentUris = newUris;
    }

    provideDecorations(uri: URI, token: CancellationToken): Decoration | Promise<Decoration | undefined> | undefined {
        const markers = this.problemManager.findMarkers({ uri }).filter(ProblemUtils.filterMarker).sort(ProblemUtils.severityCompareMarker);
        if (markers.length) {
            return {
                bubble: true,
                letter: markers.length.toString(),
                weight: ProblemUtils.getPriority(markers[0]),
                colorId: ProblemUtils.getColor(markers[0]),
                tooltip: markers.length === 1 ? nls.localizeByDefault('1 problem in this file') : nls.localizeByDefault('{0} problems in this file', markers.length),
            };
        }
    }
}

@injectable()
export class ProblemDecorationContribution implements FrontendApplicationContribution {
    @inject(DecorationsService) protected readonly decorationsService: DecorationsService;
    @inject(ProblemDecorationsProvider) protected readonly problemDecorationProvider: ProblemDecorationsProvider;

    initialize(): void {
        this.decorationsService.registerDecorationsProvider(this.problemDecorationProvider);
    }
}
