// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal partial class PatternMatcher
{
    private sealed class DFA(DFAState start, List<DFAState> states)
    {
        public DFAState Start { get; } = start;
        public List<DFAState> States { get; } = states;

        public static DFA FromNFA(NFA nfa)
        {
            static HashSet<State> EpsilonClosure(HashSet<State> states)
            {
                var stack = new Stack<State>(states);
                var closure = new HashSet<State>(states);
                while (stack.Count > 0)
                {
                    var state = stack.Pop();
                    foreach (var next in state.EpsilonTransitions)
                    {
                        if (closure.Add(next))
                        {
                            stack.Push(next);
                        }
                    }
                }
                return closure;
            }

            var stateId = 0;
            var dfaStates = new Dictionary<string, DFAState>();
            var queue = new Queue<HashSet<State>>();

            string GetKey(HashSet<State> states) =>
                string.Join(",", states.Select(s => s.Id).OrderBy(id => id));

            var startClosure = EpsilonClosure([nfa.Start]);
            var startKey = GetKey(startClosure);
            var startDFA = new DFAState(stateId++, startClosure.Any(s => nfa.Accepts.Contains(s)));
            dfaStates[startKey] = startDFA;
            queue.Enqueue(startClosure);

            while (queue.Count > 0)
            {
                var currentSet = queue.Dequeue();
                var currentKey = GetKey(currentSet);
                var currentDFA = dfaStates[currentKey];

                var grouped = new Dictionary<CharacterSet, HashSet<State>>();

                foreach (var state in currentSet)
                {
                    foreach (var (charClass, target) in state.Transitions)
                    {
                        if (!grouped.TryGetValue(charClass, out var set))
                        {
                            set = [];
                            grouped[charClass] = set;
                        }
                        set.Add(target);
                    }
                }

                foreach (var (charClass, moveSet) in grouped)
                {
                    var closure = EpsilonClosure(moveSet);
                    var closureKey = GetKey(closure);
                    if (!dfaStates.TryGetValue(closureKey, out var value))
                    {
                        var newDFA = new DFAState(stateId++, closure.Any(s => nfa.Accepts.Contains(s)));
                        value = newDFA;
                        dfaStates[closureKey] = value;
                        queue.Enqueue(closure);
                    }
                    currentDFA.AddTransition(charClass, value);
                }
            }

            return new DFA(startDFA, [.. dfaStates.Values]);
        }
    }
}