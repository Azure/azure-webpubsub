import express from 'express'
import { WebPubSubServiceClient } from '@azure/web-pubsub'
import { UserEventRequest, UserEventResponseHandler, WebPubSubEventHandler } from '@azure/web-pubsub-express'
import constants from '../common/constants'
import matchGenerator from './matchData/matchGenerator'
import { MatchSummaryListPayload } from '../models/payloads/MatchSummaryListPayload'
import { MatchRunner } from './matchData/matchRunner'
import utils from '../common/utils'
import { MatchTeams } from '../models/MatchTeams'
import path from 'path'

// environment
const port = process.env.port || process.env.PORT || 5050
const staticRoot = path.join(__dirname, 'public')
const connectionString = process.env.CONN_STR as string
const hubName = process.env.NODE_ENV === 'production' ? 'scoreboard' : 'dev_scoreboard'

const app = express()

const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true })
const handler = new WebPubSubEventHandler(hubName, {
    path: '/eventhandler',
    onConnected: async req => {
        console.log(`${req.context.userId} connected`)
    },
    handleUserEvent: async (req: UserEventRequest, res: UserEventResponseHandler) => {
        try {
            const user = req.context.userId as string
            switch (req.context.eventName) {
                // reply live match list for the user event 'getLiveMatchList'
                case constants.eventNames.getLiveMatchList:
                    await serviceClient.sendToUser(user, <MatchSummaryListPayload>{
                        event: constants.eventNames.getLiveMatchList,
                        list: matchGenerator.liveMatchList.map(m => m.getSummary()),
                    })
                    break
                // reply past match list for the user event 'getPastMatchList'
                case constants.eventNames.getPastMatchList:
                    await serviceClient.sendToUser(user, <MatchSummaryListPayload>{
                        event: constants.eventNames.getPastMatchList,
                        list: matchGenerator.pastMatchList.map(m => m.getSummary()),
                    })
                    break
                case constants.eventNames.realtimeMatchDetails: {
                    const teams: MatchTeams = req.data as any
                    const liveMatches = matchGenerator.liveMatchList.filter(m => utils.getId(m.teams) === utils.getId(teams))
                    if (liveMatches.length > 0) {
                        const payload = matchRunner.getCurrentMatchDetails(teams)
                        await serviceClient.sendToUser(user, payload)
                    }
                    break
                }
                default:
                    break
            }
            res.success()
        } catch {
            res.fail(500)
        }
    },
})

app.use(express.static(staticRoot))
app.use(handler.getMiddleware())

app.get('/', function (req, res) {
    res.sendFile(path.join(path.join(staticRoot, '/index.html')))
})

app.get('/negotiate', async (req, res) => {
    const id = req.query.id as string
    if (!id) {
        res.status(400).send('missing user id')
        return
    }
    const token = await serviceClient.getClientAccessToken({ userId: id, roles: constants.clients.roles })
    res.json({
        url: token.url,
    })
})

const matchRunner = new MatchRunner(matchGenerator.liveMatchList, serviceClient)
matchRunner.run()

app.listen(port, () => console.log(`Event handler listening at http://localhost:${port}${handler.path} at ${process.env.NODE_ENV} mode.`))
