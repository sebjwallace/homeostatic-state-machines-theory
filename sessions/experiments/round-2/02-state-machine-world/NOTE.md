# Sketch 02: the world is state machines too

The question: if the world and the automaton are both just state machines, with the only difference being that the automaton's can rewire, does the coupled loop settle into lower world energy, and does the automaton learn to keep it there, from heat alone?

`node sketch.js` (under 1 s, 7 seeds). Env knobs: `SAFE=0|1`, `HEAT=rise|gap|local`, `KGAP`, `JIG`, `TRAIL`, `GAPCAP`.

## Set-up

- **One `SM` class** for everything: a state, plus a table `state|input -> {to}`. Two traffic lights are `SM`s with a fixed table (green for 12 ticks, amber, red, wait for the other light to clear, red-amber). Each light's input is the other light's coarse state plus its own button. The automaton is two `SM`s (one per button) with states `idle`/`press`, inputs `phase + own-queue level + other-queue level`, `learnable: true`. Unknown inputs create a soft entry with a random target. The literal difference between world and automaton is one flag.
- **World energy:** queued cars + 0.02·queue² + 30 for conflicting greens. Arrivals are deterministic (fractional accumulators, two slow sine waves). Story: A-heavy 6000 ticks, B-heavy 4000, A-heavy 3000, quiet (no cars) 2000, A-heavy 3000.
- **Boundary:** a button press is the transition *into* `press`. In the default `SAFE` world, a button can only end a green early. In `SAFE=0`, it can also flip a waiting red to go, which allows conflicts.
- **Heat:** felt world energy at the boundary heats the entry that currently holds each button's state, plus the two before it (halving), plus a small operational heat per press. All heat cools 5% a tick. Earned hardness as in sketch 01 (`melt = 0.5 + 0.4·hard`, +1 each time an entry is disturbed then settles). When the current entry is above melt, with probability `0.1·plasticity` it flips its target and resets its hardness to 0. There is no reward, value or optimiser. Default heat source = *rises* in world energy (`HEAT=rise`).
- **References:** timer only; random presses (10%); a hand rule ("end a green if its road is empty and the other has cars"); tabular Q-learning with reward = −ΔE on the same inputs.

## Results (default: SAFE world, HEAT=rise, median of 7 seeds, mean world energy per window)

```
ctrl          P1 early P1 late P2 early P2 late P1 back quiet P1 postQ  sdLate confl maxQ(A/B)
timer              5.4     5.5      5.8     7.0     4.7   0.0      4.9     3.8     0   13/15
random            12.0    14.7     18.0    21.4    11.1   0.0     13.6    11.5     0   49/42
rule               2.0     1.9      2.0     2.1     1.9   0.0      2.0     1.3     0    5/5
learner           50.2    15.9     18.4     9.0    12.8   0.5     11.5     5.9     0   56/33
learn-nohard      51.3    12.1     34.9    11.4     9.2   0.0      3.7     4.7     0   63/48
Q-learn            2.5     2.5      2.6     2.5     2.2   0.0      2.3     1.7     0   10/11

learner P1-late energy per seed: 46 10 559 17 11 16 12   (learn-nohard: 15 4936 4221 5 4 10 12)
learner heat per window: 9.9 / 7.3 / 7.1 / 6.5 / 6.3 / 0.3 / 6.7   (never cools to near 0 while cars flow)
final wiring (learner, all seeds): green & own road empty & other waiting -> press 54/73 (good)
                                   green & own road has cars -> press 121/245 (bad, ~coin flip)
```

Trace, seed 1, mean energy per 500 ticks (log ramp ` .:-=+*#%@`, `@` >= 300):

```
segment       000000000000111111112222223333444444   (0=P1 1=P2 2=P1 3=quiet 4=P1)
timer         ::::-::::::::---::--::-:::    ::--::
rule          ..........................    ......
learner       +*=+***++**++@@@@@@#=:+++*.   -:****
Q-learn       :...........:.:.:.:....:..    ......
learner heat  @@@@@@@@@@@@@@@@@@@@@@@@@@....@@@@@@
```

