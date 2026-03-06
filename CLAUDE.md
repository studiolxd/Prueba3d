# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite with HMR)
- **Build:** `npm run build` (runs `tsc -b && vite build`, output in `dist/`)
- **Lint:** `npm run lint` (ESLint with TypeScript and React rules)
- **Preview production build:** `npm run preview`

## Architecture

This is a React + TypeScript + Vite application with Babylon.js for 3D rendering.

- **Entry point:** `index.html` loads `src/main.tsx`, which renders `<App />` into `#root`
- **App component:** `src/App.tsx` — main application component
- **Styling:** CSS files co-located with components (`App.css`, `index.css`)
- **Static assets:** `public/` for static files, `src/assets/` for imported assets

## Key Dependencies

- **React 19** with react-dom
- **@babylonjs/core** for 3D engine capabilities
- **Vite 7** with `@vitejs/plugin-react` (Babel-based)

## TypeScript Configuration

- Strict mode enabled with `noUnusedLocals` and `noUnusedParameters`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `erasableSyntaxOnly: true` — no enums or parameter properties; use alternatives
- Target: ES2022, JSX: react-jsx
