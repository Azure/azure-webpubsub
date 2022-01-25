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
        roles: {
            joinLeaveGroup: 'webpubsub.joinLeaveGroup',
        },
        protocol: 'json.webpubsub.azure.v1',
    },
    server: {
        host: 'http://localhost:5000',
    },
}
