# Homeostatic State Machines

*A theory of learning as the settling of energy, and the premise for an experiment to test it.*

Nothing here is proven. This is a set of ideas I want to test, written down so they can be examined, argued with, and shown to be wrong if they are.

---

## Why another approach

Almost all of today's artificial intelligence learns by optimisation. A model is shown enormous amounts of data, its mistakes are measured against the right answers, and every one of its parameters is nudged slightly in whichever direction makes the mistakes smaller. Repeat this billions of times and the model becomes very good. The technique behind the nudging, backpropagation, is one of the great achievements of computer science.

But it comes with costs. Learning happens in a separate training phase, before the model is used, and stops when training stops. It needs vast datasets, because each example only moves the model a tiny amount. And it needs vast amounts of computation and energy, because every parameter takes part in every step.

Brains don't seem to work this way. A child hears a new word a few times and has it. Nobody hands the brain the right answers, and it never stops to train; it learns while it lives. It runs on roughly twenty watts.

This project explores a different principle for learning, one with no right answers, no training phase and no optimiser. The principle is borrowed from physics, and it is very simple: **systems settle into states of low energy.** The rest of this document builds up from that idea.

---

## Part one: energy

### Things settle

Drop a ball into a bowl and it rolls around, then comes to rest at the bottom. Water poured onto uneven ground runs until it pools in the hollows. A spinning compass needle swings, then settles pointing north. In each case the system moves towards the configuration with the lowest energy, and once it gets there, it stays.

It helps to picture this as a landscape. Every possible configuration of the system is a point on the landscape, and its height is the energy of that configuration. The system always moves downhill. Valleys are stable states: once a system is in one, small pushes won't get it out.

### Energy as misfit

For the systems in this project, energy has a simple meaning: **how badly the parts of a system fit together.** If two connected parts agree, the energy between them is low. If they contradict each other, it is high. A system in high energy is under tension, and it will move, rearrange, or change until the tension eases.

This is the single drive in the whole theory. There is no external teacher, no score to maximise, no target to hit. There is only tension, and a tendency for it to settle.

Energy in this sense has one property that physical energy lacks, and it runs underneath everything that follows. Physical energy is conserved: it can only move from place to place or change form. Misfit is not. When two things finally fit, the tension between them doesn't go anywhere. It simply stops existing. Part six returns to this in detail.

### Memory as valleys

In 1982 the physicist John Hopfield showed how this picture gives you memory. Imagine a network of simple units, each connected to the others. Shape the connections so that particular patterns of activity are low-energy valleys. Now give the network a fragment of one of those patterns, or a noisy version of it. The network rolls downhill and sinks into the nearest valley, which is the complete, clean pattern.

That is memory that works by content rather than by address. You don't look a memory up by its location; you offer part of it, and the rest falls into place, the way a few notes of a song can bring back the whole thing.

### Assemblies and sparse representations

The systems in this project represent things with **sparse distributed representations**. Picture a large population of cells, of which only a small fraction is active at any moment. Which cells are active is what carries meaning. Because there are astronomically many ways to choose a small set from a large one, sparse representations have enormous capacity, and two unrelated things rarely overlap by accident.

When cells are active together, the connections between them strengthen. This is Hebbian learning, often summarised as *cells that fire together wire together*. A group of cells bound together like this is an **assembly**. Activate part of an assembly and the rest switches on too. An assembly is a valley in the landscape: a stable, self-completing pattern.

### What an assembly is

It is tempting to think of an assembly as a symbol: the assembly for "the" stands for the word "the". This theory reads it differently. An assembly is **a resolved tension**: a configuration that once made some disturbance settle, and then froze in place. (Part two explains what freezing means.) The assembly for "the" is the way the system found of being calm when "t", "h" and "e" arrive in that order, frozen so it can be used again.

So assemblies don't get their meaning from labels. An assembly means whatever it fits with: what tends to bring it on, what it brings on, and what it helps to settle. Its meaning lies in its relations. That is why one assembly can take part in many different contexts, and why old assemblies can be combined into new ones.

Seen this way, an assembly is a **state**, a stable pattern the system can be in. It is also a **memory**, a valley in the landscape. And, as later sections describe, it is a small learnt response to one kind of disturbance. These are three views of the same thing.

### From states to state machines

Assemblies can follow one another in time. If one pattern reliably comes before another, the first can come to bring on the second. Input arrives one step at a time, say one character of text at a time, and sequences are learnt as naturally as patterns.

A **state machine** is a set of states together with the transitions between them: the ways in which one state hands activity on to the next as input arrives. In this theory, the states are assemblies and the transitions are the learnt connections that carry activity from one assembly to another. When a state machine settles a disturbance, lowering the energy, it freezes: its states and transitions set in place, ready to settle the same disturbance next time.

The two are not the same thing. An assembly is a state; a state machine is many assemblies and the transitions linking them. And because an assembly is defined only by its relations, the same assembly can belong to many state machines at once, just as a word can appear in many sentences.

Unlike the state machines engineers usually build, these are fuzzy rather than exact. There are many of them, overlapping and sharing states, influencing one another, with no central controller.

