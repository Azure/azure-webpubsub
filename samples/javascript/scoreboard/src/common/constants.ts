export default {
    eventNames: {
        getLiveMatchList: 'getLiveMatchList',
        getPastMatchList: 'getPastMatchList',
        matchSummary: 'matchSummary',
        realtimeMatchDetails: 'realtimeMatchDetails',
    },
    hubs: {
        scoreboard: 'scoreboard',
    },
    clients: {
        roles: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup'],
        protocol: 'json.webpubsub.azure.v1',
    },
    server: {
        host: 'http://localhost:5000',
    },
}
