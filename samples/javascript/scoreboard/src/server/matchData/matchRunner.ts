import utils from '../../common/utils'
import { MatchDetails } from '../../models/MatchDetails'
import { WebPubSubServiceClient } from '@azure/web-pubsub'
import { RealtimeMatchDetailsPayload } from '../../models/payloads/RealtimeMatchDetailsPayload'
import constants from '../../common/constants'
import { RealtimeScore } from '../../models/RealtimeScore'
import { MatchTeams } from '../../models/MatchTeams'

const maxQuarter = 4

export class MatchRunner {
    private matchList: Array<MatchDetails>
    private serviceClient: WebPubSubServiceClient
    private timelineIndexMap: { [key: string]: number }

    constructor(matchList: Array<MatchDetails>, serviceClient: WebPubSubServiceClient) {
        this.matchList = matchList
        this.serviceClient = serviceClient
        this.timelineIndexMap = {}
        this.matchList.forEach(m => (this.timelineIndexMap[utils.getId(m.teams)] = 0))
    }

    run(): void {
        this.matchList.forEach(m => this.runCore(m))
    }

    getCurrentMatchDetails(teams: MatchTeams): RealtimeMatchDetailsPayload {
        const id = utils.getId(teams)
        const index = this.timelineIndexMap[id]
        const match = this.matchList.filter(m => utils.getId(m.teams) === utils.getId(teams))[0]
        const quarters = this.getQuarterScores(index, match.timeline)
        return <RealtimeMatchDetailsPayload>{
            teams,
            scores: match.timeline[index].scores,
            quarters,
            event: constants.eventNames.realtimeMatchDetails,
        }
    }

    private getQuarterScores(index: number, timeline: Array<RealtimeScore>): Array<[number, number]> {
        const finals: Array<[number, number]> = []
        const curTimeline = timeline.slice(0, index + 1)
        for (let i = 0; i <= curTimeline[curTimeline.length - 1].quarter; i++) finals.push([0, 0])
        curTimeline.forEach(t => (finals[t.quarter] = t.scores))
        return finals.map((f, i) => {
            if (i === 0) return f
            return [f[0] - finals[i - 1][0], f[1] - finals[i - 1][1]]
        })
    }

    private async runCore(match: MatchDetails) {
        const id = utils.getId(match.teams)
        for (let i = 0; ; i = (i + 1) % match.timeline.length) {
            const t = match.timeline[i]
            await this.delay(t.delay)
            this.timelineIndexMap[id] = i
            this.serviceClient.group(id).sendToAll(this.getCurrentMatchDetails(match.teams))
        }
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
