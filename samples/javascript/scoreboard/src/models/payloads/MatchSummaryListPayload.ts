import { MatchSummary } from '../MatchSummary'
import { Payload } from './Payload'

export interface MatchSummaryListPayload extends Payload {
    list: Array<MatchSummary>
}
