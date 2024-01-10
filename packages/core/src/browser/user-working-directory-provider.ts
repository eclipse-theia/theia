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

import { inject, injectable } from 'inversify';
import URI from '../common/uri';
import { MaybePromise, SelectionService, UNTITLED_SCHEME, UriSelection } from '../common';
import { EnvVariablesServer } from '../common/env-variables';
import { FrontendApplication } from './frontend-application';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { Widget } from './widgets';
import { Navigatable } from './navigatable-types';

@injectable()
export class UserWorkingDirectoryProvider implements FrontendApplicationContribution {
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(EnvVariablesServer) protected readonly envVariables: EnvVariablesServer;

    protected lastOpenResource: URI | undefined;

    configure(app: FrontendApplication): void {
        app.shell.onDidChangeCurrentWidget(e => this.setLastOpenResource(e.newValue ?? undefined));
        this.setLastOpenResource(app.shell.currentWidget);
    }

    protected setLastOpenResource(widget?: Widget): void {
        if (Navigatable.is(widget)) {
            const uri = widget.getResourceUri();
            if (uri && uri.scheme !== UNTITLED_SCHEME) {
                this.lastOpenResource = uri;
            }
        }
    }

    /**
     * @returns A {@link URI} that represents a good guess about the directory in which the user is currently operating.
     *
     * Factors considered may include the current widget, current selection, user home directory, or other application state.
     */
    async getUserWorkingDir(): Promise<URI> {
        return await this.getFromSelection()
            ?? this.getFromUserHome();
    }

    protected getFromSelection(): MaybePromise<URI | undefined> {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (uri?.scheme === UNTITLED_SCHEME) {
            // An untitled file is not a valid working directory context.
            return undefined;
        }
        return this.ensureIsDirectory(uri);
    }

    protected getFromLastOpenResource(): MaybePromise<URI | undefined> {
        return this.ensureIsDirectory(this.lastOpenResource);
    }

    protected getFromUserHome(): MaybePromise<URI> {
        return this.envVariables.getHomeDirUri().then(home => new URI(home));
    }

    protected ensureIsDirectory(uri?: URI): MaybePromise<URI | undefined> {
        return uri?.parent;
    }
}
