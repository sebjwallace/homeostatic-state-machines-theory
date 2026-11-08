# Future experiment: phase changes and task switching

*A proposal for the Homeostatic State Machines project. Not yet run.*

## The idea

An automaton is a web of many state machines, each holding its state until something moves it. Most of the time, changes are small and local: one machine transitions, a few connected machines react, and the cascade dies out. That sparsity is what makes the automaton cheap to run.

But sometimes enough machines change state at once that the change no longer stays local. It spreads, tips more machines over, and the whole population settles into a different stable arrangement. That is a **phase change**: a collective shift from one stable configuration to another.

The proposal is that this is how an automaton switches between tasks.

A task is not stored in a place. It is a **collective configuration**: the current states of many machines together, which form one large, stable arrangement, a deep valley in the energy landscape. Working on a task means the population sits in that valley. A cue relevant to another task flips a few key machines. If that pushes past a critical mass, the change cascades, and the population settles into the other task's configuration. Switching back is the same in reverse.

So there is no separate task manager, and no task held in one region while another waits elsewhere. Switching between tasks is a phase change among the same machines.

## Why it fits the theory

- **States persist.** A task configuration holds without effort, because each machine stays in its state until something moves it.
- **Sparsity.** Most cascades are small. A task switch is a rare large one.
- **Energy.** A task configuration is a low-energy state of the whole population. A cue that doesn't fit it creates heat. Below a threshold the heat is absorbed locally; above it, the configuration gives way and the population settles somewhere else.
- **Everything is state machines.** The thing being switched is not a special mechanism. It is the ordinary state of ordinary machines.

## Related work

- **Phase transitions and critical mass** in physics: a system holds one stable arrangement until enough of its parts change, then tips into another.
- **Self-organised criticality:** Per Bak's sandpile, where most added grains cause tiny slides and a few cause large avalanches. Systems poised near a tipping point show this mix of mostly small and occasionally large events.
- **Neuronal avalanches:** recordings from cortex (Beggs and Plenz) show cascades of activity with the same pattern, mostly small with occasional large ones, which is taken as a sign that cortex operates near criticality.
- **Task sets and switch costs** in psychology: the collective configuration for a task is called a task set, and switching between task sets has a measurable cost, as if the whole system reconfigures.

## What to test

Built on the state-machines-on-columns automaton (sketch 22 onwards), once its basic dynamics and memory work.

**Set-up.** Two (later more) tasks that share the same machines but need different configurations of them. For example, two different mappings from the same inputs to the same outputs, in the style of the three-greens homeostat, or two kinds of text that need different context. Cues in the world indicate which task is relevant, sometimes clearly, sometimes weakly.

**Questions.**

1. **Do task configurations form on their own?** After experience with both tasks, does the population settle into two distinct, stable configurations, without anything marking which machines belong to which task?
2. **Does a switch look like a phase change?** When a cue for the other task arrives, is there a threshold below which nothing much changes and above which the whole configuration flips? Is the switch fast and complete, or slow and partial?
3. **What sets the critical mass?** How many key machines have to flip before the cascade takes over? Does it depend on how well established each task is (how hard its connections are)?
4. **Cascade sizes.** Across normal running, is the distribution of cascade sizes mostly small with occasional large ones? Do task switches sit at the large end?
5. **Switch costs.** Is performance briefly worse just after a switch, as in people? Does it shrink with experience?
6. **Stability.** Does a task configuration resist noise and irrelevant cues, and only give way to a genuine cue? Does it ever flip by accident?
7. **Cost of computation.** During steady work on one task, how many machines change per step? During a switch? This tests whether the sparsity holds and whether switching is the rare expensive event the theory predicts.
8. **More than two tasks.** With three or more, does each get its own configuration, and can the population switch directly between any two?

## Signs of success

- Two or more stable configurations that form from experience alone.
- A clear threshold for switching, with small cues absorbed and strong cues flipping the whole population.
- Mostly small cascades, with task switches among the rare large ones.
- A measurable switch cost that falls with experience.
- Low computation during steady running, with spikes only at switches.

## Ways it could fool us

- If task configurations are designed in rather than learnt, a clean switch says nothing about the theory.
- A threshold can appear simply because of how the cue is presented; vary the cue strength and timing.
- Cascade-size distributions are easy to over-read with small samples; compare against shuffled controls.
