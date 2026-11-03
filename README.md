# Goku vs Cell

A Dragon Ball boss fight in plain JavaScript and canvas: intro cutscene, then Goku vs Perfect Cell.

## Run

The game reads sprite pixels from a canvas, which browsers block for pages opened as files, so serve the folder:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765 and press Enter.

## Controls

| Key | Action |
|---|---|
| A / D | Move |
| W / Space | Jump |
| S | Block |
| Shift | Dash |
| J / K | Punch / kick (press again to chain a combo) |
| L | Ki blast |
| Hold I | Charge ki |
| Q | Teleport behind Cell |
| T | Super Saiyan (full ki) |
| U | Kamehameha (Super Saiyan) |
| P | Pause |
| Esc | Skip intro |

## Files

- `game.js` – game loop, fighters, Cell AI, beams, cutscenes, HUD
- `data.js` – which sprite-sheet frames make up each move
- `sheets.js` – cuts the sheets into frames and removes the white background
- `audio.js` – music player and generated sound effects
- `tools/frames.html?sheet=goku` – every sheet frame with its id
