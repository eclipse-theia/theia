/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { inject, injectable, postConstruct, named } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { PreferenceScope, PreferenceProvider } from '@theia/core/lib/browser/preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceFilePreferenceProviderFactory, WorkspaceFilePreferenceProvider } from './workspace-file-preference-provider';

@injectable()
export class WorkspacePreferenceProvider extends PreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceFilePreferenceProviderFactory)
    protected readonly workspaceFileProviderFactory: WorkspaceFilePreferenceProviderFactory;

    @inject(PreferenceProvider) @named(PreferenceScope.Folder)
    protected readonly folderPreferenceProvider: PreferenceProvider;

    @postConstruct()
    protected async init(): Promise<void> {
        this._ready.resolve();
        this.ensureDelegateUpToDate();
        this.workspaceService.onWorkspaceLocationChanged(() => this.ensureDelegateUpToDate());
    }

    getConfigUri(resourceUri: string | undefined = this.ensureResourceUri()): URI | undefined {
        const delegate = this.delegate;
        return delegate && delegate.getConfigUri(resourceUri);
    }

    protected _delegate: PreferenceProvider | undefined;
    protected get delegate(): PreferenceProvider | undefined {
        if (!this._delegate) {
            this.ensureDelegateUpToDate();
        }
        return this._delegate;
    }
    protected readonly toDisposeOnEnsureDelegateUpToDate = new DisposableCollection();
    protected ensureDelegateUpToDate(): void {
        const delegate = this.createDelegate();
        if (this._delegate !== delegate) {
            this.toDisposeOnEnsureDelegateUpToDate.dispose();
            this.toDispose.push(this.toDisposeOnEnsureDelegateUpToDate);

            this._delegate = delegate;

            if (delegate instanceof WorkspaceFilePreferenceProvider) {
                this.toDisposeOnEnsureDelegateUpToDate.pushAll([
                    delegate,
                    delegate.onDidPreferencesChanged(changes => this.onDidPreferencesChangedEmitter.fire(changes))
                ]);
            }
            this.onDidPreferencesChangedEmitter.fire(undefined);
        }
    }
    protected createDelegate(): PreferenceProvider | undefined {
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return undefined;
        }
        if (workspace.isDirectory) {
            return this.folderPreferenceProvider;
        }
        return this.workspaceFileProviderFactory({
            workspaceUri: new URI(workspace.uri)
        });
    }

    get<T>(preferenceName: string, resourceUri: string | undefined = this.ensureResourceUri()): T | undefined {
        const delegate = this.delegate;
        return delegate ? delegate.get<T>(preferenceName, resourceUri) : undefined;
    }

    resolve<T>(preferenceName: string, resourceUri: string | undefined = this.ensureResourceUri()): { value?: T, configUri?: URI } {
        const delegate = this.delegate;
        return delegate ? delegate.resolve<T>(preferenceName, resourceUri) : {};
    }

    getPreferences(resourceUri: string | undefined = this.ensureResourceUri()): { [p: string]: any } {
        const delegate = this.delegate;
        return delegate ? delegate.getPreferences(resourceUri) : {};
    }

    async setPreference(preferenceName: string, value: any, resourceUri: string | undefined = this.ensureResourceUri()): Promise<boolean> {
        const delegate = this.delegate;
        if (delegate) {
            return delegate.setPreference(preferenceName, value, resourceUri);
        }
        return false;
    }

    protected ensureResourceUri(): string | undefined {
        const workspace = this.workspaceService.workspace;
        if (workspace && workspace.isDirectory) {
            return workspace.uri;
        }
        return undefined;
    }

}