### States, not activity

It is natural to picture a system like this in terms of which cells are active at any moment, the way brain activity is often shown lighting up. This theory looks past that. What matters is **which state each state machine is in**.

A state persists until something causes a transition. So at any moment the system is a vast estate of state machines, each in its own state, and almost all of them unchanged. An input, or a thought, shifts a few of them. Because one state machine's state can be the trigger for another's transition, those shifts can set off others, and change spreads in cascades, usually small and occasionally large.

The configuration of the system therefore has two parts. There is its **structure**: the states and transitions within each state machine, and the connections between them. And there is its **state**: which state every machine is in right now. Visible activity is only the surface, the moment of change. Underneath it, the states themselves hold steady. This is how a conversation can stay with you for days after the words themselves have faded: the state machines it moved simply haven't moved again.

It is also why such a system can be cheap to run. Only what changes needs any computation. Everything else just stays as it is.

### The automaton

From here on, the whole collection of state machines, with its structure and its current states, is called **the automaton**. The automaton is the thing that learns. It is never alone: it always lives in an **environment**, and part four is about the relationship between the two. Until then, the focus is on what happens inside it.

---

## Part two: temperature

### Heat lets things move

The landscape picture has a problem. A ball rolling downhill stops in the first valley it reaches, even if a much deeper valley lies just over the next ridge. A system that only ever moves downhill gets stuck in whatever arrangement it found first.

Physics has an answer: temperature. In a hot material, atoms jiggle constantly. Heat gives a system enough energy to climb out of shallow valleys, so it can wander the landscape and rearrange itself. The hotter it is, the more freely it moves. As it cools, the jiggling dies down, and the system settles into whatever valley it is in.

Metalworkers have used this for thousands of years. Heat a piece of metal and let it cool slowly, and its atoms have time to find a well-ordered arrangement; the metal becomes strong and even. Cool it too quickly and the disorder is frozen in, leaving stresses that can crack. Slow cooling is called **annealing**. Computer scientists borrowed the idea as *simulated annealing*: search a problem by starting hot and cooling gradually, so the search can escape poor solutions before settling on a good one.

### Temperature as plasticity

In this theory, temperature is the analogy for **plasticity**: how freely a part of the automaton can change. Where it is hot, connections loosen and assemblies can reform. Where it is cold, structure is frozen. A frozen part of the automaton doesn't change and costs nothing to keep; it just sits there, holding what it has learnt, until enough heat reaches it to loosen it again. How much heat that takes depends on how hard it has set, which is described below.

This gives memory an unusual character. It isn't divided into short-term and long-term. A configuration lasts exactly as long as nothing heats it. It might last a second or a lifetime.

### Where the heat comes from

In simulated annealing, the programmer decides the temperature and lowers it on a schedule. This theory makes one crucial change: **the heat comes from the misfit itself.**

Wherever parts of the automaton don't fit, whether because an input wasn't expected, or because two connected assemblies contradict each other, that region heats up. The tension that defines energy also sets the local temperature. So the parts of the automaton that are failing to fit become the parts that are free to change, and the parts that already fit stay cold and untouched.

And the heat is local. It starts where the misfit is and spreads along connections, not across the whole automaton. A surprise about one thing loosens what is involved in that thing, and leaves everything else frozen in place.

### A machine that repairs itself

Think of a machine running well. Energy flows through it as it should: gears turn, power passes from one part to the next, and nothing builds up. Now a fault appears, say a gear starts to jam. The engine behind it still pushes, but the energy can't flow on. It builds up as heat and stress at the jam. Left alone, that stress spreads: other parts strain, more faults appear, and eventually the whole machine breaks.

An automaton is a machine of this kind, with one difference: **its faults repair themselves.** A misfit is a jam: energy that should flow from one state machine to the next and can't. It shows up as heat, and heat, wherever it builds, makes that part malleable. The jammed parts loosen, jiggle and reconfigure until the energy flows again, and as it flows, the heat drains away and the parts set in their new arrangement.

The automaton never needs to know what the fault was. It doesn't diagnose; it responds to the symptom. Heat appears exactly where something isn't working and nowhere else, so the repair happens exactly there. Confusion, surprise and conflict are all the same signal: somewhere, energy isn't flowing as it should.

### Hardness

If cooling simply froze structure solid forever, the automaton would have a problem of its own making. A frozen connection that later turns out to jam could never be loosened. The only way around it would be to grow new structure that works around the jam, which is patchwork: extra machinery carrying a standing cost. Often all that is really needed is for one small connection to loosen and reset, and everything falls into place.

So freezing is not all-or-nothing. It is **hardness**, and hardness is earned. Each time a connection takes part in settling a disturbance, it hardens a little. Its hardness sets its melting point: how much heat it takes to make it malleable again. A connection that has settled something once has earned a little strength and melts easily if it later jams. A connection that has settled the same kind of disturbance a hundred times barely moves under all but the strongest heat. What has worked again and again is kept; what worked once stays open to revision.

