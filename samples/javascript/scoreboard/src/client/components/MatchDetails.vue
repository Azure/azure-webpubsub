<template>
    <el-card height="100vh">
        <el-row class="horizontal-center">
            <el-col :span="2">
                <el-tag type="danger" size="medium" class="live">● Live </el-tag>
            </el-col>
            <el-col :span="12" :offset="4" class="horizontal-center vertical-center">
                <img class="title-logo" :src="titleLogo" aria-label="team logo image"/>
                <div class="title">World Q League</div>
            </el-col>
        </el-row>
        <el-divider></el-divider>
        <el-row class="scores horizontal-center">
            <el-col class="logo-col" :xs="8" :sm="8" :md="8" :lg="8" :xl="8">
                <img :src="logoL" class="logo" aria-label="left side team logo image"/>
            </el-col>
            <el-col :xs="8" :sm="8" :md="8" :lg="8" :xl="8">
                <el-row class="vs-container" justify="space-around">
                    <div class="scoreL">{{ scores[0] }}</div>
                    <span class="vs-separator">:</span>
                    <div class="scoreR">{{ scores[1] }}</div>
                </el-row>
            </el-col>
            <el-col :xs="8" :sm="8" :md="8" :lg="8" :xl="8">
                <div class="logo-col">
                    <img :src="logoR" class="logo" aria-label="right side team logo image"/>
                </div>
            </el-col>
        </el-row>
        <el-row>
            <el-col :span="24">
                <div class="details">Match Details</div>
            </el-col>
        </el-row>
        <el-row>
            <el-col :span="24">
                <el-table :data="tableData" class="table" :cell-class-name="() => 'table-cell'">
                    <el-table-column prop="quarter" label="" />
                    <el-table-column prop="scoreL" :label="teams.teamL" />
                    <el-table-column prop="scoreR" :label="teams.teamR" />
                </el-table>
            </el-col>
        </el-row>
    </el-card>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import utils from '../utils'
import { MatchTeams } from '../../models/MatchTeams'
import { ScoreboardSourceOptions } from '../ScoreboardSourceOptions'
import { ScoreSource } from '../ScoreSource'
import { RealtimeMatchDetailsPayload } from '../../models/payloads/RealtimeMatchDetailsPayload'
import { anime } from '@maybecode/vue-next-animejs'
import 'element-plus/theme-chalk/display.css'

const teams = ref(new MatchTeams('', ''))
const tableData = ref([{}])
const scores = ref([0, 0] as [number, number])
const logoL = ref('')
const logoR = ref('')
const titleLogo = ref('')
utils.updateImage('images/titles/wql.png', titleLogo)

const store = useStore()
const options = store.state.source.options.value as ScoreboardSourceOptions
options.onGettingRealtimeMatchDetailsScore.push((payload: RealtimeMatchDetailsPayload): void => {
    const newTeams = new MatchTeams(payload.teams.teamL, payload.teams.teamR)
    if (teams.value && teams.value.equals(newTeams)) {
        scores.value = payload.scores

        tableData.value.length = 0
        payload.quarters.forEach((q, i) => {
            if (q[0] + q[1] === 0) return
            tableData.value.push({ quarter: getQuarterText(i), scoreL: q[0], scoreR: q[1] })
        })
    }
})

onMounted(() => {
    anime({
        targets: '.live',
        opacity: 0.3,
        loop: true,
        duration: 1000,
        easing: 'easeInOutCirc',
        direction: 'alternate',
    })
})

watch(store.state.selected, selected => {
    const newTeams: MatchTeams = selected.teams
    const source = store.state.source.instance as ScoreSource
    source.getMatchDetails(newTeams)
    teams.value = new MatchTeams(newTeams.teamL, newTeams.teamR)
    utils.updateImage(`images/logos/${newTeams.teamL}.png`, logoL)
    utils.updateImage(`images/logos/${newTeams.teamR}.png`, logoR)
})

function getQuarterText(index: number): string {
    let text = (index + 1).toString()
    switch (index) {
        case 0:
            text += 'st'
            break
        case 1:
            text += 'nd'
            break
        case 2:
            text += 'rd'
            break
        case 3:
            text += 'th'
            break
        default:
            break
    }
    text += ' Quarter'
    return text
}
</script>

<style scoped>
.title {
    font-size: 1.3rem;
    font-weight: bold;
    margin-left: 20px;
}
.title-logo {
    object-fit: contain;
    height: 3vh;
}
.scores {
    margin-top: 6rem;
    margin-bottom: 6rem;
}
.logo {
    object-fit: contain;
    height: 12vw;
}
.logo-col {
    text-align: center;
}
.details {
    font-size: 1.3rem;
    font-weight: bold;
}
.table {
    width: 100%;
}
.vs-container {
    font-size: 3vw;
    letter-spacing: 0.4rem;
    font-weight: bold;
}
.vs-separator {
    color: rgb(241, 242, 246);
}
</style>
