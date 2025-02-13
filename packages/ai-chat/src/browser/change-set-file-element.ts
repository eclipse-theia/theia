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

import { MEMORY_TEXT, URI } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChangeSetElement, ChangeSetImpl } from '../common';
import { createChangeSetFileUri } from './change-set-file-resource';
import { ChangeSetFileService } from './change-set-file-service';

export const ChangeSetFileElementFactory = Symbol('ChangeSetFileElementFactory');
export type ChangeSetFileElementFactory = (elementProps: ChangeSetElementArgs) => ChangeSetFileElement;

export const ChangeSetElementArgs = Symbol('ChangeSetElementArgs');
export interface ChangeSetElementArgs extends Partial<ChangeSetElement> {
    /** The URI of the element, expected to be unique within the same change set. */
    uri: URI;
    /** The change set containing this element. */
    changeSet: ChangeSetImpl;
    /** The id of the chat session containing this change set element. */
    chatSessionId: string;
    /**
     * The state of the file after the changes have been applied.
     * If `undefined`, there is no change.
     */
    targetState?: string;
};

@injectable()
export class ChangeSetFileElement implements ChangeSetElement {

    @inject(ChangeSetElementArgs)
    protected readonly elementProps: ChangeSetElementArgs;

    @inject(ChangeSetFileService)
    protected readonly changeSetFileService: ChangeSetFileService;

    protected _state: 'pending' | 'applied' | undefined;

    protected originalContent: string | undefined;

    @postConstruct()
    init(): void {
        this.obtainOriginalContent();
    }

    protected async obtainOriginalContent(): Promise<void> {
        this.originalContent = await this.changeSetFileService.read(this.uri);
    }

    get uri(): URI {
        return this.elementProps.uri;
    }

    get readOnlyUri(): URI {
        return this.elementProps.uri.withScheme(MEMORY_TEXT).withQuery(this.originalContent ?? '');
    }

    get changedUri(): URI {
        return createChangeSetFileUri(this.elementProps.chatSessionId, this.uri);
    }

    get name(): string {
        return this.elementProps.name ?? this.changeSetFileService.getName(this.uri);
    }

    get icon(): string | undefined {
        return this.elementProps.icon ?? this.changeSetFileService.getIcon(this.uri);
    }

    get additionalInfo(): string | undefined {
        return this.changeSetFileService.getAdditionalInfo(this.uri);
    }

    get state(): 'pending' | 'applied' | undefined {
        return this._state ?? this.elementProps.state;
    }

    protected set state(value: 'pending' | 'applied' | undefined) {
        this._state = value;
        this.elementProps.changeSet.notifyChange();
    }

    get type(): 'add' | 'modify' | 'delete' | undefined {
        return this.elementProps.type;
    }

    get data(): { [key: string]: unknown; } | undefined {
        return this.elementProps.data;
    };

    get targetState(): string {
        return this.elementProps.targetState ?? '';
    }

    async open(): Promise<void> {
        this.changeSetFileService.open(this);
    }

    async openChange(): Promise<void> {
        this.changeSetFileService.openDiff(
            this.readOnlyUri,
            this.changedUri
        );
    }

    async apply(contents?: string): Promise<void> {
        if (await this.changeSetFileService.trySave(this.changedUri)) { /** Continue */ } else if (this.type === 'delete') {
            await this.changeSetFileService.delete(this.uri);
            this.state = 'applied';
        } else {
            await this.writeChanges(contents);
        }
        this.changeSetFileService.closeDiffsFor(this.readOnlyUri);
    }

    async writeChanges(contents?: string): Promise<void> {
        await this.changeSetFileService.writeFrom(this.changedUri, this.uri, contents ?? this.targetState);
        this.state = 'applied';
    }

    async revert(): Promise<void> {
        this.state = 'pending';
        if (this.type === 'add') {
            await this.changeSetFileService.delete(this.uri);
        } else if (this.originalContent) {
            await this.changeSetFileService.write(this.uri, this.originalContent);
        }
    }

    dispose(): void {
        this.changeSetFileService.closeDiffsFor(this.readOnlyUri);
    }
}
