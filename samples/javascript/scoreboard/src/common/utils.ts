import { MatchTeams } from '../models/MatchTeams'

export default {
    getId: (teams: MatchTeams): string => {
        if (teams.teamL < teams.teamR) return teams.teamL + '-' + teams.teamR
        return teams.teamR + '-' + teams.teamL
    },
}
