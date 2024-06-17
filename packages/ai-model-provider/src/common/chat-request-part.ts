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
export type ChatActor = 'user' | 'ai';

export interface ChatRequestPart {
    actor: ChatActor;
    type: 'text';
    query: string;
}
export const isChatRequestPart = (obj: unknown): obj is ChatRequestPart =>
    !!(obj && typeof obj === 'object' &&
    'type' in obj &&
    typeof (obj as { type: unknown }).type === 'string' &&
    (obj as { type: unknown }).type === 'text' &&
    'query' in obj &&
    typeof (obj as { query: unknown }).query === 'string'
);
