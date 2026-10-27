// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { Emitter, Event } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PreferenceInspection, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';

/**
 * The scopes an untrusted workspace controls. Reads leave them out while the workspace is untrusted.
 */
const UNTRUSTED_SCOPES: readonly PreferenceScope[] = [PreferenceScope.Workspace, PreferenceScope.Folder];

/**
 * Helper for reading AI preferences that must ignore workspace/folder scopes
 * when the current workspace is not trusted.
 *
 * Writes should continue to go through `PreferenceService` directly; trust only
 * affects reads.
 *
 * @internal This is an implementation detail of {@link AiConfigurationService}. AI configuration
 * consumers should go through `AiConfigurationService` rather than injecting this reader directly.
 */
@injectable()
export class TrustAwarePreferenceReader {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(WorkspaceTrustService)
    protected readonly trust: WorkspaceTrustService;

    /**
     * Cached trust flag updated via `onDidChangeWorkspaceTrust`. Defaults to
     * `false` (fail closed): until the initial trust state has resolved, reads
     * leave out the workspace and folder scopes. Asynchronous callers should
     * `await ready` before their first read.
     */
    protected trusted = false;

    protected readonly _ready = new Deferred<void>();

    /**
     * Resolves once the initial workspace trust state has been resolved.
     * Callers that need a deterministic trust state before their first read can
     * await this promise.
     */
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    protected readonly onDidChangeTrustEmitter = new Emitter<boolean>();
    readonly onDidChangeTrust: Event<boolean> = this.onDidChangeTrustEmitter.event;

    @postConstruct()
    protected init(): void {
        let initialized = false;

        this.trust.onDidChangeWorkspaceTrust(t => {
            if (!initialized) {
                initialized = true;
                this.trusted = t;
                this._ready.resolve();
                return;
            }
            if (this.trusted === t) {
                return;
            }
            this.trusted = t;
            this.onDidChangeTrustEmitter.fire(t);
        });

        this.trust.getWorkspaceTrust().then(t => {
            if (initialized) {
                return;
            }
            initialized = true;
            this.trusted = t;
            this._ready.resolve();
        }, err => {
            if (initialized) {
                return;
            }
            initialized = true;
            this._ready.reject(err);
        });
    }

    /**
     * Reads the preference like `PreferenceService.get`, leaving out the workspace and folder scopes
     * when the workspace is untrusted.
     */
    get<T>(preferenceName: string, fallback?: T, resourceUri?: string): T | undefined {
        if (this.trusted) {
            return this.preferences.get<T>(preferenceName, fallback, resourceUri);
        }
        return this.preferences.get<T>(preferenceName, fallback, resourceUri, { excludeScopes: UNTRUSTED_SCOPES });
    }

    /**
     * Narrows a raw {@link PreferenceInspection} according to workspace trust: when the workspace is
     * untrusted the folder and workspace scope values are dropped, the same scopes {@link get} leaves out
     * (failing closed until the trust state resolves). A trusted inspection is returned unchanged.
     */
    suppressUntrusted<T extends JSONValue>(inspection: PreferenceInspection<T>): PreferenceInspection<T> {
        if (this.trusted) {
            return inspection;
        }
        return { ...inspection, workspaceValue: undefined, workspaceFolderValue: undefined };
    }
}
