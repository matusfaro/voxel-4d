# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- **Install:** `pnpm install`
- **Dev server (port 7080):** `pnpm start` — uses beefy + watchify with live reload
- **Production build:** `pnpm run build` — browserify bundle to `dist/`
- **Serve production (port 3000):** `pnpm run serve`

No test framework or linter is configured.

## Architecture

This is a 4D voxel game (Minecraft-like) built on **voxel-engine-stackgl**, a WebGL-based voxel engine. The core concept: the game renders 3D slices of a 4D world. Players can swap which axis is visible and traverse the hidden 4th dimension.

### Entry Points

- **`src/index.js`** — Main entry. Initializes the voxel engine with ~60 plugins via a plugin loader pattern, sets up keybindings, and loads textures.
- **`src/index.html`** — HTML shell with HUD elements (coordinates, crosshair).

### Core 4D System

- **`src/voxel-4d.js`** — Core 4D dimension logic. Manages dimension swapping and W-axis traversal.
- **`src/voxel-4d-worker.js`** — Web Worker for chunk generation using 4D Perlin noise. Chunks are generated off-thread to avoid blocking rendering.
- **`src/voxel-4d-location.js`** — Coordinate transformation between XYZ (visible 3D) and XYZW (full 4D space).

### Multiplayer (P2P)

- **`src/voxel-multiplayer.js`** — PeerJS-based multiplayer, syncs 4D positions and block changes.
- **`src/voxel-multiplayer-entities.js`** / **`voxel-multiplayer-entity.js`** — Renders other players as entities.
- **`src/lib/peerjs-mesh/`** — Custom P2P mesh networking library (MeshHost, MeshNetwork, MeshPeer) built on PeerJS/WebRTC.

### Other Modules

- **`src/voxel-flight.js`** — Flight mechanics
- **`src/voxel-gps.js`** — Position display UI
- **`src/level.js`** — Level setup

### Key Technologies

- **Rendering:** Raw WebGL via StackGL ecosystem (gl-shader, gl-buffer, gl-vao, gl-mat4)
- **Shaders:** GLSL compiled via glslify browserify transform
- **Networking:** PeerJS (WebRTC) with custom mesh topology
- **Chunk generation:** Web Workers with ndarray + Perlin noise
- **Bundler:** Browserify (dev: watchify via beefy)

### Plugin Architecture

The game uses voxel-engine-stackgl's plugin system. Plugins are loaded in `src/index.js` via `pluginLoaders` array — each entry is `[pluginModule, optionsObject]`. The engine handles plugin lifecycle. Over 60 community voxel-* plugins provide gameplay features (inventory, crafting, mining, health, etc.).

### Game Controls (4D-specific)

- **E** — Swap dimension axis (cycle which axis is hidden)
- **R** — Increment position on hidden axis
- **F** — Decrement position on hidden axis