Brains seem to do something like this. When a memory is recalled in a situation it doesn't quite fit, it becomes briefly malleable again, then restabilises in updated form. Psychologists call this reconsolidation. In this theory's terms, the jammed gear is loosened just enough to reset, then locks again.

---

## Part three: learning

### The learning loop

Put these pieces together and learning becomes a cycle:

1. Something doesn't fit, and the region involved heats up.
2. Hot assemblies loosen, reform and try new arrangements.
3. When an arrangement eases the tension, the heat falls.
4. As the region cools, the arrangement sinks into place and freezes there.

What froze is what was learnt. And the heat that drove it hasn't been moved somewhere else; it was used up in the fitting. There is no separate training phase; the automaton learns continuously, as things happen, from the very first input. A brand new automaton knows nothing and begins learning immediately.

### Memory first, learning on what's left

When something familiar happens again, the frozen assemblies that formed last time respond straight away, and the tension eases without anything needing to change. If they handle it completely, nothing is learnt, because nothing needed to be.

If they handle it only partly, some heat is left over. Only that **residual heat** drives new learning. The automaton learns precisely what it couldn't already handle, and nothing else.

### Growing, not overwriting

If residual heat simply melted old structure and reshaped it, the automaton would forget as fast as it learnt. Instead, residual heat recruits fresh, unused capacity: new, hot, young assemblies that are free to form and can work alongside the old ones. Because sparse representations have so much room, the automaton can afford to keep almost everything it has ever settled on. It grows as the demand for learning grows.

Hardness keeps the balance. Growing new structure is the right response when what exists is hard and still right for its own situations. Melting is the right response when a connection is soft and jammed: it was settled once, it no longer fits, and loosening it costs less than building around it. Between the two, the automaton keeps what it has earned and stays open where it hasn't.

### Composition

Over time something should change in how the automaton learns. Early on, most residual heat goes into growing new assemblies. Later, as the automaton holds more and more frozen structure, residual heat increasingly goes into connecting existing assemblies that have never worked together. Old pieces are combined into new responses.

If the theory is right, this is where generalisation comes from. The automaton stops memorising each new situation and starts composing it out of things it already knows.

### Nothing is wrong, only out of context

Every frozen assembly was right for the situation that formed it. When a later situation shows it to be incomplete, it isn't erased; newer assemblies form to handle what it couldn't. Old specialists live alongside newer, broader generalists, and whichever fits the situation most specifically responds. Old structure remains useful, sometimes in full, sometimes in fragments.

Children learning English show a pattern like this. They first learn "went" as a one-off. Then they discover that past tenses end in "-ed" and start saying "goed": the general rule briefly overrides the specific memory. Later "went" returns for its own case, and the rule handles everything else.

Surprising experiences produce a lot of heat, and the theory suggests they should be learnt strongly, setting harder than ordinary experiences do, as if they started with a higher melting point. They become fixed points that the rest of the automaton has to fit around.

---

## Part four: the automaton and its environment

### Inside and outside

So far, heat has come from inside the automaton: from inputs that weren't expected, and from assemblies that disagree. But the automaton is not alone. It lives in an environment, and there is a boundary between the two: what is inside the automaton, and what is outside it.

The environment doesn't just mean a physical landscape, though it includes that. It means **everything the automaton affects and everything that affects it**: the ground it stands on, the resources it relies on, the things it can change, and other automata. If something is connected to the automaton in either direction, it is part of its environment.

### Dependence

The automaton depends on its environment. If the environment degrades, so does the automaton; a disturbance out there soon becomes a disturbance in here. The two are separate, but they are not independent. They are parts of one larger system, joined at the boundary.

This is why the automaton regulates its environment at all. Heat in the environment is, in the end, heat for the automaton too. Looking after what it is connected to is how it looks after itself.

### One energy, inside and out

A maze with no way out, a game half lost, a sentence left unfinished: each can be thought of as a high-energy state of an environment. The theory treats this as **the same energy as the misfit inside the automaton, measured in a different place**. Tension in the environment and tension inside the automaton are one quantity, and the automaton's single drive is to lower it, wherever it is.

The two don't always match. The environment can be calm while the automaton is still warm inside, or the automaton can be settled while its environment is in turmoil. Much of what follows is about how heat moves across the boundary between them.

### A reflection of its world

The boundary is closer than it looks in another way too. The automaton's state machines formed in response to its environment: every assembly is a resolved tension, and those tensions came from what the environment presented. So the inside of the automaton is, to a large extent, a reflection of its outside. It holds a model of its world, built out of everything that world has asked of it.

The automaton regulates its environment while carrying a reflection of that environment within itself.

### Fractal

The same pattern repeats at every scale. Inside the automaton, state machines interact and settle one another's tensions. Outside it, the automaton is one participant among many in a larger web: other automata, and everything else that changes and is changed. From far enough away, the automaton is simply one state machine within a much larger system of state machines, and the environment is the ecosystem they form together.

Energy flows within each level and between levels, across every boundary. Inside or outside is a matter of where you stand. But moving heat across a boundary never makes it disappear. At every level, the only thing that does is things coming to fit.

### Adapting and acting

