export class MatchTeams {
    teamL: string
    teamR: string

    constructor(teamL: string, teamR: string) {
        this.teamL = teamL
        this.teamR = teamR
    }

    hasTeam(team: string): boolean {
        return team === this.teamL || team === this.teamR
    }

    equals(teams: MatchTeams): boolean {
        return (teams.teamL === this.teamL && teams.teamR === this.teamR) || (teams.teamL === this.teamR && teams.teamR === this.teamL)
    }
}
