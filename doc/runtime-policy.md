# Node.js

## Version Support Policy

We aim to support Node.js current _Active LTS_ version.

See https://nodejs.org/en/about/releases/ to see the status of Node.js versions.

We recommend setting up your environment to run Theia using the Node.js _Active LTS_, but any supported version should work as well. File an issue otherwise: https://github.com/eclipse-theia/theia/issues/new/choose.

Note that the Node.js version you should use depends on your own project's dependencies: packages other than Theia might have their own requirements, so we try to support a reasonable range for adopters to be able to satisfy such constraints.

## Update Process

- Follow Node.js LTS cadence and initiate the update when a new Node.js version becomes _Active LTS_.
- Use `@types/node` for the oldest supported Node version (backward compatibility).
- Update the CI matrix to include the new Node.js versions to support.
- Update the documentation referencing recommended Node versions.
- Update the CHANGELOG.

# Electron

## Version Support Policy

We aim to use Electron's latest _Stable Release_.

See https://www.electronjs.org/releases/stable to see the latest Electron stable releases.

Note that clearing new Electron releases IP-wise is a lot of work and may cause us to lag behind a bit.

Adopters will benefit from Electron versions upgrades simply by upgrading their version of Theia.

## Update Process

- Follow Electron stable release cadence and initiate the update when a new Electron _Stable Release_ is published.
- Check the new Electron version for potential IP problems.
- Update the framework dependencies to target the new Electron version.
- Update the codebase to replace/use the new Electron APIs.
- Update the CHANGELOG.

# VS Code Extension Support

If you plan on supporting VS Code Extensions then it is recommended to make sure that both Node and/or Electron match
with VS Code's Node runtime, which depends on the Electron version that they end up using.

You should look for this information in the [VS Code repository](https://github.com/microsoft/vscode).

VS Code Extensions being meant to run in VS Code, developers may use any API available in the runtime in which their
extension runs. So if they expect to run in Node 16, then they may use Node 16 APIs. Running your Theia application
on Node 14 then means that some plugin features might not work because of missing APIs from the Node runtime.
