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

export interface ChangeOperation {
    operation: 'replace' | 'insertBefore' | 'insertAtEndOfFile' | 'create_file'; // Valid operations
    anchor?: string; // Text to find as the anchor for the operation (used in replace/insertBefore)
    newContent: string; // Content to insert, replace, or write for create_file
}

export class ContentChangeApplier {
    applyChangesToContent(content: string, changes: ChangeOperation[]): string {
        let updatedContent = content;

        for (const operation of changes) {
            switch (operation.operation) {
                case 'replace':
                    if (!operation.anchor) {
                        throw new Error('Anchor is required for replace operation.');
                    }
                    const replaceIndex = updatedContent.indexOf(operation.anchor);
                    if (replaceIndex === -1) {
                        throw new Error(`Anchor not found: "${operation.anchor}"`);
                    }
                    updatedContent = updatedContent.replace(operation.anchor, operation.newContent);
                    break;

                case 'insertBefore':
                    if (!operation.anchor) {
                        throw new Error('Anchor is required for insertBefore operation.');
                    }
                    const insertIndex = updatedContent.indexOf(operation.anchor);
                    if (insertIndex === -1) {
                        throw new Error(`Anchor not found: "${operation.anchor}"`);
                    }
                    updatedContent = updatedContent.replace(operation.anchor, `${operation.newContent}${operation.anchor}`);
                    break;

                case 'insertAtEndOfFile':
                    updatedContent += operation.newContent;
                    break;

                case 'create_file':
                    if (content) {
                        throw new Error(
                            'Cannot perform create_file operation on an existing file. Ensure the file is empty or does not exist.'
                        );
                    }
                    updatedContent = operation.newContent;
                    break;

                default:
                    throw new Error(`Unsupported operation: ${operation.operation}`);
            }
        }

        return updatedContent;
    }
}