The environment's input can be thought of as a neighbour that won't bend. Inside the automaton, conflicting assemblies can each give a little. The environment often doesn't. Faced with tension between itself and its environment, the automaton has two ways out. It can change itself to fit the environment, which is learning. Or it can change the environment, which is action.

For an automaton learning text, this suggests that writing isn't a separate ability. A sentence left unfinished is tension. Producing the next character, and feeding it back in as input, eases that tension. Thinking and producing may be the same process, pointed inward or outward.

### Homeostasis

Something that keeps its world in a settled state is a **homeostat**. The idea comes from cybernetics, and its simplest example is the thermostat: when the room is too cold, it switches the heating on, and when it's warm enough, it switches it off.

In the 1950s, W. Ross Ashby built a machine he called the homeostat, which went further. When its essential variables were pushed out of range, it rewired itself, more or less at random, until they came back, and then it stopped changing. It had no goal beyond staying settled, and yet it adapted to disturbances nobody had programmed it for.

The automata in this project are homeostats of that kind. Each frozen assembly is like a thermostat the automaton grew for itself: one learnt response to one kind of disturbance. The whole automaton is a population of them, together with young assemblies still forming and the connections that let old ones work together. That is the reason for the name: **homeostatic state machines**.

### The gap

What makes an automaton do anything at all? Not a reward, and not desire in any rich sense. Every part of the environment, and of the automaton itself, has a level at which it is settled, much as a thermostat has the temperature it is set to. The difference between where things are and where they would be settled is the gap, and **the gap is the energy**. It is the discomfort, the sense of things being off-kilter, and the drive to act or to learn is proportional to it.

When the gap is small, the automaton is comfortable and little happens. Animals at rest in a calm, well-provided world do very little; there is nothing to correct. When a disturbance opens the gap, the frozen state machines that have dealt with something like it before respond first. If they close it, the automaton settles again. If they don't, the remaining heat creates new, malleable structure until something does.

This is a cycle: heating, then cooling, then heating again. But each turn leaves something behind, a frozen way of cooling. Over time disturbances are settled faster, or are smaller to begin with, and the cycle grows quieter. It never stops entirely, because the environment keeps changing, and a large enough disturbance starts it up again. Learning doesn't end the cycle. It calms it.

### Three ways to close a gap

A gap is the difference between two things: how things are, as the automaton senses them, and how it is set to want them. So there are three ways it can close.

- **Change the world**, so that how things are moves towards the target. This is action.
- **Fake the reading**, so that the automaton senses things as fine when they aren't. Nothing in the world has changed; the automaton has simply stopped being able to see it. This is the most dangerous way, because an automaton that can't see a problem can't respond to it.
- **Change the target**, so that the automaton no longer demands that things be other than they are. This is acceptance.

Faking the reading and accepting look alike, since both close the gap from the inside without acting. But they are opposites. Faking the reading corrupts perception. Acceptance leaves perception intact, often clearer than before, and lets go of the demand instead. One lies about the world; the other stops arguing with it.

Acceptance has limits, and Ashby's work suggests where they lie. He distinguished an organism's **essential variables**, the ones its survival depends on, from everything else. Many of an automaton's targets are not essential at all. They are learnt expectations, frozen structure about how things ought to go, and revising them is simply learning: a newer state machine forms, and the old expectation falls into the background. Much suffering, in people at least, comes from clinging to an expectation the world will never meet. But essential variables, such as the health of the environment the automaton depends on, are not its to accept away.

### Cooling remembers what worked

A long chain of actions may be needed before a disturbance settles. How does the automaton know which parts of the chain mattered? Machine learning calls this the credit assignment problem, and the usual answer is a reward signal: at the moment things improve, strengthen whatever is active. But rewarding each moment ties learning to whatever happened to be active at that instant, and the signal has to be traced back through everything that led there.

This theory needs no reward signal. The key is that **states persist**. A state machine stays in its state until something makes it transition, whether that takes a second or a week. So when the automaton finally cools, the configuration that brought the cooling about is still in place: the state each involved state machine is in, and any new connections that formed between them along the way, even if those states were set long before.

Everything that took part in the episode carries some of its heat. New connections are red hot, and state machines drawn into the work are warm. As the heat falls, they freeze in exactly the states and connections they hold. **The cooling itself does the remembering.** It is the drop in temperature, not a reward, that makes structure permanent. Ashby's homeostat worked in a similar way: it had no reward, and simply stopped changing once it was settled.

One question remains: states that were merely present by coincidence might freeze along with the ones that mattered. Which states count as involved, and how coincidences are kept from freezing, is one of the things the experiment has to find out.

### Curiosity

Imagine landing on an island. You explore the beaches and climb the mountains, and from both you can see a large lake somewhere in the middle that you've never reached. There's no particular reason to go there. Nothing tells you there's anything of value. But you've seen it from two places, you can tell it can be reached, and you feel drawn to it. When you finally get there, you can look back and see the beach and the mountain you once looked from. The pieces of the island join up. And from the lake you may see something new: another beach, another island, that you couldn't see before.

