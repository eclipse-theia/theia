// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { ChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { ChangeSetService } from './changeset-functions';
import { ChangeSetResponseContent } from './codheia-agent';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';

@injectable()
export class ChangeSetPartRenderer implements ChatResponsePartRenderer<ChangeSetResponseContent> {
    @inject(ChangeSetService) private readonly changeSetService: ChangeSetService;

    canHandle(response: ChatResponseContent): number {
        return response instanceof ChangeSetResponseContent ? 10 : -1;
    }

    render(response: ChangeSetResponseContent): ReactNode {
        const changeSetUUID = response.changeSetUUID;

        let fileChanges;
        try {
            const files = this.changeSetService.listChangedFiles(changeSetUUID);
            fileChanges = files.map(file => {
                const retrievedChanges = this.changeSetService.getFileChanges(changeSetUUID, file);
                return {
                    filePath: file,
                    changes: retrievedChanges.map(change => ({
                        operation: change.operation,
                        anchor: change.anchor,
                        newContent: change.newContent
                    }))
                };
            });
        } catch (error) {
            console.error('Failed to fetch change set details:', error);
            return <div className="changeset-part-renderer-error">Failed to load change set details.</div>;
        }

        return (
            <div className="changeset-part-renderer">
                {fileChanges.map(fileChange => (
                    <div key={fileChange.filePath}>
                        <h3>{fileChange.filePath}</h3>
                        <ul>
                            {fileChange.changes.map((change, index) => (
                                <li key={index}>
                                    <strong>Operation:</strong> {change.operation}<br />
                                    <strong>Anchor:</strong> {change.anchor ?? 'No Anchor'}<br />
                                    <strong>New Content:</strong> {change.newContent}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        );
    }
}
