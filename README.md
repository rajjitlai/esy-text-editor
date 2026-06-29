# Esy Text Editor

Esy Text Editor is being rebuilt as a minimal Electron desktop app for markdown-first editing. The old C/X11 direction is gone.

## Stack

- React renderer
- Electron main process
- Tailwind CSS
- shadcn-style monochrome UI
- Markdown preview with `react-markdown` + `remark-gfm`
- Electron Builder for distributables

## Current Scope

- Workspace-based file browsing
- Tabs for multiple open documents
- Markdown editing with live preview
- Formatting toolbar for common markdown actions
- Cross-platform packaging target

## Project Structure

- `electron/main.ts` handles window creation, file dialogs, and filesystem access
- `electron/preload.ts` exposes the minimal IPC bridge
- `src/App.tsx` contains the workspace, tabs, editor, and preview UI
- `src/styles.css` defines the monochrome theme and layout tokens

## Development

The repo is scaffolded for the following workflow:

```bash
npm install
npm run dev
```

For the desktop shell during development:

```bash
npm run dev:desktop
```

## Build

```bash
npm run generate:icons
npm run build
npm run dist
```

## Release Targets

- Windows: `nsis` and `portable`
- macOS: `dmg` and `zip`
- Linux: `AppImage` and `deb`

## Auto Updates

- Auto updates are configured with `electron-updater` and GitHub Releases for `rajjitlai/esy-text-editor`.
- Packaged builds can check, download, and install updates from published releases.
- Development update testing uses `dev-app-update.yml`.
- To publish update metadata and release artifacts from CI or locally, provide `GH_TOKEN` or `GITHUB_TOKEN`.
- macOS auto updates still require proper code signing.

## Notes

- This is a scaffold, not a finished editor.
- The renderer currently assumes markdown-focused editing rather than full WYSIWYG authoring.
- File access stays in the main process for safety.

## Development Credits

- This project is being developed with OpenAI Codex using GPT-5.4 models.

## Project Files

- [`CHANGELOG.md`](D:/Code/Optimization/esy-text-editor/CHANGELOG.md)
- [`LICENSE`](D:/Code/Optimization/esy-text-editor/LICENSE)
- [`CONTRIBUTING.md`](D:/Code/Optimization/esy-text-editor/CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](D:/Code/Optimization/esy-text-editor/CODE_OF_CONDUCT.md)
- [`SECURITY.md`](D:/Code/Optimization/esy-text-editor/SECURITY.md)