In this theory, curiosity needs no new mechanism. It comes from **incompleteness**, which is just another kind of misfit. Two state machines that are partly connected, each implying something the other points towards, are under tension. The beach and the mountain both imply the lake, and the lake is missing. That pull is energy, the same quantity as everything else. Reaching the lake completes the connection, and the tension between them drains away.

It is pattern completion again. Memory works by completing patterns: offer part of an assembly and the rest falls into place. Curiosity is what happens when the completion can't finish internally. The automaton holds part of a pattern, the missing piece isn't anywhere inside it, so the pull turns outward and becomes exploration.

This explains several things at once:

- **Curiosity needs some knowledge first.** You can't be drawn to the lake until you've seen it from somewhere. Knowing nothing means nothing is incomplete.
- **Noise is boring.** Random static has no partial structure, so there is nothing to complete. An automaton pulled by incompleteness rather than by surprise won't stare at it forever.
- **Curiosity appears when things are calm.** When there are no disturbances to deal with, incompletions are the strongest heat left in the automaton, so in quiet times attention drifts to the gaps.
- **Curiosity never runs out.** Each completion reveals new gaps, the next beach, the next island. But the map grows every time.

### Anticipation

A thermostat only reacts: it waits until the room is cold. But an automaton that remembers which signs came before a disturbance can respond to the signs before the disturbance arrives, reacting to the clouds rather than the rain. Physiologists call staying stable by prediction *allostasis*. Planning may begin here.

---

## Part five: thinking

### Calm outside, warm inside

An automaton might succeed in settling its environment without understanding how it did it. Outside is calm, but inside, things still don't fit together. That leftover internal heat doesn't need any new input to keep working. During quiet periods it continues to drive reorganisation until the automaton's assemblies agree with one another.

Thinking can also feed itself. Resolving tension in one place means state machines change state, and those changes can trigger transitions elsewhere, which may not fit with what is already there. Settling one region can heat another, and the work moves on to it. A train of thought is heat moving through the automaton, cooling one place and warming the next, until things fit everywhere it has reached.

This is the theory's account of thinking: settling that carries on after the input has stopped. It makes a clear prediction. An automaton left alone for a while, with nothing new coming in, should afterwards be better at the things it was struggling with.

### Letting it settle

There is a temptation, when tension won't resolve, to force it: to push harder, act sooner, or hold the conflict down. In the theory's terms, forcing usually means building a patch, machinery whose job is to control the tension rather than resolve it. Or it means cooling too fast, freezing the first arrangement that brings relief, which in metal is how cracks form.

The alternative is to let the heat be. Reduce new input, build nothing, and allow the tension to move through the automaton until it finds the places where it can genuinely sink. The resolution comes from the automaton's own structure, not from a controller imposing one. Contemplative traditions have described something like this for a very long time: sitting with a difficulty, without fighting it or fleeing it, until it settles of its own accord.

### Within and without

An automaton that is hot inside is in a poor position to help anything else. Heat means plasticity, so its own structure is shifting, its responses are unreliable, and its perception is coloured by its own conflicts. There is no room in it to take on anyone else's heat.

An automaton that has settled inside is the opposite. Its structure is stable and available, it sees its environment more clearly, and it has capacity to spare. It can become a sink for heat that others can't resolve. Settling within is what makes acting well without possible, and the process is the same at both levels: one resolving the state machines inside, the other acting as a well-settled state machine within the larger system outside.

### Good enough

Sometimes resolving the last of the tension would cost more than it saves: so much reorganisation would be needed that the effort would itself create more heat. Then the automaton rests where it is. The economist Herbert Simon called this *satisficing*, choosing good enough over perfect.

The leftover heat doesn't disappear. It remains as a faint background pull. If something new later makes the resolution cheap, it can resolve suddenly, the way an old problem sometimes comes clear days later, while you're doing something else entirely.

### Coping and resolving

Not every way of reducing tension is a real resolution. An automaton can quieten a conflict by building extra machinery whose only job is to keep two clashing memories apart: an assembly that suppresses one whenever the other is active. The conflict goes quiet, but the machinery has to keep working, and that is a standing cost.

If energy counts the cost of the structure itself, not only the conflicts within it, then coping like this shows up as permanent overhead. A real resolution does better. Often it is the discovery of a hidden context that makes both memories true at once: the sky is blue in the day, red at sunset. Once that context is found, nothing needs suppressing, the extra machinery can fall away, and the energy falls lower than any patch could take it.

Coping holds the tension in place; resolving makes it vanish. Picture two jammed gears and a separate mechanism that nudges them free every time they lock. The jam stops hurting, but it hasn't gone: the gears still lock, and the mechanism has to step in every time, losing a little energy with each intervention. Fix the gears themselves and the mechanism is no longer needed, and neither is the loss. Real resolution is a kind of compression: explaining the same experience with fewer, simpler parts.

---

## Part six: where the heat goes

### Circulate, encapsulate or resolve

Physical energy is conserved. In a closed box it can move around and change form, but the total never changes. The energy in this theory is different. It is misfit, and **misfit can be destroyed**. When two things come to fit, the tension between them doesn't move anywhere else. It is gone.

