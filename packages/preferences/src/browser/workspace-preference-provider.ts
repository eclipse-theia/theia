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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, postConstruct, named } from '@theia/core/shared/inversify';
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

    protected readonly toDisposeOnEnsureDelegateUpToDate = new DisposableCollection();

    @postConstruct()
    protected async init(): Promise<void> {
        this.workspaceService.ready.then(() => {
            // If there is no workspace after the workspace service is initialized, then no more work is needed for this provider to be ready.
            // If there is a workspace, then we wait for the new delegate to be ready before declaring this provider ready.
            if (!this.workspaceService.workspace) {
                this._ready.resolve();
            }
        });
        this.workspaceService.onWorkspaceLocationChanged(() => this.ensureDelegateUpToDate());
        this.workspaceService.onWorkspaceChanged(() => this.ensureDelegateUpToDate());
    }

    override getConfigUri(resourceUri: string | undefined = this.ensureResourceUri(), sectionName?: string): URI | undefined {
        return this.delegate?.getConfigUri(resourceUri, sectionName);
    }

    override getContainingConfigUri(resourceUri: string | undefined = this.ensureResourceUri(), sectionName?: string): URI | undefined {
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
            this.toDispose.push(this.toDisposeOnEnsureDelegateUpToDate);

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
            return this.folderPreferenceProvider;
        }
        if (this._delegate instanceof WorkspaceFilePreferenceProvider && this._delegate.getConfigUri().isEqual(workspace.resource)) {
            return this._delegate;
        }
        return this.workspaceFileProviderFactory({
            workspaceUri: workspace.resource
        });
    }

    override get<T>(preferenceName: string, resourceUri: string | undefined = this.ensureResourceUri()): T | undefined {
        const delegate = this.delegate;
        return delegate ? delegate.get<T>(preferenceName, resourceUri) : undefined;
    }

    override resolve<T>(preferenceName: string, resourceUri: string | undefined = this.ensureResourceUri()): { value?: T, configUri?: URI } {
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
        if (this.workspaceService.workspace && !this.workspaceService.isMultiRootWorkspaceOpened) {
            return this.workspaceService.workspace.resource.toString();
        }
        return undefined;
    }

}
