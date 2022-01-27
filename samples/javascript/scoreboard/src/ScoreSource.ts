import 'ws'
import axios from 'axios'
import constants from '@/common/constants'
import { RealtimeMatchDetailsPayload } from '@/models/payloads/RealtimeMatchDetailsPayload'
import { ScoreboardSourceOptions } from './ScoreboardSourceOptions'
import { MatchSummaryListPayload } from '@/models/payloads/MatchSummaryListPayload'
import { MatchTeams } from '@/models/MatchTeams'
import utils from '@/common/utils'
import { MatchTeamsPayload } from '@/models/payloads/MatchTeamsPayload'
import { Guid } from 'js-guid'

export class ScoreSource {
    private options: ScoreboardSourceOptions
    private client: WebSocket | null
    private ackId: number

    constructor(options: ScoreboardSourceOptions) {
        this.options = options
        this.client = null
        this.ackId = 1
        this.connect()
    }

    subscribeMatch(teams: MatchTeams): void {
        const group = utils.getId(teams)
        this.client?.send(
            JSON.stringify({
                type: 'joinGroup',
                ackId: this.ackId++,
                group,
            }),
        )
    }

    unsubscribeMatch(teams: MatchTeams): void {
        const group = utils.getId(teams)
        this.client?.send(
            JSON.stringify({
                type: 'leaveGroup',
                ackId: this.ackId++,
                group,
            }),
        )
    }

    getMatchDetails(teams: MatchTeams): void {
        this.client?.send(
            JSON.stringify({
                type: 'event',
                event: constants.eventNames.realtimeMatchDetails,
                ackId: this.ackId++,
                dataType: 'json',
                data: <MatchTeamsPayload>{
                    teamL: teams.teamL,
                    teamR: teams.teamR,
                },
            }),
        )
    }

    private async connect(): Promise<void> {
        if (!isOptionsValid(this.options)) throw 'Invalid options for score source!'
        axios({
            method: 'get',
            url: '/negotiate',
            params: { id: Guid.newGuid().toString() },
        }).then(res => {
            const url = res.data.url
            console.log('connect to WebPubSub service: ', url)

            this.client = new WebSocket(url, constants.clients.protocol)

            this.client.onopen = () => {
                console.log('client connected.')
                this.getLiveMatchList()
                this.getPastMatchList()
            }

            this.client.onmessage = (e: MessageEvent<any>) => {
                if (e.data === null || e.data === undefined) return
                const message = JSON.parse(e.data)
                if (message.type !== 'message') return
                const payload = message.data
                switch (payload.event) {
                    case constants.eventNames.realtimeMatchDetails:
                        this.options.onGettingRealtimeMatchDetailsScore?.forEach(f => f(payload as RealtimeMatchDetailsPayload))
                        break
                    case constants.eventNames.getPastMatchList: {
                        this.options.onGettingPastMatchSummaryList(payload as MatchSummaryListPayload)
                        break
                    }
                    case constants.eventNames.getLiveMatchList: {
                        this.options.onGettingLiveMatchSummaryList(payload as MatchSummaryListPayload)
                        break
                    }
                    default:
                        break
                }
            }

            this.client.onerror = e => {
                console.error('client gets an error: ', e)
            }

            this.client.onclose = e => {
                console.log('client closes: ', e)
            }
        })
    }

    private getLiveMatchList() {
        this.client?.send(
            JSON.stringify({
                type: 'event',
                event: constants.eventNames.getLiveMatchList,
                ackId: this.ackId++,
                data: {},
            }),
        )
    }

    private getPastMatchList() {
        this.client?.send(
            JSON.stringify({
                type: 'event',
                event: constants.eventNames.getPastMatchList,
                ackId: this.ackId++,
                data: {},
            }),
        )
    }
}

function isOptionsValid(options: ScoreboardSourceOptions): boolean {
    return typeof options.onGettingPastMatchSummaryList === 'function' && typeof options.onGettingLiveMatchSummaryList === 'function'
}
