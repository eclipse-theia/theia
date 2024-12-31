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
    operation: 'replace' | 'insert_after' | 'insert_before' | 'delete' | 'replace_entire_file' | 'insert_at' | 'create_file';
    find?: string;
    replaceWith?: string;
    insertAfter?: string;
    insertBefore?: string;
    newContent?: string;
    position?: 'start_of_file' | 'end_of_file';
}

export class ContentChangeApplier {
    applyChangesToContent(content: string, changes: ChangeOperation[]): string {
        let updatedContent = content;

        for (const operation of changes) {
            switch (operation.operation) {
                case 'replace':
                    if (operation.find) {
                        const regex = new RegExp(operation.find, 'g');
                        updatedContent = updatedContent.replace(regex, operation.replaceWith || '');
                    }
                    break;
                case 'insert_after':
                    if (operation.find) {
                        updatedContent = updatedContent.replace(
                            new RegExp(`(${operation.find})`, 'g'),
                            `$1${operation.insertAfter || ''}`
                        );
                    }
                    break;
                case 'insert_before':
                    if (operation.find) {
                        updatedContent = updatedContent.replace(
                            new RegExp(`(${operation.find})`, 'g'),
                            `${operation.insertBefore || ''}$1`
                        );
                    }
                    break;
                case 'delete':
                    if (operation.find) {
                        const regex = new RegExp(operation.find, 'g');
                        updatedContent = updatedContent.replace(regex, '');
                    }
                    break;
                case 'replace_entire_file':
                    updatedContent = operation.newContent || '';
                    break;
                case 'insert_at':
                    if (operation.position === 'start_of_file') {
                        updatedContent = (operation.newContent || '') + updatedContent;
                    } else if (operation.position === 'end_of_file') {
                        updatedContent = updatedContent + (operation.newContent || '');
                    }
                    break;
                case 'create_file':
                    if (!content) {
                        updatedContent = operation.newContent || '';
                    }
                    break;
            }
        }

        return updatedContent;
    }
}
