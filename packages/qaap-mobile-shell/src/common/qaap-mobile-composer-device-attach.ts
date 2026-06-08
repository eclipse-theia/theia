// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';

export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export async function createImageContextFromDeviceFile(file: File): Promise<AIVariableResolutionRequest> {
    const base64Data = await blobToBase64(file);
    return ImageContextVariable.createRequest({
        data: base64Data,
        name: file.name || `image-${Date.now()}.png`,
        mimeType: file.type || 'application/octet-stream',
    });
}
