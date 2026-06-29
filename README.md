# Esy Text Editor

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](file:///D:/Code/esy-text-editor/LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.0-black.svg?style=flat-square)](file:///D:/Code/esy-text-editor/package.json)
[![Platform Support](https://img.shields.io/badge/Platform-Windows_|_macOS_|_Linux-black.svg?style=flat-square)](file:///D:/Code/esy-text-editor/package.json)
[![Built With](https://img.shields.io/badge/Built_With-React_|_Electron_|_Tailwind-blue.svg?style=flat-square)](file:///D:/Code/esy-text-editor/package.json)

Esy Text Editor is a minimal, markdown-first desktop workspace built with React, Tailwind CSS, and Electron. It features a sleek monochrome design, multi-document tab controls, and real-time preview rendering.

---

## Features

- **Multi-Tab File Management**: Work on multiple documents simultaneously. Displays a dirty indicator for unsaved changes and prompts on close to prevent data loss.
- **CodeMirror 6 Editor**: Includes syntax highlighting, active line highlighting, custom gutters, formatting buttons, and smart line wrapping configurations.
- **Debounced Live Preview**: Side-by-side rendering using `react-markdown` and `remark-gfm`, optimized with a 150ms keystroke debounce to prevent editing lag.
- **Find and Replace**: Embedded in-editor search tool supporting match indexing, next/previous transitions, and standard replace/replace-all functions.
- **Clean Titlebar & Theme Control**: Frameless OS-style custom titlebar controls matching a toggleable dark/light monochrome stylesheet.
- **Recent Files & History**: Sidebar logs recently opened files with options to clear workspace history on demand.

---

## Project Structure

- [main.ts](file:///D:/Code/esy-text-editor/electron/main.ts): Configures native window parameters, auto-updater handlers, and local filesystem IPC methods.
- [preload.ts](file:///D:/Code/esy-text-editor/electron/preload.ts): Defines secure context isolation boundaries, exposing IPC channels to the renderer.
- [App.tsx](file:///D:/Code/esy-text-editor/src/App.tsx): Core React component orchestrating the sidebar, settings, tabs, search, and preview controls.
- [styles.css](file:///D:/Code/esy-text-editor/src/styles.css): Outlines the monochrome stylesheet, root CSS variables, scrollbars, and markdown preview scaling rules.

---

## Development

Set up dependencies and start the hot-reloading web renderer:

```bash
npm install
npm run dev
```

To run the application inside the Electron desktop shell:

```bash
npm run dev:desktop
```

---

## Production Build

Generate application platform binaries:

```bash
# 1. Re-generate icons from SVG source if changed
npm run generate:icons

# 2. Compile renderer code and main processes
npm run build

# 3. Package binaries for target OS (Windows, macOS, Linux)
npm run dist
```

---

## Auto Updates

- Auto updates are configured using `electron-updater` pulling from GitHub Releases.
- Packaged builds will automatically query the repository, download matching installers, and prompt users to reboot when updates are downloaded.
- Provide `GH_TOKEN` or `GITHUB_TOKEN` in your environment to deploy release artifacts.

---

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](file:///D:/Code/esy-text-editor/LICENSE) file for details.

---

## Project Resources

- [CHANGELOG.md](file:///D:/Code/esy-text-editor/CHANGELOG.md)
- [CONTRIBUTING.md](file:///D:/Code/esy-text-editor/CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](file:///D:/Code/esy-text-editor/CODE_OF_CONDUCT.md)
- [SECURITY.md](file:///D:/Code/esy-text-editor/SECURITY.md)
