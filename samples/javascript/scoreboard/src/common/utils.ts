import { MatchTeams } from '../models/MatchTeams'

export default {
    getId: (teams: MatchTeams): string => {
        return teams.teamL + '-' + teams.teamR
    },
}