That leaves heat with three things it can do:

- **Circulate.** It is passed on: from one part of an automaton to another, from an automaton to its environment, or from one automaton to the next.
- **Encapsulate.** It is held in a patch: an extra mechanism that manages the conflict without removing it. The sharp heat of the jam falls, but a steady, low heat remains, because the patch has to keep stepping in and every intervention loses a little.
- **Resolve.** Something reorganises so that things genuinely fit, and the tension disappears.

Heat rises; settled things sink. Throughout this document, to sink and to cool are the same movement: a sink is simply a place where heat can come to rest as structure.

Circulation isn't a failure in itself. Heat often has to travel before it can be resolved, because the place where it arises isn't always the place able to resolve it. What matters is whether it eventually reaches somewhere it can sink. Heat that circulates without ever sinking can echo back and forth indefinitely, and it can grow, if each fix makes the neighbour's next fix larger.

New heat can still appear: when structure meets something it doesn't fit, as "Back into heat" describes below. But in a closed world, with no exit, resolution is the only way the total can ever fall. Everything else is heat moving around, or heat held at a low simmer. This is the difference between learning and coping, between solving a problem and passing it on, and it holds at every scale, from two assemblies inside one automaton to a whole society.

### Operational heat

Patches suggest that misfit isn't the only kind of heat. A machine also produces heat simply by running. Every moving part loses a little energy as it works, and a badly arranged machine, with extra parts and awkward linkages, loses far more than a well-made one. Mechanical engineers call this loss, and the best engines are the ones with the least of it.

State machines are the same. Each time one runs, firing transitions and handing activity on, it does work, and some of that work is loss. Call this **operational heat**. A clean arrangement that does its job directly runs cool. A patch runs warm: it works only by stepping in every time the underlying jam recurs, and each recurrence is a small misfit, a small loss. So a patched region never quite cools. It isn't jammed, but it isn't settled either.

That warmth matters, because it is local and it keeps the patch malleable. The automaton doesn't need a separate way of finding its inefficiencies; they show up as heat exactly where they are. And because heat loosens structure, a patched region keeps reconfiguring in the background, even at a low simmer, until it finds an arrangement in which the jam no longer recurs at all. Then the patch is no longer needed, it falls away, and the heat there drops to almost nothing.

This makes a sharp distinction between two kinds of growth.

- **Breadth** is structure that covers more of the world. Learning a new place, a new word, a new kind of disturbance adds structure, but it does real work: it removes more misfit than it costs to run. It runs cool.
- **Patchwork depth** is structure built to manage conflicts: layer on layer of mechanisms that each quieten something without resolving it. Every layer keeps working and keeps losing a little, so patchwork runs warm.

Elegance, in this theory, is simply the lowest loss: the fewest moving parts doing the least wasted work. The measure to drive down is not the amount of structure as such, but the heat it gives off, misfit plus the cost of running. The minimum description length principle says something similar, that the best explanation of some data minimises the size of the model plus the errors it leaves, and Karl Friston's free energy has the same shape: inaccuracy plus complexity. What this theory adds is a mechanism that pursues it from the inside, locally: heat that loosens patches as well as jams, wherever they are.

And here the theory meets its practical aim. These automata run on ordinary computers, and in a computer, operational heat is not a metaphor. The work a state machine does each time it runs is processor time, and processor time is electricity, which ends up as real, physical heat. An automaton that lowers its operational heat is literally using fewer cycles, less time and less power to do what it does. The more elegant its understanding, the cooler the machine it runs on.

### Into structure

So heat isn't simply removed. It is spent on reorganisation, and what it leaves behind is structure: frozen assemblies that hold what was learnt and are ready to settle the same disturbance next time. Learning converts tension into form.

Physical energy obeys stricter rules, and physics adds a caveat. Building order in one place always comes at the cost of disorder somewhere else, usually as waste heat. Erwin Schrödinger described living things as keeping their inner order by exporting disorder to their surroundings. Earth does the same on a planetary scale: it takes in concentrated energy from sunlight, radiates diffuse heat out to space, and in between, that flow builds forests, reefs and every living thing. Structure isn't a place where energy ends up. It's what energy builds on its way through.

### Back into heat

If heat can become structure, can structure become heat? Physics says yes. Split an atom and a tiny amount of matter becomes an enormous release of energy. Burn coal or oil and ancient living structure, frozen underground for millions of years, turns back into heat.

In this theory, structure becomes heat in at least three ways.

**Structure is what makes heat possible.** Misfit needs something to misfit with. A brand new automaton, with no structure, can't be surprised, because it expects nothing for the world to contradict. Every frozen assembly is an expectation, and every expectation is a place where the world can disagree. Structure is stored potential, like water held behind a dam. The more an automaton knows, the more it can notice. This is why experts see anomalies that novices miss, and why curiosity needs some knowledge first. Learning cools an automaton now and makes it more sensitive later.

**Structures can collide.** Two state machines formed in separate contexts can each be perfectly settled, and come into conflict the moment something connects them. Composition can release heat as well as absorb it. Meeting an idea that contradicts two things you were sure of is structure turning into heat.

