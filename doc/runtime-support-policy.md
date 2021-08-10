# Node.js

## Version Support Policy

We try to support two (2) Node.js versions up to the current _Active LTS_ version.

> For example:
> - Node.js 14 is _Active LTS_: we'll support both 14 and 12 and drop 10.
> - Node.js 16 is _Active LTS_: we'll support both 16 and 14 and drop 12.

See https://nodejs.org/en/about/releases/ to see the status of Node.js versions.

We recommend setting up your environments to run Theia using the Node.js _Active LTS_, but any supported version should work as well. Fill an issue otherwise: https://github.com/eclipse-theia/theia/issues/new/choose.

Note that the Node.js version you should use depends on your own project's dependencies: packages others than Theia might have their own requirements, so we try to support a reasonable range for adopters to be able to satisfy such constraints.

## Update Process

- Follow Node.js LTS cadence and initiate the update when a new Node.js version becomes _Active LTS_.
- Use `@types/node` for the oldest supported Node version (backward compatibility).
- Update the CI matrix to include the new Node.js version to support.
- Update the CHANGELOG.

# Electron

## Version Support Policy

We aim at using Electron's latest _Stable Release_.

See https://www.electronjs.org/releases/stable to see the latest Electron stable releases.

Note that clearing new Electron releases IP-wise is a lot of work and may cause us to lag behind a bit.

Adopters will benefit from Electron versions upgrades simply by upgrading their version of Theia.

## Update Process

- Follow Electron stable release cadence and initiate the update when a new Electron _Stable Release_ is published.
- Check the new Electron version for potential IP problems.
- Update the framework dependencies to target the new Electron version.
- Update the codebase to replace/use the new Electron APIs.
- Update the CHANGELOG.
