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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import URI from '../common/uri';
import { createUntitledURI, MaybePromise, SelectionService, UriSelection } from '../common';
import { EnvVariablesServer } from '../common/env-variables';
import { NavigatableWidget } from './navigatable-types';
import { ApplicationShell } from './shell';

@injectable()
export class UntitledFileLocationProvider {
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(EnvVariablesServer) protected readonly envVariables: EnvVariablesServer;

    async getUntitledFileLocation(extension?: string): Promise<URI> {
        return createUntitledURI(extension, await this.getParent());
    }

    protected async getParent(): Promise<URI> {
        return await this.getFromCurrentWidget()
            ?? await this.getFromSelection()
            ?? this.getFromUserHome();
    }

    protected getFromCurrentWidget(): MaybePromise<URI | undefined> {
        return this.ensureIsDirectory(NavigatableWidget.getUri(this.shell.currentWidget));
    }

    protected getFromSelection(): MaybePromise<URI | undefined> {
        return this.ensureIsDirectory(UriSelection.getUri(this.selectionService.selection));
    }

    protected getFromUserHome(): MaybePromise<URI> {
        return this.envVariables.getHomeDirUri().then(home => new URI(home));
    }

    protected ensureIsDirectory(uri?: URI): MaybePromise<URI | undefined> {
        return uri?.parent;
    }
}
