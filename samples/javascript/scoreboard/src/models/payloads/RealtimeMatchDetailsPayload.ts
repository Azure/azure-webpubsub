import { MatchTeams } from '../MatchTeams'
import { Payload } from './Payload'

// todo: rename
export interface RealtimeMatchDetailsPayload extends Payload {
    teams: MatchTeams
    scores: [number, number]
    quarters: [[number, number], [number, number], [number, number], [number, number]]
}
