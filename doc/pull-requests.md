# Pull Requests

This document clarifies rules and expectations of contributing and reviewing pull requests.
It is structured as a list of rules which can be referenced on a PR to moderate and drive discussions.
If a rule causes distress during discussions itself, it has to be reviewed on [the dev meeting](https://github.com/eclipse-theia/theia/wiki/Dev-Meetings) and updated.

 - [**Opening a Pull Request**](#opening-a-pull-request)
 - [**Requesting a Review**](#requesting-a-review)
 - [**Review Checklist**](#review-checklist)
 - [**Reviewing**](#reviewing)
 - [**Landing**](#landing)
 - [**Reverting**](#reverting)
 - [**Closing**](#closing)

## Opening a Pull Request

<a name="pr-template"></a>

- [1.](#pr-template) Each PR description has to follow the [PR template](https://github.com/eclipse-theia/theia/blob/master/.github/PULL_REQUEST_TEMPLATE.md)

<a name="design-review"></a>
- [2.](#design-review) A PR can be opened early for the design review before going into the detailed implementation.
  - A request on the design review should be an explicit comment.
  - Such PR should be marked as a draft or with the WIP prefix.

<a name="fixups"></a>
- [3.](#fixups) Changes done _after_ the PR has been opened should be kept in separate commits until the review process is finished. This allows reviewers to re-review only the updated parts of the PR and to determine what needs to be tested again. The "fixup" commits must be squashed before merging in order to keep a clean history.

## Requesting a Review

<a name="review-reqs"></a>
- [1.](#review-reqs) A review can be requested when:
  - [The PR template](#pr-template) is filled in.
  - Changes are thoroughly tested by an author.
  - Changes thoroughly reviewed following the [review checklist](#review-checklist) by an author.
<a name="review-request-gh"></a>
- [2.](#review-request-gh) A review can be requested explicitly [using GitHub](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/requesting-a-pull-request-review).
<a name="review-request-comment"></a>
- [3.](#review-request-comment) A review can be also requested as a comment from any GitHub users.
  - For example to invite the person who originally filed an issue for testing.

## Review Checklist

<a name="checklist-build-and-test"></a>
- [1.](#checklist-build-and-test) The new code is built and tested according to the `How to test` section of a PR description.
<a name="checklist-project-org"></a>
- [2.](#checklist-project-org) The new code is aligned with the [project organization](code-organization.md) and [coding conventions](coding-guidelines.md).
<a name="checklist-breaking-changes"></a>
- [3.](#checklist-breaking-changes) Breaking changes are justified and recorded in the [changelog](https://github.com/eclipse-theia/theia/blob/master/CHANGELOG.md).
<a name="checklist-dependencies"></a>
- [4.](#checklist-dependencies) New dependencies are justified and [verified](https://github.com/eclipse-theia/theia/wiki/Registering-CQs#wip---new-ecd-theia-intellectual-property-clearance-approach-experimental).
<a name="checklist-copied-code"></a>
- [5.](#checklist-copied-code) Copied code is justified and [approved via a CQ](https://github.com/eclipse-theia/theia/wiki/Registering-CQs#case-3rd-party-project-code-copiedforked-from-another-project-into-eclipse-theia-maintained-by-us).
  - Look closely at the GitHub actions running for your PR: the 3pp/dash license check should be green.
  - If red: it most likely mean you need to create a CQ.
<a name="checklist-copyright"></a>
- [6.](#checklist-copyright) Each new file has proper copyright with the current year and the name of contributing entity (individual or company).
<a name="checklist-sign-off"></a>
- [7.](#checklist-sign-off) Commits are signed-off: https://github.com/eclipse-theia/theia/blob/master/CONTRIBUTING.md#sign-your-work.
<a name="checklist-meaningful-commits"></a>
- [8.](#checklist-meaningful-commit) Each commit has meaningful title and a body that explains what it does. One can take inspiration from the `What it does` section from the PR.
<a name="checklist-commit-history"></a>
- [9.](#checklist-commit-history) Commit history is rebased on master and contains only meaningful commits and changes (less are usually better).
  - For example, use `git pull -r` or `git fetch && git rebase` to pick up changes from the master.

## Reviewing

<a name="reviewing-template"></a>
- [1.](#reviewing-template) Reviewers should check that a PR has a [proper description](#pr-template).
<a name="reviewing-fn"></a>
- [2.](#reviewing-fn) Reviewers should build and verify changes according to the `How to test` section of a PR description.
<a name="reviewing-checklist"></a>
- [3.](#reviewing-checklist) Reviewers should ensure that all checks from [the review checklist](#review-checklist) are successful.
<a name="reviewing-share"></a>
- [4.](#reviewing-share) A reviewer does not need to ensure everything but can verify a part of it and provide feedback as a comment.
<a name="review-consultation"></a>
- [5.](#review-consultation) For any change that substantially alters the behavior of the application or one of its components, reviews should be requested from representatives of several contributing organizations to ensure consistency with the goals of the project and compatibility with significant adopters' downstream products.

### Requesting Changes

<a name="changes-review-reqs"></a>
- [1.](#changes-review-reqs) Changes should be requested if an author does not follow the [review requirements](#review-reqs).
<a name="changes-no-nit"></a>
- [2.](#changes-no-nit) Changes cannot be requested because of the personal preferences of a reviewer.
  - Such change requests should be dismissed.
<a name="changes-no-out-of-scope"></a>
- [3.](#changes-no-out-of-scope) Changes cannot be requested if they address issues out of the scope of a PR.
  - Such change requests should be dismissed and an issue should be filed to address them separately.
<a name="changes-style-agreement"></a>
- [4.](#changes-style-agreement) Styles and coding preferences should not be discussed on the PR, but raised in [the dev meeting](https://github.com/eclipse-theia/theia/wiki/Dev-Meetings),
  agreed by the team, applied to [the coding guidelines](coding-guidelines.md) and after that followed by all contributors.

### Approving

<a name="justifying-approve"></a>
- [1.](#justifying-approve) Each approval should have supporting comments following these guidelines.
<a name="dismissing-approve"></a>
- [2.](#dismissing-approve) An approval without a comment should be dismissed.
<a name="approval-finality"></a>
- [3.](#approval-finality) Approval of a PR implies that the reviewer is prepared to merge the PR. A reviewer should only approve a pull request that they are prepared to merge it. If a PR is under review by multiple reviewers, reviewers who are not satisfied with the state of the PR should block its merge, for example by marking their review 'request changes'.

### Collaborating

<a name="collaboration-on-pr"></a>
- [1.](#collaboration-on-pr) If a change request is important, but cannot be elaborated by a reviewer,
then a reviewer should be encouraged to open an alternative PR or collaborate on a current PR.
<a name="completing-pr"></a>
- [2.](#completing-pr) If a PR is important, but an author cannot or does not want to address outstanding issues,
then maintainers can complete the PR with additional commits
provided that the original author accepted the [ECA](https://github.com/eclipse-theia/theia/blob/master/CONTRIBUTING.md#eclipse-contributor-agreement) and their commits are preserved - the original author's work should not be squashed away.
<a name="suggesting-help-on-pr"></a>
- [3.](#suggesting-help-on-pr) Reviewers should offer their help via a comment to avoid intervening in an author's work.
<a name="landing-stale-pr"></a>
- [4.](#landing-stale-pr) Such comment is not required if an author is not responsive.

## Landing

<a name="landing-pr"></a>
- [1.](#landing-pr) A PR can be landed when:
  - CI build has succeeded.
  - The author has accepted the [Eclipse Contributor Agreement](https://github.com/eclipse-theia/theia/blob/master/CONTRIBUTING.md#eclipse-contributor-agreement).
  - All checks from [the review checklist](#pull-request-review-checklist) are approved by at least one reviewer.
  - There are no unresolved review comments.
<a name="merging-pr"></a>
- [2.](#merging-pr) Pull requests satisfying the criteria above should be merged in a timely fashion to avoid a buildup of approved PR's at release time. Responsibility for merging a PR falls to
  - The author, if the author is a committer.
  - A committer from the author's organization, if one is available.
  - The approving reviewer, otherwise.

## Reverting

<a name="reverting-pr"></a>
- [1.](#reverting-pr) If a PR causes regressions after landing
then an author and maintainers have 2 days to resolve them after that a PR has to be reverted.

## Closing

<a name="closing-pr"></a>
- [1.](#closing-pr) A reviewer cannot close a PR without a reason.
<a name="closing-pr-reasons"></a>
- [2.](#closing-pr-reasons) A PR may be closed, for example, because of the following reasons:
  - It introduces functionality which should be implemented as external Theia or VS Code extensions.
  - It introduces structural or API changes between core extensions.
  Such changes have to be done by an experienced maintainer to avoid regressions and long reviews.
  - It should be a 3rd party component, e.g. Theia is not a logging framework or a proxy server.
  - It changes development infrastructure, e.g. testing frameworks, packaging and so on.
Such changes have to be done by active maintainers after agreement in [the dev meeting](https://github.com/eclipse-theia/theia/wiki/Dev-Meetings).
