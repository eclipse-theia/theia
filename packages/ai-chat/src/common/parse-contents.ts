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
import { ChatResponseContent } from './chat-model';
import { CodeContentMatcher, MarkdownContentFactory, ResponseContentFactory, ResponseContentMatcher } from './response-content-matcher';

interface Match {
    matcher: ResponseContentMatcher;
    index: number;
    content: string;
}

export function parseContents(
    text: string,
    contentMatchers: ResponseContentMatcher[] = [CodeContentMatcher],
    defaultContentFactory: ResponseContentFactory = MarkdownContentFactory
): ChatResponseContent[] {
    const result: ChatResponseContent[] = [];

    let currentIndex = 0;
    while (currentIndex < text.length) {
        const remainingText = text.substring(currentIndex);
        const match = findFirstMatch(contentMatchers, remainingText);
        if (!match) {
            // Add the remaining text as default content
            if (remainingText.length > 0) {
                result.push(defaultContentFactory(remainingText));
            }
            break;
        }
        // We have a match
        // 1. Add preceding text as default content
        if (match.index > 0) {
            const precedingContent = remainingText.substring(0, match.index);
            if (precedingContent.trim().length > 0) {
                result.push(defaultContentFactory(precedingContent));
            }
        }
        // 2. Add the matched content object
        result.push(match.matcher.contentFactory(match.content));
        // Update currentIndex to the end of the end of the match
        // And continue with the search after the end of the match
        currentIndex += match.index + match.content.length;
    }

    return result;
}

export function findFirstMatch(contentMatchers: ResponseContentMatcher[], text: string): Match | undefined {
    let firstMatch: { matcher: ResponseContentMatcher, index: number, content: string } | undefined;
    for (const matcher of contentMatchers) {
        const startMatch = matcher.start.exec(text);
        if (!startMatch) {
            // No start match found, try next matcher.
            continue;
        }
        const endOfStartMatch = startMatch.index + startMatch[0].length;
        if (endOfStartMatch >= text.length) {
            // There is no text after the start match.
            // No need to search for the end match yet, try next matcher.
            continue;
        }
        const remainingTextAfterStartMatch = text.substring(endOfStartMatch);
        const endMatch = matcher.end.exec(remainingTextAfterStartMatch);
        if (!endMatch) {
            // No end match found, try next matcher.
            continue;
        }
        // Found start and end match.
        // Record the full match, if it is the earliest found so far.
        const index = startMatch.index;
        const contentEnd = index + startMatch[0].length + endMatch.index + endMatch[0].length;
        const content = text.substring(index, contentEnd);
        if (!firstMatch || index < firstMatch.index) {
            firstMatch = { matcher, index, content };
        }
    }
    return firstMatch;
}

