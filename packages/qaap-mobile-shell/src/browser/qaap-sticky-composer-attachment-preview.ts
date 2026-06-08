// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import { getMimeTypeFromExtension } from '@theia/ai-chat/lib/browser/image-file-utils';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { isImageAttachmentFileName } from '../common/qaap-sticky-composer-attachment-utils';
import { resolveTranscriptWorkspaceFileUri } from './qaap-transcript-file-open';

function parseImageContextArg(arg: string | undefined): ImageContextVariable | undefined {
    if (!arg?.trim()) {
        return undefined;
    }
    try {
        return ImageContextVariable.parseArg(arg);
    } catch {
        return undefined;
    }
}

async function readUriAsDataUrl(uri: URI, mimeType: string, fileService: FileService): Promise<string | undefined> {
    try {
        const content = await fileService.readFile(uri);
        const bytes = new Uint8Array(content.value.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]!);
        }
        return `data:${mimeType};base64,${btoa(binary)}`;
    } catch {
        return undefined;
    }
}

/** Resolves a data URL preview for image attachments in the sticky composer. */
export async function resolveStickyComposerAttachmentPreview(
    request: AIVariableResolutionRequest,
    fileService: FileService,
    workspaceService: WorkspaceService,
): Promise<string | undefined> {
    if (ImageContextVariable.isImageContextRequest(request)) {
        const parsed = parseImageContextArg(request.arg);
        if (!parsed) {
            return undefined;
        }
        if (ImageContextVariable.isResolved(parsed)) {
            return `data:${parsed.mimeType};base64,${parsed.data}`;
        }
        if (parsed.wsRelativePath) {
            const uri = resolveTranscriptWorkspaceFileUri(parsed.wsRelativePath, workspaceService);
            const mimeType = parsed.mimeType ?? getMimeTypeFromExtension(parsed.wsRelativePath);
            return readUriAsDataUrl(uri, mimeType, fileService);
        }
        return undefined;
    }

    if (request.variable.name === 'file' && request.arg?.trim()) {
        const path = request.arg.trim();
        const fileName = path.split('/').pop() ?? path;
        if (!isImageAttachmentFileName(fileName)) {
            return undefined;
        }
        const uri = resolveTranscriptWorkspaceFileUri(path, workspaceService);
        const mimeType = getMimeTypeFromExtension(fileName);
        return readUriAsDataUrl(uri, mimeType, fileService);
    }

    return undefined;
}
