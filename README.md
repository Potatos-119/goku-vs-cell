# Goku vs Cell

A Dragon Ball boss fight in plain JavaScript and canvas. Pick a side on the select screen:

- **Goku**: stop Cell before he becomes perfect. Cell starts Imperfect, turns Semi-Perfect at 2/3 health and
  Perfect at 1/3, unlocking new attacks each time.
- **Cell**: absorb a Saiyan's power. Fill your ki and press T to evolve yourself; Goku is the boss, going Super
  Saiyan at 2/3 health and all out (Dragon Fist included) at 1/3.

From phase two on the boss can vanish out of your attacks and counter from behind, and it reads what you do:
it punishes charging, whiffs and broken guards, blocks or dodges beams and answers them with its own.

The stage is the Cell Games ring (`assets/img/cell-games.webp`) with live effects on top: dust, a news
helicopter, rocks that lift when someone powers up, and cracks where fighters get slammed. Lines are spoken
with the browser's speech voice (press V to turn voices off).

## Music

- `assets/audio/bg-theme.mp3` loops during fights (a 4-minute cut of the background OST).
- `assets/audio/ssj-transform.mp3` plays when Goku goes Super Saiyan: a 15-second cut of Blue Saiyan
  (57.4s-72.5s of the track) that builds up and hits 5.05 seconds in. The transformation is a short
  cinematic timed to it, so his hair turns gold exactly on that hit (`SSJ_PEAK` in `game.js`); then the
  fight theme comes back.

Swap either file to change the music; the paths are in `TRACKS` at the top of the music section in `audio.js`.

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
| S | Block: turns to face the attacker, a ki barrier flares on each blocked hit. When the boss vanishes behind you a red ! flashes just before the counter, so you can block it |
| Double-tap A / D (or Shift) | Dash forward / hop back; works once per jump in the air |
| J / K | Punch / kick (press again to chain a combo) |
| Toward Cell + J | Rushing punch |
| Toward Cell + K | Heavy slash (knockdown) |
| Tap S as a hit lands | Perfect block: no damage, +25 ki, punches leave Cell dizzy |

Keys are read by position, so the layout above works on AZERTY and other keyboards too. A gamepad works as
well: A jump, X punch, Y kick, B ki blast, LB block, RB dash, LT charge, RT beam, Back vanish, Start pause,
L3 transform, R3 ultimate, stick or d-pad to move. A press made just before you can act (while landing or
recovering) is remembered for a moment, so attacks don't get swallowed.

Blocking uses the green stamina bar under the ki bar. Holding block drains it slowly and each blocked hit costs more; at zero your guard breaks, the hit lands and you can't block until it refills. Perfect blocks give stamina back.
| L | Ki blast (Goku) / finger beam (Cell); toward + L = barrage (Semi-Perfect+) |
| Hold I | Charge ki |
| T (Cell, full ki) | Evolve to the next form |
| Q | Vanish behind the enemy (in the air too) |
| T | Super Saiyan (full ki) |
| U | Kamehameha (SSJ Goku or Perfect Cell, 50 ki; in the air it angles down at the enemy) / Death Beam (Semi-Perfect Cell) |
| Jump + U at full ki | Instant Kamehameha: charge in the air, vanish behind the enemy, fire point-blank (SSJ Goku) |
| O | Ultimate at full ki: Dragon Fist (SSJ Goku) / Solar Kamehameha (Perfect Cell) |
| P | Pause |
| M | Music on/off (remembered next time) |
| R | Calm mode: much less screen shake and flashing (remembered next time) |
| V | Voices on/off |
| Esc | Skip intro / back to character select after a fight |

## Files

- `game.js` – game loop, fighters, Cell AI, beams, cutscenes, HUD
- `data.js` – which sprite-sheet frames make up each move
- `sheets.js` – cuts the sheets into frames and removes the white background
- `audio.js` – music player, generated sound effects and jingles, spoken lines
- `stage.js` – the Cell Games arena and its live effects
- `tools/frames.html?sheet=goku` – every sheet frame with its id
