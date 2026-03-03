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

import { injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core';
import { ImageContextVariable } from '../common/image-context-variable';

/**
 * Data stored for a pending image attachment.
 */
export interface PendingImageData {
    /** The parsed image variable data including base64 content. */
    imageVariable: ImageContextVariable;
    /** The full argument string (JSON) for the image variable. */
    fullArg: string;
}

export const PendingImageRegistry = Symbol('PendingImageRegistry');

/**
 * Service for registering and resolving pending image attachments.
 *
 * When images are pasted or dropped into the chat input, they are registered here
 * with a short ID. The short ID can be used in the text input (e.g., #imageContext:img_1)
 * while the actual base64 data is stored in this registry.
 *
 * This allows:
 * - The hover provider to look up image data for previews
 * - The variable resolver to expand short IDs to full image data when sending
 * - Proper scoping by model ID so multiple chat inputs don't interfere
 */
export interface PendingImageRegistry {
    /**
     * Generate a unique short ID for a pending image based on a base name.
     * For dropped files, use the basename (e.g., "photo.png").
     * For pasted images, use "pasted_image".
     * If duplicates exist, a numeric suffix is added (e.g., "photo_2.png", "pasted_image_2").
     * @param baseName The base name to use for the short ID
     * @param scopeUri The scope URI to check for duplicates
     * @returns A unique short ID within the given scope
     */
    generateShortId(baseName: string, scopeUri: string): string;

    /**
     * Register a pending image for a given scope (typically editor URI).
     * @param scopeUri The URI identifying the scope (e.g., editor URI)
     * @param shortId The short ID to use for this image (e.g., "img_1")
     * @param imageVariable The parsed image variable data
     * @param fullArg The full JSON argument string
     * @returns A disposable that unregisters this specific image
     */
    register(scopeUri: string, shortId: string, imageVariable: ImageContextVariable, fullArg: string): Disposable;

    /**
     * Get pending image data by scope and short ID.
     * @param scopeUri The URI identifying the scope
     * @param shortId The short ID of the image
     * @returns The image data if found, undefined otherwise
     */
    get(scopeUri: string, shortId: string): PendingImageData | undefined;

    /**
     * Get all pending images for a scope.
     * @param scopeUri The URI identifying the scope
     * @returns A map of short IDs to image data
     */
    getAllForScope(scopeUri: string): ReadonlyMap<string, PendingImageData>;

    /**
     * Clear all pending images for a scope.
     * Called after a message is sent.
     * @param scopeUri The URI identifying the scope
     */
    clearScope(scopeUri: string): void;

    /**
     * Check if a short ID looks like a pending image reference.
     * @param arg The argument string to check
     * @returns True if it matches the short ID pattern
     */
    isShortId(arg: string): boolean;

    /**
     * Get pending image data by short ID only (global fallback).
     * Use this when scope is not available (e.g., during variable resolution in parser).
     * @param shortId The short ID of the image
     * @returns The image data if found, undefined otherwise
     */
    getByShortId(shortId: string): PendingImageData | undefined;

    /**
     * Register a mapping from editor URI to chat model ID.
     * This allows the hover provider to look up the model ID from the editor URI.
     * @param editorUri The editor URI
     * @param modelId The chat model ID
     * @returns A disposable that unregisters the mapping
     */
    registerEditorMapping(editorUri: string, modelId: string): Disposable;

    /**
     * Get the model ID for an editor URI.
     * @param editorUri The editor URI
     * @returns The model ID if registered, undefined otherwise
     */
    getModelIdForEditor(editorUri: string): string | undefined;

    /**
     * Construct a scope URI from a chat model ID.
     * @param modelId The chat model ID
     * @returns The scope URI that would be used for this model
     */
    getScopeUriForModel(modelId: string): string;
}

@injectable()
export class DefaultPendingImageRegistry implements PendingImageRegistry {
    /** Map of scope URI -> (short ID -> image data) */
    protected readonly registry = new Map<string, Map<string, PendingImageData>>();

    /** Global map of short ID -> image data for fallback lookups when scope is unavailable */
    protected readonly globalShortIdMap = new Map<string, PendingImageData>();

    /** Map of editor URI -> model ID for hover provider lookups */
    protected readonly editorToModelMap = new Map<string, string>();

    generateShortId(baseName: string, scopeUri: string): string {
        const scopeMap = this.registry.get(scopeUri);
        if (!scopeMap || !scopeMap.has(baseName)) {
            return baseName;
        }

        // Find a unique name by adding numeric suffix
        let counter = 2;
        let candidate: string;

        // Handle file extensions: "photo.png" -> "photo_2.png"
        const dotIndex = baseName.lastIndexOf('.');
        if (dotIndex > 0) {
            const nameWithoutExt = baseName.substring(0, dotIndex);
            const ext = baseName.substring(dotIndex);
            do {
                candidate = `${nameWithoutExt}_${counter}${ext}`;
                counter++;
            } while (scopeMap.has(candidate));
        } else {
            // No extension: "pasted_image" -> "pasted_image_2"
            do {
                candidate = `${baseName}_${counter}`;
                counter++;
            } while (scopeMap.has(candidate));
        }

        return candidate;
    }

    register(scopeUri: string, shortId: string, imageVariable: ImageContextVariable, fullArg: string): Disposable {
        const data: PendingImageData = { imageVariable, fullArg };

        // Register in scoped map
        let scopeMap = this.registry.get(scopeUri);
        if (!scopeMap) {
            scopeMap = new Map();
            this.registry.set(scopeUri, scopeMap);
        }
        scopeMap.set(shortId, data);

        // Also register in global map for fallback lookups
        this.globalShortIdMap.set(shortId, data);

        return Disposable.create(() => {
            const map = this.registry.get(scopeUri);
            if (map) {
                map.delete(shortId);
                if (map.size === 0) {
                    this.registry.delete(scopeUri);
                }
            }
            this.globalShortIdMap.delete(shortId);
        });
    }

    get(scopeUri: string, shortId: string): PendingImageData | undefined {
        return this.registry.get(scopeUri)?.get(shortId);
    }

    getByShortId(shortId: string): PendingImageData | undefined {
        return this.globalShortIdMap.get(shortId);
    }

    getAllForScope(scopeUri: string): ReadonlyMap<string, PendingImageData> {
        return this.registry.get(scopeUri) ?? new Map();
    }

    clearScope(scopeUri: string): void {
        // Also clear from global map
        const scopeMap = this.registry.get(scopeUri);
        if (scopeMap) {
            for (const shortId of scopeMap.keys()) {
                this.globalShortIdMap.delete(shortId);
            }
        }
        this.registry.delete(scopeUri);
    }

    isShortId(arg: string): boolean {
        // Short IDs are anything that doesn't look like JSON (doesn't start with {)
        return !!arg && !arg.startsWith('{');
    }

    registerEditorMapping(editorUri: string, modelId: string): Disposable {
        this.editorToModelMap.set(editorUri, modelId);
        return Disposable.create(() => {
            this.editorToModelMap.delete(editorUri);
        });
    }

    getModelIdForEditor(editorUri: string): string | undefined {
        return this.editorToModelMap.get(editorUri);
    }

    getScopeUriForModel(modelId: string): string {
        return `pending-images:/${modelId}`;
    }
}
