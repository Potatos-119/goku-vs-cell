# Goku vs Cell

A Dragon Ball boss fight I made in plain JavaScript and canvas, without an engine or a build step. You
pick a side on the select screen and fight the other one.

If you play Goku, you're trying to stop Cell before he gets perfect. He starts out Imperfect and turns
Semi-Perfect at 2/3 health. At 1/3 he sends in the Cell Juniors, three of them, one after another, while
he stands at the back of the ring with his arms folded. Beat all three and he comes back and goes Perfect
for the last stretch.

If you play Cell, it's the other way around. You fill your ki and press T to evolve yourself, and Goku is
the boss. He goes Super Saiyan at 2/3 health and all out at 1/3, Dragon Fist and all.

The boss gets meaner as it goes. From phase two it can vanish out of your attacks and hit you from behind.
It also watches what you do: charge in front of it, whiff, or let your guard break and it punishes you.
It blocks or dodges beams, or fires its own back. And spamming ki blasts won't work. It blocks them, jumps
over them, or Super Dashes straight through them and makes you pay, and the more you spam the more often
it does that.

## How to run it

The game reads sprite pixels off a canvas, and browsers don't allow that for a page opened straight from
disk, so you have to serve the folder:

```bash
python3 -m http.server 8766
```

Then open http://localhost:8766 and press Enter.

## Fighting

The basic chains are J J J J or K K K for Goku, and J J K or K K for Cell. The last hit of a chain
launches them. Press W right after and you jump up after them, then J J J in the air does two hits and a
spike that slams them into the ring and bounces them back up.

