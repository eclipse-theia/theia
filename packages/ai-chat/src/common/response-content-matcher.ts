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
    ChatResponseContent,
    CodeChatResponseContentImpl,
    MarkdownChatResponseContentImpl
} from './chat-model';
import { injectable } from '@theia/core/shared/inversify';

export type ResponseContentFactory = (content: string) => ChatResponseContent;

export const MarkdownContentFactory: ResponseContentFactory = (content: string) =>
    new MarkdownChatResponseContentImpl(content);

/**
 * Default response content factory used if no other `ResponseContentMatcher` applies.
 * By default, this factory creates a markdown content object.
 *
 * @see MarkdownChatResponseContentImpl
 */
@injectable()
export class DefaultResponseContentFactory {
    create(content: string): ChatResponseContent {
        return MarkdownContentFactory(content);
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
}

export const CodeContentMatcher: ResponseContentMatcher = {
    start: /^```.*?$/m,
    end: /^```$/m,
    contentFactory: (content: string) => {
        const language = content.match(/^```(\w+)/)?.[1] || '';
        const code = content.replace(/^```(\w+)\n|```$/g, '');
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
