// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { FILE_VARIABLE } from '@theia/ai-core/lib/browser/file-variable-contribution';
import { IMAGE_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/common/image-context-variable';
import { URI, generateUuid, nls } from '@theia/core';
import { fileToStream } from '@theia/core/lib/common/stream';
import { FileUploadService } from '@theia/filesystem/lib/common/upload/file-upload';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    buildPendingComposerContextArg,
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import { isImageAttachmentFileName } from '../common/qaap-sticky-composer-attachment-utils';
import {
    createImageContextFromDeviceFile,
} from '../common/qaap-mobile-composer-device-attach';

export {
    blobToBase64,
    createImageContextFromDeviceFile,
} from '../common/qaap-mobile-composer-device-attach';

export interface MobileComposerAttachHandlers {
    appendOptimistic(entry: StickyComposerContextEntry): void;
    finalizeOptimistic(id: string, request: AIVariableResolutionRequest): void;
    removeOptimistic(id: string): void;
}

export interface MobileComposerDeviceAttachServices {
    readonly fileUploadService: FileUploadService;
    readonly fileService: FileService;
    readonly workspaceService: WorkspaceService;
}

export function pickFilesFromDevice(options: {
    accept?: string;
    multiple?: boolean;
}): Promise<File[]> {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = options.multiple ?? true;
        if (options.accept) {
            input.accept = options.accept;
        }
        input.style.display = 'none';
        document.body.append(input);

        const finish = (files: File[]): void => {
            input.remove();
            resolve(files);
        };

        input.addEventListener('change', () => {
            finish(input.files ? Array.from(input.files) : []);
        });

        input.click();
    });
}

async function uploadDeviceFileToWorkspace(
    file: File,
    root: URI,
    fileService: FileService,
    workspaceService: WorkspaceService,
): Promise<AIVariableResolutionRequest | undefined> {
    const targetUri = root.resolve(file.name);
    if (await fileService.exists(targetUri)) {
        await fileService.delete(targetUri);
    }
    await fileService.writeFile(targetUri, fileToStream(file));
    const wsPath = await workspaceService.getWorkspaceRelativePath(targetUri);
    if (!wsPath) {
        return undefined;
    }
    return { variable: FILE_VARIABLE, arg: wsPath };
}

export async function createFileContextFromDeviceFiles(
    files: readonly File[],
    fileUploadService: FileUploadService,
    workspaceService: WorkspaceService,
    fileService?: FileService,
): Promise<AIVariableResolutionRequest[]> {
    if (files.length === 0) {
        return [];
    }
    const root = workspaceService.tryGetRoots()[0]?.resource;
    if (!root) {
        throw new Error(nls.localize(
            'qaap/mobileProjects/stickyComposerAttachNoWorkspace',
            'Open a workspace before attaching files from this device.',
        ));
    }

    if (fileService) {
        const requests: AIVariableResolutionRequest[] = [];
        for (const file of files) {
            const request = await uploadDeviceFileToWorkspace(file, root, fileService, workspaceService);
            if (request) {
                requests.push(request);
            }
        }
        return requests;
    }

    const formData = new FormData();
    for (const file of files) {
        formData.append('upload', file);
    }
    const result = await fileUploadService.upload(root, { source: formData });
    const requests: AIVariableResolutionRequest[] = [];
    for (const uriStr of result.uploaded) {
        const wsPath = await workspaceService.getWorkspaceRelativePath(new URI(uriStr));
        if (wsPath) {
            requests.push({ variable: FILE_VARIABLE, arg: wsPath });
        }
    }
    return requests;
}

function createPendingImageEntry(file: File): StickyComposerContextEntry {
    const id = generateUuid();
    return {
        id,
        pending: true,
        displayName: file.name || nls.localize('qaap/mobileProjects/stickyComposerAttachmentImage', 'Image'),
        localPreviewSrc: URL.createObjectURL(file),
        request: {
            variable: IMAGE_CONTEXT_VARIABLE,
            arg: buildPendingComposerContextArg(id),
        },
    };
}

function createPendingFileEntry(file: File): StickyComposerContextEntry {
    const id = generateUuid();
    const isImage = isImageAttachmentFileName(file.name);
    return {
        id,
        pending: true,
        displayName: file.name,
        localPreviewSrc: isImage ? URL.createObjectURL(file) : undefined,
        request: {
            variable: isImage ? IMAGE_CONTEXT_VARIABLE : FILE_VARIABLE,
            arg: buildPendingComposerContextArg(id),
        },
    };
}

export function attachDeviceImagesOptimistic(
    files: readonly File[],
    handlers: MobileComposerAttachHandlers,
): void {
    for (const file of files) {
        const entry = createPendingImageEntry(file);
        handlers.appendOptimistic(entry);
        void createImageContextFromDeviceFile(file)
            .then(request => handlers.finalizeOptimistic(entry.id, request))
            .catch(() => handlers.removeOptimistic(entry.id));
    }
}

export function attachDeviceFilesOptimistic(
    files: readonly File[],
    services: MobileComposerDeviceAttachServices,
    handlers: MobileComposerAttachHandlers,
): void {
    const root = services.workspaceService.tryGetRoots()[0]?.resource;
    if (!root) {
        throw new Error(nls.localize(
            'qaap/mobileProjects/stickyComposerAttachNoWorkspace',
            'Open a workspace before attaching files from this device.',
        ));
    }

    for (const file of files) {
        const entry = createPendingFileEntry(file);
        handlers.appendOptimistic(entry);

        if (isImageAttachmentFileName(file.name)) {
            void createImageContextFromDeviceFile(file)
                .then(request => handlers.finalizeOptimistic(entry.id, request))
                .catch(() => handlers.removeOptimistic(entry.id));
            continue;
        }

        void uploadDeviceFileToWorkspace(file, root, services.fileService, services.workspaceService)
            .then(request => {
                if (request) {
                    handlers.finalizeOptimistic(entry.id, request);
                } else {
                    handlers.removeOptimistic(entry.id);
                }
            })
            .catch(() => handlers.removeOptimistic(entry.id));
    }
}

export async function attachDeviceImagesFromPicker(): Promise<AIVariableResolutionRequest[]> {
    const files = await pickFilesFromDevice({ accept: 'image/*', multiple: true });
    if (files.length === 0) {
        return [];
    }
    return Promise.all(files.map(file => createImageContextFromDeviceFile(file)));
}

export async function attachDeviceFilesFromPicker(
    services: MobileComposerDeviceAttachServices,
): Promise<AIVariableResolutionRequest[]> {
    const files = await pickFilesFromDevice({ multiple: true });
    return createFileContextFromDeviceFiles(
        files,
        services.fileUploadService,
        services.workspaceService,
        services.fileService,
    );
}
