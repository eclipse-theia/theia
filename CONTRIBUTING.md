# Contributing to Eclipse Theia

Theia is a young open-source project with a modular architecture. One of the
goals is to make sure that we can customize and enhance any Theia application
through extensions.  So while the main Theia repository contains some common
functionality for IDE-like applications, like a file system or a navigator
view, most functionality doesn't necessarily need to be put into the core
repository but can be developed separately.

## How Can I Contribute?

In the following some of the typical ways of contribution are described.

### Asking Questions

It's totally fine to ask questions by opening an issue in the Theia GitHub
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

We follow the contributing and reviewing pull request guidelines described
[here](https://github.com/eclipse-theia/theia/blob/master/doc/pull-requests.md).

## Coding Guidelines

We follow the coding guidelines described
[here](https://github.com/eclipse-theia/theia/wiki/Coding-Guidelines).

## Eclipse Contributor Agreement

Before your contribution can be accepted by the project team contributors must
electronically sign the Eclipse Contributor Agreement (ECA).

* https://www.eclipse.org/legal/ECA.php

Commits that are provided by non-committers must have a Signed-off-by field in
the footer indicating that the author is aware of the terms by which the
contribution has been provided to the project. The non-committer must
additionally have an Eclipse Foundation account and must have a signed Eclipse
Contributor Agreement (ECA) on file.

For more information, please see the Eclipse Committer Handbook:
https://www.eclipse.org/projects/handbook/#resources-commit

## Sign your work

The sign-off is a simple line at the end of the explanation for the patch. Your
signature certifies that you wrote the patch or otherwise have the right to
pass it on as an open-source patch. The rules are pretty simple: if you can
certify the below (from
[developercertificate.org](https://developercertificate.org/)):

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
1 Letterman Drive
Suite D4700
San Francisco, CA, 94129

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

Then you just add a line to every git commit message:

    Signed-off-by: Joe Smith <joe.smith@email.com>

Use your real name (sorry, no pseudonyms or anonymous contributions.)

If you set your `user.name` and `user.email` git configs, you can sign your
commit automatically with `git commit -s`.
