// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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

import { z } from 'zod';

/**
 * Common Zod schemas for MCP tool arguments
 */
export const MCPSchemas = {
    /**
     * Schema for command ID validation
     */
    CommandId: {
        commandId: z.string().min(1, 'Command ID cannot be empty')
    },

    /**
     * Schema for command execution with arguments
     */
    CommandExecution: {
        commandId: z.string().min(1, 'Command ID cannot be empty'),
        args: z.array(z.unknown()).optional()
    },

    /**
     * Schema for file path validation
     */
    FilePath: {
        path: z.string().min(1, 'File path cannot be empty')
    },

    /**
     * Schema for directory listing
     */
    DirectoryListing: {
    },

    /**
     * Schema for file analysis
     */
    FileAnalysis: {
        path: z.string().min(1, 'File path cannot be empty'),
        analysisType: z.enum(['syntax', 'semantic', 'structure', 'dependencies']).optional()
    }
};

/**
 * Type definitions for the schemas above
 */
export type CommandId = z.infer<z.ZodObject<typeof MCPSchemas.CommandId>>;
export type CommandExecution = z.infer<z.ZodObject<typeof MCPSchemas.CommandExecution>>;
export type FilePath = z.infer<z.ZodObject<typeof MCPSchemas.FilePath>>;
export type DirectoryListing = z.infer<z.ZodObject<typeof MCPSchemas.DirectoryListing>>;
export type FileAnalysis = z.infer<z.ZodObject<typeof MCPSchemas.FileAnalysis>>;
