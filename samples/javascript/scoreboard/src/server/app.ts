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
const connectionString = process.env.WebPubSubConnectionString as string
const hubName = process.env.NODE_ENV === 'production' ? 'sample_scoreboard' : 'sample_dev_scoreboard'

// setup simulation matches
const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true })
const matchRunner = new MatchRunner(matchGenerator, serviceClient)

// setup event handler
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
                        list: matchRunner.liveMatchList.map(m => m.getSummary()),
                    })
                    break
                // reply past match list for the user event 'getPastMatchList'
                case constants.eventNames.getPastMatchList:
                    await serviceClient.sendToUser(user, <MatchSummaryListPayload>{
                        event: constants.eventNames.getPastMatchList,
                        list: matchRunner.pastMatchList.map(m => m.getSummary()),
                    })
                    break
                // reply real time match details for the user event 'realtimeMatchDetails'
                case constants.eventNames.realtimeMatchDetails: {
                    const teams: MatchTeams = req.data as MatchTeams
                    const liveMatches = matchRunner.liveMatchList.filter(m => utils.getId(m.teams) === utils.getId(teams))
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

// setup server
const app = express()
app.use(express.static(staticRoot))
app.use(handler.getMiddleware())

app.get('/', function (req, res) {
    res.sendFile(path.join(path.join(staticRoot, '/index.html')))
})

// return negotiate response to redirect websocket client to Azure Web PubSub service
app.get('/negotiate', async (req, res) => {
    const userId = req.query.id as string
    if (!userId) {
        res.status(400).send('missing user id')
        return
    }
    const roles = matchRunner.liveMatchList.map(m => `${constants.clients.roles.joinLeaveGroup}.${utils.getId(m.teams)}`)
    const token = await serviceClient.getClientAccessToken({ userId, roles })
    res.json({
        url: token.url,
    })
})

// start match
matchRunner.run()

// start server
app.listen(port, () => console.log(`Event handler listening at http://localhost:${port}${handler.path} for hub ${hubName}.`))
