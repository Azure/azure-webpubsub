import { createStore } from 'vuex'
import { ScoreboardSourceOptions } from '@/ScoreboardSourceOptions'
import { MatchTeams } from '@/models/MatchTeams'
import { ScoreSource } from '@/ScoreSource'

export default createStore({
    state: {
        source: {
            options: {
                value: <ScoreboardSourceOptions>{},
            },
            instance: { value: null as ScoreSource | null },
        },
        selected: { teams: {} as MatchTeams },
    },
    mutations: {
        updateCurrentSelectedMatch(state, teams): void {
            state.selected.teams = teams
        },
        setSourceInstance(state, scoreSource) {
            state.source.instance.value = scoreSource
        },
    },
    getters: {},
    actions: {},
    modules: {},
})
