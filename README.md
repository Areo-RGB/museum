# Media Gallery — Personal Museum derivative

A fixed Three.js gallery where every frame is an editable media slot. Images and videos can be uploaded directly in the browser and are stored locally in IndexedDB.

This prototype is derived from ideas and portions of the MIT-licensed **barisulgen/personal-museum** project. The original MIT license is preserved in `LICENSE`.

## Features

- Fixed museum/gallery scene
- 12 framed media slots
- Three supplied photographs repeated as defaults
- First-person WASD navigation + mouse look
- Collision against gallery walls
- Aim at a frame and click to edit it
- Upload images or videos per frame
- VideoTexture playback, muted and looping
- Cover / contain fit mode
- Per-frame media persistence in IndexedDB
- Cinematic camera tour (`C`)
- Reset an individual frame back to its default photograph

## Run

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Controls

- Click **Enter Gallery** to start
- `WASD` / arrow keys: move
- Mouse: look
- Left click while aiming at a frame: edit that frame
- `C`: cinematic camera tour
- `Esc`: release mouse / leave edit mode

## Browser note

Uploaded media never leaves the browser in this prototype. Videos are played muted so autoplay is allowed by modern browsers.
