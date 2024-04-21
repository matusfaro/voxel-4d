# voxel-4d

Four dimensions in three dimensional space. A Minecraft-like Voxel game where you can swap out any dimension for
another.

## Build

Download dependencies:

```shell
pnpm install`
```

Then build the project:

```shell
pnpm run build
```

Then serve content out of `dist` folder:

```shell
pnpm run serve
```

Then point your browser to [http://localhost:3000](http://localhost:3000) and have fun!

## Development

Download dependencies:

```shell
pnpm install
```

Then run the start script:

```shell
pnpm run start
```

Then point your browser to [http://localhost:7080](http://localhost:7080) and have fun!

## History

A long time ago (~2013), I used [VoxelJS](https://web.archive.org/web/20190108105609/http://voxeljs.com/) and
its [voxel-engine](https://github.com/max-mapper/voxel-engine) to
create a 4-dimensional game. I've since lost the code, but the idea persisted.

When I've picked it up in 2024, I found the original engine has been abandoned. I've revived the engine and re-built the
4d game from scratch. I then found that the original author ported the engine from ThreeJS to WebGL and added a lot of
extra functionality as part of [Voxel Metaverse](https://github.com/voxel/voxelmetaverse). I've decided to port the
plugins into the new WebGL engine and continued development from there.
