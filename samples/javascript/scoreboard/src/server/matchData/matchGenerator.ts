import { MatchTeams } from '../../models/MatchTeams'
import { MatchDetails } from '../../models/MatchDetails'
import { RealtimeScore } from '../../models/RealtimeScore'

const maxQuarter = 4
const maxRecordPerQuarter = 15
const minRecordPerQuarter = 8
const maxIntervalMs = 1000
const minIntervalMs = 400

const pastMatchList: Array<MatchDetails> = [
    new MatchDetails(new MatchTeams('Bear', 'Thunders')),
    new MatchDetails(new MatchTeams('Ax', 'Hawks')),
    new MatchDetails(new MatchTeams('Shark', 'Bold')),
    new MatchDetails(new MatchTeams('Wolf', 'Jzer')),
]

const liveMatchList: Array<MatchDetails> = [
    new MatchDetails(new MatchTeams('Hawks', 'Ax')),
    new MatchDetails(new MatchTeams('Badger', 'Shark')),
    new MatchDetails(new MatchTeams('Bold', 'Wolf')),
]

pastMatchList.forEach(m => (m.timeline = generateRandomTimeline()))
liveMatchList.forEach(m => (m.timeline = generateRandomTimeline()))

function generateRandomTimeline() {
    let timeline = Array<RealtimeScore>()
    let initScores: [number, number] = [0, 0]
    for (let i = 0; i < maxQuarter; i++) {
        timeline = timeline.concat(generateRandomTimelineByQuarter(i, initScores))
        const last = timeline[timeline.length - 1]
        initScores = last.scores.slice() as [number, number]
    }
    return timeline
}

function generateRandomTimelineByQuarter(quarter: number, initScores: [number, number] = [0, 0]): Array<RealtimeScore> {
    const count = getRandomInt(maxRecordPerQuarter, minRecordPerQuarter)
    const timeline = Array<RealtimeScore>()
    const scores = initScores.slice()
    for (let i = 0; i < count; i++) {
        if (getRandomInt(10) % 2 === 0) scores[0] += 1
        else scores[1] += 1
        timeline.push(<RealtimeScore>{
            scores: scores.slice(),
            quarter,
            delay: getRandomInt(maxIntervalMs, minIntervalMs),
        })
    }
    return timeline
}

function getRandomInt(max: number, min = 1): number {
    return Math.floor(Math.random() * (max - min) + min)
}

export default { liveMatchList, pastMatchList }
