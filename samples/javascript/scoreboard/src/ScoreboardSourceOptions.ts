import { RealtimeMatchDetailsPayload } from '@/models/payloads/RealtimeMatchDetailsPayload'
import { MatchSummaryListPayload } from '@/models/payloads/MatchSummaryListPayload'

export interface ScoreboardSourceOptions {
    onGettingRealtimeMatchDetailsScore: Array<(payload: RealtimeMatchDetailsPayload) => void>
    onGettingPastMatchSummaryList: (payload: MatchSummaryListPayload) => void
    onGettingLiveMatchSummaryList: (payload: MatchSummaryListPayload) => void
}
