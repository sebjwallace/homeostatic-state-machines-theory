#!/usr/bin/env python3
"""A minimal external automaton speaking the gridworld line protocol.

It moves towards the hottest cell it can feel (local feel) and otherwise picks
a random allowed action. It exists to show the protocol, not to do well.

Run it through the judge:
    go run ./cmd/judge -quick -ext "pyrandom=python3 examples/random_agent.py"
"""
import random
import sys

allowed = list(range(9))
radius = 2
rng = random.Random(0)


def reply(s):
    sys.stdout.write(s + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    w = line.split()
    if not w:
        continue
    cmd = w[0]
    if cmd == "seed":
        rng.seed(int(w[1]))
        reply("ok")
    elif cmd == "enter":
        # enter <env> <radius> <feel> <allowed> <syms>
        radius = int(w[2])
        allowed = [i for i, c in enumerate(w[4]) if c == "1"]
        reply("ok")
    elif cmd == "act":
        # act <step> <felt> <carry> <moved> <view> [heat]
        side = 2 * radius + 1
        a = rng.choice(allowed)
        if len(w) > 6:
            heat = [float(x) for x in w[6].split(",")]
            k = max(range(len(heat)), key=lambda i: heat[i])
            if heat[k] > 0 and rng.random() < 0.7:
                dy, dx = k // side - radius, k % side - radius
                if dx == 0 and dy == 0:
                    a = rng.choice([x for x in allowed if x >= 5] or allowed)
                elif abs(dy) >= abs(dx):
                    a = 1 if dy < 0 else 3
                else:
                    a = 2 if dx > 0 else 4
        reply(str(a) + " 0")
    elif cmd == "stats":
        reply("")
    elif cmd == "quit":
        break
    else:  # quiet, learning, freezing
        reply("ok")
