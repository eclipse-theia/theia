// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceFilePreferenceProviderFactory, WorkspaceFilePreferenceProvider } from './workspace-file-preference-provider';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Emitter, Event, PreferenceProvider, PreferenceProviderDataChanges, PreferenceProviderProvider, PreferenceScope } from '@theia/core';
import { JSONObject } from '@theia/core/shared/@lumino/coreutils';

@injectable()
export class WorkspacePreferenceProvider implements PreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceFilePreferenceProviderFactory)
    protected readonly workspaceFileProviderFactory: WorkspaceFilePreferenceProviderFactory;

    @inject(PreferenceProviderProvider)
    protected readonly preferenceProviderProvider: PreferenceProviderProvider;

    protected readonly onDidPreferencesChangedEmitter = new Emitter<PreferenceProviderDataChanges>();
    readonly onDidPreferencesChanged: Event<PreferenceProviderDataChanges> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDisposeOnEnsureDelegateUpToDate = new DisposableCollection();

    protected _ready = new Deferred<void>();
    readonly ready = this._ready.promise;

    protected readonly disposables = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.workspaceService.ready.then(() => {
            // If there is no workspace after the workspace service is initialized, then no more work is needed for this provider to be ready.
            // If there is a workspace, then we wait for the new delegate to be ready before declaring this provider ready.
            if (!this.workspaceService.workspace) {
                this._ready.resolve();
            } else {
                // important for the case if onWorkspaceLocationChanged has fired before this init is finished
                this.ensureDelegateUpToDate();
            }
        });
    }

    dispose(): void {
        this.disposables.dispose();
    }

    canHandleScope(scope: PreferenceScope): boolean {
        return true;
    }

    getConfigUri(resourceUri: string | undefined = this.ensureResourceUri(), sectionName?: string): URI | undefined {
        return this.delegate?.getConfigUri && this.delegate?.getConfigUri(resourceUri, sectionName);
    }

    getContainingConfigUri(resourceUri: string | undefined = this.ensureResourceUri(), sectionName?: string): URI | undefined {
        return this.delegate?.getContainingConfigUri?.(resourceUri, sectionName);
    }

    protected _delegate: PreferenceProvider | undefined;
    protected get delegate(): PreferenceProvider | undefined {
        return this._delegate;
    }

    protected ensureDelegateUpToDate(): void {
        const delegate = this.createDelegate();
        if (this._delegate !== delegate) {
            this.toDisposeOnEnsureDelegateUpToDate.dispose();
            this.disposables.push(this.toDisposeOnEnsureDelegateUpToDate);

            this._delegate = delegate;

            if (delegate) {
                // If this provider has not yet declared itself ready, it should do so when the new delegate is ready.
                delegate.ready.then(() => this._ready.resolve(), () => { });
            }

            if (delegate instanceof WorkspaceFilePreferenceProvider) {
                this.toDisposeOnEnsureDelegateUpToDate.pushAll([
                    delegate,
                    delegate.onDidPreferencesChanged(changes => this.onDidPreferencesChangedEmitter.fire(changes))
                ]);
            }
        }
    }

    protected createDelegate(): PreferenceProvider | undefined {
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return undefined;
        }
        if (!this.workspaceService.isMultiRootWorkspaceOpened) {
            return this.preferenceProviderProvider(PreferenceScope.Folder);
        }
        if (this._delegate instanceof WorkspaceFilePreferenceProvider && this._delegate.getConfigUri().isEqual(workspace.resource)) {
            return this._delegate;
        }
        return this.workspaceFileProviderFactory({
            workspaceUri: workspace.resource
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

    async setPreference(preferenceName: string, value: any, resourceUri: string | undefined = this.ensureResourceUri()): Promise<boolean> {
        const delegate = this.delegate;
        if (delegate) {
            return delegate.setPreference(preferenceName, value, resourceUri);
        }
        return false;
    }

    getPreferences(resourceUri: string | undefined = this.ensureResourceUri()): JSONObject {
        const delegate = this.delegate;
        return delegate ? delegate.getPreferences(resourceUri) : {};
    }

    protected ensureResourceUri(): string | undefined {
        if (this.workspaceService.workspace && !this.workspaceService.isMultiRootWorkspaceOpened) {
            return this.workspaceService.workspace.resource.toString();
        }
        return undefined;
    }

}
