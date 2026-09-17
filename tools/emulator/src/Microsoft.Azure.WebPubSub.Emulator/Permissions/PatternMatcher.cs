// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal partial class PatternMatcher(PatternTokenString tokenString)
{
    private readonly DFA _dfa = CreateDFA(tokenString);

    private static DFA CreateDFA(PatternTokenString tokenString) =>
        DFA.FromNFA(NFA.Build(tokenString));

    public bool Matches(string input)
    {
        var queue = new Queue<(DFAState state, int index)>();
        var visited = new HashSet<(int stateId, int index)>();

        queue.Enqueue((_dfa.Start, 0));

        while (queue.Count > 0)
        {
            var (state, index) = queue.Dequeue();

            if (!visited.Add((state.Id, index)))
            {
                continue;
            }

            if (index == input.Length)
            {
                if (state.IsAccepting)
                {
                    return true;
                }
                continue;
            }

            char c = input[index];
            foreach (var (charClass, target) in state.Transitions)
            {
                if (charClass.Contains(c))
                {
                    queue.Enqueue((target, index + 1));
                }
            }
        }

        return false;
    }

    private sealed class State(int id)
    {
        public int Id { get; } = id;
        public List<(CharacterSet, State)> Transitions { get; } = [];
        public List<State> EpsilonTransitions { get; } = [];

        public void AddTransition(CharacterSet charClass, State target) =>
            Transitions.Add((charClass, target));

        public void AddEpsilon(State target) =>
            EpsilonTransitions.Add(target);
    }

    private sealed class NFA(State start, HashSet<State> accepts)
    {
        public State Start { get; } = start;
        public HashSet<State> Accepts { get; } = accepts;

        public static NFA Build(PatternTokenString tokenString)
        {
            if (tokenString.Count == 0)
            {
                var s = new State(0);
                return new NFA(s, [s]);
            }

            int stateId = 0;
            var current = CreateFragment(tokenString[0], ref stateId);
            for (int i = 1; i < tokenString.Count; i++)
            {
                var next = CreateFragment(tokenString[i], ref stateId);
                foreach (var accept in current.Accepts)
                {
                    accept.AddEpsilon(next.Start);
                }
                current = new NFA(current.Start, next.Accepts);
            }
            return current;
        }

        private static NFA CreateFragment(PatternToken token, ref int stateId)
        {
            var start = new State(stateId++);
            var end = new State(stateId++);

            switch (token.Type)
            {
                case PatternTokenType.Literal:
                    start.AddTransition(new CharacterSet(false, [token.Value!.Value]), end);
                    break;
                case PatternTokenType.QuestionMark:
                    start.AddTransition(CharacterSet.ExceptDot, end);
                    break;
                case PatternTokenType.Asterisk:
                    var loop1 = new State(stateId++);
                    start.AddEpsilon(loop1);
                    loop1.AddTransition(CharacterSet.ExceptDot, loop1);
                    loop1.AddEpsilon(end);
                    break;
                case PatternTokenType.DoubleAsterisk:
                    var loop2 = new State(stateId++);
                    start.AddEpsilon(loop2);
                    loop2.AddTransition(CharacterSet.All, loop2);
                    loop2.AddEpsilon(end);
                    break;
            }

            return new NFA(start, [end]);
        }
    }

    private sealed class DFAState(int id, bool isAccepting)
    {
        public int Id { get; } = id;
        public bool IsAccepting { get; set; } = isAccepting;
        public List<(CharacterSet, DFAState)> Transitions { get; } = [];

        public void AddTransition(CharacterSet charClass, DFAState target) =>
            Transitions.Add((charClass, target));
    }
}