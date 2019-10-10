/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/**
 * The C language ID.
 */
export const C_LANGUAGE_ID = 'c';
/**
 * The C++ language ID.
 */
export const CPP_LANGUAGE_ID = 'cpp';
/**
 * The human-readable name for the C/C++ language server.
 */
export const CPP_LANGUAGE_NAME = 'C/C++';

// These should become preferences eventually and be forwarded to the server.

/**
 * The C/C++ header file extensions.
 */
export const HEADER_FILE_EXTENSIONS = ['h', 'hxx', 'hh', 'hpp', 'inc'];
/**
 * The C/C++ source file extensions.
 */
export const SOURCE_FILE_EXTENSIONS = ['c', 'cxx', 'C', 'c++', 'cc', 'cpp', 'cl'];
/**
 * The list of file extensions important to the C/C++ language server.
 */
export const HEADER_AND_SOURCE_FILE_EXTENSIONS = SOURCE_FILE_EXTENSIONS.concat(HEADER_FILE_EXTENSIONS);

export const CLANGD_EXECUTABLE_DEFAULT = 'clangd';

/**
 * Representation of the C/C++ start parameters.
 */
export interface CppStartParameters {
    /**
     * The path to the clangd executable.
     */
    clangdExecutable: string;
    /**
     * The clangd command line arguments.
     */
    clangdArgs: string;
    /**
     * Determines whether to turn on clang-tidy linting.
     */
    clangTidy?: boolean;
    /**
     * The list of clang-tidy checks to take into consideration.
     */
    clangTidyChecks?: string;
}
