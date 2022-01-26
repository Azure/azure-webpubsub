import { createStore } from 'vuex'
import { ScoreboardSourceOptions } from '@/ScoreboardSourceOptions'
import { MatchTeams } from '@/models/MatchTeams'
import { ScoreSource } from '@/ScoreSource'

const options = <ScoreboardSourceOptions>{}
options.onGettingRealtimeMatchDetailsScore = []

export default createStore({
    state: {
        source: {
            options: {
                value: options,
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