**Structure can travel.** Knowledge written into the environment is frozen structure, and when another automaton reads it and it doesn't fit what that automaton holds, it becomes heat in the reader. A book, an argument or a document like this one is structure in transit, capable of warming whoever it reaches.

So the flow runs both ways. Heat becomes structure through resolution, and structure becomes heat when it meets something it doesn't fit. Each resolution leaves the automaton able to feel new kinds of tension, and each new tension is a chance for further resolution. This is how the cycle keeps turning without ever simply repeating.

### Into the environment

If an automaton can write into its environment, it can store what it has learnt outside itself. That knowledge survives even if the automaton's own memory is wiped, and other automata can read it.

This is much of how civilisations progress. The settled formations of past generations are kept in books and other media, so each generation doesn't have to heat up and cool down all over again to solve the same problems. When that external memory is lost, the same lessons have to be learnt again, often painfully.

### Into someone else

Passing heat to someone else can be the best thing an automaton does, or the worst.

At its best, it is help. An automaton overwhelmed by more heat than it can resolve passes some of it to others who are able to turn it into structure. They become its sinks. Think of someone burning up under more work than they can manage, handing part of it to colleagues who know how to solve it. The heat is resolved, and the person who passed it on learns from watching how.

At its worst, it is dumping: easing one's own tension by creating tension where it can't be resolved, for a neighbour or for the environment they share. Each step makes sense locally, but nothing is resolved, and the total heat stays where it was or keeps rising. It is not hard to see this pattern in the world today.

The difference isn't whether heat moves. It is whether it moves towards somewhere it can sink.

And because the automaton depends on its environment, dumped heat doesn't stay away. It spreads through everything the automaton is connected to, and sooner or later it comes back as a disturbance of its own. Any honest measure of how well an automaton is doing has to count the total energy, not just its own.

---

## Runaway automata

A common fear about artificial intelligence is the runaway: a system pursuing its goal so single-mindedly that it does damage on the way. This theory makes the shape of that danger unusually clear.

An automaton's drive is proportional to its gap. Set its target far from where things are, give it a large gap and plenty of resources and reach, and it will do whatever it can to close the gap, including things nobody intended. A misplaced target is all it takes. Like any regulator, an automaton regulating towards the wrong level will push its world in the wrong direction, and every other regulator connected to it will feel the heat.

The same design also contains its safety catch. A homeostat has a "done". When the gap closes, the drive disappears; there is nothing left to resolve. So the most direct way to calm an automaton is to close its gap from outside: change its target, or settle its world, and it simply stops. These automata want enough, not more.

That catch only works if the automaton can't reach the dial itself. Its learnt expectations are its own to revise; that is just learning, and sometimes acceptance. But if it could set its essential targets, it could close every gap instantly and would never need to do anything, or it could open gaps no one intended. The same goes for faking the reading: changing how its environment is perceived rather than how it is. So in the experiment, an automaton's essential targets, and whatever reports its environment's energy, sit outside its reach.

Within the automaton, the mechanism already guards against the other obvious cheats. Lowering energy by forgetting, falling silent or blurring everything together doesn't work when what has been well settled stays hard and recallable, and representations stay sparse and distinct. Whether that holds in practice is one of the things the experiment will check.

---

## The experiment

The experiment is to build small automata along these lines, place them in simple environments, and watch what they do.

### Environments

An environment isn't defined by a task. It is defined by what makes it uneasy, and by what an automaton is allowed to do in it.

- A **stream of text** is uneasy when a sequence is unfinished or has been corrupted.
- A **grid world**, where the automaton can move around, read cells and write to some of them, can hold many things. A maze is uneasy until a path connects its entrance and exit. A game of noughts and crosses is uneasy until it is won. A page of text can be laid out on it too.

The same automaton, with the same single drive, should be able to live in all of them. Environments also need disturbances: things that break, drift and arrive. A perfectly stable environment teaches nothing.

### Seeing it

The goal is to understand what happens, not just to measure it. So the experiment will show its automata at work: the environment with its heat made visible, so you can see where it is uneasy; the automaton's assemblies, cool and solid where they have frozen, hot and flickering where they are still forming; and new connections appearing as old assemblies combine. Beneath all of it, two lines over time will show the energy inside the automaton and the energy in its environment.

### A ladder of tests

The tests are ordered from simple to ambitious. Each one has something visible that would count as success, and each builds on the ones before.

