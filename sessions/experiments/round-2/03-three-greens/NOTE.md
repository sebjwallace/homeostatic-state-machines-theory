# Sketch 03: three greens

The question: can a small homeostat learn which buttons bring three lights back to green, using only heat (no reward, no value function, no optimiser)? Can it re-adapt when the buttons are rewired, and does it remember the old wiring when that comes back?

`node sketch.js` (under 1 s, seeded, 12 seeds). `SIDE=0.3 node sketch.js` lowers the side-effect heat.

## Set-up

- **World.** Three lights. Each is a deterministic `SM` with states R/A/G: `fwd` goes R→A→G→R and `back` goes the other way. Four buttons, not one-to-one with the lights:
  - Mapping A: B0 = fwd L0 and L1; B1 = back L1; B2 = fwd L2; B3 = nothing.
  - Mapping B: B0 = back L2; B1 = fwd L0 and L2; B2 = nothing; B3 = fwd L1.
  - Schedule: A for 4000 steps, then B for 4000, then A again for 4000.
  - Disturbance: each step there is a 4% chance that a random light is set to a random colour. The disturbance stream is identical for every controller.
- **Automaton.** Built from the same `SM` class, with `reconfigurable = true`.
  - Three sensor machines mirror the lights (boundary in).
  - Three driver machines have table entries `colour --sense--> button`. Firing one presses that button (boundary out). Each (light, colour) entry is a junction with its own heat and a hardness for each button.
  - Each step, if any light is off green, the hottest such light fires its driver.
- **Heat.**
  - Boundary heat: +1 per step on each light that is not green. It does not decay while the misfit persists, so unresolved heat accumulates. It decays by ×0.6 per step once the light is green.
  - Internal misfit on the junction that fired: +1 if the press didn't move its own light, +SIDE (default 1) for each green light it knocked off. This decays by ×0.85 per step.
- **Malleability.** `p = clamp((lightHeat + junctionHeat − melt)/2, 0, 1)`. With probability `0.5·p` the entry lets go and re-lands on a different button.
  - `earned`: re-lands uniformly.
  - `earned+mem`: re-lands weighted by `1 + hardness` of each button, so old wirings are easier to fall back into.
- **Cooling.** When all three lights return to green, every junction that fired during the episode gains +1 hardness on the button it currently holds. Earned melt is `1 + 2·√hardness`. `frozen` uses melt 1 until a junction's first settle, then ∞.
- **Ashby.** When a light's heat exceeds 4, all three of its entries are re-randomised and its heat is reset. There is no hardness, and it stops changing once things are calm.
- **Baselines.**
  - `none`: no presses.
  - `random`: presses a random button whenever the lights are not all green.
  - `oracle`: does a BFS over the 27 joint states using the true current mapping.

## Results (medians over 12 seeds, SIDE = 1)

```
kind        | A:early  late |  B:early  late | A2:early  late | adaptA adaptB adaptA2 | green% | presses/opt | heat A/B/A2
none        |    1220  1435 |     2472 943.0 |    660.7 309.5 |   4000   4000    4000 |    3.0 |        0.00 | -
random      |    29.0  33.4 |     28.4  28.4 |     29.6  28.6 |   4000   4000    4000 |   56.2 |       15.07 | -
oracle      |     2.1   2.0 |      2.1   2.1 |      2.0   2.0 |    183    205     180 |   97.4 |        1.01 | -
earned+mem  |     6.2   2.0 |     23.8   2.2 |      5.8   2.1 |    397    620     479 |   93.6 |        2.13 | 0.6/2.9/0.4
earned      |     8.1   2.0 |     18.2   2.0 |     12.8   2.0 |    397    545     557 |   93.7 |        1.83 | 0.6/1.3/0.9
frozen      |    16.8  12.0 |     1273 620.5 |      9.0   9.8 |    725   4000     390 |   52.6 |       19.36 | 2.9/1346.6/3.7
ashby       |    42.0  36.2 |     44.4  18.2 |     30.0  20.7 |   1404   1812    1320 |   63.0 |       11.93 | 4.9/4.9/4.6
earned+mem  adaptA2 < adaptA in 3/12 seeds; adaptA2 < adaptB in 9/12
```

Columns:

- **early/late:** mean steps to restore all-green per disturbance episode, in the first 500 steps and the last 1500 steps of the phase.
- **adapt:** steps into the phase until 5 consecutive episodes each come within optimal + 2 (4000 means never).
- **presses/opt:** presses per episode divided by the oracle's shortest path.
- **heat:** the automaton's mean total heat in each phase.