In the unsafe world (`SAFE=0 HEAT=gap`), the learner's P1-late energy is 12.8, which is similar to the default. But it has about 5300 conflict ticks, versus 0 for timer and rule and 866 for Q-learning.

## What the sketch suggests

- **The "all state machines" framing costs nothing and is clarifying.** World and automaton really are one class with a `learnable` flag. Inputs are world states read at the boundary, and outputs are automaton states that are world inputs. Writing it this way forced a real question the README glosses: *which* automaton state change counts as an action. Here a held `press` state is not an action, only the transition into it is. "States persist" and "acting" pull in different directions at the boundary.
- **The loop does not settle, and the heat learner mostly does not learn.** Early-to-late energy falls in most seeds (50 → 16 median), but that is the learner climbing out of its own random start. It ends worse than leaving the lights alone (16 vs 5.5), far worse than a one-line rule (1.9), and far worse than Q-learning on the same inputs (2.5). Its heat never cools to near zero while traffic flows. It finds the useful wiring (press when your road is empty) about 74% of the time, but leaves the harmful wiring (press when your road has cars) at a coin flip. Nothing distinguishes "this entry caused the rise" from "this entry was present during the rise".
- **Credit assignment is exactly where it breaks, as the README's open question predicted.** The harm from a bad press shows up 10–30 ticks later as a slowly growing queue. By then the heat lands on whatever entry happens to hold the state. Whole-world "gap" heat is worse than heating on "rises" (in the SAFE world it runs away to thousands in some seeds). The constant background unease of normal traffic keeps everything above melt, so nothing ever hardens into the right thing. "Heat = the gap" needs a baseline: the felt level when things are normal has to read as cold.
- **Pattern change, revert and quiet give no clear signal.** With the learner this noisy, P2 and "P1 back" are not distinguishable from P1. The quiet period cools it to about 0.3, which is good: no cars means no heat and no rewiring, so states persist untouched. "P1 after quiet" is no worse than before (11.5 vs 15.9), so the quiet did not erase anything. But there was little worth preserving, so this is not evidence of memory. Earned hardness vs none: medians are similar, and each blows up in different seeds (one learner seed reached 559, two no-hardness seeds reached 4000+). Too noisy to call.
- **Cheating check:** no starvation in any controller (served ≥ 99.6% on both roads, max red run 20–21 ticks, which is the light's own wait cycle). But when the world lets it (`SAFE=0`), the heat learner happily creates conflicting greens. Conflicts drain both queues quickly, so the drop in queue energy roughly pays for the +30 per conflict tick. The energy function, not the learner, decided that was acceptable. A fair test needs the world's own "hard" constraints to be in the world machines (interlocks), not priced into energy.

## Ways it could be fooling us

- The parameters were tuned by hand over about 8 short sweeps (`KGAP`, `JIG`, `TRAIL`, heat source, safe vs unsafe), and the results swing by orders of magnitude between settings. A config where the learner beats the timer may exist. I didn't find one, and I didn't search long.
- The flip-on-heat rule only has two targets, so "jiggling" is a coin flip with no memory of what was tried. That is a much weaker search than sketch 01's, and weaker than the README's "new malleable structure".
- There is no internal misfit at all: the automaton has no prediction of its inputs, so all its heat comes from outside. The README's main heat source (unexpected inputs) is absent. An automaton that predicted queue growth would feel the bad press *at the time it happens*, which is probably the missing piece for credit assignment.
- Q-learning got a reward every tick on the same coarse inputs. It is a reference, not a fair rival: its discounting does the temporal credit assignment that heat here cannot.
- 7 seeds, with heavy-tailed per-seed results. Medians hide that some seeds are fine (~10) and some blow up (500+).