Once a hit lands you can cancel the rest of the move into a ki blast (L), a beam (U), a vanish (Q) or a
dash. In the air it's the same idea: after an air hit, double-tap toward them to dash in (it homes in on
them) and keep going, or press U to fire the Kamehameha (Death Beam if you're Semi-Perfect Cell) right
out of the combo. A beam carries a flying enemy along and blasts them away at the end. The longest route
I've found is J J J J, W, J J, dash, J J, U.

Ki blasts work in combos too. L works in the air, and if the blast hits you can cancel it like a punch:
J rushes in after it, or go into a dash, Q, U or another L. So on the ground something like J J, L, J,
J J, and in the air J J, L, double-tap, J J, U.

A few more things:

- J + K together (or F) is a grab, Dragon Rush for Goku and Absorb for Cell. It goes through a block and
  launches them, so W, J J J follows. It's slow, though, and hitting them first beats it. The boss will do
  it to you if you sit behind your guard too long.
- Hit someone while their own attack, ki blast or beam is still starting up and you get a counter hit:
  25% more damage and a longer stun.
- The heavy slash (toward + K) bounces them off the edge of the screen for a follow-up.
- Juggles are capped and long combos hit softer, so nothing loops forever.
- At full ki you get a finisher. SSJ Goku's is the Instant Kamehameha (U in the air, or U after an air hit).
  Perfect Cell's is the Solar Kamehameha (O on the ground, in the air or right after a hit): he flares his
  aura, vanishes, shows up high above and fires a huge Kamehameha down into the ring.
- The combo counter shows hits and damage. Land a named combo and you get its name on screen and +8 ki.

Cell has a few tools Goku doesn't. His grab is Absorb, which heals him and drains your ki. G is his
Barrier, a burst that throws you off and works even while he's getting hit (30 ki). As Perfect Cell, E
calls in a Cell Junior that flies at you and launches you (35 ki, also after a landed hit). Holding I
heals him a little while he charges. The boss Cell uses all of these on you too.

P pauses. The pause menu has the full move list, a combo list (the ones you've landed get ticked) and
the controls. There's also a training mode, which you can pick after choosing a fighter. The dummy can't
be KO'd, health and ki refill, and a checklist shows every combo with a hint for the next one to try.
You can set the dummy to fight back.

## Controls

| Key | What it does |
|---|---|
| A / D | Move |
| W / Space | Jump |
| S | Block. You turn to face the attacker and a ki barrier flares on each blocked hit. When the boss vanishes behind you, a red ! flashes just before it attacks, so you can still block it |
| Tap S as a hit lands | Perfect block: no damage, +25 ki, and punches leave them dizzy |
| Double-tap A / D (or Shift) | Dash forward or hop back, once per jump in the air |
| J / K | Punch / kick, press again to chain |
| Toward + J | Rushing punch |
| Toward + K | Heavy slash (knockdown, wall bounce) |
| J + K / F | Grab: Dragon Rush (Goku) or Absorb (Cell) |
| L | Ki blast (Goku) / finger beam (Cell). Toward + L is Cell's barrage (Semi-Perfect and up) |
| Hold I | Charge ki |
| T | At full ki: Super Saiyan (Goku) or evolve to the next form (Cell) |
| Q | Vanish behind them, in the air too |
| U | Kamehameha (SSJ Goku or Perfect Cell, 50 ki; from the air it angles down) / Death Beam (Semi-Perfect Cell) |
| Jump + U at full ki | Instant Kamehameha (SSJ Goku), also right after an air hit |
| O | At full ki: Dragon Fist (SSJ Goku) / Solar Kamehameha (Perfect Cell) |
| G | Cell's Barrier (30 ki) |
| E | Perfect Cell calls a Cell Junior (35 ki) |
| P | Pause |
| M | Music on/off |
| R | Calm mode: a lot less screen shake and flashing |
| Esc | Skip the intro, or go back to character select after a fight |

The keys are read by position, so this layout also works on AZERTY and other keyboards. A gamepad works
too: A jump, X punch, Y kick (X + Y grab), B ki blast, LB block, RB dash, LT charge, RT beam, Back
vanish, Start pause, L3 transform, R3 ultimate, and the stick or d-pad to move. If you press something a
moment before you're able to act (while landing, say), the game remembers it, so inputs don't get eaten.

Blocking uses the green stamina bar under your ki bar. Holding block drains it slowly and every hit you
block takes a chunk. If it hits zero your guard breaks, the hit lands, and you can't block again until it
refills. Perfect blocks give some back.

## Stage, music and options

The arena is the Cell Games ring. `assets/img/arena.jpg` is the art upscaled 2x with the sky extended so
it fills a 16:9 screen. The older painting, `assets/img/cell-games.webp`, is still there as the CLASSIC
arena in the options. On top of it there's dust, a news helicopter, rocks that float up when someone
powers up, and cracks wherever someone gets slammed. On big or retina screens the game draws at twice
the resolution so everything stays sharp. The camera stays still during the fight and only pushes in for
cinematics.

Music:

- `assets/audio/bg-theme.mp3` loops during fights. It's a 4-minute cut of the background OST.
- `assets/audio/ssj-transform.mp3` plays when Goku goes Super Saiyan. It's 15 seconds of Blue Saiyan
  (57.4s to 72.5s of the track), and the build-up hits 5.05 seconds in. The transformation is a short
  cinematic timed to that hit, so his hair turns gold right on it (`SSJ_PEAK` in `game.js`). After that
  the fight theme comes back.

To change the music, swap either file. The paths are in `TRACKS` in `audio.js`. There's also a
`VOICE_CLIPS` table there if you want to add recorded voice lines.

The options (from the pause menu, or the menu after you pick a fighter) cover music and sound volume,
music on/off, calm mode and the arena. They're saved between visits.

## Files

- `game.js`: the game loop, fighters, boss AI, beams, cutscenes and HUD
- `data.js`: which sprite-sheet frames make up each move, plus the move and combo lists
- `sheets.js`: cuts the sheets into frames and removes the white background
- `audio.js`: the music player, generated sound effects and jingles, and the voice clip hook
- `stage.js`: the arena and its live effects
- `assets/sheets/cell.png`: Cell's three forms plus the Cell Juniors (rows 17-21). `cell-faces.png` has his portraits
- `tools/frames.html?sheet=goku`: shows every frame of a sheet with its id