With SIDE = 0.3, `earned+mem` adapts to B more slowly (adaptB 924, late B 11.4) and `earned` is unchanged.

The trace below is `earned+mem`, seed 1, at the rewire. L1 had been wired to B0 under A. After the rewire, B0 pushes L2 instead, so L2 is knocked around while L1 stays amber. Heat climbs until L1's entry melts. It flips between B0, B1 and B2, lands on B3 at t=4073, and then L2 settles.

```
 4048  GAG  B1 !  L1A->B1        5.5 ######
 4049  RAR  B0    L0R->B0        7.6 ########
 4056  RAG  B0    L1A->B0       23.4 #######################
 4067  AAG  B0    L1A->B0       33.2 #################################
 4069  GAG  B2    L1A->B2       27.6 ############################
 4073  GAA  B3    L1A->B3       20.0 ####################
 4074  GGA  B2    L2A->B2       15.6 ################
```

## What it suggests

- **Heat alone was enough to learn the mapping here.** Late in every phase, both earned-hardness variants recover in about 2.0 steps, the same as the oracle. That is down from 29 for random and over 1000 for none. They keep all-green 94% of the time (oracle 97%), with about 2× the minimum presses, so they don't thrash once they have learned. Within roughly 400–600 steps of each phase they behave like the oracle.
- **The accumulating boundary heat is what makes earned hardness safe.** Heat on an unresolved light grows without bound, so any hardness eventually melts (seed 1 has hardnesses in the hundreds and still re-adapts). Sketch 01's jam plateaued at about 5 and couldn't melt hard edges. Here "unresolved heat accumulates" removes that ceiling, at the cost of a large heat spike after a rewire (see the trace).
- **All-or-nothing freezing breaks on the rewire.** `frozen` never adapts to B, and its heat explodes (1347). It recovers in A2 only because the old wiring is still frozen in place. That is memory without adaptability, and it is the mirror image of sketch 01.
- **Remembering the old mapping is weak at best.** A2 early recovery is better for `earned+mem` (5.8) than for `earned` (12.8). But A2 adaptation was faster than the first learning in only 3/12 seeds, and the hardness prior slows adaptation to the new mapping B (620 vs 545, and 924 with SIDE = 0.3). The same mechanism that helps recall also anchors to the stale wiring. Most of this difference is under 2×, so treat it as a hint.
- **Ashby-style re-randomisation works, but slowly** (late recovery about 20–36 steps, 63% green). It never really stops changing, because disturbances keep pushing heat past the threshold. Locality and earned hardness are what make the difference.

## Ways it could be fooling us

- **The problem is tiny.** There are 4 buttons per junction, and a per-light reactive policy (one button per light colour) suffices to reach the oracle's ~2 steps. The automaton never has to learn a multi-press sequence or a joint-state policy, so "learned the mapping" means "learned a decent lookup table".
- **The structure is hand-shaped.** It decides which light acts (the hottest), that drivers are per light, and that the internal-misfit rule is "my own light didn't move". That last rule is a strong hint that leans close to a supervised signal. The side-effect term makes it worse: it is a hand-written credit rule.
- **Credit is assigned to everything that fired in the episode.** Junctions present by coincidence also harden. That is the README's open question, and it didn't break anything here only because episodes are short.
- **"Not green = heat" is a fixed setpoint, an error signal in Ashby's sense.** It is binary for each light and has no magnitude of goodness. Nothing is maximised, and the learning signal is the *drop* of heat (cooling), not a scalar handed out at the success moment. But in practice "hardness +1 when all-green returns" is close to a success-triggered update, so the line between this and a sparse reward with eligibility traces is thin. The honest difference is that there is no value estimate and no gradient. Credit comes from states persisting, not from tracing back.
- **The measures are noisy.** The adapt metric has a floor around 180 (the oracle's value, set by the disturbance rate). With 12 seeds, differences under about 2× shouldn't be trusted.

## Addendum: a rule changed during the sketch

The first version hardened connections whenever any single light returned to green. That locked in bad habits: buttons that cycle a light through all three colours got rewarded, and recovery stayed around 20 steps. Hardening only when all three lights are green fixed it. So "cool only when the whole gap closes" mattered, and it was found by trial during the sketch, not designed in advance.
