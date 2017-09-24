# Contributing to Theia

Theia is a young open-source project with a modular architecture. One of the
goals is to make sure that we can customize and enhance any Theia application
through extensions.  So while the main Theia repository contains some common
functionality for IDE-like applications, like a file system or a navigator
view, most functionality doesn't necessarily need to be put into the core
repository but can be developed separately.

* [How Can I Contribute?](#how-can-i-contribute)
  * [Asking Questions](#asking-questions)
  * [Reporting Bugs](#reporting-bugs)
  * [Reporting Feature Requests](#reporting-feature-requests)
  * [Pull Requests](#pull-requests)
* [Contributions](#contributions)
  * [Reviewing](#reviewing)
  * [Signing off](#signing-off)
  * [Landing](#signing-off)
* [Becoming a Committer](#becoming-a-committer)
* [Coding Guidelines](#coding-guidelines)
* [Developer's Certificate of Origin 1.1](#developers-certificate-of-origin-11)

## How Can I Contribute?

In the following some of the typical ways of contribution are described.

### Asking Questions

It's totally fine to ask questions by opening an issue in the Theia Github
repository. We will close it once it's answered and tag it with the 'question'
label. Please check if the question has been asked before there or on [Stack
Overflow](https://stackoverflow.com).

### Reporting Bugs

If you have found a bug, you should first check if it has already been filed
and maybe even fixed. If you find an existing unresolved issue, please add your
case. If you could not find an existing bug report, please file a new one. In
any case, please add all information you can share and that will help to
reproduce and solve the problem.

### Reporting Feature Requests

You may want to see a feature or have an idea. You can file a request and we
can discuss it.  If such a feature request already exists, please add a comment
or some other form of feedback to indicate you are interested too. Also in this
case any concrete use case scenario is appreciated to understand the motivation
behind it.

### Pull Requests

Before you get started investing significant time in something you want to get
merged and maintained as part of Theia, you should talk with the team through
an issue. Simply choose the issue you would want to work on, and tell everyone
that you are willing to do so and how you would approach it. The team will be
happy to guide you and give feedback.

## Contributions

All contributions to the project must be through pull requests. This applies to all changes to documentation, code, binary files, etc. Even long term committers must use pull requests.

No pull request can be merged without being reviewed.

### Reviewing

For non-trivial contributions, pull requests should sit for at least 24 hours to ensure that committers in other timezones have time to review. Trivial pull requests may be landed after a shorter delay.

The default for each contribution is that it is accepted once no committer has an objection. Once all issues brought by committers are addressed it can be signed-off and landed by any committer.

### Signing off

Committers sign-off on a pull request by explicitly stating their approval in the PR text or associated comment stream.

All pull requests submitted by individuals who are not committers must be signed-off on by an existing committer before the PR can be landed. The sponsoring committer becomes responsible for the PR.

Pull requests from an existing committer must be signed-off on by at least one other committer.

### Landing

When Landing a pull request, a committer may modify the original commit message to include the following additional meta information regarding the change process:

- A `PR-URL:` line that references the full GitHub URL of the original Pull Request being merged so it's easy to trace a commit back to the conversation that lead up to that change.
- A `Fixes: X` line as appropriate, where X includes the full GitHub URL for an issue, and/or the complete or abbreviated hash identifier and commit message if the commit fixes a bug in a previous commit. Multiple Fixes: lines may be added if appropriate.

## Becoming a Committer

All contributors who land a non-trivial contribution should be on-boarded in a timely manner and added as a committer. The invitation to become a committer must include a copy of the project Developer’s Certificate of Origin ([DCO]((#developers-certificate-of-origin-11))). Assuming the individual accepts the invitation, they are granted commit-access to the project.

Committers are expected to follow this policy and continue to send pull requests, go through proper review, and have other committers sign-off and land their pull requests.

## Coding Guidelines

We follow the coding guidelines described
[here](https://github.com/theia-ide/theia/wiki/Coding-Guidelines).

## Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

* (a) The contribution was created in whole or in part by me and I
  have the right to submit it under the open source license
  indicated in the file; or

* (b) The contribution is based upon previous work that, to the best
  of my knowledge, is covered under an appropriate open source
  license and I have the right under that license to submit that
  work with modifications, whether created in whole or in part
  by me, under the same open source license (unless I am
  permitted to submit under a different license), as indicated
  in the file; or

* (c) The contribution was provided directly to me by some other
  person who certified (a), (b) or (c) and I have not modified
  it.

* (d) I understand and agree that this project and the contribution
  are public and that a record of the contribution (including all
  personal information I submit with it, including my sign-off) is
  maintained indefinitely and may be redistributed consistent with
  this project or the open source license(s) involved.