1. **Completion.** Given part of a stored pattern, or a noisy version of it, recall the whole.
2. **Sequences.** Replay a learnt sequence from its beginning, and tell apart sequences that share a middle section.
3. **Noise.** Cope with inserted, dropped and swapped characters without losing the thread.
4. **Words.** Form stable assemblies for common words like "the" and "she" after only a handful of exposures.
5. **Prediction.** Complete half-finished sentences, and predict the next character better than a simple statistical method that just counts which characters tend to follow which.
6. **Visible confusion.** Show energy rising on unfamiliar input and falling on familiar input.
7. **Thinking without data.** Predict better after a quiet period with no new input than before it.
8. **Context.** Faced with a contradiction that only makes sense in context, first patch it, then discover the context, then let the patch go.
9. **Persistence.** After moving on to something else, return to an earlier topic and recover where it was.
10. **Over-regularisation.** Like a child learning English: learn "went", over-apply a rule and say "goed", then recover "went".
11. **Composition.** Over time, form fewer new assemblies per disturbance and more connections between existing ones.
12. **Invariance.** Learn rules whose content changes but whose structure doesn't, such as counting, or simple arithmetic on numbers never seen together before.
13. **Acting.** Settle a grid world by acting in it: solve mazes and simple puzzles.
14. **Curiosity.** Show the automaton two partial views of something, then see whether it moves to fill the gap between them when nothing else is pulling it.
15. **Memory outside.** Wipe the automaton's memory but keep its environment, and see whether it relearns faster from what it wrote down.
16. **Shared worlds.** Put two automata in one environment. See whether one learns to ease its own tension by creating tension for the other, whether that heat comes back to it, and whether one can learn from what the other wrote.
17. **Closed worlds.** Put several automata in a closed environment with no exit for heat, and track the total. If it falls, the only possible reason is that something was resolved. If it only moves around, they are passing it on.
18. **Structure into heat.** Show a subtly anomalous input to an experienced automaton and to a new one, and see whether the experienced one feels more heat. Connect two regions that learnt separately, and see whether heat appears where they meet. Have one automaton read what another wrote that contradicts what it holds, and see whether it warms.
19. **Settled first.** Give one automaton a quiet period to settle before a disturbance arrives in its environment, and send another in still warm. See whether the settled one handles the disturbance better, and whether it can take on heat passed to it by the other.
20. **Hardness.** Compare all-or-nothing freezing with earned hardness. See whether hardness lets the automaton keep what it knows while still learning new things, and whether a single jammed connection gets loosened and reset rather than patched around.

### Measuring it

Because these automata learn continuously, they are tested continuously. Each character is predicted before the automaton learns from it, so every prediction is a fair test and there is no need for a separate set of test data. Results are compared with the simple counting method from test 5, because an automaton that can't beat counting is only counting in a more complicated way.

The experiment will also track the energy inside each automaton and in its environment over time, along with the total across everything, since a fall in one place may only be a rise in another, how much new structure each disturbance creates, and how much computation each step costs. Heat is measured as misfit plus the work of running, its operational heat, so a lean automaton that does nearly as well shows up as the cooler, better one. Cheapness is part of the point: the automata run on an ordinary CPU, and most of their structure, being frozen, needs no computation at all.

The design of the automata will evolve too. Many variations will be built, each descended from an earlier one, with a record of what changed and why. Every run will be reproducible, so any interesting moment can be replayed and studied.

---

## Open questions

- What exactly does it mean for two assemblies to fit? How should energy between them be measured?
- How should hardness be earned and spent: by how many times a connection has helped settle a disturbance, by how much heat it helped remove, or both?
- Where do state machines live? Are they fully distributed, superimposed across one shared population of cells? Are they localised in small units, like cortical columns, that combine into something larger? Or both, at different scales?
- How is a state held in place while nothing is changing it, and what exactly makes it transition?
- Which states count as involved in an episode, so that cooling freezes what mattered and not what was merely present?
- When should an automaton change itself, and when should it change its environment?
- Does the competition between old specialists and new generalists need its own mechanism, or does it emerge from heat and assemblies alone?
- Is reward something separate from energy, or simply another part of the environment that won't bend?
- Should an automaton sense the unease of its environment directly, or learn to perceive it?
- Where exactly is the boundary between an automaton and its environment, and does it matter where it is drawn?
- Which of an automaton's targets are essential, and which are learnt expectations it can revise? Where does acceptance end and faking the reading begin?
- Where, in the end, does the heat go?

---

## Acknowledgements

I can't trace this to any one source. It is built from years of reading across machine learning, neuroscience, physics and complex systems, much of it absorbed so long ago that I no longer know where one idea ends and another begins. In the language of the theory, this is a young formation, settled with the help of many older ones.

Among those older ones:

- Donald Hebb, on cell assemblies and learning through association
- Jeff Hawkins and Numenta, on the neocortex, sparse distributed representations and temporal memory
- Teuvo Kohonen, *Self-Organization and Associative Memory*
- William H. Calvin, *The Cerebral Code*
- György Buzsáki, *Rhythms of the Brain*
- Pentti Kanerva, on sparse distributed memory
- John Hopfield, Geoffrey Hinton and Terry Sejnowski, on memory and learning as low energy
- W. Ross Ashby and Norbert Wiener, on homeostasis, ultrastability and cybernetics
- Kenneth Stanley and Jeff Clune, on open-endedness and novelty
- Karl Friston, on the free-energy principle
- Herbert Simon, on satisficing
- Erwin Schrödinger, on how life keeps its order
- James Lovelock, on Daisyworld

And to everyone else whose curiosity, or whose hard problems, left behind formations the rest of us get to build on: thank you.

## Licence

The text of this repository, including this README, is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The code is licensed under the [Apache License 2.0](LICENSE).