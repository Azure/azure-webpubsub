import { RealtimeScore } from './RealtimeScore'
import { MatchTeams } from './MatchTeams'
import { MatchSummary } from './MatchSummary'

const maxQuarter = 4

export class MatchDetails {
    teams: MatchTeams
    timeline: Array<RealtimeScore>
    constructor(teams: MatchTeams, timeline: Array<RealtimeScore> = []) {
        this.teams = teams
        this.timeline = timeline
    }

    getSummary(): MatchSummary {
        const finalScores: [number, number] = [0, 0]
        for (let q = 0; q < maxQuarter; q++) {
            const scoreL = getScoreByQuarter(this.timeline, q, true)
            const scoreR = getScoreByQuarter(this.timeline, q, false)
            finalScores[0] += scoreL
            finalScores[1] += scoreR
        }
        return <MatchSummary>{
            teams: this.teams,
            finalScores,
        }
    }
}

function getScoreByQuarter(timeline: Array<RealtimeScore>, quarter: number, isLeft: boolean): number {
    const detailsList = timeline.filter(g => g.quarter === quarter)
    const details = detailsList[detailsList.length - 1]
    return details.scores[isLeft ? 0 : 1]
}
