import { MatchTeams } from './MatchTeams'

export interface MatchSummary {
    teams: MatchTeams
    finalScores: [number, number]
}
