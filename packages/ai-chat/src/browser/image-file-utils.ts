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

import { ILogger, URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

const MIME_TYPES: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

/**
 * Determines the MIME type based on file extension.
 */
export function getMimeTypeFromExtension(filePath: string): string {
    const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    return MIME_TYPES[extension] || 'application/octet-stream';
}

/**
 * Reads a file and converts its content to a base64-encoded string.
 */
export async function fileToBase64(uri: URI, fileService: FileService, logger: ILogger): Promise<string> {
    try {
        const fileContent = await fileService.readFile(uri);
        const uint8Array = new Uint8Array(fileContent.value.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    } catch (error) {
        logger.error('Error reading file content:', error);
        return '';
    }
}
