package judge

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"

	"hsm/gridworld/world"
)

// TraceWriter writes a compact JSON-lines trace of a run.
//
// Line 1 is a header with the full initial grid and energy field. Each later
// line is one step and carries only what changed:
//
//	{"t":12,"a":5,"x":3,"y":4,"m":1,"E":2.5,"F":1.0,"I":0.1,"k":0,"c":[i,s,...],"h":[i,v,...]}
//
// t step, a action index, x/y agent position after the step, m whether the
// action had an effect, E true total energy, F felt energy, I the automaton's
// internal energy, k carried symbol, c changed cells (index, symbol pairs),
// h changed field values (index, energy pairs). Events (layout change,
// erased marks) are lines with "ev".
type TraceWriter struct {
	f     *os.File
	w     *bufio.Writer
	cells []world.Sym
	field []float64
	buf   []byte
}

func NewTrace(path string) (*TraceWriter, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	return &TraceWriter{f: f, w: bufio.NewWriterSize(f, 1<<16)}, nil
}

func (t *TraceWriter) Close() error {
	t.w.Flush()
	return t.f.Close()
}

func round3(x float64) float64 { return math.Round(x*1000) / 1000 }

func (t *TraceWriter) Header(r *Runner) {
	g := r.Env.Grid()
	field := r.Env.Field()
	cells := make([]byte, len(g.Cells))
	locked := make([]byte, len(g.Cells))
	for i, s := range g.Cells {
		cells[i] = world.SymChars[s]
		locked[i] = '0'
		if g.Locked[i] {
			locked[i] = '1'
		}
	}
	fl := make([]float64, len(field))
	for i, v := range field {
		fl[i] = round3(v)
	}
	acts := make([]string, world.NumActions)
	for i := range acts {
		acts[i] = world.ActionNames[i]
	}
	h := map[string]any{
		"type": "header", "env": r.Env.Name(), "desc": r.Env.Info().Desc, "agent": r.Agent.Name(),
		"feel": r.Spec.Feel.String(), "radius": r.Spec.Radius,
		"w": g.W, "h": g.H, "x": g.AX, "y": g.AY, "syms": world.SymChars, "symNames": world.SymNames[:],
		"actions": acts, "cells": string(cells), "locked": string(locked), "field": fl, "E": round3(r.Env.Total()),
		"settle": r.Env.Info().SettleLevel,
	}
	b, _ := json.Marshal(h)
	t.w.Write(b)
	t.w.WriteByte('\n')
	t.cells = append(t.cells[:0], g.Cells...)
	t.field = append(t.field[:0], fl...)
}

func (t *TraceWriter) Event(r *Runner, what string) {
	fmt.Fprintf(t.w, "{\"ev\":%q,\"t\":%d}\n", what, r.T)
	// a full refresh follows so the replay stays exact
	t.Header(r)
}

func (t *TraceWriter) Step(r *Runner, a world.Action, felt float64) {
	g := r.Env.Grid()
	field := r.Env.Field()
	b := t.buf[:0]
	b = append(b, `{"t":`...)
	b = strconv.AppendInt(b, int64(r.T+1), 10)
	b = append(b, `,"a":`...)
	b = strconv.AppendInt(b, int64(a), 10)
	b = append(b, `,"x":`...)
	b = strconv.AppendInt(b, int64(g.AX), 10)
	b = append(b, `,"y":`...)
	b = strconv.AppendInt(b, int64(g.AY), 10)
	b = append(b, `,"m":`...)
	if r.moved {
		b = append(b, '1')
	} else {
		b = append(b, '0')
	}
	b = append(b, `,"E":`...)
	b = strconv.AppendFloat(b, round3(r.Env.Total()), 'g', -1, 64)
	b = append(b, `,"F":`...)
	b = strconv.AppendFloat(b, round3(felt), 'g', -1, 64)
	b = append(b, `,"I":`...)
	ie := r.Agent.Energy()
	if math.IsNaN(ie) || math.IsInf(ie, 0) {
		ie = 0
	}
	b = strconv.AppendFloat(b, round3(ie), 'g', 6, 64)
	b = append(b, `,"k":`...)
	b = strconv.AppendInt(b, int64(g.Carry), 10)
	first := true
	for i, s := range g.Cells {
		if s != t.cells[i] {
			if first {
				b = append(b, `,"c":[`...)
				first = false
			} else {
				b = append(b, ',')
			}
			b = strconv.AppendInt(b, int64(i), 10)
			b = append(b, ',')
			b = strconv.AppendInt(b, int64(s), 10)
			t.cells[i] = s
		}
	}
	if !first {
		b = append(b, ']')
	}
	first = true
	for i, v := range field {
		v = round3(v)
		if v != t.field[i] {
			if first {
				b = append(b, `,"h":[`...)
				first = false
			} else {
				b = append(b, ',')
			}
			b = strconv.AppendInt(b, int64(i), 10)
			b = append(b, ',')
			b = strconv.AppendFloat(b, v, 'g', -1, 64)
			t.field[i] = v
		}
	}
	if !first {
		b = append(b, ']')
	}
	b = append(b, "}\n"...)
	t.w.Write(b)
	t.buf = b
}
