/*
 * Copyright (C) 2024 EclipseSource GmbH.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 */
import {
    MutableChatRequestModel,
    ChatResponseContent,
    CodeChatResponseContentImpl,
    MarkdownChatResponseContentImpl
} from './chat-model';
import { injectable } from '@theia/core/shared/inversify';

export type ResponseContentFactory = (content: string, request: MutableChatRequestModel) => ChatResponseContent;

export const MarkdownContentFactory: ResponseContentFactory = (content: string, request: MutableChatRequestModel) =>
    new MarkdownChatResponseContentImpl(content);

/**
 * Default response content factory used if no other `ResponseContentMatcher` applies.
 * By default, this factory creates a markdown content object.
 *
 * @see MarkdownChatResponseContentImpl
 */
@injectable()
export class DefaultResponseContentFactory {
    create(content: string, request: MutableChatRequestModel): ChatResponseContent {
        return MarkdownContentFactory(content, request);
    }
}

/**
 * Clients can contribute response content matchers to parse a chat response into specific
 * `ChatResponseContent` instances.
 */
export interface ResponseContentMatcher {
    /** Regular expression for finding the start delimiter. */
    start: RegExp;
    /** Regular expression for finding the start delimiter. */
    end: RegExp;
    /**
     * The factory creating a response content from the matching content,
     * from start index to end index of the match (including delimiters).
     */
    contentFactory: ResponseContentFactory;
    /**
     * Optional factory for creating a response content when only the start delimiter has been matched,
     * but not yet the end delimiter. Used during streaming to provide better visual feedback.
     * If not provided, the default content factory will be used until the end delimiter is matched.
     */
    incompleteContentFactory?: ResponseContentFactory;
}

export const CodeContentMatcher: ResponseContentMatcher = {
    // Only match when we have the complete first line ending with a newline
    // This ensures we have the full language specification before creating the editor
    start: /^```.*\n/m,
    end: /^```$/m,
    contentFactory: (content: string, request: MutableChatRequestModel) => {
        const language = content.match(/^```(\w+)/)?.[1] || '';
        const code = content.replace(/^```(\w+)?\n|```$/g, '');
        return new CodeChatResponseContentImpl(code.trim(), language);
    },
    incompleteContentFactory: (content: string, request: MutableChatRequestModel) => {
        // By this point, we know we have at least the complete first line with ```
        const firstLine = content.split('\n')[0];
        const language = firstLine.match(/^```(\w+)/)?.[1] || '';

        // Remove the first line to get just the code content
        const code = content.substring(content.indexOf('\n') + 1);

        return new CodeChatResponseContentImpl(code.trim(), language);
    }
};

/**
 * Clients can contribute response content matchers to parse the response content.
 *
 * The default chat user interface will collect all contributed matchers and use them
 * to parse the response into structured content parts (e.g. code blocks, markdown blocks),
 * which are then rendered with a `ChatResponsePartRenderer` registered for the respective
 * content part type.
 *
 * ### Example
 * ```ts
 * bind(ResponseContentMatcherProvider).to(MyResponseContentMatcherProvider);
 * ...
 * @injectable()
 * export class MyResponseContentMatcherProvider implements ResponseContentMatcherProvider {
 *     readonly matchers: ResponseContentMatcher[] = [{
 *       start: /^<command>$/m,
 *       end: /^</command>$/m,
 *       contentFactory: (content: string) => {
 *         const command = content.replace(/^<command>\n|<\/command>$/g, '');
 *         return new MyChatResponseContentImpl(command.trim());
 *       }
 *   }];
 * }
 * ```
 *
 * @see ResponseContentMatcher
 */
export const ResponseContentMatcherProvider = Symbol('ResponseContentMatcherProvider');
export interface ResponseContentMatcherProvider {
    readonly matchers: ResponseContentMatcher[];
}

@injectable()
export class DefaultResponseContentMatcherProvider implements ResponseContentMatcherProvider {
    readonly matchers: ResponseContentMatcher[] = [CodeContentMatcher];
}
