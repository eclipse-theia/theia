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
import { MutableChatRequestModel, ChatResponseContent } from './chat-model';
import { CodeContentMatcher, MarkdownContentFactory, ResponseContentFactory, ResponseContentMatcher } from './response-content-matcher';

interface Match {
    matcher: ResponseContentMatcher;
    index: number;
    content: string;
    isComplete: boolean;
}

export function parseContents(
    text: string,
    request: MutableChatRequestModel,
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
                result.push(defaultContentFactory(remainingText, request));
            }
            break;
        }
        // We have a match
        // 1. Add preceding text as default content
        if (match.index > 0) {
            const precedingContent = remainingText.substring(0, match.index);
            if (precedingContent.trim().length > 0) {
                result.push(defaultContentFactory(precedingContent, request));
            }
        }
        // 2. Add the matched content object
        if (match.isComplete) {
            // Complete match, use regular content factory
            result.push(match.matcher.contentFactory(match.content, request));
        } else if (match.matcher.incompleteContentFactory) {
            // Incomplete match with an incomplete content factory available
            result.push(match.matcher.incompleteContentFactory(match.content, request));
        } else {
            // Incomplete match but no incomplete content factory available, use default
            result.push(defaultContentFactory(match.content, request));
        }
        // Update currentIndex to the end of the end of the match
        // And continue with the search after the end of the match
        currentIndex += match.index + match.content.length;
    }

    return result;
}

export function findFirstMatch(contentMatchers: ResponseContentMatcher[], text: string): Match | undefined {
    let firstMatch: Match | undefined;
    let firstIncompleteMatch: Match | undefined;

    for (const matcher of contentMatchers) {
        const startMatch = matcher.start.exec(text);
        if (!startMatch) {
            // No start match found, try next matcher.
            continue;
        }
        const endOfStartMatch = startMatch.index + startMatch[0].length;
        if (endOfStartMatch >= text.length) {
            // There is no text after the start match.
            // This is an incomplete match if the matcher has an incompleteContentFactory
            if (matcher.incompleteContentFactory) {
                const incompleteMatch: Match = {
                    matcher,
                    index: startMatch.index,
                    content: text.substring(startMatch.index),
                    isComplete: false
                };
                if (!firstIncompleteMatch || incompleteMatch.index < firstIncompleteMatch.index) {
                    firstIncompleteMatch = incompleteMatch;
                }
            }
            continue;
        }

        const remainingTextAfterStartMatch = text.substring(endOfStartMatch);
        const endMatch = matcher.end.exec(remainingTextAfterStartMatch);

        if (!endMatch) {
            // No end match found, this is an incomplete match
            if (matcher.incompleteContentFactory) {
                const incompleteMatch: Match = {
                    matcher,
                    index: startMatch.index,
                    content: text.substring(startMatch.index),
                    isComplete: false
                };
                if (!firstIncompleteMatch || incompleteMatch.index < firstIncompleteMatch.index) {
                    firstIncompleteMatch = incompleteMatch;
                }
            }
            continue;
        }

        // Found start and end match.
        // Record the full match, if it is the earliest found so far.
        const index = startMatch.index;
        const contentEnd = index + startMatch[0].length + endMatch.index + endMatch[0].length;
        const content = text.substring(index, contentEnd);
        const completeMatch: Match = { matcher, index, content, isComplete: true };

        if (!firstMatch || index < firstMatch.index) {
            firstMatch = completeMatch;
        }
    }

    // If we found a complete match, return it
    if (firstMatch) {
        return firstMatch;
    }

    // Otherwise, return the first incomplete match if one exists
    return firstIncompleteMatch;
}

