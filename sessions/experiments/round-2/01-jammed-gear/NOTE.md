# Sketch 01: the jammed gear

The question: when one settled connection is made wrong by the world, how does each freezing rule (permanent, earned hardness, none) repair it, and what is left when the old world comes back?

`node sketch.js` (about 3 s, seeded).

## Mechanics

- **Machines.** Five machines M0..M4 with 6 states each. A repeating pattern of 4 inputs sets M0's state. Each junction (machine i, state s) has weighted edges to states of machine i+1. The hand-off picks an edge by softmax over weights, with temperature `0.02 + 0.3·heat`. It succeeds if the edge lands where the world says machine i+1 should be. The system is pre-wired correctly, with 16 edges and all at hardness 1.
- **Misfit and heat.** A failed hand-off stops the flow and adds +1 heat at that junction. It also adds +0.3 to the junction that fed it and +0.3 to the junction it wrongly reached. All heat cools by 5% per step.
- **Malleability.** `plasticity = clamp((heat − melt)/2, 0, 1)`. On a misfit, the failing edge resets to a random target with probability `0.5·plasticity`. A reset edge counts as new, with hardness 0. If the edge doesn't reset, the junction may grow a new young edge with probability `0.3·(1 − plasticity)`, which is the patchwork. Edge weights only move while warm: a successful edge gains `0.3·p·(3 − w)` and a failing edge loses `0.3·p·w`.
- **Hardness.** A junction counts as "disturbed" once its heat passes 0.5 and "settled" when it falls back below 0.1. At that point the edge that last carried flow gains +1 hardness.
  - Permanent: an edge with hardness above 0 has `melt = ∞`.
  - Earned: `melt = 0.5 + 0.4·hardness`.
  - None: `melt = 0.5` always.
- **Story.**
  1. A happy run of 100, 4000 or 20000 steps. In each step there is a 2% chance of a one-step world blip somewhere, so that there is something to settle and hardness can be earned.
  2. The jam: for input 0, the M2→M3 hand-off (and what follows it) now needs to go where input 1's does. Exactly one connection is wrong. This runs for 800 steps.
  3. The world reverts for 800 steps.
  4. "Recovered" means 30 clean steps in a row.

## Results

These are for seed 7. The medians in brackets are over 20 other seeds (a run that never recovered counts as 800).

```
rule      happy  okPre  hardJ  recJam     peakJ peakElse heatSum     grown resets touchElse recBack     heatBack    origKept  edges
permanent short  y[20]  1[1]   125[101]   5.0   1.5      912[704]    5[4]  0/7    0[0]      413[341]    1733[2158]  y[20/20]  27[27]
permanent long   y[20]  5[6]   77[89]     2.9   4.9      767[646]    5[2]  0/7    1[1]      185[217]    882[1571]   y[20/20]  54[51]
permanent vlong  y[20]  23[13] 209[213]   4.1   1.9      1007[1242]  2[3]  0/2    0[0]      never[369]  4060[2597]  y[20/20]  149[139]
earned    short  y[20]  1[1]   9[41]      2.4   0.7      91[364]     0[0]  1/1    0[0]      17[37]      152[304]    n[1/20]   16[17]
earned    long   y[20]  8[5]   65[65]     4.2   2.5      493[486]    3[1]  1/1    0[0]      53[33]      365[274]    n[6/20]   48[42]
earned    vlong  y[20]  13[11] 169[121]   4.6   3.5      1147[639]   3[2]  0/14   1[0]      21[57]      213[334]    y[17/20]  148[135]
none      short  y[18]  1[1]   9[33]      2.4   0.7      91[296]     0[0]  1/1    0[0]      17[37]      152[243]    n[0/20]   16[17]
none      long   y[18]  0[4]   133[45]    5.1   1.5      1051[399]   1[0]  0/12   0[0]      21[69]      182[456]    n[1/20]   34[33]
none      vlong  y[18]  0[0]   53[37]     4.1   1.2      368[257]    0[0]  0/5    0[0]      9[53]       91[334]     n[0/20]   79[91]
```

Columns:

- **okPre:** the system was still correct just before the jam.
- **hardJ:** hardness of the jammed edge at the jam.
- **resets:** resets of the original edge / all resets.
- **touchElse:** junctions other than the jammed one whose structure changed.
- **origKept:** the original jammed edge is still there at the end.
- **edges:** total edges at the end (16 at the start).

Heat around the jam under earned hardness, long run, seed 7. The jammed edge has hardness 8, so the system grows a patch, and the heat drains once the patch carries the flow:

```
t=  0  up      0.3 | J ...  1.0 | down      0.3
t= 24  up ...  1.2 | J +++  3.9 | down ...  1.0
t= 56  up :::  2.0 | J ***  4.2 | down      0.5
t= 80  up ...  0.7 | J :::  1.6 | down      0.2
t=112  up      0.1 | J      0.3 | down      0.0
```

## What the sketch suggests

- **Hardness picks between melting and patching, as the README says.** A soft jammed edge (hardness ~1) resets in place. That gives a fast fix (median 33–41 steps), low heat and no growth. A hard edge can't reach its melting point, because heat at a stuck junction plateaus at about 5 (1 misfit per 4 steps against 5% cooling). In that case the system grows a patch and takes 2–4 times longer. Earned hardness behaves like "none" when young and like "permanent" when old. The crossover comes at about `melt ≈ equilibrium heat`, so **the useful hardness range is set by how hot a jam can get**, which is a parameter nobody chose on purpose.
- **Keeping the old connection is not the same as getting it back.** This is the surprise. Permanent freezing kept the original edge in 60/60 runs. Yet it was the *slowest* to recover when the world reverted (median 217–369 steps, often never). The patch had hardened with a high weight, and frozen weights can't be outcompeted, so the kept memory is unreachable. Earned hardness did much better on revert (33–57 steps). In the very long run it kept the original 17/20 times, because the patch was young and soft: it lost on its first failures and let the old, hard edge win back. **Hard old structure plus soft new patches** is the combination that both keeps and recovers.
- **Without freezing, the system drifts before anything goes wrong.** With no freezing, 2 of 20 seeds were already broken by noise blips before the jam. The jammed edge had usually been reset by blips already (hardJ 0), which makes its fast jam recovery partly an artefact. It never keeps the original (≤1/20), so every revert is relearnt from scratch. That is cheap here only because a junction has 6 possible targets.
- **Locality comes from the misfit rule, not from the freezing rule.** Fixes stayed at the jammed junction under all three rules (touchElse ≈ 0). Heat spread to neighbours (peakElse up to ~5), but neighbours only change when *their own* hand-off fails. Spread heat makes neighbours malleable but gives them nothing to do. So this sketch can't test whether hardness protects neighbours.
- **Ways it could be fooling us:**
  - The search space is tiny. A random reset finds the right target 1 time in 6, so melting looks cheap.
  - There is no context, so old and new situations compete at the *same* junction. The README's "keep what is still right for its own situations" isn't exercised.
  - The "settled" detector awards hardness on a heat threshold. Most hardness came from noise blips rather than the pattern, so hardness measures "survived disturbances", not "was used a lot".
  - The edge count grows with run length under every rule. Blips trigger growth at low heat, and young edges are rarely pruned. That is clutter from a mechanics quirk, not a finding.
  - Variance across seeds is large (for example, recJam for earned short is 9 on seed 7 vs a median of 41). Differences under about 2× shouldn't be trusted.
