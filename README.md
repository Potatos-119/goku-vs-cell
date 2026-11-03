# Goku vs Cell

A Dragon Ball boss fight in plain JavaScript and canvas: intro cutscene, then Goku against all three of Cell's forms.
Cell starts Imperfect, turns Semi-Perfect at 2/3 health and Perfect at 1/3, unlocking new attacks each time.

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
| Toward Cell + J | Rushing punch |
| Toward Cell + K | Heavy slash (knockdown) |
| Tap S as a hit lands | Perfect block: no damage, +25 ki, punches leave Cell dizzy |

Blocking uses the green stamina bar under the ki bar. Holding block drains it slowly and each blocked hit costs more; at zero your guard breaks, the hit lands and you can't block until it refills. Perfect blocks give stamina back.
| L | Ki blast |
| Hold I | Charge ki |
| Q | Teleport behind Cell |
| T | Super Saiyan (full ki) |
| U | Kamehameha (Super Saiyan, 50 ki) |
| O | Dragon Fist: Super Saiyan 3 ultimate (Super Saiyan, full ki) |
| P | Pause |
| Esc | Skip intro |

## Files

- `game.js` – game loop, fighters, Cell AI, beams, cutscenes, HUD
- `data.js` – which sprite-sheet frames make up each move
- `sheets.js` – cuts the sheets into frames and removes the white background
- `audio.js` – music player and generated sound effects
- `tools/frames.html?sheet=goku` – every sheet frame with its id
