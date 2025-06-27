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

import { injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class CodeCompletionCache {
    private cache: Map<string, CacheEntry>;
    private maxSize = 100;

    constructor() {
        this.cache = new Map<string, CacheEntry>();
    }

    /**
     * Generate a unique cache key for code completion based on the file path, cursor position, and the hashed context (prefix and suffix).
     * The prefix and suffix are hashed to avoid storing large or sensitive content directly in the cache key.
     *
     * @param filePath Path of the current file
     * @param model Monaco text model of the file
     * @param position Current cursor position in the editor
     * @returns Unique cache key as a string
     */
    generateKey(filePath: string, model: monaco.editor.ITextModel, position: monaco.Position): string {
        const lineNumber = position.lineNumber;
        const prefixRange = new monaco.Range(1, 1, position.lineNumber, position.column);
        const prefix = model.getValueInRange(prefixRange);
        const lastLine = model.getLineCount();
        const lastColumn = model.getLineMaxColumn(lastLine);
        const suffixRange = new monaco.Range(position.lineNumber, position.column, lastLine, lastColumn);
        const suffix = model.getValueInRange(suffixRange);
        const key = JSON.stringify({
            filePath,
            lineNumber,
            prefixHash: CodeCompletionCache.hashString(prefix),
            suffixHash: CodeCompletionCache.hashString(suffix)
        });
        return key;
    }

    /**
     * Hash a string using a simple hash algorithm (FNV-1a 32-bit).
     * This is not cryptographically secure but is sufficient for cache key uniqueness.
     * @param str The string to hash
     * @returns The hash as a hex string
     */
    private static hashString(str: string): string {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0;
        }
        return hash.toString(16);
    }

    /**
     * Get a cached completion if available
     * @param key Cache key
     * @returns Cached completion or undefined
     */
    get(key: string): monaco.languages.InlineCompletions | undefined {
        const entry = this.cache.get(key);
        if (entry) {
            // Update the entry's last accessed time
            entry.lastAccessed = Date.now();
            return entry.value;
        }
        return undefined;
    }

    /**
     * Store a completion in the cache
     * @param key Cache key
     * @param value Completion value to cache
     */
    put(key: string, value: monaco.languages.InlineCompletions | undefined): void {
        // If cache is full, remove the least recently used entry
        if (this.cache.size >= this.maxSize) {
            this.removeLeastRecentlyUsed();
        }

        this.cache.set(key, {
            value,
            lastAccessed: Date.now()
        });
    }

    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Remove the least recently used entry from the cache
     */
    private removeLeastRecentlyUsed(): void {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestKey = key;
                oldestTime = entry.lastAccessed;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Set the maximum cache size
     * @param size New maximum cache size
     */
    setMaxSize(size: number): void {
        this.maxSize = size;
        // Trim cache if it exceeds new size
        while (this.cache.size > this.maxSize) {
            this.removeLeastRecentlyUsed();
        }
    }
}

interface CacheEntry {
    value: monaco.languages.InlineCompletions | undefined;
    lastAccessed: number;
}
