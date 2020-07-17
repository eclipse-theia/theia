# API Management

> The guidance below is for the code of the Theia framework only. End products will get better development experience by using private visibility.


- [**Stability**](#stability)
  - [**Experimental**](#experimental)
  - [**Stable**](#stable)
- [**Finalization**](#finalization)
- [**Deprecation**](#deprecation)

Theia is a framework embracing openness, extensibility, and customizability as much as possible:
- API defaults to public visibility for clients.
- API defaults to protected for extenders.
- Language constructions prohibiting runtime access to internals are never used.

Usually, the version management is built around API visibility.
Particularly, when a public API is broken a new major release is required.


Since all APIs are more or less public, following the conventional approach is not practicable for Theia.
It will slow down API innovation, accumulate technical debt or require many major releases.

Instead, we demand a major release only if a _stable_ API is broken.
Breaking an _experimental_ API is allowed in a minor release.

## Stability

Conceptually, an API consists of all assumptions adopters depend on to make use or extend Theia.
A stable API is based on assumptions that are not subject to change.
It does not matter whether an API is public or internal, or whether it is used a lot or never.

> For instance, the language server protocol (LSP) depends on such data types like URIs and positions
since they don't change from language to language. It ensures its stability.

API stability is indicated explicitly by adding `@experimental` or `@stable` js-doc tags.

The explicit stability tag should be accompanied by `@since` tag indicating when API was added.
The `@stable` tag should mention since which version an API was finalized.

An API without a stability tag is considered to be experimental and does not require `@since` tag.

```ts
/**
 * One does not need any annotations while working on experimental APIs.
 */
export interface ExperimentalInterface {
}

/**
 * @since 0.1.0
 * @stable since 1.0.0
 */
export interface StableInterface {

    /**
     * The same as `StableInterface`.
     */
    stableMethod(): void;

    /**
     * Adding new API to stable API should be explicit.
     *
     * @since 1.1.0
     * @experimental
     */
    experimentalMethod(): void;

}

```

### Experimental

- All new APIs should always be added as **experimental** since it's almost impossible to get [stable API](#stable) right the first time.
- Experimental APIs don't require the stability tag, but if a new member is added to [stable API](#stable) then it should be explicitly annotated.
- Experimental APIs don't require extensive documentation. It does not mean that one should not document not obvious parts.
- Experimental APIs don't follow [semver](https://semver.org/#spec-item-8) semantic.
- Experimental APIs could be changed or removed without [the deprecation cycle](#deprecation) if they were not widely adopted.
- Adoption should be measured by the number of internal clients or based on the feedback of Theia contributors and committers.

### Stable

- [Experimental APIs](#experimental) can be graduated to `stable` via [the finalization cycle](#finalization).
- Stable APIs should be based on design decisions that are not likely to change.
- Stable APIs should have sufficient adoption.
- Stable APIs should have proper documentation.
- Stable APIs must follow [semver](https://semver.org/#spec-item-8) semantic.
- They can be changed only in a backward-compatible fashion.
- They can be removed only via [the deprecation cycle](#deprecation).

## Finalization

API finalization should be requested via GitHub issues with `api-finalization` label.
Such request should be resolved via a pull request following to [PR guidelines](https://github.com/eclipse-theia/theia/blob/master/doc/pull-requests.md#pull-requests).

Finalization implies a review of the adoption, stability, and documentation of APIs.
One cannot judge stability without gaining enough experience
and provide stable documentation without API stability in the first place.

If there is not enough adoption, then finalization should be postponed.
If it does not get adopted later, it should be considered to move APIs
from the framework to another repository managed by requesting adopters.

> Why? Consider the case if the LSP would have a feature that can be supported only by one tool.
It is reasonable to move such a feature to a tool specific LSP extension
instead of bloating the protocol. The same applies to the framework:
If API is added and used only by one adopter, then such API has to be moved to the adopter.
It ensures control of API for such adopters and reduces the API surface of the framework.

If APIs are based on design decisions that are subject to change, then
one could postpone finalization before such decisions are resolved.

> Why? Some design decisions are only temporarily subject to change, for instance,
which layout framework should be used. After it is resolved,
such a design decision becomes fundamental, cannot be changed, and can be adopted.

If it is not possible, then APIs should be refactored to hide such assumptions.

> Why? Some design decisions are changeable by nature, for instance, for the LSP,
kind of symbols of a concrete language. In such a case,
API should be changed to operate abstract symbol data type to hide concrete symbols.

If sufficient adoption and API stability are established,
documentation should be reviewed and completed.

## Deprecation

API deprecation is indicated by adding `@deprecated` js-doc tag.
The deprecation tag should mention, since which version it is deprecated, explain why and what should be used instead.

```ts
/**
 * @since 0.1.0
 * @stable since 1.0.0
 * @deprecated since 1.1.0 - because that and that, use that instead
 */
export interface DeprecatedStableInterface {

}
```

Deprecated [stable API](#stable) can be removed in one of the next *major* releases

Deprecated [experimental API](#experimental) can be removed in one of the next *minor* releases

Breaking changes should be documented in [CHANGELOG](../CHANGELOG.md). Each breaking change should be justified to adopters
and guide what should be done instead.
