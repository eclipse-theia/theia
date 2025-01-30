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

import { Resource, ResourceResolver, ResourceSaveOptions, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatService } from '../common';
import { ChangeSetFileElement } from './change-set-file-element';

export const CHANGE_SET_FILE_RESOURCE_SCHEME = 'changeset-file';
const QUERY = 'uri=';

export function createChangeSetFileUri(chatSessionId: string, elementUri: URI): URI {
    return new URI(CHANGE_SET_FILE_RESOURCE_SCHEME + '://' + chatSessionId + '/' + elementUri.path).withQuery(QUERY + encodeURIComponent(elementUri.path.toString()));
}

/**
 * A file resource within a chat's change set can be resolved with the following URI:
 * changeset-file:/<chat-session-id>?uri=<element-uri-without-scheme>
 */
@injectable()
export class ChangeSetFileResourceResolver implements ResourceResolver {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== CHANGE_SET_FILE_RESOURCE_SCHEME) {
            throw new Error('The given uri is not a change set file uri: ' + uri);
        }

        const chatSessionId = uri.authority;
        const session = this.chatService.getSession(chatSessionId);
        if (!session) {
            throw new Error('Chat session not found: ' + chatSessionId);
        }

        const changeSet = session.model.changeSet;
        if (!changeSet) {
            throw new Error('Chat session has no change set: ' + chatSessionId);
        }

        const fileUri = decodeURIComponent(uri.query.toString().replace(QUERY, ''));
        const element = changeSet.getElements().find(e => e.uri.path.toString() === fileUri);
        if (!(element instanceof ChangeSetFileElement)) {
            throw new Error('Change set element not found: ' + fileUri);
        }

        return {
            uri,
            readOnly: false,
            initiallyDirty: true,
            readContents: async () => element.targetState ?? '',
            saveContents: async (content: string, options?: ResourceSaveOptions): Promise<void> => {
                element.accept(content);
            },
            dispose: () => { }
        };
    }

}

